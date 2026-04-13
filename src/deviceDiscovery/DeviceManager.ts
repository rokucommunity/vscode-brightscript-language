import { EventEmitter } from 'eventemitter3';
import * as vscode from 'vscode';
import { firstBy } from 'thenby';
import type { Disposable } from 'vscode';
import { rokuDeploy, type DeviceInfoRaw } from 'roku-deploy';
import { util as rokuDebugUtil } from 'roku-debug/dist/util';
import type { GlobalStateManager } from '../GlobalStateManager';
import { RokuFinder } from './RokuFinder';
import { NetworkChangeMonitor, getNetworkHash } from './NetworkChangeMonitor';
import { SystemSleepMonitor } from './SystemSleepMonitor';
import { util } from '../util';
import { vscodeContextManager } from '../managers/VscodeContextManager';
import { debounce } from 'lodash';

export class DeviceManager {
    // #region constructor
    constructor(
        private context: vscode.ExtensionContext,
        private globalStateManager: GlobalStateManager
    ) {
        this.networkId = getNetworkHash();

        this.setupConfiguration();
        this.setupWindowFocusHandling();
        this.setupMonitors();
        this.initialize();
        this.context.subscriptions.push(this);
    }

    private setupConfiguration() {
        const applyConfig = (event?: vscode.ConfigurationChangeEvent) => {
            let config: any = util.getConfiguration('brightscript') || {};

            void vscodeContextManager.set('brightscript.deviceDiscovery.enabled', config.deviceDiscovery?.enabled);

            //if the `deviceDiscovery.enabled` setting was changed, start or stop monitoring
            if (event?.affectsConfiguration('brightscript.deviceDiscovery.enabled')) {
                if (this.deviceDiscoveryEnabled) {
                    //emit that we need a scan (will trigger UI to refresh and show devices as needed when enabled)
                    this.setScanNeeded(true);
                    this.systemSleepMonitor.start();
                    void this.activateMonitoring();
                } else {
                    this.systemSleepMonitor.stop();
                    this.deactivateMonitoring();
                }
            }

            //if the `concealDeviceInfo` setting was changed, refresh the UI (no reload needed)
            if (event?.affectsConfiguration('brightscript.deviceDiscovery.concealDeviceInfo')) {
                this.emitDevicesChanged();
            }

            //if the `devices` setting was changed, re-apply configured devices
            if (event?.affectsConfiguration('brightscript.devices')) {
                this.loadConfiguredDevices().then(() => {
                    this.emitDevicesChanged();
                }).catch(() => { });
            }
        };
        this.context.subscriptions.push(
            vscode.workspace.onDidChangeConfiguration(applyConfig)
        );
        applyConfig();
    }

    private setupWindowFocusHandling() {
        this.context.subscriptions.push(
            vscode.window.onDidChangeWindowState((state) => {
                if (state.focused) {
                    this.notifyFocusGained();
                } else {
                    this.notifyFocusLost();
                }
            })
        );
    }

    private setupMonitors() {
        this.systemSleepMonitor = new SystemSleepMonitor(() => {
            this.setScanNeeded();
        });
        this.networkChangeMonitor = new NetworkChangeMonitor(() => {
            this.networkId = getNetworkHash();
            this.deviceInfoCache.clear();
            this.loadLastSeenDevices();
            this.setScanNeeded();
        });
    }

    private initialize() {
        //clear any deviceInfo entries older than our max age
        this.globalStateManager.clearExpiredDevices();

        // Load configured devices and cached devices (order doesn't matter due to setDevice merge logic)
        this.loadConfiguredDevices().catch(() => { });
        this.loadLastSeenDevices();

        /**
         * Set up event listeners for the RokuFinder.
         * This must be called regardless of passiveScanPermitted so that
         * active scan responses are processed.
         */
        this.finder.removeAllListeners();
        this.finder.on('found', (ip: string, options?: { serialNumber?: string }) => {
            void this.processDiscoveredIp(ip, options?.serialNumber);
        });

        this.finder.on('device-online', (ip: string, serialNumber?: string) => {
            this.handleDeviceOnline(ip, serialNumber);
        });

        this.finder.on('lost', (ip: string) => {
            // Remove device from discovered array and update state
            this.removeDevice(ip);
        });

        // Forward scan events from RokuFinder
        this.finder.on('scan-started', () => {
            this.emitter.emit('scan-started');
        });

        this.finder.on('scan-ended', () => {
            this.emitter.emit('scan-ended');
        });

        if (this.deviceDiscoveryEnabled) {
            // Sleep monitor runs all the time when enabled (ignores focus state)
            this.systemSleepMonitor.start();

            this.activateMonitoring().then(() => {
                const lastSeenDeviceIds = this.globalStateManager.getLastSeenDevices(this.networkId);
                if (lastSeenDeviceIds.length === 0) {
                    this.refresh();
                } else {
                    this.setScanNeeded();
                }
            }).catch((e) => {
                console.error(e);
            });
        }
    }
    // #endregion

    // Core state and dependencies
    private configuredDevices: ConfiguredDeviceEntry[] = [];
    private discoveredDevices: DiscoveredDeviceEntry[] = [];
    private scanNeeded = false;
    private lastUsedDeviceIp: string | undefined = undefined;
    private networkId: string;

    private emitter = new EventEmitter();
    private systemSleepMonitor: SystemSleepMonitor;
    private networkChangeMonitor: NetworkChangeMonitor;
    private finder = new RokuFinder();

