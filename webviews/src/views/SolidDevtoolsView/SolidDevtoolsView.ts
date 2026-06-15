import { writable } from 'svelte/store';
import { intermediary } from '../../ExtensionIntermediary';
import { ViewProviderCommand } from '../../../../src/viewProviders/ViewProviderCommand';
import { SOLID_DEVTOOLS_UI_STATE_KEY } from '../../../../src/solidDevtools/protocol';
import type { SolidDevtoolsRequest, SolidDevtoolsResponseData, SolidDevtoolsResult, SolidEncodedValue, SolidTreeNode } from '../../../../src/solidDevtools/protocol';

/** An expanded value's fetched children + paging cursor (drill-down state, by ref). */
export interface DrillNode {
    node: SolidEncodedValue;
    /** Offset to request for the next "show more" page (array index / object key index
     * / string char offset). */
    nextOffset: number;
    /** Items/keys/chars still beyond what's loaded. */
    more: number;
    /** Ref to use for the next page (same ref for the same value). */
    pageRef?: number;
}

/** UI state shared by the sidebar view and the popped-out panel. */
export interface SolidDevtoolsUiState {
    expanded: Record<string, true>;
    selectedId?: string;
    live: boolean;
}

class SolidDevtoolsViewModel {
    /** Id of the tree node currently selected for inspection (shared by every TreeNode row). */
    public selectedId = writable<string | null>(null);

    /** The selected tree node itself — drives the inspector header so the pane always
     * shows WHICH node is selected even if the inspect comes back empty or errors. */
    public selectedNode = writable<SolidTreeNode | null>(null);

    /** Select a node for inspection (called by every TreeNode row). */
    public select(node: SolidTreeNode) {
        this.selectedNode.set(node);
        this.setSelected(node.id);
        this.selectedId.set(node.id);
    }

    /**
     * Expanded nodes / selection / live toggle live extension-side in workspaceState —
     * webview-local storage is per-webview, so popping out to the panel (a different
     * webview) would otherwise start from scratch. Loaded once at view startup;
     * written through on actual changes.
     */
    private uiState: SolidDevtoolsUiState = { expanded: {}, live: true };

    public async loadUiState(): Promise<SolidDevtoolsUiState> {
        const stored = await intermediary.getWorkspaceState(SOLID_DEVTOOLS_UI_STATE_KEY);
        if (stored && typeof stored === 'object') {
            this.uiState = { expanded: {}, live: true, ...stored };
        }
        return this.uiState;
    }

    private saveUiState() {
        void intermediary.updateWorkspaceState(SOLID_DEVTOOLS_UI_STATE_KEY, this.uiState);
    }

    /** A new debug session started — node ids from the previous run are dead. Drop
     * expansion + selection (the live preference isn't per-session and survives). */
    public resetUiState() {
        this.uiState = { expanded: {}, live: this.uiState.live };
        this.saveUiState();
    }

    public isExpanded(id: string) {
        return this.uiState.expanded[id] === true;
    }

    public setExpanded(id: string, expanded: boolean) {
        if (this.isExpanded(id) === expanded) {
            return;
        }
        if (expanded) {
            this.uiState.expanded[id] = true;
        } else {
            delete this.uiState.expanded[id];
        }
        this.saveUiState();
    }

    public setSelected(id: string) {
        if (this.uiState.selectedId === id) {
            return;
        }
        this.uiState.selectedId = id;
        this.saveUiState();
    }

    public setLive(live: boolean) {
        if (this.uiState.live === live) {
            return;
        }
        this.uiState.live = live;
        this.saveUiState();
    }

    /**
     * Promise-style request to the on-device bridge via SolidDevtoolsViewProvider.
     * Expected not-available states (no debug session, no bridge) resolve as
     * `{ ok: false, reason }` — they never reject.
     */
    public sendRequest<M extends SolidDevtoolsRequest['method']>(request: SolidDevtoolsRequest & { method: M }) {
        return intermediary.sendCommand<SolidDevtoolsResult<SolidDevtoolsResponseData[M]>>(ViewProviderCommand.sendSolidDevtoolsRequest, request);
    }

