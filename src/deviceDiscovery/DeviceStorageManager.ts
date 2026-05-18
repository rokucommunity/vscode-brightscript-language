import * as vscode from 'vscode';

/**
 * Interface for components that need heartbeat tracking (e.g., RokuFinder)
 */
export interface HeartbeatProvider {
    getLastAliveTimestamp(key: string): number | undefined;
    setLastAliveTimestamp(key: string, timestamp: number): void;
}

/**
 * Manages device-related persistent storage (last seen devices, device cache, IP mappings, heartbeats)
 */
export class DeviceStorageManager implements HeartbeatProvider {
    constructor(
        private context: vscode.ExtensionContext
    ) { }

    private keys = {
        lastSeenDevicesByNetwork: 'lastSeenDevicesByNetwork',
        deviceCache: 'deviceCache',
        serialNumberByIpForNetwork: 'serialNumberByIpForNetwork',
        lastAliveTimestamp: 'lastAliveTimestamp'
    };

    private LAST_SEEN_NETWORK_EXPIRATION = 30 * 24 * 60 * 60 * 1_000; // 30 days

    // ==================== Last Seen Devices ====================

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
        // Set to undefined if empty to keep storage clean
        const value = Object.keys(networks).length === 0 ? undefined : networks;
        void this.context.globalState.update(this.keys.lastSeenDevicesByNetwork, value);
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
     * Clear all last seen devices for all networks
     */
    public clearLastSeenDevices(): void {
        void this.context.globalState.update(this.keys.lastSeenDevicesByNetwork, undefined);
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

    // ==================== Device Cache ====================

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

    // ==================== IP to Serial Number Mapping ====================

    private LAST_AUDIT_TIME_SERIALNUMBER_BY_IP_FOR_NETWORK = 0;

    /**
     * Get serial number for an IP address.
     * When currentNetworkId is provided, ONLY checks that specific network (network-specific lookup).
     * When currentNetworkId is NOT provided, searches all networks for the most recent entry.
     * Used for host-only configured devices to look up cached device info.
     */
    public getSerialNumberForIp(ip: string, currentNetworkId?: string): string | undefined {
        this.clearExpiredEntriesSerialNumberByIpForNetwork();
        const map = this.context.globalState.get<IpToSerialNumberMap>(this.keys.serialNumberByIpForNetwork) || {};

        // When currentNetworkId is provided, only check that specific network (strict lookup)
        if (currentNetworkId) {
            const currentNetworkEntry = map[currentNetworkId]?.[ip];
            return currentNetworkEntry?.serialNumber;
        }

        // No network specified - fall back to searching all networks, return most recent by timestamp
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

        // Fallback: Any network, return the most recently updated IP for this serial
        let mostRecent: { ip: string; timestamp: number } | undefined;
        for (const networkId in map) {
            const networkMap = map[networkId];
            for (const [ip, entry] of Object.entries(networkMap)) {
                if (entry.serialNumber === serialNumber) {
                    if (!mostRecent || entry.timestamp > mostRecent.timestamp) {
                        mostRecent = { ip: ip, timestamp: entry.timestamp };
                    }
                }
            }
        }

        return mostRecent?.ip;
    }

    /**
     * Clear the IP→serialNumber map
     */
    public clearSerialNumberByIpForNetwork(): void {
        void this.context.globalState.update(this.keys.serialNumberByIpForNetwork, undefined);
    }

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

    // ==================== Heartbeat / Last Alive Timestamp ====================

    public getLastAliveTimestamp(key: string): number | undefined {
        const map = this.context.globalState.get<Record<string, number>>(this.keys.lastAliveTimestamp) || {};
        return map[key];
    }

    public setLastAliveTimestamp(key: string, timestamp: number): void {
        const map = this.context.globalState.get<Record<string, number>>(this.keys.lastAliveTimestamp) || {};
        map[key] = timestamp;
        void this.context.globalState.update(this.keys.lastAliveTimestamp, map);
    }
}

// ==================== Interfaces ====================

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
