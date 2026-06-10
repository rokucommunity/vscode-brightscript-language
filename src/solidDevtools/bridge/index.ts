/* eslint-disable @typescript-eslint/no-explicit-any */
// ON-DEVICE CODE (Hermes) — Solid Devtools bridge (read-only, lazy tree).
//
// This is the extension-owned source of truth for the on-device half of the Solid
// Devtools feature. It is esbuild-bundled to a single self-contained IIFE
// (dist/solidDevtools/bridge.js) which roku-debug PREPENDS to the staged app bundle
// (<stagingDir>/source/compiled/index.js) during stage(), then injects
//   globalThis.__SDT && globalThis.__SDT.__connect({hooks:DevHooks,getOwner,untrack,createRoot,getListener})
// right after solid's dev `DevHooks` declaration. The app itself carries ZERO
// devtools code — it only needs a dev build (`__SIGNAL__`). If the injection marker
// is missing (prod / non-dev build), __connect never runs and the bridge stays inert
// reporting status "waiting" — it must NEVER break the app.
//
// We deliberately do NOT do continuous observation of the owner graph. On Hermes /
// the SceneGraph renderer observing the whole graph (thousands of owners) spins the
// JS thread and Roku's watchdog kills the app. Instead we walk Solid's owner graph
// IMPERATIVELY, ON DEMAND: lazyRoots() / lazyChildren(id) each walk ONE component-
// layer; lazyInspect(id) reads one node's props/signals/memos/value; lazyValue(ref)
// expands one collapsed value. Each call stashes a base64 result the extension
// drains in chunks via readResult(off, len) over the js-debug `evaluate` channel —
// O(visible), bounded payloads. There is ONE shared result buffer, so the extension
// MUST serialize lazy calls (never overlap two of them). version() bumps on graph
// activity; the extension polls it to drive live refresh.
//
// Return values are escape-safe (digits / hyphenated words / base64) so they survive
// the single-quote-wrapped, backslash-escaping `evaluate` display rendering.

import { utf8ToBase64 } from './base64';
import type { SolidApi } from './solid';
import {
    getNodeName, getNodeType, getOwnerType, getSolidApi, isSolidRoot,
    onOwnerCleanup, runInThrowawayRoot, setSolidApi, untrackRead
} from './solid';
import { encodeValue, expandRef, NODE_BUDGET, resetValueRefs } from './values';

// ---- state -------------------------------------------------------------------

/** 'waiting' (installed, solid never connected — not a dev build or marker missed)
 *  → 'ready' | 'connect-error'. */
let status = 'waiting';
let lastError = '';
let connected = false;
/** Bumped on graph activity; the extension polls this to know when to re-fetch. */
let version = 0;

/** Live createRoot owners, self-cleaned on disposal — what lazyRoots stitches from. */
const roots = new Set<any>();
/** Anchor owner -> label; the NAMED top-level entries of the tree (opt-in via attachAnchor). */
const anchors = new Map<any, string>();
/** Namespace -> record of module-level state (opt-in via registerGlobals). */
const globalGroups = new Map<string, any>();
/** Unowned signals (created with no Owner) — auto-captured via afterCreateSignal. */
const orphanSignals = new Set<any>();
const ORPHAN_CAP = 5000;
/** Runaway seatbelt only — roots self-clean via onOwnerCleanup, so this shouldn't be reached. */
const ROOT_CAP = 20000;

let lastResult = ''; // base64 of the latest lazy response; the extension drains it in chunks

function setResult(obj: any): number {
    try {
        lastResult = utf8ToBase64(JSON.stringify(obj));
    } catch (e: any) {
        lastResult = utf8ToBase64(JSON.stringify({ error: String(e?.message ?? e) }));
    }
    return lastResult.length;
}

// ---- ids ---------------------------------------------------------------------

const idMap = new WeakMap<any, string>();
let idCounter = 0;
const ownerById = new Map<string, any>(); // reverse map so the UI can expand a node by id

