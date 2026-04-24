import * as vscode from 'vscode';
import { util } from './util';

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
        serialNumberByIpForNetwork: 'serialNumberByIpForNetwork'
    };
    private remoteTextHistoryLimit: number;
    private remoteTextHistoryEnabled: boolean;

    private updateFromVsCodeConfiguration() {
        let config: any = util.getConfiguration('brightscript') || {};
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

    public getLastSeenDevices(network: string): string[] {
        const networks = this.context.globalState.get<Record<string, LastSeenNetworkEntry>>(this.keys.lastSeenDevicesByNetwork) || {};
        const entry = networks[network];
        const serialNumbers = entry?.serialNumbers ?? [];
        if (serialNumbers.length !== 0) {
            networks[network] = { serialNumbers: serialNumbers, lastSeen: Date.now() };
            void this.context.globalState.update(this.keys.lastSeenDevicesByNetwork, this.expireOldLastSeenNetworks(networks));
        }
        return serialNumbers;
    }

    public setLastSeenDevices(network: string, serialNumbers: string[]) {
        const networks = this.context.globalState.get<Record<string, LastSeenNetworkEntry>>(this.keys.lastSeenDevicesByNetwork) || {};
        if (serialNumbers.length === 0) {
            delete networks[network];
        } else {
            networks[network] = { serialNumbers: serialNumbers, lastSeen: Date.now() };
        }
        void this.context.globalState.update(this.keys.lastSeenDevicesByNetwork, networks);
    }

    public addLastSeenDevice(network: string, serialNumber: string) {
        const serialNumbers = this.getLastSeenDevices(network);
        if (!serialNumbers.includes(serialNumber)) {
            serialNumbers.push(serialNumber);
            this.setLastSeenDevices(network, serialNumbers);
        }
    }

    public removeLastSeenDevice(network: string, serialNumber: string) {
        const serialNumbers = this.getLastSeenDevices(network);
        if (serialNumbers.includes(serialNumber)) {
            this.setLastSeenDevices(network, serialNumbers.filter((existing) => existing !== serialNumber));
        }
    }

    /**
     * Get cached device details by serial number
     */
    public getCachedDevice(serialNumber: string): CachedDevice | undefined {
        const cache = this.context.globalState.get<Record<string, CachedDevice>>(this.keys.deviceCache) || {};
        return cache[serialNumber];
    }

    /**
     * Cache device details for future sessions
     */
    public setCachedDevice(serialNumber: string, device: CachedDevice): void {
        const cache = this.context.globalState.get<Record<string, CachedDevice>>(this.keys.deviceCache) || {};
        cache[serialNumber] = device;
        void this.context.globalState.update(this.keys.deviceCache, cache);
    }

    private LAST_SEEN_NETWORK_EXPIRATION = 30 * 24 * 60 * 60 * 1_000; // 30 days

    /**
     * Delete any device infos from the cache that were created more than LAST_SEEN_NETWORK_EXPIRATION ago
     */
    public clearExpiredDevices() {
        const cache = this.context.globalState.get<Record<string, CachedDevice>>(this.keys.deviceCache) || {};
        const now = Date.now();
        for (const serialNumber in cache) {
            if (now - cache[serialNumber].createdAt > this.LAST_SEEN_NETWORK_EXPIRATION) {
                delete cache[serialNumber];
            }
        }
        void this.context.globalState.update(this.keys.deviceCache, cache);
    }

    /**
     * Remove a device from the cache
     */
    public removeCachedDevice(serialNumber: string): void {
        const cache = this.context.globalState.get<Record<string, CachedDevice>>(this.keys.deviceCache) || {};
        delete cache[serialNumber];
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
     * Get serial number for an IP address.
     * First checks the current network, then falls back to searching all networks for the most recent entry.
     * Used for host-only configured devices to look up cached device info.
     */
    public getSerialNumberForIp(ip: string, currentNetworkId?: string): string | undefined {
        this.clearExpiredEntriesSerialNumberByIpForNetwork();
        const map = this.context.globalState.get<IpToSerialNumberMap>(this.keys.serialNumberByIpForNetwork) || {};
        // First, check the current network
        if (currentNetworkId) {
            const currentNetworkEntry = map[currentNetworkId]?.[ip];
            if (currentNetworkEntry) {
                return currentNetworkEntry.serialNumber;
            }
        }

        // Fall back to searching all networks, return most recent by timestamp
        let mostRecent: { serialNumber: string; timestamp: number } | undefined;
        for (const networkId in map) {
            const networkMap = map[networkId];
            const entry = networkMap?.[ip];
            if (entry && (!mostRecent || entry.timestamp > mostRecent.timestamp)) {
                mostRecent = entry;
            }
        }

        return mostRecent?.serialNumber;
    }

    /**
     * Save IP→serialNumber mapping for the specified network. Called when a device is successfully resolved.
     * Ensures uniqueness: removes any existing entry with the same serial number (device moved IPs).
     * IP uniqueness is implicit since IP is the key.
     */
    public setSerialNumberForIp(networkId: string, ip: string, serialNumber: string): void {
        const map = this.context.globalState.get<IpToSerialNumberMap>(this.keys.serialNumberByIpForNetwork) || {};
        if (!map[networkId]) {
            map[networkId] = {};
        }

        // Remove any existing entry with the same serial number (device moved IPs)
        for (const existingIp in map[networkId]) {
            if (map[networkId][existingIp].serialNumber === serialNumber && existingIp !== ip) {
                delete map[networkId][existingIp];
            }
        }

        map[networkId][ip] = { serialNumber: serialNumber, timestamp: Date.now() };
        void this.context.globalState.update(this.keys.serialNumberByIpForNetwork, map);
    }

    /**
     * Get the most recent IP address for a given serial number.
     * Checks current network first, then falls back to any network.
     */
    public getIpForSerial(serialNumber: string, currentNetworkId?: string): string | undefined {
        this.clearExpiredEntriesSerialNumberByIpForNetwork();
        const map = this.context.globalState.get<IpToSerialNumberMap>(this.keys.serialNumberByIpForNetwork) || {};

        // First try: Current network mapping
        if (currentNetworkId && map[currentNetworkId]) {
            for (const [ip, entry] of Object.entries(map[currentNetworkId])) {
                if (entry.serialNumber === serialNumber) {
                    return ip;
                }
            }
        }

        // Fallback: Any network
        for (const networkId in map) {
            const networkMap = map[networkId];
            for (const [ip, entry] of Object.entries(networkMap)) {
                if (entry.serialNumber === serialNumber) {
                    return ip;
                }
            }
        }

        return undefined;
    }

    /**
     * Clear the IP→serialNumber map
     */
    public clearSerialNumberByIpForNetwork(): void {
        void this.context.globalState.update(this.keys.serialNumberByIpForNetwork, undefined);
    }

    private LAST_AUDIT_TIME_SERIALNUMBER_BY_IP_FOR_NETWORK = 0;
    /**
     * Clear expired entries from the IP→serialNumber map (same expiration as other cached data)
     */
    public clearExpiredEntriesSerialNumberByIpForNetwork(): void {
        const now = Date.now();
        if (now - this.LAST_AUDIT_TIME_SERIALNUMBER_BY_IP_FOR_NETWORK < 24 * 60 * 60 * 1_000) {
            return;
        }
        this.LAST_AUDIT_TIME_SERIALNUMBER_BY_IP_FOR_NETWORK = now;

        const map = this.context.globalState.get<IpToSerialNumberMap>(this.keys.serialNumberByIpForNetwork) || {};
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
            void this.context.globalState.update(this.keys.serialNumberByIpForNetwork, map);
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
    serialNumbers: string[];
    lastSeen: number;
}

/**
 * Cached device details (RokuDevice without transient deviceState)
 */
export interface CachedDevice {
    serialNumber: string;
    deviceInfo: Record<string, any>;
    createdAt: number;
}


/**
 * Entry in the IP→serialNumber map
 */
interface IpToSerialNumberEntry {
    serialNumber: string;
    timestamp: number;
}

/**
 * Per-network IP→serialNumber mapping with timestamps
 */
type IpToSerialNumberMap = Record<string, Record<string, IpToSerialNumberEntry>>;