    // Health check tracking and cooldowns
    private lastHealthCheckTime = new Map<string, number>();
    private resolveDeviceSequence = new Map<string, number>();
    private readonly HEALTH_CHECK_COOLDOWN_MS = 5 * 60 * 1_000; // 5 minutes
    public static readonly HEALTH_CHECK_TIMEOUT_MS = 2_000; // 2 seconds

    // Device info caching (reduces redundant network calls)
    private readonly DEVICE_INFO_CACHE_TTL_MS = 5_000; // 5 seconds
    private readonly CACHE_CLEANUP_DELAY_MS = 10_000; // 10 seconds of inactivity
    private deviceInfoCache = new Map<string, { info: DeviceInfoRaw; timestamp: number }>();
    private cacheCleanupTimer: ReturnType<typeof setTimeout> | null = null;

    // Notifications and event debouncing
    private readonly DEVICES_CHANGED_DEBOUNCE_MS = 50;
    private deviceOnlineNotifiers = new Map<string, ReturnType<typeof debounce>>();

    // Scan state management
    private readonly STALE_SCAN_THRESHOLD_MS = 30 * 60 * 1_000; // 30 minutes
    private lastScanDate: Date | null = null;

    public on(eventName: 'devices-changed', handler: () => void, disposables?: Disposable[]): () => void;
    public on(eventName: 'scan-started', handler: () => void, disposables?: Disposable[]): () => void;
    public on(eventName: 'scan-ended', handler: () => void, disposables?: Disposable[]): () => void;
    public on(eventName: 'scanNeeded-changed', handler: () => void, disposables?: Disposable[]): () => void;
    public on(eventName: string, handler: (payload: any) => void, disposables?: Disposable[]): () => void {
        this.emitter.on(eventName, handler);
        const unsubscribe = () => {
            if (this.emitter !== undefined) {
                this.emitter.removeListener(eventName, handler);
            }
        };

        disposables?.push({
            dispose: unsubscribe
        });

        return unsubscribe;
    }

    /**
     * Get device by encoded key string.
     * Key format: "s:{serialNumber}" or "i:{ip}"
     *
     * @param key - Encoded device key
     * @returns Device with deviceInfo or undefined if not found
     */
    public getDevice(key: string): RokuDevice | undefined;
    /**
     * Get device by IP or serial number.
     * Returns device with deviceInfo hydrated from cache.
     *
     * @param lookup - Object with optional ip and/or serialNumber
     * @returns Device with deviceInfo or undefined if not found
     */
    public getDevice(lookup: { ip?: string; serialNumber?: string }): RokuDevice | undefined;
    public getDevice(keyOrLookup: string | { ip?: string; serialNumber?: string }): RokuDevice | undefined {
        const device = this.buildMergedDevice(keyOrLookup as any);

        // If lookup object with both ip and serialNumber, verify exact match
        if (typeof keyOrLookup !== 'string' && keyOrLookup.ip && keyOrLookup.serialNumber && device) {
            if (device.ip !== keyOrLookup.ip || device.serialNumber !== keyOrLookup.serialNumber) {
                return undefined;
            }
        }

        return device;
    }

    /**
     * Get a list of all roku devices known by this extension (by scanning, hardcoded lists, etc)
     * Returns full devices with deviceInfo hydrated from cache.
     * Builds merged view on-demand from configuredDevices and discoveredDevices arrays.
     * Deduplication by serial number (preferred) or IP (fallback).
     */
    public getAllDevices(): RokuDevice[] {
        const mergedDevices = new Map<string, RokuDevice>();
        const processedDiscoveredIndices = new Set<number>();

        // Process configured devices first, finding matching discovered entries
        for (const configured of this.configuredDevices) {
            // Find matching discovered entry by serial, resolvedIp, or host
            let discoveredIdx = -1;
            let discovered: DiscoveredDeviceEntry | undefined;

            if (configured.serialNumber) {
                discoveredIdx = this.discoveredDevices.findIndex(d => d.serialNumber === configured.serialNumber);
            }
            if (discoveredIdx < 0 && configured.resolvedIp) {
                discoveredIdx = this.discoveredDevices.findIndex(d => d.ip === configured.resolvedIp);
            }
            if (discoveredIdx < 0) {
                discoveredIdx = this.discoveredDevices.findIndex(d => d.ip === configured.host);
            }

            if (discoveredIdx >= 0) {
                discovered = this.discoveredDevices[discoveredIdx];
                processedDiscoveredIndices.add(discoveredIdx);
            }

            const device = this.buildMergedDevice(configured, discovered);
            if (device) {
                mergedDevices.set(device.key, device);
            }
        }

        // Process discovered-only devices (not already merged via configured)
        for (let i = 0; i < this.discoveredDevices.length; i++) {
            if (processedDiscoveredIndices.has(i)) {
                continue;
            }

            const discovered = this.discoveredDevices[i];
            const device = this.buildMergedDevice(undefined, discovered);
            if (device) {
                // Check for duplicate by key or IP
                if (mergedDevices.has(device.key)) {
                    continue;
                }
                const existingByIp = Array.from(mergedDevices.values()).find(d => d.ip === device.ip);
                if (existingByIp) {
                    continue;
                }
                mergedDevices.set(device.key, device);
            }
        }

        // Convert to array and sort
        return Array.from(mergedDevices.values()).sort(
            // Sort by form factor
            firstBy<RokuDevice>((a, b) => {
                return this.getPriorityForDeviceFormFactor(a.deviceInfo) - this.getPriorityForDeviceFormFactor(b.deviceInfo);
                // Then by name
            }).thenBy<RokuDevice>((a, b) => {
                const nameA = a.deviceInfo['default-device-name'] || '';
                const nameB = b.deviceInfo['default-device-name'] || '';
                return nameA.localeCompare(nameB);
            }).thenBy<RokuDevice>((a, b) => {
                const serialA = a.serialNumber || '';
                const serialB = b.serialNumber || '';
                if (serialA < serialB) {
                    return -1;
                }
                if (serialA > serialB) {
                    return 1;
                }
                // serial numbers must be equal
                return 0;
            })
        );
    }