function idOf(owner: any): string {
    let id = idMap.get(owner);
    if (!id) {
        id = '#' + (idCounter++).toString(16);
        idMap.set(owner, id);
    }
    if (!ownerById.has(id)) {
        ownerById.set(id, owner);
    }
    return id;
}

// ---- lazy / virtualized tree: walk ONE component-layer per request ------------

function safeType(owner: any): string {
    try {
        return getOwnerType(owner);
    } catch {
        return 'UNKNOWN';
    }
}

function safeName(owner: any): string | undefined {
    try {
        return getNodeName(owner) || undefined;
    } catch {
        return undefined;
    }
}

function nodeOf(owner: any): any {
    const n: any = { id: idOf(owner), type: safeType(owner) };
    const name = safeName(owner);
    if (name) {
        n.name = name;
    }
    return n;
}

/**
 * Collect the NEXT layer of COMPONENT descendants of `owner` (recursing THROUGH
 * non-component owners, stopping at each component). Bounded — never walks the
 * whole graph, only down to the next component layer.
 */
function collectChildComponents(owner: any, out: any[], seen: Set<any>, depth: number): void {
    const owned = owner?.owned;
    if (!owned || depth > 1500) {
        return;
    }
    for (let i = 0; i < owned.length && out.length < 1000; i++) {
        const c = owned[i];
        if (!c || seen.has(c)) {
            continue;
        }
        seen.add(c);
        if (safeType(c) === 'COMPONENT') {
            out.push(nodeOf(c)); // stop here (lazy — children fetched on expand)
        } else {
            collectChildComponents(c, out, seen, depth + 1); // recurse through non-component
        }
    }
}

// ---- root stitching ------------------------------------------------------------
// Solid's createRoot DETACHES downward (the parent's `owned` does NOT list the
// root) but NOT upward: for `<For>`/`<Index>` item roots — createRoot(fn) where fn
// takes a dispose arg — `root.owner` still points at the enclosing owner. So we
// re-link a root into the tree by walking `root.owner` UP to its nearest COMPONENT
// ancestor and showing the root's component children under that component. Roots
// with no component ancestor (e.g. the app's top root) stay top-level.

const MAX_UP = 10000;

function nearestComponentAncestor(root: any): any {
    let o = root?.owner;
    let guard = 0;
    while (o && guard++ < MAX_UP) {
        if (safeType(o) === 'COMPONENT') {
            return o;
        }
        o = o.owner;
    }
    return null;
}

// Attachment index: top-level roots + (componentId -> roots attached under it).
// Rebuilt at most every 250ms so a refresh's lazyRoots + cascaded lazyChildren
// share one consistent snapshot without rebuilding on every call.
let topRoots: any[] = [];
const rootsByParentId = new Map<string, any[]>();
let indexBuiltAt = 0;

function buildRootIndex(): void {
    topRoots = [];
    rootsByParentId.clear();
    for (const r of roots) {
        if (!r) {
            continue;
        }
        const parent = nearestComponentAncestor(r);
        if (!parent) {
            topRoots.push(r);
        } else {
            const key = idOf(parent);
            const arr = rootsByParentId.get(key);
            if (arr) {
                arr.push(r);
            } else {
                rootsByParentId.set(key, [r]);
            }
        }
    }
}

function ensureRootIndex(): void {
    const now = Date.now();
    if (now - indexBuiltAt > 250) {
        buildRootIndex();
        indexBuiltAt = now;
    }
}

/**
 * Append the component children stitched under `owner` (a component or a root):
 * its COMPONENT descendants via the `owned` walk, PLUS — because roots are rendered
 * TRANSPARENTLY (no ROOT node) — the component children of every sub-root attached
 * to it. So a `<For>`/`<Index>` shows its item components directly, not each wrapped
 * in a redundant ROOT row.
 */
function collectStitchedChildren(owner: any, idStr: string, out: any[], seen: Set<any>): void {
    collectChildComponents(owner, out, seen, 0);
    ensureRootIndex();
    const attached = rootsByParentId.get(idStr);
    if (attached) {
        for (const r of attached) {
            collectChildComponents(r, out, seen, 0);
        }
    }
}

