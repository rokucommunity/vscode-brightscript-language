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
import type { SolidApi, SolidNode } from './solid';
import {
    getNodeName, getNodeType, getOwnerType, getSolidApi,
    isBridgeWork, onOwnerCleanup, runInThrowawayRoot, setSolidApi, untrackRead
} from './solid';
import { encodeValue, expandRef, NODE_BUDGET, resetValueRefs } from './values';
// Type-only — erased by esbuild, so the bundled bridge stays import-free. The bridge
// is the PRODUCER of these wire shapes; the webview consumes the same types (protocol.ts).
import type {
    SolidChildrenData, SolidInspectData, SolidInspectEntry,
    SolidRootsData, SolidSearchData, SolidSearchMatch, SolidTreeNode, SolidValueData
} from '../protocol';

// Result/global types (RootsResult … SdtApi) are declared at the bottom.

/** Extract a human-readable message from an unknown thrown value (Error or otherwise). */
function errText(e: unknown): string {
    return String((e as { message?: unknown })?.message ?? e);
}

// ---- state -------------------------------------------------------------------

/** 'waiting' (installed, solid never connected — not a dev build or marker missed)
 *  → 'ready' | 'connect-error'. */
let status = 'waiting';
let lastError = '';
let connected = false;
/** Bumped on graph activity; the extension polls this to know when to re-fetch. */
let version = 0;

/** Live createRoot owners, self-cleaned on disposal — what lazyRoots stitches from. */
const roots = new Set<SolidNode>();
/** Anchor owner -> label; the NAMED top-level entries of the tree (opt-in via attachAnchor). */
const anchors = new Map<SolidNode, string>();
/** Namespace -> record of module-level state (opt-in via registerGlobals). The record maps
 *  a label to an accessor fn / {get,set} wrapper / store proxy / plain value. */
const globalGroups = new Map<string, Record<string, unknown>>();
/** Unowned signals (created with no Owner) — auto-captured via afterCreateSignal. */
const orphanSignals = new Set<SolidNode>();
const ORPHAN_CAP = 5000;
/** Runaway seatbelt only — roots self-clean via onOwnerCleanup, so this shouldn't be reached. */
const ROOT_CAP = 20000;

let lastResult = ''; // base64 of the latest lazy response; the extension drains it in chunks

function setResult(obj: unknown): number {
    try {
        lastResult = utf8ToBase64(JSON.stringify(obj));
    } catch (e) {
        lastResult = utf8ToBase64(JSON.stringify({ error: errText(e) }));
    }
    return lastResult.length;
}

// ---- ids ---------------------------------------------------------------------

const idMap = new WeakMap<SolidNode, string>();
let idCounter = 0;

// Reverse map (id -> owner) so the UI can expand/inspect a node by id. The owners are
// long-lived app objects (component computations, SceneGraph node graphs); holding them
// with STRONG refs would keep every node ever shown alive forever — a slow leak over a
// long session. So when the runtime has WeakRef (Hermes 0.12.0+ does; the SDK's own
// leak-detect ponyfill proves it works on device), store WeakRefs and sweep dead ones
// opportunistically. FinalizationRegistry is NOT on Hermes, so we poll-sweep instead of
// auto-finalize. If WeakRef is absent, fall back to a capped strong-ref map (FIFO evict).
// WeakRef isn't in the project's TS lib target, so grab the global ctor (undefined if
// the runtime lacks it) with the minimal shape we use (SdtWeakRef, declared at bottom).
const WeakRefCtor = (globalThis as { WeakRef?: new (target: SolidNode) => SdtWeakRef }).WeakRef;
let weakRefEnabled = !!WeakRefCtor;
const OWNER_CAP = 10000; // fallback cap (strong-ref mode only)
// id -> WeakRef<owner> (weakRefEnabled) | owner. The `weakRefEnabled` flag is the runtime
// tag for which arm each entry is, so the few accesses cast on it explicitly.
const ownerById = new Map<string, SdtWeakRef | SolidNode>();

function rememberOwner(id: string, owner: SolidNode): void {
    if (ownerById.has(id)) {
        return;
    }
    if (weakRefEnabled && WeakRefCtor) {
        ownerById.set(id, new WeakRefCtor(owner));
        return;
    }
    ownerById.set(id, owner);
    if (ownerById.size > OWNER_CAP) {
        const oldest = ownerById.keys().next().value; // Map preserves insertion order → FIFO
        if (oldest !== undefined) {
            ownerById.delete(oldest);
        }
    }
}

