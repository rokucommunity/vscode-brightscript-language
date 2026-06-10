/* eslint-disable @typescript-eslint/no-explicit-any */
// ON-DEVICE CODE (Hermes) — bundled into dist/solidDevtools/bridge.js and injected
// into the staged app bundle by roku-debug. Must stay dependency-free.
//
// Encodes arbitrary JS values into small, display-safe shapes. Hard-capped on DEPTH
// and BREADTH per value, with a SHARED node budget per request bounding the TOTAL
// payload (values can be huge/circular SceneGraph nodes and Hermes is memory-
// constrained — we never deep-walk). Anything NOT fully shown is tagged with a `ref`
// the client can expand on demand via __SDT.lazyValue(ref, offset).

import { untrackRead } from './solid';

/** Max keys/items shown per object/array per level. */
export const VALUE_BREADTH = 40;
/** Max chars of a string shown inline. */
export const STRING_CAP = 400;
/** Chars per page when drilling into a long string via lazyValue. */
export const STRING_PAGE = 2000;
/** Shared per-request node budget — bounds the total payload so drains never time out. */
export const NODE_BUDGET = 800;

// ---- value-ref registry ------------------------------------------------------
// Collapsed values are kept here so lazyValue(ref, offset) can expand them later.
// Refs are scoped to the LAST inspect: each lazyInspect resets the registry (so it
// can't grow without bound), and the monotonic counter guarantees a stale ref from
// a previous inspect can never alias a new value — it just reports `missing`.
const valueRefs = new Map<number, any>();
let refCounter = 0;
const REF_CAP = 5000;

export function resetValueRefs(): void {
    valueRefs.clear();
}

function refOf(v: any): number {
    if (valueRefs.size >= REF_CAP) {
        return 0; // registry full — value simply isn't expandable this round
    }
    refCounter++;
    valueRefs.set(refCounter, v);
    return refCounter;
}

function tagRef(node: any, v: any): any {
    const r = refOf(v);
    if (r) {
        node.ref = r;
    }
    return node;
}

/**
 * Is `v` a PLAIN object (literal / store proxy with Object.prototype proto) vs a class
 * instance (SceneGraph node, Map, …)? We only auto-enumerate plain objects + real
 * arrays; class instances show their constructor name and a `ref` WITHOUT walking,
 * because their property getters can do heavy synchronous native work. Drilling into
 * one is then an explicit user action (lazyValue).
 */
export function isPlainObject(v: any): boolean {
    let p: any;
    try {
        p = Object.getPrototypeOf(v);
    } catch {
        return false;
    }
    return p === Object.prototype || p === null;
}

export function encodeValue(v: any, depth: number, budget: { n: number }, seen: Set<any>): any {
    budget.n--;
    const t = typeof v;
    if (v === null) {
        return { t: 'null' };
    }
    if (t === 'undefined') {
        return { t: 'undefined' };
    }
    if (t === 'number' || t === 'boolean') {
        return { t: t, v: v };
    }
    if (t === 'bigint') {
        return { t: 'number', v: v.toString() + 'n' };
    }
    if (t === 'string') {
        return v.length > STRING_CAP
            ? tagRef({ t: 'string', v: v.slice(0, STRING_CAP), len: v.length }, v)
            : { t: 'string', v: v };
    }
    if (t === 'symbol') {
        return { t: 'symbol', v: v.toString() };
    }
    if (t === 'function') {
        return { t: 'function', v: v.name || '' };
    }
    if (t === 'object') {
        if (seen.has(v)) {
            return tagRef({ t: 'circular' }, v);
        }
        const expand = depth > 0 && budget.n > 0; // out of budget → collapse to a shape tag
        if (Array.isArray(v)) {
            let len = 0;
            try {
                len = v.length;
            } catch {
                // proxy length getter threw
            }
            const node: any = { t: 'array', len: len };
            if (expand && len) {
                seen.add(v);
                node.items = [];
                for (let i = 0; i < len && i < VALUE_BREADTH; i++) {
                    let it: any;
                    try {
                        it = v[i];
                    } catch {
                        it = undefined;
                    }
                    node.items.push(encodeValue(it, depth - 1, budget, seen));
                }
                if (len > VALUE_BREADTH) {
                    node.more = len - VALUE_BREADTH;
                    tagRef(node, v); // expand more pages via lazyValue(ref, offset)
                }
            } else if (len) {
                tagRef(node, v);
            }
            return node;
        }
        let ctor: string | undefined;
        try {
            ctor = v.constructor?.name;
        } catch {
            // constructor getter threw
        }
        const node: any = { t: 'object' };
        if (ctor && ctor !== 'Object') {
            node.ctor = ctor;
        }
        if (expand && isPlainObject(v)) {
            seen.add(v);
            let keys: string[] = [];
            try {
                keys = Object.keys(v);
            } catch {
                // proxy ownKeys threw
            }
            if (keys.length) {
                node.entries = [];
                for (let i = 0; i < keys.length && i < VALUE_BREADTH; i++) {
                    const k = keys[i];
                    let val: any;
                    try {
                        val = v[k];
                    } catch {
                        val = undefined;
                    }
                    node.entries.push({ k: k, value: encodeValue(val, depth - 1, budget, seen) });
                }
                if (keys.length > VALUE_BREADTH) {
                    node.more = keys.length - VALUE_BREADTH;
                    tagRef(node, v);
                }
            }
        } else {
            // collapsed (out of depth/budget) or a class instance we won't auto-walk —
            // expandable on demand
            tagRef(node, v);
        }
        return node;
    }
    return { t: t };
}

