import { writable } from 'svelte/store';
import { intermediary } from '../../ExtensionIntermediary';
import { ViewProviderCommand } from '../../../../src/viewProviders/ViewProviderCommand';
import { SOLID_DEVTOOLS_UI_STATE_KEY, defaultLayoutForContext, resetUiStateForNewSession } from '../../../../src/solidDevtools/protocol';
import type { SolidDevtoolsPerfSample, SolidDevtoolsRequest, SolidDevtoolsResponseData, SolidDevtoolsResult, SolidDevtoolsUiState, SolidEncodedValue, SolidLayoutState, SolidSearchMatch, SolidTreeNode, SolidWebviewContext } from '../../../../src/solidDevtools/protocol';

/** A perf sample stamped with its receipt time (for rolling-window throughput). */
export interface PerfSample extends SolidDevtoolsPerfSample {
    t: number;
}

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

class SolidDevtoolsViewModel {
    /** Id of the tree node currently selected for inspection (shared by every TreeNode row). */
    public selectedId = writable<string | null>(null);

    /** The selected tree node itself — drives the inspector header so the pane always
     * shows WHICH node is selected even if the inspect comes back empty or errors. */
    public selectedNode = writable<SolidTreeNode | null>(null);

    /** When set, the TreeNode with this id scrolls itself into view on (re)render, then
     * clears it. Used by "reveal in tree" from a search result. */
    public scrollTargetId = writable<string | null>(null);

    /** The focused row (distinct from selection, like VS Code): clicking a chevron to
     * expand focuses a row without selecting it. Selecting also focuses. */
    public focusedId = writable<string | null>(null);

    /** Active indent-guide anchor + level. The guide at indent index `activeGuideLevel`
     * is drawn bright on every row inside `activeGuideAncestorId`'s subtree. The selected
     * TreeNode publishes these from its live expand state: when expanded it lights the
     * guide its children hang off of; when leaf/collapsed, the guide at its own level. */
    public activeGuideAncestorId = writable<string | null>(null);
    public activeGuideLevel = writable<number>(-1);

    /** Select a node for inspection (called by every TreeNode row / search result). */
    public select(node: SolidTreeNode) {
        this.selectedNode.set(node);
        this.focusedId.set(node.id);
        this.setSelected(node.id);
        this.selectedId.set(node.id);
    }

    public setFocused(id: string) {
        this.focusedId.set(id);
    }

    public setActiveGuide(ancestorId: string | null, level: number) {
        this.activeGuideAncestorId.set(ancestorId);
        this.activeGuideLevel.set(level);
    }

    public clearScrollTarget() {
        this.scrollTargetId.set(null);
    }

    /**
     * Jump from a search result to the node in the tree: mark its ancestors expanded
     * (so the tree cascades open to it when search clears and the tree remounts), select
     * it, and request a scroll. The caller clears the search box afterward.
     */
    public revealInTree(match: SolidSearchMatch) {
        for (const id of match.ancestorIds ?? []) {
            this.setExpanded(id, true);
        }
        this.scrollTargetId.set(match.id);
        this.select({ id: match.id, name: match.name, type: match.type });
    }

    /**
     * Expanded nodes / selection / live toggle live extension-side in workspaceState —
     * webview-local storage is per-webview, so popping out to the panel (a different
     * webview) would otherwise start from scratch. Loaded once at view startup;
     * written through on actual changes.
     */
    private uiState: SolidDevtoolsUiState = { expanded: {}, live: true };

    /** Which copy of the view this is — the sidebar and the popped-out panel remember
     * their inspector layout independently. Set once at startup from window.webviewContext. */
    private context: SolidWebviewContext = 'sidebar';

    public setContext(context: SolidWebviewContext) {
        this.context = context;
    }

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

    /** This context's persisted inspector layout, with context-aware defaults filled in
     * (sidebar → bottom, pop-out panel → right). */
    public getLayout(): SolidLayoutState {
        return { ...defaultLayoutForContext(this.context), ...this.uiState.layouts?.[this.context] };
    }

