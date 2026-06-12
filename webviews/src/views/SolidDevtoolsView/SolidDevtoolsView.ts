import { writable } from 'svelte/store';
import { intermediary } from '../../ExtensionIntermediary';
import { ViewProviderCommand } from '../../../../src/viewProviders/ViewProviderCommand';
import type { SolidDevtoolsRequest, SolidDevtoolsResponseData, SolidDevtoolsResult } from '../../../../src/solidDevtools/protocol';

/** UI state shared by the sidebar view and the popped-out panel. */
export interface SolidDevtoolsUiState {
    expanded: Record<string, true>;
    selectedId?: string;
    live: boolean;
}

const UI_STATE_KEY = 'solidDevtoolsUiState';

class SolidDevtoolsViewModel {
    /** Id of the tree node currently selected for inspection (shared by every TreeNode row). */
    public selectedId = writable<string | null>(null);

    /**
     * Expanded nodes / selection / live toggle live extension-side in workspaceState —
     * webview-local storage is per-webview, so popping out to the panel (a different
     * webview) would otherwise start from scratch. Loaded once at view startup;
     * written through on actual changes.
     */
    private uiState: SolidDevtoolsUiState = { expanded: {}, live: true };

    public async loadUiState(): Promise<SolidDevtoolsUiState> {
        const stored = await intermediary.getWorkspaceState(UI_STATE_KEY);
        if (stored && typeof stored === 'object') {
            this.uiState = { expanded: {}, live: true, ...stored };
        }
        return this.uiState;
    }

    private saveUiState() {
        void intermediary.updateWorkspaceState(UI_STATE_KEY, this.uiState);
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