/** Resolve an id to its owner, or undefined if it was collected/evicted (→ "missing").
 *  Drops a dead entry on the way out. */
function resolveOwner(id: string): SolidNode | undefined {
    const entry = ownerById.get(id);
    if (entry === undefined) {
        return undefined;
    }
    if (!weakRefEnabled) {
        return entry as SolidNode;
    }
    const owner = (entry as SdtWeakRef).deref();
    if (owner === undefined) {
        ownerById.delete(id);
    }
    return owner;
}

/** Drop entries whose owner has been GC'd. Cheap, bounded, no timer — called from the
 *  throttled root-index rebuild so it only runs while the panel is actively walking. */
function sweepOwnerById(): void {
    if (!weakRefEnabled) {
        return;
    }
    for (const entry of ownerById) {
        if ((entry[1] as SdtWeakRef).deref() === undefined) {
            ownerById.delete(entry[0]);
        }
    }
}

function idOf(owner: SolidNode): string {
    let id = idMap.get(owner);
    if (!id) {
        id = '#' + (idCounter++).toString(16);
        idMap.set(owner, id);
    }
    rememberOwner(id, owner);
    return id;
}

// ---- lazy / virtualized tree: walk ONE component-layer per request ------------

function safeType(owner: SolidNode): string {
    try {
        return getOwnerType(owner);
    } catch {
        return 'UNKNOWN';
    }
}

function safeName(owner: SolidNode): string | undefined {
    try {
        return getNodeName(owner) || undefined;
    } catch {
        return undefined;
    }
}

function nodeOf(owner: SolidNode): SolidTreeNode {
    const id = idOf(owner);
    const n: SolidTreeNode = { id: id, type: safeType(owner) };
    const name = safeName(owner);
    if (name) {
        n.name = name;
    }
    // mark empty nodes leaf UP FRONT so the tree never shows an expand chevron that
    // vanishes when a click reveals nothing (e.g. a <Show> whose branch renders no
    // components). Cheap: an early-exit peek for the next component layer.
    if (isLeafOwner(owner, id)) {
        n.leaf = true;
    }
    return n;
}

/**
 * Collect the NEXT layer of COMPONENT descendants of `owner` (recursing THROUGH
 * non-component owners, stopping at each component). Bounded — never walks the
 * whole graph, only down to the next component layer.
 */
