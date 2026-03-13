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
        deviceCache: 'deviceCache',
        ipToDeviceId: 'ipToDeviceId'
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

    public setLastSeenDeviceIds(network: string, deviceIds: string[]) {
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

    private LAST_SEEN_NETWORK_EXPIRATION = 30 * 24 * 60 * 60 * 1_000; // 30 days

    /**
     * Delete any device infos from the cache that were created more than LAST_SEEN_NETWORK_EXPIRATION ago
     */
    public clearExpiredDevices() {
        const cache = this.context.globalState.get<Record<string, CachedDevice>>(this.keys.deviceCache) || {};
        const now = Date.now();
        for (const deviceId in cache) {
            if (now - cache[deviceId].createdAt > this.LAST_SEEN_NETWORK_EXPIRATION) {
                delete cache[deviceId];
            }
        }
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

    /**
     * Get deviceId for an IP address.
     * First checks the current network, then falls back to searching all networks for the most recent entry.
     * Used for host-only configured devices to look up cached device info.
     */
    public getDeviceIdForIp(ip: string, currentNetworkId?: string): string | undefined {
        const map = this.context.globalState.get<IpToDeviceIdMap>(this.keys.ipToDeviceId) || {};

        // First, check the current network
        if (currentNetworkId) {
            const currentNetworkEntry = map[currentNetworkId]?.[ip];
            if (currentNetworkEntry) {
                return currentNetworkEntry.deviceId;
            }
        }

        // Fall back to searching all networks, return most recent by timestamp
        let mostRecent: { deviceId: string; timestamp: number } | undefined;
        for (const networkId in map) {
            const networkMap = map[networkId];
            const entry = networkMap?.[ip];
            if (entry && (!mostRecent || entry.timestamp > mostRecent.timestamp)) {
                mostRecent = entry;
            }
        }

        return mostRecent?.deviceId;
    }

    /**
     * Save IP→deviceId mapping for the specified network. Called when a device is successfully resolved.
     */
    public setDeviceIdForIp(networkId: string, ip: string, deviceId: string): void {
        const map = this.context.globalState.get<IpToDeviceIdMap>(this.keys.ipToDeviceId) || {};
        if (!map[networkId]) {
            map[networkId] = {};
        }
        map[networkId][ip] = { deviceId: deviceId, timestamp: Date.now() };
        void this.context.globalState.update(this.keys.ipToDeviceId, map);
    }

    /**
     * Clear the IP→deviceId map
     */
    public clearIpToDeviceIdMap(): void {
        void this.context.globalState.update(this.keys.ipToDeviceId, undefined);
    }

    /**
     * Clear expired entries from the IP→deviceId map (same expiration as other cached data)
     */
    public clearExpiredIpMappings(): void {
        const map = this.context.globalState.get<IpToDeviceIdMap>(this.keys.ipToDeviceId) || {};
        const now = Date.now();
        let changed = false;

        for (const networkId in map) {
            const networkMap = map[networkId];
            for (const ip in networkMap) {
                if (now - networkMap[ip].timestamp > this.LAST_SEEN_NETWORK_EXPIRATION) {
                    delete networkMap[ip];
                    changed = true;
                }
            }
            // Remove empty network entries
            if (Object.keys(networkMap).length === 0) {
                delete map[networkId];
                changed = true;
            }
        }

        if (changed) {
            void this.context.globalState.update(this.keys.ipToDeviceId, map);
        }
    }


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
    createdAt: number;
}

/**
 * Entry in the IP→deviceId map
 */
interface IpToDeviceIdEntry {
    deviceId: string;
    timestamp: number;
}

/**
 * Per-network IP→deviceId mapping with timestamps
 */
type IpToDeviceIdMap = Record<string, Record<string, IpToDeviceIdEntry>>;