/**
 * Top level of the tree. PREFER named anchor entries — either a top-level root that
 * carries a dev `name` (Solid's standard dev naming convention; the RSG SDK names each
 * TS-component mount root after its component, so this needs no app or tool-specific
 * code) or an owner explicitly registered via attachAnchor. The anchor owner itself
 * isn't a Solid COMPONENT, so without this the tree would start at its first child.
 * Falls back to hoisting top-level roots' components when no named entry is live.
 */
function lazyRoots(): number {
    ensureRootIndex();
    const nodes: any[] = [];
    // Global-state entries first (leaves you SELECT to inspect): the auto-captured
    // orphan (unowned) signals, plus any explicitly-registered named groups.
    if (orphanSignals.size) {
        nodes.push({ id: '@orphans', type: 'GLOBALS', name: 'orphan signals (' + orphanSignals.size + ')', leaf: true });
    }
    for (const ns of globalGroups.keys()) {
        nodes.push({ id: '@g:' + ns, type: 'GLOBALS', name: ns, leaf: true });
    }
    const emitted = new Set<string>();
    const pushAnchor = (owner: any, name: string) => {
        const id = idOf(owner);
        if (emitted.has(id)) {
            return;
        }
        const kids: any[] = [];
        collectStitchedChildren(owner, id, kids, new Set());
        if (kids.length) {
            emitted.add(id);
            nodes.push({ id: id, type: 'ANCHOR', name: name, childCount: kids.length });
        }
    };
    for (const entry of anchors) {
        pushAnchor(entry[0], entry[1]);
    }
    const tops = topRoots.length ? topRoots : Array.from(roots);
    for (const r of tops) {
        const name = safeName(r);
        if (name) {
            pushAnchor(r, name);
        }
    }
    if (!emitted.size) {
        // No named entry — hoist top-level roots' components so the tree isn't empty.
        const seen = new Set<any>();
        for (const r of tops) {
            collectChildComponents(r, nodes, seen, 0);
        }
    }
    return setResult({ kind: 'roots', connected: connected, nodes: nodes });
}

/** Children of a component (one layer), with sub-roots stitched in transparently. */
function lazyChildren(idStr: string): number {
    if (idStr.startsWith('@')) {
        return setResult({ kind: 'children', parent: idStr, nodes: [] }); // synthetic Globals node: a leaf — select it to inspect
    }
    const owner = ownerById.get(idStr);
    if (!owner) {
        return setResult({ kind: 'children', parent: idStr, nodes: [], missing: true });
    }
    const out: any[] = [];
    collectStitchedChildren(owner, idStr, out, new Set());
    return setResult({ kind: 'children', parent: idStr, nodes: out });
}

// ---- inspector: props / signals / memos / stores / value of one node ----------

/** Read a registered global's CURRENT value without subscribing. */
function readGlobal(v: any): any {
    try {
        if (typeof v === 'function') {
            return untrackRead(() => v()); // bare accessor
        }
        if (v && typeof v.get === 'function') {
            return untrackRead(() => v.get()); // asSignal-style {get,set} wrapper
        }
    } catch {
        return undefined;
    }
    return v; // store proxy / plain value
}

/** Inspect the auto-captured orphan (unowned) signals — value rows. Names appear only
 *  if the signal was named (Solid records no names without a build transform). */
function inspectOrphans(): number {
    resetValueRefs();
    const out: any = { kind: 'inspect', id: '@orphans', name: 'orphan signals', type: 'GLOBALS' };
    const seen = new Set<any>();
    const budget = { n: NODE_BUDGET };
    const signals: any[] = [];
    let i = 0;
    for (const s of orphanSignals) {
        if (i++ >= 400) {
            out.truncated = true;
            break;
        }
        signals.push({ name: safeName(s) || '', value: encodeValue(s.value, 2, budget, seen) });
    }
    if (signals.length) {
        out.signals = signals;
    }
    if (budget.n <= 0) {
        out.truncated = true;
    }
    return setResult(out);
}

