import * as vscode from 'vscode';
export class GlobalStateManager {
    constructor(
        private context: vscode.ExtensionContext
    ) { }

    private keys = {
        lastRunExtensionVersion: 'lastRunExtensionVersion',
        lastSeenReleaseNotesVersion: 'lastSeenReleaseNotesVersion',
        remoteHost: 'remoteHost',
        remotePassword: 'remotePassword'
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

    public get remoteHost() {
        return this.context.workspaceState.get(this.keys.remoteHost);
    }
    public set remoteHost(value: string) {
        this.context.workspaceState.update(this.keys.remoteHost, value);
    }

    public get remotePassword() {
        return this.context.workspaceState.get(this.keys.remotePassword);
    }
    public set remotePassword(value: string) {
        this.context.workspaceState.update(this.keys.remotePassword, value);
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
