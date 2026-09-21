// ON-DEVICE CODE (Hermes) — bundled into dist/solidDevtools/bridge.js and injected
// into the staged app bundle by roku-debug. Must stay dependency-free.
//
// Encodes arbitrary JS values into small, display-safe shapes. Hard-capped on DEPTH
// and BREADTH per value, with a SHARED node budget per request bounding the TOTAL
// payload (values can be huge/circular SceneGraph nodes and Hermes is memory-
// constrained — we never deep-walk). Anything NOT fully shown is tagged with a `ref`
// the client can expand on demand via __SDT.lazyValue(ref, offset).

import { untrackRead } from './solid';
// Type-only — erased by esbuild, so the bundled bridge stays import-free. The bridge
// is the producer of this wire shape; the webview consumes the same type (protocol.ts).
import type { SolidEncodedValue } from '../protocol';

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
const valueRefs = new Map<number, unknown>();
let refCounter = 0;
const REF_CAP = 5000;

export function resetValueRefs(): void {
    valueRefs.clear();
}

function refOf(v: unknown): number {
    if (valueRefs.size >= REF_CAP) {
        return 0; // registry full — value simply isn't expandable this round
    }
    refCounter++;
    valueRefs.set(refCounter, v);
    return refCounter;
}

function tagRef(node: SolidEncodedValue, v: unknown): SolidEncodedValue {
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
export function isPlainObject(v: unknown): boolean {
    let p: unknown;
    try {
        p = Object.getPrototypeOf(v);
    } catch {
        return false;
    }
    return p === Object.prototype || p === null;
}

export function encodeValue(v: unknown, depth: number, budget: { n: number }, seen: Set<unknown>, path: Set<unknown>): SolidEncodedValue {
    budget.n--;
    if (v === null) {
        return { t: 'null' };
    }
    if (v === undefined) {
        return { t: 'undefined' };
    }
    if (typeof v === 'number' || typeof v === 'boolean') {
        return { t: typeof v, v: v };
    }
    if (typeof v === 'bigint') {
        return { t: 'number', v: v.toString() + 'n' };
    }
    if (typeof v === 'string') {
        return v.length > STRING_CAP
            ? tagRef({ t: 'string', v: v.slice(0, STRING_CAP), len: v.length }, v)
            : { t: 'string', v: v };
    }
    if (typeof v === 'symbol') {
        return { t: 'symbol', v: v.toString() };
    }
    if (typeof v === 'function') {
        return { t: 'function', v: v.name || '' };
    }
    if (typeof v === 'object') {
        if (path.has(v)) {
            return tagRef({ t: 'circular' }, v);
        }
        // out of budget/depth, OR already emitted elsewhere in this payload (dedupe,
        // not a cycle) → collapse to a shape tag
        const expand = depth > 0 && budget.n > 0 && !seen.has(v);
        if (Array.isArray(v)) {
            const arr = v as unknown[];
            let len = 0;
            try {
                len = arr.length;
            } catch {
                // proxy length getter threw
            }
            const node: SolidEncodedValue = { t: 'array', len: len };
            if (expand && len) {
                seen.add(v);
                path.add(v);
                const items: SolidEncodedValue[] = [];
                for (let i = 0; i < len && i < VALUE_BREADTH; i++) {
                    let it: unknown;
                    try {
                        it = arr[i];
                    } catch {
                        it = undefined;
                    }
                    items.push(encodeValue(it, depth - 1, budget, seen, path));
                }
                path.delete(v);
                node.items = items;
                if (len > VALUE_BREADTH) {
                    node.more = len - VALUE_BREADTH;
                    tagRef(node, v); // expand more pages via lazyValue(ref, offset)
                }
            } else if (len) {
                tagRef(node, v);
            }
            return node;
        }
        const obj = v as Record<string, unknown>;
        let ctor: string | undefined;
        try {
            ctor = (v as { constructor?: { name?: string } }).constructor?.name;
        } catch {
            // constructor getter threw
        }
        const node: SolidEncodedValue = { t: 'object' };
        if (ctor && ctor !== 'Object') {
            node.ctor = ctor;
        }
        if (expand && isPlainObject(v)) {
            seen.add(v);
            path.add(v);
            let keys: string[] = [];
            try {
                keys = Object.keys(obj);
            } catch {
                // proxy ownKeys threw
            }
            if (keys.length) {
                const entries: Array<{ k: string; value: SolidEncodedValue }> = [];
                for (let i = 0; i < keys.length && i < VALUE_BREADTH; i++) {
                    const k = keys[i];
                    let val: unknown;
                    try {
                        val = obj[k];
                    } catch {
                        val = undefined;
                    }
                    entries.push({ k: k, value: encodeValue(val, depth - 1, budget, seen, path) });
                }
                node.entries = entries;
                if (keys.length > VALUE_BREADTH) {
                    node.more = keys.length - VALUE_BREADTH;
                    tagRef(node, v);
                }
            }
            path.delete(v);
        } else {
            // collapsed (out of depth/budget) or a class instance we won't auto-walk —
            // expandable on demand
            tagRef(node, v);
        }
        return node;
    }
    return { t: 'undefined' };
}

/**
 * Expand ONE more level of a ref'd value, starting at `offset` (array index / object
 * key index / string char offset). The user explicitly asked for this value, so —
 * unlike encodeValue — non-plain objects ARE enumerated here (own properties only,
 * every read individually guarded). Returns `{ node }` or `{ missing: true }`;
 * nested children get fresh refs for further drilling.
 */
export function expandRef(refId: number, offset: number): ExpandResult {
    if (!valueRefs.has(refId)) {
        return { missing: true };
    }
    const v = valueRefs.get(refId);
    const budget = { n: NODE_BUDGET };
    const seen = new Set<unknown>();
    const path = new Set<unknown>();
    if (typeof v === 'string') {
        const chunk = v.slice(offset, offset + STRING_PAGE);
        const node: SolidEncodedValue = { t: 'string', v: chunk, len: v.length, offset: offset };
        if (offset + chunk.length < v.length) {
            node.more = v.length - offset - chunk.length;
            node.ref = refId; // same ref — page again with a bigger offset
        }
        return { node: node };
    }
    if (typeof v !== 'object' || v === null) {
        return { node: encodeValue(v, 1, budget, seen, path) };
    }
    seen.add(v);
    // the root is its own ancestor for this expansion, so a direct self-reference
    // among its children still reports circular
    path.add(v);
    if (Array.isArray(v)) {
        const arr = v as unknown[];
        let len = 0;
        try {
            len = arr.length;
        } catch {
            // proxy length getter threw
        }
        const items: SolidEncodedValue[] = [];
        const node: SolidEncodedValue = { t: 'array', len: len, offset: offset, items: items };
        for (let i = offset; i < len && i < offset + VALUE_BREADTH; i++) {
            let it: unknown;
            try {
                it = untrackRead(() => arr[i]);
            } catch {
                it = undefined;
            }
            items.push(encodeValue(it, 1, budget, seen, path));
        }
        if (len > offset + VALUE_BREADTH) {
            node.more = len - offset - VALUE_BREADTH;
            node.ref = refId;
        }
        return { node: node };
    }
    const obj = v as Record<string, unknown>;
    let ctor: string | undefined;
    try {
        ctor = (v as { constructor?: { name?: string } }).constructor?.name;
    } catch {
        // constructor getter threw
    }
    let keys: string[] = [];
    try {
        keys = Object.keys(obj);
    } catch {
        // proxy ownKeys threw
    }
    if (!keys.length) {
        // class instances often have no own enumerable keys — fall back to own
        // property names (still own-only; prototype getters are never touched)
        try {
            keys = Object.getOwnPropertyNames(obj);
        } catch {
            // exotic object
        }
    }
    const entries: Array<{ k: string; value: SolidEncodedValue }> = [];
    const node: SolidEncodedValue = { t: 'object', offset: offset, entries: entries };
    if (ctor && ctor !== 'Object') {
        node.ctor = ctor;
    }
    for (let i = offset; i < keys.length && i < offset + VALUE_BREADTH; i++) {
        const k = keys[i];
        let val: unknown;
        try {
            val = untrackRead(() => obj[k]);
        } catch {
            val = undefined;
        }
        entries.push({ k: k, value: encodeValue(val, 1, budget, seen, path) });
    }
    if (keys.length > offset + VALUE_BREADTH) {
        node.more = keys.length - offset - VALUE_BREADTH;
        node.ref = refId;
    }
    return { node: node };
}

// ---- types -------------------------------------------------------------------

/** One value expanded one more level by expandRef (drill-down), or a missing marker. */
interface ExpandResult {
    node?: SolidEncodedValue;
    missing?: boolean;
}