    // ---- value drill-down (lazyValue) -------------------------------------------
    // The bridge's value `ref`s only live until the next lazyInspect (it resets its
    // registry per inspect), so a live re-inspect invalidates an open drill-down's
    // handles. To keep drill-down LIVE we key expansion by a stable PATH (not by ref)
    // and re-fetch each open path against the FRESH ref after every inspect — the
    // recursive ValueNode does this top-down: when its value's ref changes it re-fetches
    // its own children, which hands fresh refs to ITS children, cascading all the way
    // down. Paths are `<rowKey>/<childIndex>/…` — unique and order-stable across
    // refreshes. Reset only when the inspected NODE changes (paths are node-relative).

    public drill = writable<{ open: Set<string>; children: Record<string, DrillNode> }>({ open: new Set(), children: {} });
    private open = new Set<string>();
    private children: Record<string, DrillNode> = {};

    private publishDrill() {
        this.drill.set({ open: new Set(this.open), children: { ...this.children } });
    }

    public openPath(path: string) {
        this.open.add(path);
        this.publishDrill(); // ValueNode's reactive fetch picks it up with the live ref
    }

    /** Collapse a path and everything under it. */
    public closePath(path: string) {
        const prefix = path + '/';
        for (const p of [...this.open]) {
            if (p === path || p.startsWith(prefix)) {
                this.open.delete(p);
            }
        }
        for (const p of Object.keys(this.children)) {
            if (p === path || p.startsWith(prefix)) {
                delete this.children[p];
            }
        }
        this.publishDrill();
    }

    /** (Re)fetch the first page of children for an open path, using its CURRENT ref.
     * Called by ValueNode whenever the value's ref changes (i.e. after a re-inspect). */
    public async fetchPath(path: string, ref: number): Promise<void> {
        const result = await this.sendRequest({ method: 'value', ref: ref, offset: 0 });
        if (!this.open.has(path)) {
            return; // collapsed while in flight
        }
        if (!result.ok || !result.data?.node || result.data.missing) {
            delete this.children[path];
        } else {
            this.children[path] = this.toDrillNode(result.data.node);
        }
        this.publishDrill();
    }

    /** Append the next page of an already-expanded path. */
    public async loadMorePath(path: string): Promise<void> {
        const current = this.children[path];
        if (!current || current.pageRef === undefined) {
            return;
        }
        const result = await this.sendRequest({ method: 'value', ref: current.pageRef, offset: current.nextOffset });
        if (!result.ok || !result.data?.node || result.data.missing || !this.children[path]) {
            return;
        }
        const fresh = result.data.node;
        const node = current.node;
        if (fresh.t === 'string') {
            node.v = String(node.v ?? '') + String(fresh.v ?? '');
        } else if (fresh.items) {
            node.items = [...(node.items ?? []), ...fresh.items];
        } else if (fresh.entries) {
            node.entries = [...(node.entries ?? []), ...fresh.entries];
        }
        this.children[path] = this.toDrillNode(node, fresh);
        this.publishDrill();
    }

    /** Drop all expansion (call when the inspected node changes — paths are node-relative). */
    public resetDrill() {
        if (this.open.size || Object.keys(this.children).length) {
            this.open = new Set();
            this.children = {};
            this.publishDrill();
        }
    }

    /**
     * Build a DrillNode (accumulated children + next-page cursor) from a response.
     * `node` is what we render (the accumulated value on paging); `fresh` is the page
     * just fetched — its offset + loaded count is where the NEXT page starts. The
     * bridge tags `offset`/`more`/`ref` on every paged response (see expandRef).
     */
    private toDrillNode(node: SolidEncodedValue, fresh: SolidEncodedValue = node): DrillNode {
        const freshBase = fresh.offset ?? 0;
        const freshCount = fresh.t === 'string'
            ? String(fresh.v ?? '').length
            : (fresh.items?.length ?? fresh.entries?.length ?? 0);
        return {
            node: node,
            nextOffset: freshBase + freshCount,
            more: fresh.more ?? 0,
            pageRef: fresh.ref
        };
    }
}

export const solidDevtools = new SolidDevtoolsViewModel();

/** Drop any duplicate-id nodes. The tree's keyed {#each (id)} throws (blanking the
 * whole view) on a dup, so never trust the bridge to be dup-free at the render layer. */
export function dedupeById(nodes: SolidTreeNode[]): SolidTreeNode[] {
    const seen = new Set<string>();
    return nodes.filter((node) => {
        if (seen.has(node.id)) {
            return false;
        }
        seen.add(node.id);
        return true;
    });
}