/** Inspect a registered Globals group: each entry's current value as a signal row. */
function inspectGlobals(ns: string): number {
    resetValueRefs();
    const out: any = { kind: 'inspect', id: '@g:' + ns, name: ns, type: 'GLOBALS' };
    const rec = globalGroups.get(ns);
    if (rec) {
        const seen = new Set<any>();
        const budget = { n: NODE_BUDGET };
        const signals: any[] = [];
        try {
            for (const k of Object.keys(rec)) {
                signals.push({ name: k, value: encodeValue(readGlobal(rec[k]), 2, budget, seen) });
            }
        } catch (e: any) {
            out.error = String(e?.message ?? e);
        }
        if (signals.length) {
            out.signals = signals;
        }
        if (budget.n <= 0) {
            out.truncated = true;
        }
    }
    return setResult(out);
}

/**
 * Inspect one node by id: its props, signals (sourceMap), memos (owned), stores,
 * and rendered value, each with current values. Read-only / non-subscribing.
 * Resets the value-ref registry — refs from a previous inspect become invalid.
 */
function lazyInspect(idStr: string): number {
    if (idStr === '@orphans') {
        return inspectOrphans();
    }
    if (idStr.startsWith('@g:')) {
        return inspectGlobals(idStr.slice(3));
    }
    const owner = ownerById.get(idStr);
    if (!owner) {
        return setResult({ kind: 'inspect', id: idStr, missing: true });
    }
    resetValueRefs();
    const out: any = { kind: 'inspect', id: idStr, name: safeName(owner) || '', type: safeType(owner) };
    const seen = new Set<any>();
    // Shared node budget across the whole inspect — bounds the total payload so it
    // always drains well within the client timeout no matter how many signals/memos
    // a component has. When exhausted, remaining values collapse to a ref'd shape tag.
    const budget = { n: NODE_BUDGET };
    try {
        // Props WITH values. Reading the props proxy invokes reactive getters, which
        // can create transient computations — so do it inside a throwaway root we
        // dispose. We skip `children`/`ref`: resolving children can do heavy
        // synchronous render work.
        const props = owner.props;
        if (props && typeof props === 'object') {
            let keys: string[] = [];
            try {
                keys = Object.keys(props);
            } catch {
                // proxy ownKeys threw
            }
            if (keys.length) {
                const list: any[] = [];
                runInThrowawayRoot(() => {
                    for (let i = 0; i < keys.length && i < 60; i++) {
                        const k = keys[i];
                        if (k === 'children' || k === 'ref') {
                            list.push({ key: k }); // name only — don't resolve
                            continue;
                        }
                        let val: any;
                        try {
                            val = untrackRead(() => props[k]);
                        } catch {
                            val = undefined;
                        }
                        list.push({ key: k, value: encodeValue(val, 2, budget, seen) });
                    }
                });
                if (list.length) {
                    out.props = list;
                }
            }
        }
        // Signals + stores from the owner's sourceMap; `.value` is a plain data property.
        const sm = owner.sourceMap;
        if (sm?.length) {
            const signals: any[] = [];
            const stores: any[] = [];
            for (let i = 0; i < sm.length && i < 200; i++) {
                const n = sm[i];
                if (!n) {
                    continue;
                }
                let nt = 'SIGNAL';
                try {
                    nt = getNodeType(n);
                } catch {
                    // fall back to SIGNAL
                }
                const entry = { name: safeName(n) || '', value: encodeValue(n.value, 2, budget, seen) };
                if (nt === 'STORE') {
                    stores.push(entry);
                } else {
                    signals.push(entry);
                }
            }
            if (signals.length) {
                out.signals = signals;
            }
            if (stores.length) {
                out.stores = stores;
            }
        }
        // Memos are computations in `owned` (fn + comparator); `.value` is a data prop.
        const owned = owner.owned;
        if (owned?.length) {
            const memos: any[] = [];
            for (let i = 0; i < owned.length && i < 400 && memos.length < 100; i++) {
                const c = owned[i];
                if (c && typeof c.fn === 'function' && ('comparator' in c)) {
                    memos.push({ name: safeName(c) || '', value: encodeValue(c.value, 2, budget, seen) });
                }
            }
            if (memos.length) {
                out.memos = memos;
            }
        }
        // The component's rendered output — depth 1, but it's a SceneGraph node
        // (non-plain) so encodeValue won't walk into it; shows its constructor + a ref.
        const ev = encodeValue(owner.value, 1, budget, seen);
        if (ev && ev.t !== 'undefined' && ev.t !== 'null') {
            out.value = ev;
        }
        if (budget.n <= 0) {
            out.truncated = true; // some values were collapsed to fit the payload budget
        }
    } catch (e: any) {
        out.error = String(e?.message ?? e);
    }
    return setResult(out);
}