    /**
     * Compute merged device state from configured and discovered states.
     * Priority: online > offline > pending
     */
    private computeMergedState(
        configuredState: DeviceState,
        discoveredState: 'pending' | 'online' | undefined
    ): DeviceState {
        if (configuredState === 'online' || discoveredState === 'online') {
            return 'online';
        }
        if (configuredState === 'offline') {
            return 'offline';
        }
        return 'pending';
    }

    /**
     * Check if a device has cached info (has been successfully resolved before).
     * Used by view providers to determine icon: warning (no cache) vs disconnect (has cache).
     */
    public hasDeviceCache(serialNumber: string): boolean {
        return !!this.globalStateManager.getCachedDevice(serialNumber);
    }

    /**
     * Re-scan the network for devices and health-check existing ones
     */
    public refresh(force = false, doSyntheticDelay = true): boolean {
        this.checkDevicesHealth(force, doSyntheticDelay).catch(() => { });
        // Block automatic scans when device discovery is disabled
        if (!force && !this.deviceDiscoveryEnabled) {
            return false;
        }
        return this.discoverAll(force);
    }

    /**
     * Clear discovered devices from the device list, keeping configured devices.
     * Useful for refreshing the network scan without losing user-configured devices.
     */
    public clearCurrentDeviceList() {
        // Clear discovered devices (ephemeral)
        this.discoveredDevices = [];

        // Reset configured devices to pending (they persist but need re-verification)
        for (const entry of this.configuredDevices) {
            entry.deviceState = 'pending';
        }

        // Clear short-lived device info cache
        this.deviceInfoCache.clear();

        // Only clear lastUsedDeviceIp if it belonged to a discovered-only device
        if (this.lastUsedDeviceIp) {
            const stillExists = this.configuredDevices.some(
                d => d.resolvedIp === this.lastUsedDeviceIp || d.host === this.lastUsedDeviceIp
            );
            if (!stillExists) {
                this.lastUsedDeviceIp = undefined;
            }
        }

        this.emitDevicesChanged();
    }

    public clearAllCache() {
        // Stop any in-progress scan (finder.stop() emits scan-ended if scanning)
        this.finder.stop();

        // Clear current device list
        this.clearCurrentDeviceList();

        // Clear new arrays completely (clearCurrentDeviceList already cleared discoveredDevices)
        this.configuredDevices = [];

        // Clear global state
        this.globalStateManager.clearLastSeenDevices();
        this.globalStateManager.clearDeviceCache();
        this.globalStateManager.clearSerialNumberByIpForNetwork();

        // Clear all timestamps and per-device state
        this.lastScanDate = null;
        this.lastHealthCheckTime.clear();
        this.resolveDeviceSequence.clear();

        // Clear cache cleanup timer
        if (this.cacheCleanupTimer) {
            clearTimeout(this.cacheCleanupTimer);
            this.cacheCleanupTimer = null;
        }
    }

    public async checkDeviceHealth(deviceOrLookup: RokuDevice | { ip?: string; serialNumber?: string }, force = false, doSyntheticDelay = true): Promise<boolean> {
        // If already a device object with deviceState, use it directly; otherwise look it up
        const device = 'deviceState' in deviceOrLookup
            ? deviceOrLookup
            : this.getDevice(deviceOrLookup);

        if (!device) {
            return false;
        }

        // If not forcing, respect the per-device cooldown
        if (!force) {
            const lastCheck = this.lastHealthCheckTime.get(device.ip) ?? 0;
            const now = Date.now();
            if (now - lastCheck <= this.HEALTH_CHECK_COOLDOWN_MS) {
                return true;
            }
            this.lastHealthCheckTime.set(device.ip, now);
        }

        const isHealthy = await this.resolveDevice(device, doSyntheticDelay);
        if (!isHealthy) {
            // force a scan if passive scan is permitted
            this.refresh(this.deviceDiscoveryEnabled);
        }
        return isHealthy;
    }

    public getLastUsedDeviceIp(): string | undefined {
        return this.lastUsedDeviceIp;
    }

    public setLastUsedDeviceIp(value: string | undefined) {
        this.lastUsedDeviceIp = value;
    }

    public dispose() {
        this.deactivateMonitoring();
        this.systemSleepMonitor?.dispose?.();
        this.networkChangeMonitor?.dispose?.();
        this.finder?.dispose?.();
        this.configuredDevices = [];
        this.discoveredDevices = [];
        this.emitter.removeAllListeners();

        //clear any timeouts
        clearTimeout(this.cacheCleanupTimer);
    }

    /**
     * Is device discovery enabled (i.e. passive scans are permitted)
     */
    private get deviceDiscoveryEnabled() {
        return util.getConfiguration('brightscript')?.deviceDiscovery?.enabled ?? true;
    }

    /**
     * Should info messages be shown when new devices are discovered (e.g. "Device found: Roku TV")?
     */
    private get showInfoMessages() {
        return util.getConfiguration('brightscript')?.deviceDiscovery?.showInfoMessages ?? true;
    }