function collectChildComponents(owner: SolidNode, out: SolidTreeNode[], seen: Set<SolidNode>, depth: number): void {
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

function nearestComponentAncestor(root: SolidNode): SolidNode | null {
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
let topRoots: SolidNode[] = [];
const rootsByParentId = new Map<string, SolidNode[]>();
let indexBuiltAt = 0;

function buildRootIndex(): void {
    sweepOwnerById(); // opportunistic: drop GC'd owners while we're already walking
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
function collectStitchedChildren(owner: SolidNode, idStr: string, out: SolidTreeNode[], seen: Set<SolidNode>): void {
    collectChildComponents(owner, out, seen, 0);
    ensureRootIndex();
    const attached = rootsByParentId.get(idStr);
    if (attached) {
        for (const r of attached) {
            collectChildComponents(r, out, seen, 0);
        }
    }
}

// The leaf-peek must NEVER do an unbounded synchronous walk — a node with a big
// childless subtree would otherwise block Hermes for seconds (stalling every evaluate
// and backlogging the channel). So cap the owners visited; if the search is TRUNCATED
// (budget hit) we can't prove it's a leaf, so assume expandable (show the chevron — the
// old optimistic behaviour, but only for these rare deep nodes). No false leaves.
const LEAF_PEEK_BUDGET = 256;

/** Early-exit "is there a COMPONENT in here?" — same descent as collectChildComponents
 * (through non-component owners) but returns on the FIRST one found, and bails when the
 * shared visit budget is exhausted (budget.n <= 0 after the call ⇒ truncated). */
function hasChildComponent(owner: SolidNode, seen: Set<SolidNode>, depth: number, budget: { n: number }): boolean {
    const owned = owner?.owned;
    if (!owned || depth > 1500) {
        return false;
    }
    for (let i = 0; i < owned.length; i++) {
        const c = owned[i];
        if (!c || seen.has(c)) {
            continue;
        }
        seen.add(c);
        if (--budget.n <= 0) {
            return false; // truncated — caller checks budget.n to know it was inconclusive
        }
        if (safeType(c) === 'COMPONENT') {
            return true;
        }
        if (hasChildComponent(c, seen, depth + 1, budget)) {
            return true;
        }
    }
    return false;
}

/** True when `owner` has no component children at all (owned-walk OR stitched sub-roots).
 * Bounded by LEAF_PEEK_BUDGET; a truncated (inconclusive) search returns false so the node
 * stays expandable rather than being mislabelled a leaf. */
function isLeafOwner(owner: SolidNode, idStr: string): boolean {
    const budget = { n: LEAF_PEEK_BUDGET };
    const seen = new Set<SolidNode>();
    if (hasChildComponent(owner, seen, 0, budget) || budget.n <= 0) {
        return false; // found a component, or ran out of budget (assume expandable)
    }
    ensureRootIndex();
    const attached = rootsByParentId.get(idStr);
    if (attached) {
        for (const r of attached) {
            if (hasChildComponent(r, seen, 0, budget) || budget.n <= 0) {
                return false;
            }
        }
    }
    return true;
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
    const nodes: SolidTreeNode[] = [];
    // Global-state entries first (leaves you SELECT to inspect): the auto-captured
    // orphan (unowned) signals, plus any explicitly-registered named groups.
    if (orphanSignals.size) {
        nodes.push({ id: '@orphans', type: 'GLOBALS', name: 'orphan signals (' + orphanSignals.size + ')', leaf: true });
    }
    for (const ns of globalGroups.keys()) {
        nodes.push({ id: '@g:' + ns, type: 'GLOBALS', name: ns, leaf: true });
    }
    const emitted = new Set<string>();
    const pushAnchor = (owner: SolidNode, name: string) => {
        const id = idOf(owner);
        if (emitted.has(id)) {
            return;
        }
        const kids: SolidTreeNode[] = [];
        collectStitchedChildren(owner, id, kids, new Set<SolidNode>());
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
        const seen = new Set<SolidNode>();
        for (const r of tops) {
            collectChildComponents(r, nodes, seen, 0);
        }
    }
    const result: RootsResult = { kind: 'roots', connected: connected, nodes: nodes };
    return setResult(result);
}

/** Children of a component (one layer), with sub-roots stitched in transparently. */
function lazyChildren(idStr: string): number {
    if (idStr.startsWith('@')) {
        return setResult({ kind: 'children', parent: idStr, nodes: [] }); // synthetic Globals node: a leaf — select it to inspect
    }
    const owner = resolveOwner(idStr);
    if (!owner) {
        return setResult({ kind: 'children', parent: idStr, nodes: [], missing: true });
    }
    const out: SolidTreeNode[] = [];
    collectStitchedChildren(owner, idStr, out, new Set<SolidNode>());
    const result: ChildrenResult = { kind: 'children', parent: idStr, nodes: out };
    return setResult(result);
}

/**
 * Full-tree search by component NAME. Walks the SAME node layers the tree renders
 * (lazyRoots' top level → collectStitchedChildren per layer) so results match what's
 * shown — but unlike the lazy tree it descends the whole graph, not one layer, so it
 * finds matches in not-yet-expanded subtrees. Each match carries a `›`-joined ancestor
 * NAME path for context. Budget- and count-capped to keep the payload drainable.
 */
function lazySearch(queryStr: string): number {
    const q = String(queryStr || '').trim().toLowerCase();
    const matches: SolidSearchMatch[] = [];
    if (q) {
        const MAX_MATCHES = 200;
        const budget = { n: 8000 };
        // Top-level entries exactly as lazyRoots derives them (skipping GLOBALS leaves).
        ensureRootIndex();
        const topNodes: SolidTreeNode[] = [];
        const emitted = new Set<string>();
        const pushTop = (owner: SolidNode, name: string) => {
            const id = idOf(owner);
            if (emitted.has(id)) {
                return;
            }
            const kids: SolidTreeNode[] = [];
            collectStitchedChildren(owner, id, kids, new Set<SolidNode>());
            if (kids.length) {
                emitted.add(id);
                topNodes.push({ id: id, type: 'ANCHOR', name: name });
            }
        };
        for (const entry of anchors) {
            pushTop(entry[0], entry[1]);
        }
        const tops = topRoots.length ? topRoots : Array.from(roots);
        for (const r of tops) {
            const name = safeName(r);
            if (name) {
                pushTop(r, name);
            }
        }
        if (!emitted.size) {
            const seen = new Set<SolidNode>();
            for (const r of tops) {
                collectChildComponents(r, topNodes, seen, 0);
            }
        }
        // DFS over the layers, carrying each node's ancestor NAME path (for display)
        // and ancestor ID path (so the client can expand the tree to a match).
        const stack: Array<{ node: SolidTreeNode; path: string[]; idPath: string[] }> = [];
        for (const n of topNodes) {
            stack.push({ node: n, path: [], idPath: [] });
        }
        const visited = new Set<string>();
        while (stack.length && matches.length < MAX_MATCHES && budget.n-- > 0) {
            const item = stack.pop();
            if (!item || visited.has(item.node.id)) {
                continue;
            }
            visited.add(item.node.id);
            const node = item.node;
            const name = node.name || '';
            if (name.toLowerCase().includes(q)) {
                matches.push({ id: node.id, name: name, type: node.type, path: item.path.join(' › '), ancestorIds: item.idPath });
            }
            if (!node.leaf && !node.id.startsWith('@')) {
                const owner = resolveOwner(node.id);
                if (owner) {
                    const kids: SolidTreeNode[] = [];
                    collectStitchedChildren(owner, node.id, kids, new Set<SolidNode>());
                    const childPath = item.path.concat(name || node.type || '?');
                    const childIdPath = item.idPath.concat(node.id);
                    for (const kid of kids) {
                        stack.push({ node: kid, path: childPath, idPath: childIdPath });
                    }
                }
            }
        }
    }
    const result: SearchResult = { kind: 'search', matches: matches };
    return setResult(result);
}

// ---- inspector: props / signals / memos / stores / value of one node ----------

/** Read a registered global's CURRENT value without subscribing. */
function readGlobal(v: unknown): unknown {
    try {
        if (typeof v === 'function') {
            return untrackRead(() => (v as () => unknown)()); // bare accessor
        }
        const wrapper = v as { get?: unknown };
        if (v && typeof wrapper.get === 'function') {
            return untrackRead(() => (wrapper.get as () => unknown)()); // asSignal-style {get,set} wrapper
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
    const out: InspectResult = { kind: 'inspect', id: '@orphans', name: 'orphan signals', type: 'GLOBALS' };
    const seen = new Set<unknown>();
    const path = new Set<unknown>();
    const budget = { n: NODE_BUDGET };
    const signals: SolidInspectEntry[] = [];
    // throwaway root: encodeValue's walks can hit app getters that create computations
    runInThrowawayRoot(() => {
        let i = 0;
        for (const s of orphanSignals) {
            if (i++ >= 400) {
                out.truncated = true;
                break;
            }
            signals.push({ name: safeName(s) || '', value: encodeValue(s.value, 2, budget, seen, path) });
        }
    });
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
    const out: InspectResult = { kind: 'inspect', id: '@g:' + ns, name: ns, type: 'GLOBALS' };
    const rec = globalGroups.get(ns);
    if (rec) {
        const seen = new Set<unknown>();
        const path = new Set<unknown>();
        const budget = { n: NODE_BUDGET };
        const signals: SolidInspectEntry[] = [];
        try {
            // throwaway root: reading registered accessors can create computations
            runInThrowawayRoot(() => {
                for (const k of Object.keys(rec)) {
                    signals.push({ name: k, value: encodeValue(readGlobal(rec[k]), 2, budget, seen, path) });
                }
            });
        } catch (e) {
            out.error = errText(e);
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
    const owner = resolveOwner(idStr);
    if (!owner) {
        return setResult({ kind: 'inspect', id: idStr, missing: true });
    }
    resetValueRefs();
    const out: InspectResult = { kind: 'inspect', id: idStr, name: safeName(owner) || '', type: safeType(owner) };
    const seen = new Set<unknown>();
    const path = new Set<unknown>();
    // Shared node budget across the whole inspect — bounds the total payload so it
    // always drains well within the client timeout no matter how many signals/memos
    // a component has. When exhausted, remaining values collapse to a ref'd shape tag.
    const budget = { n: NODE_BUDGET };
    try {
        // ONE throwaway root around ALL value reading: props getters AND encodeValue's
        // object walks can invoke app getters that create transient computations —
        // without an owner Solid DEV warns "computations created outside a
        // `createRoot` or `render` will never be disposed" and leaks them.
        runInThrowawayRoot(() => {
            collectInspect(owner, out, budget, seen, path);
        });
        if (budget.n <= 0) {
            out.truncated = true; // some values were collapsed to fit the payload budget
        }
    } catch (e) {
        out.error = errText(e);
    }
    return setResult(out);
}

/** Read one owner's props/signals/memos/stores/value into `out`. Must run inside a
 *  throwaway root (see lazyInspect). */
function collectInspect(owner: SolidNode, out: SolidInspectData, budget: { n: number }, seen: Set<unknown>, path: Set<unknown>): void {
    // Props WITH values. We skip `children`/`ref`: resolving children can do heavy
    // synchronous render work.
    const props = owner.props;
    if (props && typeof props === 'object') {
        const propsObj = props as Record<string, unknown>;
        let keys: string[] = [];
        try {
            keys = Object.keys(propsObj);
        } catch {
            // proxy ownKeys threw
        }
        if (keys.length) {
            const list: SolidInspectEntry[] = [];
            for (let i = 0; i < keys.length && i < 60; i++) {
                const k = keys[i];
                if (k === 'children' || k === 'ref') {
                    list.push({ key: k }); // name only — don't resolve
                    continue;
                }
                let val: unknown;
                try {
                    val = untrackRead(() => propsObj[k]);
                } catch {
                    val = undefined;
                }
                list.push({ key: k, value: encodeValue(val, 2, budget, seen, path) });
            }
            if (list.length) {
                out.props = list;
            }
        }
    }
    // Signals + stores from the owner's sourceMap; `.value` is a plain data property.
    const sm = owner.sourceMap;
    if (sm?.length) {
        const signals: SolidInspectEntry[] = [];
        const stores: SolidInspectEntry[] = [];
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
            const entry: SolidInspectEntry = { name: safeName(n) || '', value: encodeValue(n.value, 2, budget, seen, path) };
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
        const memos: SolidInspectEntry[] = [];
        for (let i = 0; i < owned.length && i < 400 && memos.length < 100; i++) {
            const c = owned[i];
            if (c && typeof c.fn === 'function' && ('comparator' in c)) {
                memos.push({ name: safeName(c) || '', value: encodeValue(c.value, 2, budget, seen, path) });
            }
        }
        if (memos.length) {
            out.memos = memos;
        }
    }
    // The component's rendered output — depth 1, but it's a SceneGraph node
    // (non-plain) so encodeValue won't walk into it; shows its constructor + a ref.
    const ev = encodeValue(owner.value, 1, budget, seen, path);
    if (ev && ev.t !== 'undefined' && ev.t !== 'null') {
        out.value = ev;
    }
}

/**
 * Expand one collapsed value by ref (value drill-down). Refs come from the LAST
 * lazyInspect's payload; `offset` pages through long arrays/objects/strings.
 * Property reads happen inside a throwaway root (reactive getters may create
 * transient computations) and without subscribing.
 */
function lazyValue(ref: number, offset: number): number {
    const out: ValueResult = { kind: 'value', ref: ref, offset: offset || 0 };
    try {
        runInThrowawayRoot(() => {
            const r = expandRef(ref, offset || 0);
            if (r.missing) {
                out.missing = true;
            } else {
                out.node = r.node;
            }
        });
    } catch (e) {
        out.error = errText(e);
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
    } catch (e) {
        lastError = 'attachAnchor: ' + errText(e);
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
function registerGlobals(namespace: string, record: unknown): void {
    if (!record) {
        return;
    }
    globalGroups.set(String(namespace), record as Record<string, unknown>);
    version++;
}

// ---- connect (called by the line roku-debug injects after solid's DevHooks) ----

// These hooks run on the app's HOT PATHS (every owner / signal creation, every
// update cycle), so their passive cost must be as close to zero as possible — the
// goal is that a dev build with the bridge connected costs no more than solid DEV
// itself. Principles:
//  - the per-call fast path is ONE property check, no try/catch (every operation on
//    it is a throw-free primitive read); only the rare root-capture branch (a few
//    hundred hits vs tens of thousands) carries a try/catch + allocations
//  - no version bump per owner: once a client observes, afterUpdate covers all graph
//    activity (creation always happens inside an update cycle); root/anchor DISPOSAL
//    bumps version from the (rare) cleanup callbacks
//  - afterUpdate isn't installed AT ALL until a devtools client actually talks to
//    the bridge (ensureObserving), so idle debug sessions pay nothing on writes
//  - the prev-hook chaining branch is specialized away when there's no prev hook

/** Rare path: record a live root + self-clean registration. */
function captureRoot(owner: SolidNode): void {
    try {
        roots.add(owner);
        const cleanup = (): void => {
            roots.delete(owner);
            version++; // disposal is graph activity → triggers a live refresh
        };
        if (owner.cleanups === null || owner.cleanups === undefined) {
            owner.cleanups = [cleanup];
        } else {
            owner.cleanups.push(cleanup);
        }
    } catch {
        // never break app rendering
    }
}

function installHooks(api: SolidApi): void {
    const hooks = api.hooks;
    // Root collection: createRoot owners are the only owners with NO `fn` property,
    // so one undefined-check filters the storm of computations/components/effects.
    // (the isBridgeWork() check is on the rare root branch only — it skips the
    // bridge's OWN throwaway roots, whose capture+dispose would loop live refresh)
    const prevCreateOwner = hooks.afterCreateOwner;
    hooks.afterCreateOwner = prevCreateOwner
        ? function afterCreateOwner(owner: SolidNode) {
            if (owner.fn === undefined && roots.size < ROOT_CAP && !isBridgeWork()) {
                captureRoot(owner);
            }
            prevCreateOwner(owner);
        }
        : function afterCreateOwner(owner: SolidNode) {
            if (owner.fn === undefined && roots.size < ROOT_CAP && !isBridgeWork()) {
                captureRoot(owner);
            }
        };
    // Orphan capture: unowned signals (module-level globals) have no `.graph`
    // (registerGraph only sets it under an Owner). __connect runs during solid's
    // module init — BEFORE any app module — so import-time globals are caught.
    const prevCreateSignal = hooks.afterCreateSignal;
    hooks.afterCreateSignal = prevCreateSignal
        ? function afterCreateSignal(s: SolidNode) {
            if (s.graph === undefined && orphanSignals.size < ORPHAN_CAP && !isBridgeWork()) {
                orphanSignals.add(s);
            }
            prevCreateSignal(s);
        }
        : function afterCreateSignal(s: SolidNode) {
            if (s.graph === undefined && orphanSignals.size < ORPHAN_CAP && !isBridgeWork()) {
                orphanSignals.add(s);
            }
        };
}

let observing = false;

/**
 * The client-visible change counter: our local `version` (root/anchor disposals,
 * globals registration) PLUS solid's own ExecCount when the connect payload could
 * provide it — solid bumps ExecCount once per update cycle anyway, so reading it
 * gives change detection with ZERO code on the app's update path. Both terms are
 * monotonic, so the sum is a valid "did anything change since last poll" signal.
 */
function currentVersion(): number {
    const api = getSolidApi();
    if (api?.getExecCount) {
        const n = api.getExecCount();
        if (typeof n === 'number' && n >= 0) {
            return version + n;
        }
    }
    return version;
}

/**
 * Start live-refresh observation on the FIRST client interaction. Until a devtools
 * client talks to the bridge, the app's update path carries zero bridge code — and
 * when solid's ExecCount is readable (the normal case), it stays that way even
 * while observing; the afterUpdate → version++ hook is only the fallback.
 */
function ensureObserving(): void {
    const api = getSolidApi();
    if (observing || !connected || !api) {
        return;
    }
    observing = true;
    const execCount = api.getExecCount ? api.getExecCount() : -1;
    if (typeof execCount === 'number' && execCount >= 0) {
        return; // ExecCount drives version — no hook needed
    }
    const hooks = api.hooks;
    const prevUpdate = hooks.afterUpdate;
    hooks.afterUpdate = prevUpdate
        ? function afterUpdate() {
            version++;
            prevUpdate();
        }
        : function afterUpdate() {
            version++;
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
        console.log('[SDT] connected to solid DEV; hooks installed; ownerById=' + (weakRefEnabled ? 'weakref' : 'capped'));
        return 'ok';
    } catch (e) {
        status = 'connect-error';
        lastError = 'connect: ' + errText(e);
        console.log('[SDT] ' + lastError);
        return 'error';
    }
}

// ---- install -------------------------------------------------------------------

function installSdt(): void {
    const g = globalThis as SdtGlobal;
    if (g.__SDT?.__sdtBridge) {
        return; // double-injection guard
    }
    const sdt: SdtApi = {
        __sdtBridge: true,
        __connect: __connect,
        // status/version/lazyRoots are the panel's entry points — the first call
        // starts live-refresh observation (until then the app's update path carries
        // zero bridge code)
        // "status|rootsCount|anchorsCount|orphansCount|version"
        status: () => {
            ensureObserving();
            return [status, roots.size, anchors.size, orphanSignals.size, currentVersion()].join('|');
        },
        version: () => {
            ensureObserving();
            return currentVersion();
        },
        // --- lazy/virtualized tree + inspector API (one shared result buffer —
        // the extension must SERIALIZE these calls) ---
        lazyRoots: () => {
            ensureObserving();
            return lazyRoots();
        }, // -> total b64 length of the result; drain via readResult
        lazyChildren: lazyChildren, // (idStr) -> total b64 length
        lazyInspect: lazyInspect, // (idStr) -> total b64 length; props/signals/memos/stores/value
        lazyValue: lazyValue, // (ref, offset) -> total b64 length; expand a collapsed value
        lazySearch: lazySearch, // (query) -> total b64 length; full-tree name search
        readResult: (off: number, len: number) => lastResult.slice(off, off + len),
        errorB64: () => utf8ToBase64(lastError || ''),
        // --- optional app-side hooks ---
        attachAnchor: attachAnchor,
        registerGlobals: registerGlobals
    };
    g.__SDT = sdt;
    console.log('[SDT] bridge installed (waiting for solid __connect)');
}

installSdt();

/** TEST-ONLY: reset all module state and reinstall a fresh __SDT. Pass
 *  `{ forceCapMode: true }` to exercise the strong-ref fallback (no WeakRef). */
export function __resetSdtBridgeForTests(opts?: { forceCapMode?: boolean }): void {
    status = 'waiting';
    lastError = '';
    connected = false;
    observing = false;
    version = 0;
    weakRefEnabled = !!WeakRefCtor && !opts?.forceCapMode;
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
    (globalThis as SdtGlobal).__SDT = undefined;
    installSdt();
}

// ---- types -------------------------------------------------------------------

/** The bridge tags every drained result with the method that produced it (a diagnostic
 *  aid — the transport routes by call site). Each result = a protocol payload + `kind`. */
interface RootsResult extends SolidRootsData {
    kind: 'roots';
}
interface ChildrenResult extends SolidChildrenData {
    kind: 'children';
}
interface InspectResult extends SolidInspectData {
    kind: 'inspect';
}
interface ValueResult extends SolidValueData {
    kind: 'value';
}
interface SearchResult extends SolidSearchData {
    kind: 'search';
}

/** Minimal shape of the global `WeakRef` ctor we use (not in the project's TS lib target);
 *  undefined when the runtime lacks it (then ownerById falls back to a capped strong map). */
interface SdtWeakRef {
    deref(): SolidNode | undefined;
}

/**
 * The on-device `globalThis.__SDT` surface the extension's transport calls over the
 * debug `evaluate` channel. Every lazy* call returns the total base64 length of the
 * stashed result, drained in chunks via `readResult`.
 */
interface SdtApi {
    __sdtBridge: true;
    __connect: (api: SolidApi) => string;
    status: () => string;
    version: () => number;
    lazyRoots: () => number;
    lazyChildren: (idStr: string) => number;
    lazyInspect: (idStr: string) => number;
    lazyValue: (ref: number, offset: number) => number;
    lazySearch: (query: string) => number;
    readResult: (off: number, len: number) => string;
    errorB64: () => string;
    attachAnchor: (name?: string) => boolean;
    registerGlobals: (namespace: string, record: unknown) => void;
}

/** globalThis with the bridge's optional install target. */
type SdtGlobal = typeof globalThis & { __SDT?: SdtApi };
