import { writable } from 'svelte/store';
import { intermediary } from '../../ExtensionIntermediary';
import { ViewProviderCommand } from '../../../../src/viewProviders/ViewProviderCommand';
import { SOLID_DEVTOOLS_UI_STATE_KEY } from '../../../../src/solidDevtools/protocol';
import type { SolidDevtoolsRequest, SolidDevtoolsResponseData, SolidDevtoolsResult, SolidTreeNode } from '../../../../src/solidDevtools/protocol';

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
