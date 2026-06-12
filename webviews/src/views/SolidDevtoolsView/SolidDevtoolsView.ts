import { writable } from 'svelte/store';
import { intermediary } from '../../ExtensionIntermediary';
import { ViewProviderCommand } from '../../../../src/viewProviders/ViewProviderCommand';
import type { SolidDevtoolsRequest, SolidDevtoolsResponseData, SolidDevtoolsResult } from '../../../../src/solidDevtools/protocol';

class SolidDevtoolsViewModel {
    /** Id of the tree node currently selected for inspection (shared by every TreeNode row). */
    public selectedId = writable<string | null>(null);

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