/**
 * Expand ONE more level of a ref'd value, starting at `offset` (array index / object
 * key index / string char offset). The user explicitly asked for this value, so —
 * unlike encodeValue — non-plain objects ARE enumerated here (own properties only,
 * every read individually guarded). Returns `{ node }` or `{ missing: true }`;
 * nested children get fresh refs for further drilling.
 */
export function expandRef(refId: number, offset: number): any {
    if (!valueRefs.has(refId)) {
        return { missing: true };
    }
    const v = valueRefs.get(refId);
    const budget = { n: NODE_BUDGET };
    const seen = new Set<any>();
    if (typeof v === 'string') {
        const chunk = v.slice(offset, offset + STRING_PAGE);
        const node: any = { t: 'string', v: chunk, len: v.length, offset: offset };
        if (offset + chunk.length < v.length) {
            node.more = v.length - offset - chunk.length;
            node.ref = refId; // same ref — page again with a bigger offset
        }
        return { node: node };
    }
    if (typeof v !== 'object' || v === null) {
        return { node: encodeValue(v, 1, budget, seen) };
    }
    seen.add(v);
    if (Array.isArray(v)) {
        let len = 0;
        try {
            len = v.length;
        } catch {
            // proxy length getter threw
        }
        const node: any = { t: 'array', len: len, offset: offset, items: [] };
        for (let i = offset; i < len && i < offset + VALUE_BREADTH; i++) {
            let it: any;
            try {
                it = untrackRead(() => v[i]);
            } catch {
                it = undefined;
            }
            node.items.push(encodeValue(it, 1, budget, seen));
        }
        if (len > offset + VALUE_BREADTH) {
            node.more = len - offset - VALUE_BREADTH;
            node.ref = refId;
        }
        return { node: node };
    }
    let ctor: string | undefined;
    try {
        ctor = v.constructor?.name;
    } catch {
        // constructor getter threw
    }
    let keys: string[] = [];
    try {
        keys = Object.keys(v);
    } catch {
        // proxy ownKeys threw
    }
    if (!keys.length) {
        // class instances often have no own enumerable keys — fall back to own
        // property names (still own-only; prototype getters are never touched)
        try {
            keys = Object.getOwnPropertyNames(v);
        } catch {
            // exotic object
        }
    }
    const node: any = { t: 'object', offset: offset, entries: [] };
    if (ctor && ctor !== 'Object') {
        node.ctor = ctor;
    }
    for (let i = offset; i < keys.length && i < offset + VALUE_BREADTH; i++) {
        const k = keys[i];
        let val: any;
        try {
            val = untrackRead(() => v[k]);
        } catch {
            val = undefined;
        }
        node.entries.push({ k: k, value: encodeValue(val, 1, budget, seen) });
    }
    if (keys.length > offset + VALUE_BREADTH) {
        node.more = keys.length - offset - VALUE_BREADTH;
        node.ref = refId;
    }
    return { node: node };
}