    private get timeSinceLastScan(): number {
        if (!this.lastScanDate) {
            return Infinity; // Never scanned, so always stale
        }
        return Date.now() - this.lastScanDate.getTime();
    }

    private getPriorityForDeviceFormFactor(deviceInfo: Record<string, any>): number {
        if (deviceInfo?.['is-stick'] === 'true') {
            return 0;
        }
        if (deviceInfo?.['is-tv'] === 'true') {
            return 2;
        }
        return 1;
    }

    /**
     * Remove a device from the discoveredDevices array and update lastSeenDevices.
     */
    private removeDevice(deviceIp: string): void {
        // Find the serial before removing
        const discovered = this.discoveredDevices.find(d => d.ip === deviceIp);
        const serial = discovered?.serialNumber ?? this.globalStateManager.getSerialNumberForIp(deviceIp, this.networkId);

        // Remove from discovered devices
        this.removeDiscoveredDevice(deviceIp);

        // Remove from last seen devices (if has serial)
        if (serial) {
            this.globalStateManager.removeLastSeenDevice(this.networkId, serial);
        }

        // Clear lastUsedDeviceIp if the removed device was the last used
        if (this.lastUsedDeviceIp === deviceIp) {
            this.lastUsedDeviceIp = undefined;
        }

        this.emitDevicesChanged();
    }

    /**
     * Load last seen devices from cache.
     * Resets configured devices to pending and clears discovered devices.
     * Last seen devices are used to pre-populate the IP→serial mapping.
     */
    private loadLastSeenDevices(): void {
        // Reset configured devices to pending
        for (const entry of this.configuredDevices) {
            entry.deviceState = 'pending';
        }

        // Clear discovered devices (ephemeral - reload from network)
        this.discoveredDevices = [];

        // Load cached devices for current network - add to discoveredDevices with 'pending' state
        const lastSeenDevices = this.globalStateManager.getLastSeenDevices(this.networkId);
        for (const serialNumber of lastSeenDevices) {
            const cached = this.globalStateManager.getCachedDevice(serialNumber);
            if (cached && typeof cached === 'object' && !Array.isArray(cached)) {
                // Get IP from ip-to-serial mapping
                const ip = this.globalStateManager.getIpForSerial(serialNumber, this.networkId);
                if (!ip) {
                    // No IP mapping found - remove stale entry
                    this.globalStateManager.removeLastSeenDevice(this.networkId, serialNumber);
                    continue;
                }
                // Ensure IP→serial mapping is set up
                this.globalStateManager.setSerialNumberForIp(this.networkId, ip, serialNumber);

                // Add to discoveredDevices with 'pending' state (will be updated when device responds)
                this.discoveredDevices.push({
                    ip: ip,
                    serialNumber: serialNumber,
                    deviceState: 'pending'
                });
            } else {
                // No cached info - remove stale entry
                this.globalStateManager.removeLastSeenDevice(this.networkId, serialNumber);
            }
        }
    }

    /**
     * Load configured devices from VSCode settings.
     * Handles removals (devices no longer in config) and adds/updates.
     * Safe to call at startup (removal is no-op when devices array is empty).
     * Resolves hostnames to IP addresses using DNS lookup.
     */
    private async loadConfiguredDevices(): Promise<void> {
        // Read config from all VSCode scopes
        const config = vscode.workspace.getConfiguration('brightscript');
        // inspect may not be available in test mocks
        if (typeof config.inspect !== 'function') {
            return;
        }
        const inspection = config.inspect<ConfiguredDevice[]>('devices');

        // Get devices from specific scopes we care about
        const userDevices = inspection?.globalValue ?? [];
        const workspaceDevices = inspection?.workspaceValue ?? [];

        // Build a map tracking which scopes each device is in
        // Key is serialNumber or host, value includes scope info
        interface ConfiguredDeviceWithScope extends ConfiguredDevice {
            configuredIn: ConfigurationScope[];
        }
        const deviceMap = new Map<string, ConfiguredDeviceWithScope>();

        // Process user settings
        for (const device of userDevices) {
            if (!device?.host) {
                continue;
            }
            const key = device.serialNumber || device.host;
            const existing = deviceMap.get(key);
            const scopes = existing?.configuredIn ?? [];
            if (!scopes.includes('user')) {
                scopes.push('user');
            }
            deviceMap.set(key, {
                ...existing,
                ...device,
                configuredIn: scopes
            });
        }

        // Process workspace settings
        for (const device of workspaceDevices) {
            if (!device?.host) {
                continue;
            }
            const key = device.serialNumber || device.host;
            const existing = deviceMap.get(key);
            const scopes = existing?.configuredIn ?? [];
            if (!scopes.includes('workspace')) {
                scopes.push('workspace');
            }
            deviceMap.set(key, {
                ...existing,
                ...device,
                configuredIn: scopes
            });
        }

        const configuredDevicesList = Array.from(deviceMap.values());

        // Track which hosts are still in config (for removal logic)
        const configuredHosts = new Set<string>();
        const configuredSerials = new Set<string>();

        // Track resolved IPs so removal loop can compare against them (not hostnames)
        const configuredIps = new Set<string>();

        // First: add/update configured devices (with DNS resolution)
        for (const configured of configuredDevicesList) {
            configuredHosts.add(configured.host);
            if (configured.serialNumber) {
                configuredSerials.add(configured.serialNumber);
            }

            // Resolve hostname to IP address (handles both hostnames and IPs)
            let resolvedIp: string | undefined;
            try {
                resolvedIp = await rokuDebugUtil.dnsLookup(configured.host);
            } catch {
                // DNS lookup failed - resolvedIp remains undefined
                // This allows the original host to be used if it's an IP
            }

            // Use resolved IP or fall back to host (if host looks like IP)
            const ip = resolvedIp ?? configured.host;

            // Track resolved IP for removal loop
            configuredIps.add(ip);

            // Determine serial number (must be after DNS resolution so IP lookup works)
            let serialNumber = configured.serialNumber;
            if (!serialNumber) {
                serialNumber = this.globalStateManager.getSerialNumberForIp(ip, this.networkId);
            }

            // Check for existing entry in configuredDevices by host
            const existingConfiguredIdx = this.configuredDevices.findIndex(
                d => d.host === configured.host ||
                    (configured.serialNumber && d.serialNumber === configured.serialNumber)
            );
            const existingConfigured = existingConfiguredIdx >= 0 ? this.configuredDevices[existingConfiguredIdx] : undefined;

            // Preserve state if device exists
            const deviceState = existingConfigured?.deviceState ?? 'pending';

            // Update or add to configuredDevices array
            const configuredEntry: ConfiguredDeviceEntry = {
                ...configured,
                resolvedIp: resolvedIp,
                deviceState: deviceState
            };

            if (existingConfiguredIdx >= 0) {
                this.configuredDevices[existingConfiguredIdx] = configuredEntry;
            } else {
                this.configuredDevices.push(configuredEntry);
            }

            // Set up IP→serial mapping if we have serial (deviceInfo already cached if it exists)
            if (serialNumber) {
                this.globalStateManager.setSerialNumberForIp(this.networkId, ip, serialNumber);
            }
        }

        // Remove configured devices no longer in config
        for (let i = this.configuredDevices.length - 1; i >= 0; i--) {
            const entry = this.configuredDevices[i];
            const stillConfigured = configuredHosts.has(entry.host) ||
                (entry.serialNumber && configuredSerials.has(entry.serialNumber));

            if (!stillConfigured) {
                this.configuredDevices.splice(i, 1);
            }
        }
    }

