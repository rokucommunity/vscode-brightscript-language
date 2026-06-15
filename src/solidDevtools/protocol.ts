/**
 * Shared types for the Solid Devtools view — the contract between the extension side
 * (SolidDevtoolsViewProvider + SolidDevtoolsTransport) and the webview
 * (webviews/src/views/SolidDevtoolsView), mirroring the payloads emitted by the
 * on-device bridge (./bridge). Both sides import this file so they stay in lock-step.
 */

/** workspaceState key holding the view's persisted UI state (expanded/selection/live).
 * Written by the webview (via updateWorkspaceState), cleared by the provider when a
 * new debug session starts — node ids only live for one app run. */
export const SOLID_DEVTOOLS_UI_STATE_KEY = 'solidDevtoolsUiState';

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

/** webview → extension: the `context` of a sendSolidDevtoolsRequest command message. */
export type SolidDevtoolsRequest =
    | { method: 'version' }
    | { method: 'roots' }
    | { method: 'children'; id: string }
    | { method: 'inspect'; id: string }
    | { method: 'value'; ref: number; offset?: number };

/** Maps each request method to its `data` payload type. */
export interface SolidDevtoolsResponseData {
    version: number;
    roots: SolidRootsData;
    children: SolidChildrenData;
    inspect: SolidInspectData;
    value: SolidValueData;
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
