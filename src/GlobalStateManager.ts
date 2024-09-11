import * as vscode from 'vscode';

export class GlobalStateManager {
    constructor(
        private context: vscode.ExtensionContext
    ) {
        this.updateFromVsCodeConfiguration();
        vscode.workspace.onDidChangeConfiguration(() => this.updateFromVsCodeConfiguration());
    }

    private keys = {
        lastRunExtensionVersion: 'lastRunExtensionVersion',
        lastSeenReleaseNotesVersion: 'lastSeenReleaseNotesVersion',
        sendRemoteTextHistory: 'sendRemoteTextHistory',
        debugProtocolPopupSnoozeUntilDate: 'debugProtocolPopupSnoozeUntilDate',
        debugProtocolPopupSnoozeValue: 'debugProtocolPopupSnoozeValue'

    };
    private remoteTextHistoryLimit: number;
    private remoteTextHistoryEnabled: boolean;

    private updateFromVsCodeConfiguration() {
        let config: any = vscode.workspace.getConfiguration('brightscript') || {};
        this.remoteTextHistoryLimit = (config.sendRemoteTextHistory || { limit: 30 }).limit;
        this.remoteTextHistoryEnabled = config.sendRemoteTextHistory?.enabled;
    }

    public get lastRunExtensionVersion() {
        return this.context.globalState.get(this.keys.lastRunExtensionVersion);
    }
    public set lastRunExtensionVersion(value: string) {
        void this.context.globalState.update(this.keys.lastRunExtensionVersion, value);
    }

    public get lastSeenReleaseNotesVersion() {
        return this.context.globalState.get(this.keys.lastSeenReleaseNotesVersion);
    }
    public set lastSeenReleaseNotesVersion(value: string) {
        void this.context.globalState.update(this.keys.lastSeenReleaseNotesVersion, value);
    }

    public get debugProtocolPopupSnoozeUntilDate(): Date {
        const epoch = this.context.globalState.get<number>(this.keys.debugProtocolPopupSnoozeUntilDate);
        if (epoch) {
            return new Date(epoch);
        }
    }
    public set debugProtocolPopupSnoozeUntilDate(value: Date) {
        void this.context.globalState.update(this.keys.debugProtocolPopupSnoozeUntilDate, value?.getTime());
    }


    public get debugProtocolPopupSnoozeValue(): boolean {
        return this.context.globalState.get<boolean>(this.keys.debugProtocolPopupSnoozeValue);
    }
    public set debugProtocolPopupSnoozeValue(value: boolean) {
        void this.context.globalState.update(this.keys.debugProtocolPopupSnoozeValue, value);
    }


    public get sendRemoteTextHistory(): string[] {
        return this.context.globalState.get(this.keys.sendRemoteTextHistory) ?? [];
    }
    public set sendRemoteTextHistory(history: string[]) {
        history ??= [];
        // only update the results if the user has the the history enabled
        if (this.remoteTextHistoryEnabled) {
            // limit the number of entries saved to history
            history.length = Math.min(history.length, this.remoteTextHistoryLimit);
            void this.context.globalState.update(this.keys.sendRemoteTextHistory, history);
        }
    }

    public addTextHistory(value: string) {
        if (value !== '' && this.remoteTextHistoryEnabled) {
            let history = this.sendRemoteTextHistory;
            const index = history.indexOf(value);
            if (index > -1) {
                // Remove this entry to prevent duplicates in the saved history
                history.splice(index, 1);
            }

            // Add the the start of the array so that the history is most resent to oldest
            history.unshift(value);

            this.sendRemoteTextHistory = history;
        }
    }

    /**
     * Clear all known global state values for this extension
     */
    public clear() {
        for (let i in this.keys) {
            const key = this.keys[i];
            this[key] = undefined;
        }
    }
}
