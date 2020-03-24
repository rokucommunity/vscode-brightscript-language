import * as vscode from 'vscode';
export class GlobalStateManager {
    constructor(
        private context: vscode.ExtensionContext
    ) { }

    private keys = {
        lastRunExtensionVersion: 'lastRunExtensionVersion',
        lastSeenReleaseNotesVersion: 'lastSeenReleaseNotesVersion'
    };

    public get lastRunExtensionVersion() {
        return this.context.globalState.get(this.keys.lastRunExtensionVersion);
    }
    public set lastRunExtensionVersion(value: string) {
        this.context.globalState.update(this.keys.lastRunExtensionVersion, value);
    }

    public get lastSeenReleaseNotesVersion() {
        return this.context.globalState.get(this.keys.lastSeenReleaseNotesVersion);
    }
    public set lastSeenReleaseNotesVersion(value: string) {
        this.context.globalState.update(this.keys.lastSeenReleaseNotesVersion, value);
    }

    /**
     * Clear all known global state values for this extension
     */
    public clear() {
        for (let i in this.keys) {
            var key = this.keys[i];
            this[key] = undefined;
        }
    }
}