/**
 * Expand one collapsed value by ref (value drill-down). Refs come from the LAST
 * lazyInspect's payload; `offset` pages through long arrays/objects/strings.
 * Property reads happen inside a throwaway root (reactive getters may create
 * transient computations) and without subscribing.
 */
function lazyValue(ref: number, offset: number): number {
    const out: any = { kind: 'value', ref: ref, offset: offset || 0 };
    try {
        runInThrowawayRoot(() => {
            const r = expandRef(ref, offset || 0);
            if (r.missing) {
                out.missing = true;
            } else {
                out.node = r.node;
            }
        });
    } catch (e: any) {
        out.error = String(e?.message ?? e);
    }
    return setResult(out);
}

// ---- optional app-side hooks (zero-app-code by default) ------------------------

/**
 * OPTIONAL: call from inside a component's reactive root (e.g. a TS-component
 * anchor factory) to surface that subtree as a NAMED top-level tree entry:
 *   (globalThis as any).__SDT?.attachAnchor('App')
 */
function attachAnchor(name?: string): boolean {
    const api = getSolidApi();
    if (!api) {
        return false; // not connected (not a dev build) — no-op
    }
    try {
        const owner = api.getOwner();
        if (!owner) {
            return false;
        }
        anchors.set(owner, name || 'anchor');
        onOwnerCleanup(owner, () => {
            anchors.delete(owner);
            version++; // disposal is graph activity → triggers a live refresh
        });
        version++;
        console.log('[SDT] attachAnchor "' + (name || 'anchor') + '"; anchors=' + anchors.size);
        return true;
    } catch (e: any) {
        lastError = 'attachAnchor: ' + String(e?.message ?? e);
        return false;
    }
}

/**
 * OPTIONAL: register module-level / global state (signals, stores, plain values) so
 * it shows as a NAMED group in the devtools "Globals" view:
 *   (globalThis as any).__SDT?.registerGlobals('appState', { activeScreenId, ... })
 * Unowned signals never appear in a component's sourceMap, so without this they're
 * only auto-captured as UNNAMED orphans. `record` is read on demand:
 * { name: accessorFn | {get,set} wrapper | store proxy | plain value }.
 */
function registerGlobals(namespace: string, record: any): void {
    if (!record) {
        return;
    }
    globalGroups.set(String(namespace), record);
    version++;
}

// ---- connect (called by the line roku-debug injects after solid's DevHooks) ----

