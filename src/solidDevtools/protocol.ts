/**
 * Shared types for the Solid Devtools view — the contract between the extension side
 * (SolidDevtoolsViewProvider + SolidDevtoolsTransport) and the webview
 * (webviews/src/views/SolidDevtoolsView), mirroring the payloads emitted by the
 * on-device bridge (./bridge). Both sides import this file so they stay in lock-step.
 */

/** workspaceState key holding the view's persisted UI state (expanded/selection/live
 * + per-context layout). Written by the webview (via updateWorkspaceState); the
 * provider drops the node-specific bits (but keeps layout/live) when a new debug
 * session starts — node ids only live for one app run. */
export const SOLID_DEVTOOLS_UI_STATE_KEY = 'solidDevtoolsUiState';

/** The same webview component runs in two places — the Run-and-Debug sidebar view and
 * the popped-out editor panel — and each remembers its own inspector layout. */
export type SolidWebviewContext = 'sidebar' | 'panel';

/** Which side of the view the inspector pane docks on (VS Code "Panel Position" parity). */
export type SolidInspectorPosition = 'bottom' | 'top' | 'left' | 'right';

/** Inspector-pane layout for ONE context. Persisted per workspace + per context. */
export interface SolidLayoutState {
    position: SolidInspectorPosition;
    /** Collapsed = body hidden, header strip stays (controls remain reachable). */
    collapsed: boolean;
    /** Inspector size as a fraction (0..1) of the body along the split axis. */
    sizePct: number;
}

export const DEFAULT_SOLID_LAYOUT: SolidLayoutState = { position: 'bottom', collapsed: false, sizePct: 0.42 };

/** Default layout for a context (used until the user moves the inspector). The sidebar is
 * narrow + tall, so the inspector reads best docked at the BOTTOM; the popped-out editor
 * panel is wide, so it reads best docked at the RIGHT. */
export function defaultLayoutForContext(context: SolidWebviewContext): SolidLayoutState {
    return { ...DEFAULT_SOLID_LAYOUT, position: context === 'panel' ? 'right' : 'bottom' };
}

/** Persisted UI state for the Solid Devtools view, shared by the sidebar + panel copies.
 * `expanded`/`selectedId` are per-debug-session (node ids); `live`/`layouts`/`perf` outlive
 * a session. `layouts` is keyed by context so the sidebar and pop-out remember separately. */
export interface SolidDevtoolsUiState {
    expanded: Record<string, true>;
    selectedId?: string;
    live: boolean;
    /** Whether the perf overlay is shown (a dev preference, persisted like `live`). */
    perf?: boolean;
    layouts?: Partial<Record<SolidWebviewContext, SolidLayoutState>>;
}

/** A new debug session = a fresh owner graph, so previous node ids are dead. Keep the
 * developer's layout/live/perf preferences; drop expansion/selection. Returns undefined
 * when there was nothing stored (so the key clears entirely). */
export function resetUiStateForNewSession(prev: SolidDevtoolsUiState | undefined): SolidDevtoolsUiState | undefined {
    if (!prev) {
        return undefined;
    }
    return { expanded: {}, live: prev.live, perf: prev.perf, layouts: prev.layouts };
}

/**
 * One timed bridge round-trip, emitted by the transport and streamed to the perf overlay.
 * `deviceMs` is the lazy call itself (on-device encode + one evaluate round-trip);
 * `drainMs` is the readResult paging loop; `roundTrips` counts every evaluate (1 + drains);
 * `bytes` is the base64 payload length drained.
 */
export interface SolidDevtoolsPerfSample {
    op: 'version' | 'roots' | 'children' | 'inspect' | 'value' | 'search';
    totalMs: number;
    deviceMs?: number;
    drainMs?: number;
    roundTrips?: number;
    bytes?: number;
}

/** One row in the component tree (a `nodes` entry from lazyRoots/lazyChildren). */
export interface SolidTreeNode {
    id: string;
    /** Owner classification, e.g. COMPONENT / ANCHOR / GLOBALS. */
    type: string;
    name?: string;
    childCount?: number;
    /** Nothing to expand (e.g. a Globals entry) — select it to inspect instead. */
    leaf?: boolean;
}