    private async resolveDevice(device: RokuDevice | { ip: string }, doSyntheticDelay = true): Promise<boolean> {

        // Increment and capture sequence number to handle concurrent refresh calls
        // Use IP for sequence tracking (primary key)
        const currentSeq = (this.resolveDeviceSequence.get(device.ip) ?? 0) + 1;
        this.resolveDeviceSequence.set(device.ip, currentSeq);

        // Set to pending during health check with immediate UI feedback
        // Update both arrays to show pending state
        let stateChanged = false;

        const configuredEntry = this.getConfiguredDeviceByIp(device.ip);
        if (configuredEntry && configuredEntry.deviceState !== 'pending') {
            configuredEntry.deviceState = 'pending';
            stateChanged = true;
        }

        const discoveredEntry = this.discoveredDevices.find(d => d.ip === device.ip);
        if (discoveredEntry && discoveredEntry.deviceState !== 'pending') {
            discoveredEntry.deviceState = 'pending';
            stateChanged = true;
        }

        if (stateChanged) {
            this.emitDevicesChanged();
        }

        // Fetch latest device info from the network (with short-lived cache)
        let deviceInfo: DeviceInfoRaw | undefined;
        try {
            deviceInfo = await this.getDeviceInfoCached(device.ip, 8060);

            if (doSyntheticDelay) {
                await this.randomDelay(400, 1_000);
            }
        } catch {
            deviceInfo = undefined;
        }

        // Only apply result if this is still the latest request for this device
        if (this.resolveDeviceSequence.get(device.ip) !== currentSeq) {
            // Stale response - a newer check was started, ignore this result
            return !!deviceInfo;
        }

        if (deviceInfo) {
            // Extract serial and cache the deviceInfo
            const serial = deviceInfo['serial-number']?.toString?.();
            if (serial) {
                this.globalStateManager.setCachedDevice(serial, {
                    serialNumber: serial,
                    deviceInfo: deviceInfo,
                    createdAt: Date.now()
                });
                this.globalStateManager.setSerialNumberForIp(this.networkId, device.ip, serial);

                // Add to last seen devices (successfully resolved with serial)
                this.globalStateManager.addLastSeenDevice(this.networkId, serial);
            }

            // Update discoveredDevices array
            this.setDiscoveredDevice(device.ip, serial, 'online');

            // Update configuredDevices if this device is configured
            this.updateConfiguredDeviceState(device.ip, serial, 'online');

            this.emitDevicesChanged();
            return true;
        } else {
            // Remove from discoveredDevices (ephemeral - offline devices are removed)
            this.removeDiscoveredDevice(device.ip);

            // Update configured device state to offline (configured devices persist)
            this.updateConfiguredDeviceState(device.ip, undefined, 'offline');

            this.emitDevicesChanged();
            return false;
        }
    }

    /**
     * Update state for a configured device by IP or serial number.
     */
    private updateConfiguredDeviceState(ip: string, serialNumber: string | undefined, state: DeviceState): void {
        // Try to find by serial first (more reliable), then by IP
        let entry: ConfiguredDeviceEntry | undefined;
        if (serialNumber) {
            entry = this.getConfiguredDeviceBySerial(serialNumber);
        }
        if (!entry) {
            entry = this.getConfiguredDeviceByIp(ip);
        }

        if (entry) {
            entry.deviceState = state;
            // Update resolvedIp if we have a successful resolution
            if (state === 'online' && ip) {
                entry.resolvedIp = ip;
            }
        }
    }