    public saveLayout(layout: SolidLayoutState) {
        this.uiState.layouts = { ...this.uiState.layouts, [this.context]: layout };
        this.saveUiState();
    }

    /** A new debug session started — node ids from the previous run are dead. Drop
     * expansion + selection; keep the live preference + per-context layout (not per-session). */
    public resetUiState() {
        this.uiState = resetUiStateForNewSession(this.uiState) ?? { expanded: {}, live: true };
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

    public setPerf(enabled: boolean) {
        if (this.uiState.perf === enabled) {
            return;
        }
        this.uiState.perf = enabled;
        this.saveUiState();
    }

    // ---- perf overlay metrics ---------------------------------------------------
    // The transport (extension side) streams a timed sample per bridge round-trip via
    // the onSolidDevtoolsPerfSample event; the view records them here so the overlay can
    // show where the latency goes (device encode vs. drain round-trips) and spot the
    // refresh-cascade saturating the single serialized channel.
    public perfSamples = writable<PerfSample[]>([]);
    private perfBuffer: PerfSample[] = [];
    private static readonly PERF_CAP = 400;
    private perfPublishTimer: ReturnType<typeof setTimeout> | undefined;

    /** Record a round-trip (stamped on receipt). Publishes on a 200ms cadence so a
     * refresh burst can't make the overlay's own rendering a bottleneck. */
    public recordPerf(sample: SolidDevtoolsPerfSample) {
        this.perfBuffer.push({ ...sample, t: Date.now() });
        if (this.perfBuffer.length > SolidDevtoolsViewModel.PERF_CAP) {
            this.perfBuffer.splice(0, this.perfBuffer.length - SolidDevtoolsViewModel.PERF_CAP);
        }
        if (this.perfPublishTimer === undefined) {
            this.perfPublishTimer = setTimeout(() => {
                this.perfPublishTimer = undefined;
                this.perfSamples.set([...this.perfBuffer]);
            }, 200);
        }
    }

    public clearPerf() {
        this.perfBuffer = [];
        this.perfSamples.set([]);
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

    // ---- full-tree search -------------------------------------------------------
    /** null = not searching (show the tree); array (possibly empty) = active results. */
    public searchResults = writable<SolidSearchMatch[] | null>(null);
    /** True while a search request is in flight (for a spinner / "searching…"). */
    public searching = writable<boolean>(false);
    /** Non-null when the search REQUEST failed (vs. genuinely zero matches). */
    public searchError = writable<string | null>(null);
    private searchSeq = 0;

    /** Run a full-tree name search; empty query clears results (back to the tree). */
    public async runSearch(query: string): Promise<void> {
        const trimmed = query.trim();
        const seq = ++this.searchSeq; // ignore out-of-order responses from earlier keystrokes
        if (!trimmed) {
            this.searching.set(false);
            this.searchResults.set(null);
            this.searchError.set(null);
            return;
        }
        this.searching.set(true);
        this.searchError.set(null);
        const result = await this.sendRequest({ method: 'search', query: trimmed });
        if (seq !== this.searchSeq) {
            return; // a newer search superseded this one
        }
        this.searching.set(false);
        if (result.ok) {
            this.searchResults.set(result.data.matches);
            this.searchError.set(null);
            return;
        }
        // A failed request is NOT "no matches" — surface why. The common case is an
        // older on-device bridge without lazySearch (the evaluate throws), so hint at it.
        const reasonMessages: Record<string, string> = {
            'no-session': 'No debug session — launch an RSG/TS app.',
            'no-bridge': 'No devtools bridge on the device yet.'
        };
        this.searchResults.set([]);
        this.searchError.set(
            reasonMessages[result.reason ?? ''] ?? 'Search failed — relaunch the app so the updated devtools bridge is injected.'
        );
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
