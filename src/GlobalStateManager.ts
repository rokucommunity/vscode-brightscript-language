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
        debugProtocolPopupSnoozeValue: 'debugProtocolPopupSnoozeValue',
        lastSeenDevicesByNetwork: 'lastSeenDevicesByNetwork',
        deviceCache: 'deviceCache'
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

    public getLastSeenDeviceIds(network: string): string[] {
        const networks = this.context.globalState.get<Record<string, LastSeenNetworkEntry>>(this.keys.lastSeenDevicesByNetwork) || {};
        const deviceIds = networks[network]?.deviceIds || [];
        if (deviceIds.length !== 0) {
            networks[network] = { deviceIds: deviceIds, lastSeen: Date.now() };
            void this.context.globalState.update(this.keys.lastSeenDevicesByNetwork, this.expireOldLastSeenNetworks(networks));
        }
        return deviceIds;
    }

    private setLastSeenDeviceIds(network: string, deviceIds: string[]) {
        const networks = this.context.globalState.get<Record<string, LastSeenNetworkEntry>>(this.keys.lastSeenDevicesByNetwork) || {};
        if (deviceIds.length === 0) {
            delete networks[network];
        } else {
            networks[network] = { deviceIds: deviceIds, lastSeen: Date.now() };
        }
        void this.context.globalState.update(this.keys.lastSeenDevicesByNetwork, networks);
    }

    public addLastSeenDevice(network: string, deviceId: string) {
        const deviceIds = this.getLastSeenDeviceIds(network);
        if (!deviceIds.includes(deviceId)) {
            deviceIds.push(deviceId);
            this.setLastSeenDeviceIds(network, deviceIds);
        }
    }

    public removeLastSeenDevice(network: string, deviceId: string) {
        const deviceIds = this.getLastSeenDeviceIds(network);
        if (deviceIds.includes(deviceId)) {
            this.setLastSeenDeviceIds(network, deviceIds.filter((id) => id !== deviceId));
        }
    }

    /**
     * Get cached device details by deviceId
     */
    public getCachedDevice(deviceId: string): CachedDevice | undefined {
        const cache = this.context.globalState.get<Record<string, CachedDevice>>(this.keys.deviceCache) || {};
        return cache[deviceId];
    }

    /**
     * Cache device details for future sessions
     */
    public setCachedDevice(deviceId: string, device: CachedDevice): void {
        const cache = this.context.globalState.get<Record<string, CachedDevice>>(this.keys.deviceCache) || {};
        cache[deviceId] = device;
        void this.context.globalState.update(this.keys.deviceCache, cache);
    }

    /**
     * Remove a device from the cache
     */
    public removeCachedDevice(deviceId: string): void {
        const cache = this.context.globalState.get<Record<string, CachedDevice>>(this.keys.deviceCache) || {};
        delete cache[deviceId];
        void this.context.globalState.update(this.keys.deviceCache, cache);
    }

    /**
     * Clear all cached devices
     */
    public clearDeviceCache(): void {
        void this.context.globalState.update(this.keys.deviceCache, undefined);
    }

    /**
     * Clear all last seen devices for all networks
     */
    public clearLastSeenDevices(): void {
        void this.context.globalState.update(this.keys.lastSeenDevicesByNetwork, undefined);
    }

    private LAST_SEEN_NETWORK_EXPIRATION = 30 * 24 * 60 * 60 * 1_000; // 30 days

    private expireOldLastSeenNetworks(networks: Record<string, LastSeenNetworkEntry>): Record<string, LastSeenNetworkEntry> {
        const now = Date.now();
        for (const network in networks) {
            if (now - networks[network].lastSeen > this.LAST_SEEN_NETWORK_EXPIRATION) {
                delete networks[network];
            }
        }
        return networks;
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

interface LastSeenNetworkEntry {
    deviceIds: string[];
    lastSeen: number;
}

/**
 * Cached device details (RokuDeviceDetails without transient deviceState)
 */
export interface CachedDevice {
    location: string;
    id: string;
    ip: string;
    deviceInfo: Record<string, any>;
}