function installHooks(api: SolidApi): void {
    const hooks = api.hooks;
    // Root collection — a cheap, NON-reactive hook (records a ref only; no walking /
    // observation). Roots self-clean on disposal so the Set tracks only LIVE roots.
    const prevCreateOwner = hooks.afterCreateOwner;
    hooks.afterCreateOwner = function afterCreateOwner(owner: any) {
        version++;
        try {
            if (isSolidRoot(owner) && !roots.has(owner) && roots.size < ROOT_CAP) {
                roots.add(owner);
                onOwnerCleanup(owner, () => {
                    roots.delete(owner);
                    version++; // disposal is graph activity → triggers a live refresh
                });
            }
        } catch {
            // never break app rendering
        }
        if (prevCreateOwner) {
            prevCreateOwner(owner);
        }
    };
    const prevUpdate = hooks.afterUpdate;
    hooks.afterUpdate = function afterUpdate() {
        version++;
        if (prevUpdate) {
            prevUpdate();
        }
    };
    // Orphan capture: unowned signals (module-level globals) have no `.graph`
    // (registerGraph only sets it under an Owner). __connect runs during solid's
    // module init — BEFORE any app module — so import-time globals are caught.
    const prevCreateSignal = hooks.afterCreateSignal;
    hooks.afterCreateSignal = function afterCreateSignal(s: any) {
        try {
            if (s && !s.graph && orphanSignals.size < ORPHAN_CAP) {
                orphanSignals.add(s);
            }
        } catch {
            // never break app rendering
        }
        if (prevCreateSignal) {
            prevCreateSignal(s);
        }
    };
}

/**
 * Called by the one-line statement roku-debug injects right after solid's dev
 * `DevHooks` declaration — i.e. during solid's module init, before any app code
 * runs. The payload is the bridge's only access to solid internals. Must NEVER
 * throw (it executes inside the app bundle's module init).
 */
function __connect(api: SolidApi): string {
    try {
        if (connected) {
            return 'already-connected';
        }
        if (!api?.hooks || typeof api.getOwner !== 'function' ||
            typeof api.untrack !== 'function' || typeof api.createRoot !== 'function') {
            status = 'connect-error';
            lastError = 'connect: bad payload (missing hooks/getOwner/untrack/createRoot)';
            console.log('[SDT] ' + lastError);
            return 'bad-payload';
        }
        setSolidApi(api);
        installHooks(api);
        connected = true;
        status = 'ready';
        version++;
        console.log('[SDT] connected to solid DEV; hooks installed');
        return 'ok';
    } catch (e: any) {
        status = 'connect-error';
        lastError = 'connect: ' + String(e?.message ?? e);
        console.log('[SDT] ' + lastError);
        return 'error';
    }
}

// ---- install -------------------------------------------------------------------

function installSdt(): void {
    const g = globalThis as any;
    if (g.__SDT?.__sdtBridge) {
        return; // double-injection guard
    }
    g.__SDT = {
        __sdtBridge: true,
        __connect: __connect,
        // "status|rootsCount|anchorsCount|orphansCount|version"
        status: () => [status, roots.size, anchors.size, orphanSignals.size, version].join('|'),
        version: () => version,
        // --- lazy/virtualized tree + inspector API (one shared result buffer —
        // the extension must SERIALIZE these calls) ---
        lazyRoots: lazyRoots, // -> total b64 length of the result; drain via readResult
        lazyChildren: lazyChildren, // (idStr) -> total b64 length
        lazyInspect: lazyInspect, // (idStr) -> total b64 length; props/signals/memos/stores/value
        lazyValue: lazyValue, // (ref, offset) -> total b64 length; expand a collapsed value
        readResult: (off: number, len: number) => lastResult.slice(off, off + len),
        errorB64: () => utf8ToBase64(lastError || ''),
        // --- optional app-side hooks ---
        attachAnchor: attachAnchor,
        registerGlobals: registerGlobals
    };
    console.log('[SDT] bridge installed (waiting for solid __connect)');
}

installSdt();

/** TEST-ONLY: reset all module state and reinstall a fresh __SDT. */
export function __resetSdtBridgeForTests(): void {
    status = 'waiting';
    lastError = '';
    connected = false;
    version = 0;
    roots.clear();
    anchors.clear();
    globalGroups.clear();
    orphanSignals.clear();
    lastResult = '';
    ownerById.clear();
    idCounter = 0;
    topRoots = [];
    rootsByParentId.clear();
    indexBuiltAt = 0;
    setSolidApi(null);
    resetValueRefs();
    (globalThis as any).__SDT = undefined;
    installSdt();
}