    private async checkDevicesHealth(force = false, doSyntheticDelay = true): Promise<void> {
        // Get all devices from merged view
        const devices = this.getAllDevices();

        // Filter to devices that need checking
        const devicesToCheck = force ? devices : devices.filter(d => {
            const lastCheck = this.lastHealthCheckTime.get(d.ip) ?? 0;
            return Date.now() - lastCheck > this.HEALTH_CHECK_COOLDOWN_MS;
        });

        if (devicesToCheck.length === 0) {
            return;
        }

        // Set all to pending and emit before async work
        for (const device of devicesToCheck) {
            // Update state in source arrays (both configured and discovered)
            const configuredEntry = this.getConfiguredDeviceByIp(device.ip);
            if (configuredEntry) {
                configuredEntry.deviceState = 'pending';
            }
            const discoveredEntry = this.discoveredDevices.find(d => d.ip === device.ip);
            if (discoveredEntry) {
                discoveredEntry.deviceState = 'pending';
            }
            this.lastHealthCheckTime.set(device.ip, Date.now());
        }
        this.emitDevicesChanged();

        // Check all devices
        let needsScan = false;
        await Promise.all(devicesToCheck.map(async (device) => {
            const isHealthy = await this.resolveDevice(device, doSyntheticDelay);
            if (!isHealthy) {
                needsScan = true;
            }
        }));

        if (needsScan) {
            this.discoverAll(this.deviceDiscoveryEnabled);
        }
    }

    /**
     * Reset the cache cleanup timer. After inactivity, the cache will be cleared.
     */
    private resetCacheCleanupTimer(): void {
        if (this.cacheCleanupTimer) {
            clearTimeout(this.cacheCleanupTimer);
        }
        this.cacheCleanupTimer = setTimeout(() => {
            this.deviceInfoCache.clear();
            this.cacheCleanupTimer = null;
        }, this.CACHE_CLEANUP_DELAY_MS);
    }

    /**
     * Cached wrapper around rokuDeploy.getDeviceInfo to prevent duplicate calls
     * when health checks and SSDP responses race during refresh.
     */
    private async getDeviceInfoCached(ip: string, port: number): Promise<DeviceInfoRaw> {
        this.resetCacheCleanupTimer();

        const cached = this.deviceInfoCache.get(ip);
        if (cached && Date.now() - cached.timestamp < this.DEVICE_INFO_CACHE_TTL_MS) {
            return cached.info;
        }

        const info = await rokuDeploy.getDeviceInfo({
            host: ip,
            remotePort: port,
            timeout: DeviceManager.HEALTH_CHECK_TIMEOUT_MS
        });

        this.deviceInfoCache.set(ip, { info: info, timestamp: Date.now() });
        return info;
    }

    /**
     * Discover all Roku devices on the network and watch for new ones that connect
     */
    private discoverAll(force: boolean): boolean {
        if (force || this.scanNeeded || this.timeSinceLastScan > this.STALE_SCAN_THRESHOLD_MS) {
            this.scanNeeded = false;
            this.lastScanDate = new Date();
            this.finder.scan();
            return true;
        }
        return false;
    }

    /**
     * Process a discovered IP address from SSDP.
     * Fetches device info, applies filtering, and sets if valid.
     * @param serialNumber - Serial number from SSDP USN header, if available
     */
    private async processDiscoveredIp(ip: string, serialNumber?: string): Promise<void> {
        try {
            const deviceInfo = await this.getDeviceInfoCached(ip, 8060);

            const config: any = util.getConfiguration('brightscript') || {};
            const includeNonDeveloperDevices = config?.deviceDiscovery?.includeNonDeveloperDevices === true;
            const developerEnabled = deviceInfo['developer-enabled'] === 'true';

            if (!includeNonDeveloperDevices && !developerEnabled) {
                return;
            }

            // Extract serial and cache the deviceInfo
            const serial = deviceInfo['serial-number']?.toString?.();
            if (serial) {
                this.globalStateManager.setCachedDevice(serial, {
                    serialNumber: serial,
                    deviceInfo: deviceInfo,
                    createdAt: Date.now()
                });
                this.globalStateManager.setSerialNumberForIp(this.networkId, ip, serial);
            }

            // Update discoveredDevices array
            this.setDiscoveredDevice(ip, serial, 'online');

            // Update configured device state if present
            this.updateConfiguredDeviceState(ip, serial, 'online');

            this.emitDevicesChanged();
        } catch {
            // Device unreachable - remove from discoveredDevices if present
            this.removeDiscoveredDevice(ip);
        }
    }

    /**
     * Add or update a device in the discoveredDevices array.
     * Handles deduplication by serial number (removes old IP entry if serial matches).
     */
    private setDiscoveredDevice(ip: string, serialNumber: string | undefined, deviceState: 'pending' | 'online'): void {
        // Serial dedupe: if same serial exists at different IP, remove old entry
        if (serialNumber) {
            const oldIdx = this.discoveredDevices.findIndex(d => d.ip !== ip && d.serialNumber === serialNumber);
            if (oldIdx >= 0) {
                const oldIp = this.discoveredDevices[oldIdx].ip;
                // Transfer lastUsedDeviceIp to new IP if it was pointing to old IP
                if (this.lastUsedDeviceIp === oldIp) {
                    this.lastUsedDeviceIp = ip;
                }
                this.discoveredDevices.splice(oldIdx, 1);
            }
        }

        // IP dedupe: find existing entry at same IP
        const existingIdx = this.discoveredDevices.findIndex(d => d.ip === ip);
        if (existingIdx >= 0) {
            // Update existing entry
            this.discoveredDevices[existingIdx] = {
                ip: ip,
                serialNumber: serialNumber,
                deviceState: deviceState
            };
        } else {
            // Add new entry
            this.discoveredDevices.push({
                ip: ip,
                serialNumber: serialNumber,
                deviceState: deviceState
            });
        }
    }