/**
 * The bridge's encodeValue() output: a one-level preview of a runtime value.
 * Anything not fully shown carries a `ref` expandable via a `value` request —
 * refs are only valid until the NEXT inspect (the bridge resets its registry).
 */
export interface SolidEncodedValue {
    t: 'number' | 'boolean' | 'string' | 'bigint' | 'function' | 'symbol' | 'null' | 'undefined' | 'circular' | 'array' | 'object';
    v?: string | number | boolean;
    /** Full length of a truncated string / un-expanded array. */
    len?: number;
    items?: SolidEncodedValue[];
    entries?: Array<{ k: string; value: SolidEncodedValue }>;
    /** Count of items/keys beyond the shown breadth. */
    more?: number;
    /** Constructor name for non-plain objects (e.g. a SceneGraph node class). */
    ctor?: string;
    ref?: number;
    /** Start index/char offset of this page — set by lazyValue on paged responses. */
    offset?: number;
}

/** A named row in an inspect section (props use `key`, the others use `name`). */
export interface SolidInspectEntry {
    key?: string;
    name?: string;
    /** Absent for props we deliberately don't resolve (children/ref). */
    value?: SolidEncodedValue;
}

/** lazyInspect payload — one node's props/signals/memos/stores/rendered value. */
export interface SolidInspectData {
    id: string;
    name?: string;
    type?: string;
    props?: SolidInspectEntry[];
    signals?: SolidInspectEntry[];
    memos?: SolidInspectEntry[];
    stores?: SolidInspectEntry[];
    value?: SolidEncodedValue;
    error?: string;
    /** Some values were collapsed to keep the payload inside the bridge's node budget. */
    truncated?: boolean;
    /** The node is no longer present in the graph. */
    missing?: boolean;
}

export interface SolidRootsData {
    /** False = bridge injected but solid DEV never connected (not a dev build). */
    connected: boolean;
    nodes: SolidTreeNode[];
}

export interface SolidChildrenData {
    parent: string;
    nodes: SolidTreeNode[];
    missing?: boolean;
}

/** lazyValue payload — one collapsed value expanded one more level (drill-down). */
export interface SolidValueData {
    ref: number;
    offset: number;
    node?: SolidEncodedValue;
    missing?: boolean;
    error?: string;
}

/** One hit from a full-tree name search, with a `›`-joined ancestor path for context. */
export interface SolidSearchMatch {
    id: string;
    name: string;
    type: string;
    path: string;
    /** Ancestor node ids (top → parent) — the tree expands these to reveal the match. */
    ancestorIds: string[];
}

export interface SolidSearchData {
    matches: SolidSearchMatch[];
}

/** webview → extension: the `context` of a sendSolidDevtoolsRequest command message. */
export type SolidDevtoolsRequest =
    | { method: 'version' }
    | { method: 'roots' }
    | { method: 'children'; id: string }
    | { method: 'inspect'; id: string }
    | { method: 'value'; ref: number; offset?: number }
    | { method: 'search'; query: string };

/** Maps each request method to its `data` payload type. */
export interface SolidDevtoolsResponseData {
    version: number;
    roots: SolidRootsData;
    children: SolidChildrenData;
    inspect: SolidInspectData;
    value: SolidValueData;
    search: SolidSearchData;
}

/**
 * extension → webview response. Expected not-available states (no debug session yet,
 * bridge not on device) are results — not promise rejections — so the view can render
 * them as guidance rather than errors. `data` is present exactly when `ok` is true,
 * `reason` exactly when it's false (deliberately NOT a discriminated union — the
 * webviews tsconfig is non-strict and svelte-check doesn't narrow them).
 */
export interface SolidDevtoolsResult<T> {
    ok: boolean;
    data?: T;
    reason?: 'no-session' | 'no-bridge' | 'error';
    message?: string;
}