    /**
     * Remove a device from the discoveredDevices array by IP.
     */
    private removeDiscoveredDevice(ip: string): void {
        const idx = this.discoveredDevices.findIndex(d => d.ip === ip);
        if (idx >= 0) {
            this.discoveredDevices.splice(idx, 1);
        }
    }

    /**
     * Find a configured device by serial number.
     */
    private getConfiguredDeviceBySerial(serialNumber: string): ConfiguredDeviceEntry | undefined {
        return this.configuredDevices.find(d => d.serialNumber === serialNumber);
    }

    /**
     * Find a configured device by host or resolved IP.
     */
    private getConfiguredDeviceByIp(ip: string): ConfiguredDeviceEntry | undefined {
        return this.configuredDevices.find(d => d.resolvedIp === ip || d.host === ip);
    }

    /**
     * Build a merged RokuDevice by decoding an encoded key (s:serial or i:ip).
     */
    private buildMergedDevice(key: string): RokuDevice | undefined;
    /**
     * Build a merged RokuDevice by looking up in source arrays.
     */
    private buildMergedDevice(lookup: { ip?: string; serialNumber?: string }): RokuDevice | undefined;
    /**
     * Build a merged RokuDevice from provided entries.
     */
    private buildMergedDevice(configuredEntry: ConfiguredDeviceEntry | undefined, discoveredEntry: DiscoveredDeviceEntry | undefined): RokuDevice | undefined;
    private buildMergedDevice(
        keyOrLookupOrConfigured: string | { ip?: string; serialNumber?: string } | ConfiguredDeviceEntry | undefined,
        discoveredEntry?: DiscoveredDeviceEntry | undefined
    ): RokuDevice | undefined {
        let configuredEntry: ConfiguredDeviceEntry | undefined;
        let discovered: DiscoveredDeviceEntry | undefined;

        // Determine which overload was called
        if (typeof keyOrLookupOrConfigured === 'string') {
            // Called with encoded key - decode and look up
            const key = keyOrLookupOrConfigured;
            if (key.startsWith('s:')) {
                const serial = key.slice(2);
                if (!serial) {
                    return undefined;
                }
                configuredEntry = this.configuredDevices.find(c => c.serialNumber === serial);
                discovered = this.discoveredDevices.find(d => d.serialNumber === serial);
            } else if (key.startsWith('i:')) {
                const ip = key.slice(2);
                if (!ip) {
                    return undefined;
                }
                configuredEntry = this.configuredDevices.find(c => c.resolvedIp === ip || c.host === ip);
                discovered = this.discoveredDevices.find(d => d.ip === ip);
            } else {
                // Invalid key format
                return undefined;
            }
        } else if (discoveredEntry !== undefined || this.isConfiguredDeviceEntry(keyOrLookupOrConfigured)) {
            // Called with entries directly
            configuredEntry = keyOrLookupOrConfigured as ConfiguredDeviceEntry | undefined;
            discovered = discoveredEntry;
        } else if (keyOrLookupOrConfigured && ('ip' in keyOrLookupOrConfigured || 'serialNumber' in keyOrLookupOrConfigured)) {
            // Called with lookup object - find entries in source arrays
            const lookup = keyOrLookupOrConfigured as { ip?: string; serialNumber?: string };

            if (lookup.serialNumber) {
                configuredEntry = this.configuredDevices.find(c => c.serialNumber === lookup.serialNumber);
                discovered = this.discoveredDevices.find(d => d.serialNumber === lookup.serialNumber);
            }

            if (lookup.ip) {
                if (!configuredEntry) {
                    configuredEntry = this.configuredDevices.find(c => c.resolvedIp === lookup.ip || c.host === lookup.ip);
                }
                if (!discovered) {
                    discovered = this.discoveredDevices.find(d => d.ip === lookup.ip);
                }
            }
        }

        if (!configuredEntry && !discovered) {
            return undefined;
        }

        // Determine IP: discovered > resolvedIp > host
        let ip: string;
        if (discovered) {
            ip = discovered.ip;
        } else if (configuredEntry?.resolvedIp) {
            ip = configuredEntry.resolvedIp;
        } else {
            ip = configuredEntry.host;
        }

        // Determine serial: cache > configured > discovered
        const serialNumber = this.globalStateManager.getSerialNumberForIp(ip, this.networkId) ??
            configuredEntry?.serialNumber ??
            discovered?.serialNumber;

        // Compute merged state: online > offline > pending
        const deviceState = this.computeMergedState(
            configuredEntry?.deviceState,
            discovered?.deviceState
        );

        // Build key
        const key = serialNumber ? `s:${serialNumber}` : `i:${ip}`;

        // Hydrate deviceInfo from cache
        const cached = serialNumber ? this.globalStateManager.getCachedDevice(serialNumber) : undefined;

        return {
            ip: ip,
            serialNumber: serialNumber,
            key: key,
            deviceState: deviceState,
            deviceInfo: cached?.deviceInfo ?? {},
            isDiscovered: !!discovered,
            isConfigured: !!configuredEntry,
            configuredIn: configuredEntry?.configuredIn,
            configuredName: configuredEntry?.name,
            configuredPassword: configuredEntry?.password
        };
    }

    /**
     * Type guard to check if an object is a ConfiguredDeviceEntry.
     */
    private isConfiguredDeviceEntry(obj: unknown): obj is ConfiguredDeviceEntry {
        return obj !== null && typeof obj === 'object' && 'host' in obj;
    }

    /**
     * Handle device-online event from RokuFinder.
     * Shows a notification if showInfoMessages is enabled.
     */
    private handleDeviceOnline(ip: string, serialNumber?: string): void {
        if (!this.showInfoMessages) {
            return;
        }

        // Get actual serial number from IP→serial mapping (more reliable than SSDP hint)
        const actualSerial = this.globalStateManager.getSerialNumberForIp(ip, this.networkId) ?? serialNumber;

        // Get cached device directly from globalStateManager
        const cachedDevice = actualSerial
            ? this.globalStateManager.getCachedDevice(actualSerial)
            : undefined;

        // Get display name from cache
        const fallbackName = actualSerial ? `${ip} (${actualSerial})` : ip;
        const displayName = cachedDevice?.deviceInfo?.['default-device-name'] ?? fallbackName;
        const notifierId = actualSerial ?? ip;

        if (!this.deviceOnlineNotifiers.has(notifierId)) {
            this.deviceOnlineNotifiers.set(notifierId, debounce((name: string) => {
                this.deviceOnlineNotifiers.delete(notifierId);
                void util.showTimedNotification(`Device Online: ${name}`);
            }, 500));
        }
        this.deviceOnlineNotifiers.get(notifierId)(displayName);
    }

    private async activateMonitoring() {
        this.networkChangeMonitor.start();
        await this.startRokuFinder();
    }

    private deactivateMonitoring() {
        this.networkChangeMonitor.stop();
        this.stopRokuFinder();
    }

    /**
     * Start listening for passive SSDP announcements from Roku devices
     */
    private async startRokuFinder() {
        await this.finder.start();
    }

    private stopRokuFinder() {
        this.finder.stop();
    }

    private notifyFocusGained() {
        this.networkChangeMonitor.start();
    }

    private notifyFocusLost() {
        this.networkChangeMonitor.stop();
    }

    /**
     * Set the flag indicating a scan is needed. Emits 'scanNeeded-changed' event
     * when the flag flips from false to true.
     */
    private setScanNeeded(force = false): void {
        if (!this.scanNeeded || force) {
            this.scanNeeded = true;
            this.emitter.emit('scanNeeded-changed');
        }
    }

    private emitDevicesChanged = throttleBounce(() => {
        this.emitter.emit('devices-changed');
    }, this.DEVICES_CHANGED_DEBOUNCE_MS);

    private async randomDelay(min: number, max: number) {
        const randomness = Math.random() * ((max - min) + min);
        await util.sleep(randomness);
    }
}

export type DeviceState = 'offline' | 'pending' | 'online';

export type ConfigurationScope = 'user' | 'workspace';

/**
 * User-configured device from settings (brightscript.devices)
 */
interface ConfiguredDevice {
    host: string;
    name?: string;
    serialNumber?: string;
    password?: string;
}

/**
 * Internal: configured device from settings
 * Extends the raw settings shape with runtime tracking fields.
 * Persists even when device goes offline.
 */
interface ConfiguredDeviceEntry extends ConfiguredDevice {
    /**
     * IP from DNS lookup (updated on resolution)
     */
    resolvedIp?: string;
    /**
     * Device state: pending/online/offline (persists even when offline)
     */
    deviceState: DeviceState;
    /**
     * Which settings scopes this device is configured in
     */
    configuredIn?: ConfigurationScope[];
}

/**
 * Internal: discovered device from network
 * Removed when device goes offline (ephemeral)
 */
interface DiscoveredDeviceEntry {
    /**
     * Current IP from SSDP/resolution
     */
    ip: string;
    /**
     * Serial number from device-info response
     */
    serialNumber?: string;
    /**
     * Device state: pending/online only (offline = removed from array)
     */
    deviceState: 'pending' | 'online';
}

/**
 * Full device details returned by public API
 * Built on-demand by merging configured and discovered device data
 */
export interface RokuDevice {
    /**
     * Computed IP from resolution order: discovered > resolvedIp > host
     */
    ip: string;
    /**
     * Serial number from discovered or configured
     */
    serialNumber?: string;
    /**
     * Encoded device key: "s:{serial}" or "i:{ip}"
     */
    key: string;
    /**
     * Computed state: online > offline > pending (from both sources)
     */
    deviceState: DeviceState;
    /**
     * Cached device info from GlobalStateManager
     */
    deviceInfo: Record<string, any>;
    /**
     * True if device exists in discoveredDevices array
     */
    isDiscovered: boolean;
    /**
     * True if device exists in configuredDevices array
     */
    isConfigured: boolean;
    /**
     * Which settings scopes this device is configured in
     */
    configuredIn?: ConfigurationScope[];
    /**
     * User-provided name from config
     */
    configuredName?: string;
    /**
     * User-provided password from config
     */
    configuredPassword?: string;
}

function throttleBounce<T extends (...args: any[]) => void>(
    callback: T,
    threshold: number
): (...args: Parameters<T>) => void {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let pending: Parameters<T> | undefined;
    function onTimer() {
        if (pending) {
            callback(...pending);
            pending = undefined;
            timer = setTimeout(onTimer, threshold);
        } else {
            timer = undefined;
        }
    }

    return (...args: Parameters<T>) => {
        if (!timer) {
            callback(...args);
            timer = setTimeout(onTimer, threshold);
        } else {
            pending = args;
        }
    };
}
