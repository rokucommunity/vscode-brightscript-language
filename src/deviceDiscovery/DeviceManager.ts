import { EventEmitter } from 'eventemitter3';
import * as vscode from 'vscode';
import { firstBy } from 'thenby';
import type { Disposable } from 'vscode';
import { rokuDeploy, DeviceUnreachableError, type DeviceInfoRaw } from 'roku-deploy';
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
        private globalStateManager: GlobalStateManager,
        private extensionOutputChannel?: vscode.OutputChannel
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
            void vscodeContextManager.set('brightscript.hasDefaultDevicePassword', !!this.getDefaultPassword());

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

            //if the `includeNonDeveloperDevices` setting was changed, refresh the UI to show/hide devices
            if (event?.affectsConfiguration('brightscript.deviceDiscovery.includeNonDeveloperDevices')) {
                this.emitDevicesChanged();
            }

            //if the `hiddenDevices` or `showOfflineDevices` settings were changed, refresh the UI
            if (event?.affectsConfiguration('brightscript.deviceDiscovery.hiddenDevices') ||
                event?.affectsConfiguration('brightscript.deviceDiscovery.showOfflineDevices')) {
                this.emitDevicesChanged();
            }

            //if the `devices` setting was changed, re-apply configured devices and health check them
            if (event?.affectsConfiguration('brightscript.devices')) {
                this.loadConfiguredDevices().then(() => {
                    return this.healthCheckAllDevices(false, true);
                }).catch(() => { });
            }

            //if the `defaultDevicePassword` setting was changed, refresh any device views that rely on it
            if (event?.affectsConfiguration('brightscript.defaultDevicePassword')) {
                this.emitDevicesChanged();
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

            //reset all device states to pending - need to re-verify on new network
            this.deviceStates.clear();

            //clear and reload discovered devices anytime this network changes
            this.discoveredDevices = [];
            this.loadLastSeenDevices();

            this.restartRokuFinder();

            //this is important for telling the devices view to refresh and health check its devices
            this.setScanNeeded();
        });
    }

    private initialize() {
        //clear any deviceInfo entries older than our max age
        this.globalStateManager.clearExpiredDevices();

        // Load configured devices and cached devices (order doesn't matter due to setDevice merge logic)
        this.loadConfiguredDevices().catch(() => { });
        this.loadLastSeenDevices();

        // Set up event listeners for the RokuFinder
        this.setupFinderListeners();

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
    private deviceStates = new Map<DeviceStateKey, DeviceStateEntry>();
    private scanNeeded = false;
    private lastUsedDeviceIp: string | undefined = undefined;
    private networkId: string;

    private emitter = new EventEmitter();
    private systemSleepMonitor: SystemSleepMonitor;
    private networkChangeMonitor: NetworkChangeMonitor;
    private finder = new RokuFinder(this.globalStateManager, this.makeFinderLogger());

    // Health check tracking and cooldowns
    private resolveDeviceSequence = new Map<string, number>();
    private readonly DEVICE_INFO_CACHE_MS = 5 * 60 * 1_000; // 5 minutes - cache duration for fetchDeviceInfo
    private readonly FRESH_CACHE_THRESHOLD_MS = 5 * 60 * 1_000; // 5 minutes - cache fresher than this = online on load
    private readonly STALE_DEVICE_AFTER_SCAN_MS = 10_000; // 10 seconds - health check devices with cache older than this after scan
    private readonly OFFLINE_COOLDOWN_MS = 5_000; // 5 seconds - minimum time between resolve attempts for offline devices
    public static readonly HEALTH_CHECK_TIMEOUT_MS = 2_000; // 2 seconds

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
        const { configured, discovered } = this.findDeviceEntries(keyOrLookup);
        const device = this.buildMergedDevice(configured, discovered);

        // If lookup object with both ip and serialNumber, verify exact match
        if (typeof keyOrLookup !== 'string' && keyOrLookup.ip && keyOrLookup.serialNumber && device) {
            if (device.ip !== keyOrLookup.ip || device.serialNumber !== keyOrLookup.serialNumber) {
                return undefined;
            }
        }

        return device;
    }

    /**
     * Probe an IP address, add it to the discovered devices list if reachable, and return the device.
     * Used when user manually enters an IP or before resolving a debug config.
     *
     * @param ip - The IP address to probe
     * @returns The device if reachable, undefined otherwise
     */
    public async validateAndAddDevice(ip: string): Promise<RokuDevice | undefined> {
        this.setDiscoveredDevice(ip, undefined);
        await this.resolveDevice({ ip: ip }, false);
        return this.getDevice({ ip: ip });
    }

    /**
     * Get a list of all roku devices.
     * Returns all devices without filtering.
     */
    public getAllDevices(): RokuDevice[] {
        return this.buildAllDevices();
    }

    /**
     * Get all devices filtered for UI display.
     * Respects includeNonDeveloperDevices setting.
     */
    public getDevicesForUI(): RokuDevice[] {
        return this.buildAllDevices().filter(d => this.shouldShowDevice(d));
    }

    /**
     * Build all devices from configuredDevices and discoveredDevices arrays.
     * Deduplication by serial number (preferred) or IP (fallback).
     */
    private buildAllDevices(): RokuDevice[] {
        const mergedDevices = new Map<string, RokuDevice>();
        const processedDiscoveredIndices = new Set<number>();

        // Process configured devices first, finding matching discovered entries
        for (const configured of this.configuredDevices) {
            // Find matching discovered entry by serial, resolvedIp, or host
            let discoveredIdx = -1;
            let discovered: DiscoveredDeviceEntry | undefined;

            if (configured.serialNumber) {
                // Config has serial - ONLY match by serial (serial is primary key)
                discoveredIdx = this.discoveredDevices.findIndex(d => d.serialNumber === configured.serialNumber);
            } else {
                // Config has no serial - match by IP
                if (configured.resolvedIp) {
                    discoveredIdx = this.discoveredDevices.findIndex(d => d.ip === configured.resolvedIp);
                }
                if (discoveredIdx < 0) {
                    discoveredIdx = this.discoveredDevices.findIndex(d => d.ip === configured.host);
                }
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
                // Check for duplicate by key
                if (mergedDevices.has(device.key)) {
                    continue;
                }
                // Only skip by IP if neither device has a serial (serial is primary key)
                // Different serials at same IP = different devices
                const existingByIp = Array.from(mergedDevices.values()).find(d => d.ip === device.ip);
                if (existingByIp && !device.serialNumber && !existingByIp.serialNumber) {
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

    // #region Device State Management
    /**
     * Get the state key for a device lookup.
     * Prefers serial number over IP for stable identity.
     * @returns Key in format "s:{serial}" or "i:{ip}"
     */
    private getStateKey(lookup: { serialNumber?: string; ip?: string }): DeviceStateKey {
        if (lookup.serialNumber) {
            return `s:${lookup.serialNumber}`;
        }
        return `i:${lookup.ip}`;
    }

    /**
     * Get device state from the separate state map.
     * @param lookup - Device lookup by serial and/or IP
     * @returns The device state, defaulting to 'pending' if not found
     */
    public getDeviceState(lookup: { serialNumber?: string; ip?: string }): DeviceStateEntry {
        // Try serial key first (most stable)
        if (lookup.serialNumber) {
            const serialEntry = this.deviceStates.get(`s:${lookup.serialNumber}`);
            if (serialEntry) {
                return serialEntry;
            }
        }

        // Try IP key as fallback
        if (lookup.ip) {
            const ipEntry = this.deviceStates.get(`i:${lookup.ip}`);
            if (ipEntry) {
                return ipEntry;
            }
        }

        return { state: 'pending', lastUpdated: Date.now() };
    }

    /**
     * Set device state in the separate state map.
     * When called without explicit state, uses intelligent defaults:
     * - If already online, stays online
     * - Else checks cache freshness (5 min threshold) to determine online vs pending
     * Handles key migration: when serial becomes known, migrates i:{ip} entry to s:{serial}
     *
     * @param lookup - Device lookup by serial and/or IP
     * @param state - Explicit state to set, or undefined for intelligent default
     */
    public setDeviceState(lookup: { serialNumber?: string; ip?: string }, state?: DeviceState): void {
        const now = Date.now();
        let resolvedState: DeviceState;

        if (state !== undefined) {
            // Explicit state provided
            resolvedState = state;
        } else {
            // Intelligent default: check current state and cache freshness
            const currentState = this.getDeviceState(lookup).state;
            if (currentState === 'online') {
                // Already online, keep it online
                resolvedState = 'online';
            } else if (lookup.serialNumber) {
                // Check cache freshness to determine state
                const cached = this.globalStateManager.getCachedDevice(lookup.serialNumber);
                if (cached && now - cached.createdAt < this.FRESH_CACHE_THRESHOLD_MS) {
                    resolvedState = 'online';
                } else {
                    resolvedState = 'pending';
                }
            } else {
                resolvedState = 'pending';
            }
        }

        // Handle key migration: when serial becomes known, migrate from IP key to serial key
        if (lookup.serialNumber && lookup.ip) {
            const ipKey = `i:${lookup.ip}` as DeviceStateKey;
            if (this.deviceStates.has(ipKey)) {
                // Remove the old IP-based entry
                this.deviceStates.delete(ipKey);
            }
        }

        // Set state using preferred key (serial if available, else IP)
        const key = this.getStateKey(lookup);
        this.deviceStates.set(key, { state: resolvedState, lastUpdated: now });
    }
    // #endregion

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
        this.healthCheckAllDevices(force, doSyntheticDelay).catch(() => { });
        // Block automatic scans when device discovery is disabled
        if (!force && !this.deviceDiscoveryEnabled) {
            return false;
        }
        return this.discoverAll(force);
    }

    /**
     * Trigger a network scan for devices without health checking existing devices.
     * Use this when you just want to discover new devices without verifying existing ones.
     * @param force - If true, scan even if deviceDiscovery is disabled
     * @returns true if a scan was started, false otherwise
     */
    public scan(force = false): boolean {
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

        // Only clear lastUsedDeviceIp if it belonged to a discovered-only device
        if (this.lastUsedDeviceIp) {
            const stillExists = this.configuredDevices.some(
                d => d.resolvedIp === this.lastUsedDeviceIp || d.host === this.lastUsedDeviceIp
            );
            if (!stillExists) {
                this.lastUsedDeviceIp = undefined;
            }
        }

        //clear the cache for the current list of devices
        this.globalStateManager.setLastSeenDevices(this.networkId, []);

        this.emitDevicesChanged();
    }

    public clearAllCache() {
        // Stop any in-progress scan (finder.stop() emits scan-ended if scanning)
        this.finder.stop();

        // Clear persisted global state
        this.globalStateManager.clearLastSeenDevices();
        this.globalStateManager.clearDeviceCache();
        this.globalStateManager.clearSerialNumberByIpForNetwork();

        // Clear all timestamps and per-device state
        this.lastScanDate = null;
        this.resolveDeviceSequence.clear();
        this.deviceStates.clear();

        // Clear discovered devices
        this.clearCurrentDeviceList();
    }

    public async healthCheckDevice(deviceOrLookup: RokuDevice | { ip?: string; serialNumber?: string }, force = false, doSyntheticDelay = true): Promise<boolean> {
        // If already a device object with deviceState, use it directly; otherwise look it up
        const device = 'deviceState' in deviceOrLookup
            ? deviceOrLookup
            : this.getDevice(deviceOrLookup);

        if (!device) {
            return false;
        }

        // Cooldown is handled by fetchDeviceInfo cache; force bypasses it
        const isHealthy = await this.resolveDevice(device, doSyntheticDelay, force);
        if (!isHealthy && device.isDiscovered) {
            // force a scan if passive scan is permitted
            this.refresh(this.deviceDiscoveryEnabled);
        }
        return isHealthy;
    }

    /**
     * Validate a developer password against the device at `host`.
     *
     * Returns:
     * - `'ok'` — credentials accepted
     * - `'bad-password'` — device reachable, credentials rejected
     * - `'unreachable'` — device could not be contacted (transient; don't treat as wrong password)
     */
    public async validateDevicePassword(host: string, password: string): Promise<PasswordValidationResult> {
        try {
            const accepted = await rokuDeploy.validateDeveloperPassword({ host: host, password: password });
            return accepted ? 'ok' : 'bad-password';
        } catch (e) {
            if (e instanceof DeviceUnreachableError) {
                return 'unreachable';
            }
            // Unexpected response code or any other failure — treat as unreachable so the caller retries/prompts rather than discarding credentials.
            return 'unreachable';
        }
    }

    public getLastUsedDeviceIp(): string | undefined {
        return this.lastUsedDeviceIp;
    }

    public setLastUsedDeviceIp(value: string | undefined) {
        this.lastUsedDeviceIp = value;
    }

    /**
     * Add a device to the hidden devices list by serial number.
     * Updates the user settings to persist the change.
     */
    public async hideDevice(serialNumber: string): Promise<void> {
        const config = vscode.workspace.getConfiguration('brightscript.deviceDiscovery');
        const hidden = config.get<string[]>('hiddenDevices') ?? [];
        if (!hidden.includes(serialNumber)) {
            hidden.push(serialNumber);
            await config.update('hiddenDevices', hidden, vscode.ConfigurationTarget.Global);
        }
    }

    public dispose() {
        this.deactivateMonitoring();
        this.systemSleepMonitor?.dispose?.();
        this.networkChangeMonitor?.dispose?.();
        this.finder?.dispose?.();
        this.configuredDevices = [];
        this.discoveredDevices = [];
        this.emitter.removeAllListeners();
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

    private get heartbeatLogging() {
        return util.getConfiguration('brightscript')?.deviceDiscovery?.heartbeatLogging ?? false;
    }

    private makeFinderLogger(): (msg: string) => void {
        return (msg: string) => {
            if (this.heartbeatLogging) {
                this.extensionOutputChannel?.appendLine(`[heartbeat] ${msg}`);
            }
        };
    }

    /**
     * Should non-developer devices be included in device lists?
     */
    private get includeNonDeveloperDevices() {
        return util.getConfiguration('brightscript')?.deviceDiscovery?.includeNonDeveloperDevices === true;
    }

    /**
     * List of device serial numbers to hide from the device panel.
     */
    private get hiddenDevices(): string[] {
        return util.getConfiguration('brightscript')?.deviceDiscovery?.hiddenDevices ?? [];
    }

    /**
     * Should offline devices be shown in the device panel?
     */
    private get showOfflineDevices(): boolean {
        return util.getConfiguration('brightscript')?.deviceDiscovery?.showOfflineDevices !== false;
    }

    /**
     * Should this device be shown via public API?
     * Filters based on hiddenDevices, showOfflineDevices, and includeNonDeveloperDevices settings.
     */
    private shouldShowDevice(device: RokuDevice): boolean {
        // Hidden devices blacklist
        if (device.serialNumber && this.hiddenDevices.includes(device.serialNumber)) {
            return false;
        }

        // Offline device filtering
        if (!this.showOfflineDevices && device.deviceState === 'offline') {
            return false;
        }

        // Non-developer device filtering
        if (!this.includeNonDeveloperDevices && device?.deviceInfo?.['developer-enabled'] === 'false') {
            return false;
        }

        return true;
    }

    /**
     * Default password applied to any device that does not have its own configured password.
     * Returns undefined when the setting is empty so callers can fall through to their own logic.
     */
    public getDefaultPassword(): string | undefined {
        const value = util.getConfiguration('brightscript')?.defaultDevicePassword;
        return typeof value === 'string' && value.length > 0 ? value : undefined;
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
     * Load last seen devices from cache.
     * Last seen devices are used to pre-populate the IP→serial mapping.
     */
    private loadLastSeenDevices(): void {
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
                // Add to discoveredDevices array (state determined from cache freshness)
                this.setDiscoveredDevice(ip, serialNumber);
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
        const inspection = vscode.workspace.getConfiguration('brightscript').inspect<ConfiguredDevice[]>('devices');
        const userDevices = inspection?.globalValue ?? [];
        const workspaceDevices = inspection?.workspaceValue ?? [];

        // Build a map tracking which scopes each device is in
        interface ConfiguredDeviceWithScope extends ConfiguredDevice {
            configuredIn: ConfigurationScope[];
        }
        const deviceMap = new Map<string, ConfiguredDeviceWithScope>();

        function addDevicesFromScope(devices: ConfiguredDevice[], scope: ConfigurationScope) {
            for (const device of devices) {
                if (!device?.host) {
                    continue;
                }
                const key = device.serialNumber || device.host;
                const existing = deviceMap.get(key);
                const scopes = existing?.configuredIn ?? [];
                if (!scopes.includes(scope)) {
                    scopes.push(scope);
                }
                deviceMap.set(key, {
                    ...existing,
                    ...device,
                    configuredIn: scopes
                });
            }
        }

        addDevicesFromScope(userDevices, 'user');
        addDevicesFromScope(workspaceDevices, 'workspace');

        // Clear and rebuild configuredDevices array
        this.configuredDevices = [];

        // Sort devices by deterministic key for consistent ordering
        const sortedDevices = Array.from(deviceMap.values()).sort((a, b) => {
            const keyA = a.serialNumber || a.host;
            const keyB = b.serialNumber || b.host;
            return keyA.localeCompare(keyB);
        });

        for (const configured of sortedDevices) {
            // Resolve hostname to IP address (handles both hostnames and IPs)
            let resolvedIp: string | undefined;
            try {
                resolvedIp = await rokuDebugUtil.dnsLookup(configured.host);
            } catch {
                // DNS lookup failed - resolvedIp remains undefined
            }

            const ip = resolvedIp ?? configured.host;

            this.configuredDevices.push({
                ...configured,
                resolvedIp: resolvedIp
            });

            // Set device state using configured serial (not cache - cache might be stale)
            this.setDeviceState({ serialNumber: configured.serialNumber, ip: ip });
        }

        this.emitDevicesChanged();
    }

    private async resolveDevice(device: RokuDevice | { ip: string }, doSyntheticDelay = true, force = false): Promise<boolean> {
        // Extract serial from device if available (for proper state key management)
        const knownSerial = 'serialNumber' in device ? device.serialNumber : undefined;

        const currentStateObject = this.getDeviceState({ ip: device.ip, serialNumber: knownSerial });

        // Offline cooldown: if device is offline and we recently checked, skip unless forced
        // This prevents the loop: healthCheck → resolve → offline → emit → refresh → healthCheck...
        const isOffline = currentStateObject.state === 'offline';
        const recentlyCheckedOffline = isOffline && (Date.now() - currentStateObject.lastUpdated < this.OFFLINE_COOLDOWN_MS);
        if (!force && recentlyCheckedOffline) {
            return false;
        }

        // Increment and capture sequence number to handle concurrent refresh calls
        // Use IP for sequence tracking (primary key)
        const currentSeq = (this.resolveDeviceSequence.get(device.ip) ?? 0) + 1;
        this.resolveDeviceSequence.set(device.ip, currentSeq);

        // Get device info from cache or network
        let deviceInfo: DeviceInfoRaw | undefined;

        // Try to find cached data via serial number
        const serialForCache = knownSerial ?? this.globalStateManager.getSerialNumberForIp(device.ip, this.networkId);
        const cached = serialForCache ? this.globalStateManager.getCachedDevice(serialForCache) : undefined;
        const cacheIsFresh = cached && (Date.now() - cached.createdAt < this.DEVICE_INFO_CACHE_MS);

        // Use cache only if:
        // - Not forced
        // - Cache is fresh
        // - Device is not offline (offline devices should always hit network to check if back online)
        if (!force && cacheIsFresh && !isOffline) {
            // Use cached data
            deviceInfo = cached.deviceInfo as DeviceInfoRaw;
        } else {
            // Set to pending before making network call
            // This prevents unnecessary state flicker (online→pending→online) when using cache
            if (currentStateObject.state !== 'pending') {
                this.setDeviceState({ ip: device.ip, serialNumber: knownSerial }, 'pending');
                this.emitDevicesChanged();
            }

            // Fetch fresh data from network
            try {
                deviceInfo = await this.fetchDeviceInfo(device.ip, 8060);

                if (doSyntheticDelay) {
                    await this.randomDelay(400, 1_000);
                }
            } catch {
                deviceInfo = undefined;
            }
        }

        // Only apply result if this is still the latest request for this device
        if (this.resolveDeviceSequence.get(device.ip) !== currentSeq) {
            // Stale response - a newer check was started, ignore this result
            return !!deviceInfo;
        }

        if (deviceInfo) {
            // Extract serial from response, fall back to known serial
            const serial = deviceInfo['serial-number']?.toString?.() ?? knownSerial;

            if (serial) {
                // Add to last seen devices (successfully resolved with serial)
                this.globalStateManager.addLastSeenDevice(this.networkId, serial);
            }

            // Update discoveredDevices array (handles mismatch detection internally)
            if ('isDiscovered' in device && device.isDiscovered) {
                this.setDiscoveredDevice(device.ip, serial);
            }

            // Mark any configured devices at this IP with different serials as offline
            this.markMismatchedConfiguredDevicesOffline(device.ip, serial);

            // Only emit if state actually changed
            this.setDeviceState({ ip: device.ip, serialNumber: serial }, 'online');
            this.emitDevicesChanged();
            return true;
        } else {
            // Remove from discoveredDevices (ephemeral - offline devices are removed)
            this.removeDiscoveredDevice(device.ip);

            // Set state to offline (configured devices persist with offline state)
            // Use known serial if available for proper key management
            this.setDeviceState({ ip: device.ip, serialNumber: knownSerial }, 'offline');

            this.emitDevicesChanged();
            return false;
        }
    }

    /**
     * Check if a newly discovered serial number at an IP represents a mismatch
     * with what we currently have stored. Used to trigger config reload when
     * a device has changed IPs or a different device is now at a known IP.
     *
     * Mismatch scenarios:
     * - Stored IP→serial map has SerialA for IP1, but got SerialB
     * - Discovered device at IP1 had SerialA, but now has SerialB
     *
     * Note: We intentionally don't check configured device serials here.
     * If a user misconfigured a serial, reloading won't fix it and would
     * cause an infinite reload loop.
     *
     * @param ip - The IP address
     * @param newSerial - The newly discovered serial number
     * @returns true if there's a mismatch that warrants reloading configurations
     */
    private checkForSerialMismatch(ip: string, newSerial: string | undefined): boolean {
        if (!newSerial) {
            // No new serial to compare
            return false;
        }

        // Check what serial we have stored for this IP in the IP→serial map
        const storedSerial = this.globalStateManager.getSerialNumberForIp(ip, this.networkId);

        if (storedSerial && storedSerial !== newSerial) {
            // Different device is now at this IP
            return true;
        }


        // Check if any discovered device at this IP has a different serial
        const discoveredDevice = this.discoveredDevices.find(d => d.ip === ip);
        if (discoveredDevice?.serialNumber && discoveredDevice.serialNumber !== newSerial) {
            // Discovered device has a different serial than what's actually at the IP
            return true;
        }

        return false;
    }

    /**
     * Mark configured devices as offline when a different device is found at their IP.
     * Note: resolvedIp is only set during DNS resolution in loadConfiguredDevices(),
     * not updated here when discovering devices.
     */
    private markMismatchedConfiguredDevicesOffline(ip: string, serialNumber: string | undefined): void {
        for (const entry of this.configuredDevices) {
            const isAtThisIp = entry.host === ip || entry.resolvedIp === ip;
            const hasDifferentSerial = entry.serialNumber && serialNumber && entry.serialNumber !== serialNumber;

            if (isAtThisIp && hasDifferentSerial) {
                this.setDeviceState({ serialNumber: entry.serialNumber }, 'offline');
            }
        }
    }

    private async healthCheckAllDevices(force = false, doSyntheticDelay = true): Promise<void> {
        // Get all devices
        const devices = this.getAllDevices();

        if (devices.length === 0) {
            return;
        }

        // Set all to pending and emit before async work
        for (const device of devices) {
            this.setDeviceState({ ip: device.ip, serialNumber: device.serialNumber }, 'pending');
        }
        this.emitDevicesChanged();

        // Check all devices (force flag bypasses fetch cache)
        let needsScan = false;
        await Promise.all(devices.map(async (device) => {
            const isHealthy = await this.resolveDevice(device, doSyntheticDelay, force);
            if (!isHealthy && device.isDiscovered) {
                needsScan = true;
            }
        }));

        if (needsScan) {
            this.discoverAll(this.deviceDiscoveryEnabled);
        }
    }

    /**
     * Health check devices that didn't respond to a scan.
     * Called after scan-ended. Checks devices whose cache is older than STALE_DEVICE_AFTER_SCAN_MS.
     */
    private async healthCheckStaleDevices() {
        const now = Date.now();
        const staleDevices = this.getAllDevices().filter(device => {
            // Skip devices that are already offline - no point health checking them
            if (device.deviceState === 'offline') {
                return false;
            }

            if (!device.serialNumber) {
                // No serial = no cache, consider stale
                return true;
            }
            const cached = this.globalStateManager.getCachedDevice(device.serialNumber);
            if (!cached) {
                return true;
            }
            const cacheAge = now - cached.createdAt;
            return cacheAge > this.STALE_DEVICE_AFTER_SCAN_MS;
        });

        if (staleDevices.length === 0) {
            return;
        }

        // Cooldown is handled by fetchDeviceInfo cache
        await Promise.all(staleDevices.map(device => this.resolveDevice(device, false)));
    }

    /**
     * Fetch device info from the network. Always makes a network request.
     * Caches the result in globalStateManager for future lookups.
     */
    private async fetchDeviceInfo(ip: string, port: number): Promise<DeviceInfoRaw> {
        try {
            const info = await rokuDeploy.getDeviceInfo({
                host: ip,
                remotePort: port,
                timeout: DeviceManager.HEALTH_CHECK_TIMEOUT_MS
            });
            if (info['serial-number']) {
                this.globalStateManager.setCachedDevice(info['serial-number'], {
                    serialNumber: info['serial-number'],
                    deviceInfo: info,
                    createdAt: Date.now()
                });
                this.globalStateManager.setSerialNumberForIp(this.networkId, ip, info['serial-number']);
            }

            return info;
        } catch (e) {
            console.error(e);
            return undefined;
        }
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
     * Add or update a device in the discoveredDevices array.
     * Handles deduplication by serial number (removes old IP entry if serial matches).
     * Also sets device state using intelligent defaults (cache freshness check).
     */
    private setDiscoveredDevice(ip: string, serialNumber: string | undefined): void {
        // Check for serial mismatch before updating state
        const hasMismatch = this.checkForSerialMismatch(ip, serialNumber);

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
        const existing = existingIdx >= 0 ? this.discoveredDevices[existingIdx] : undefined;

        if (existing) {
            // Update existing entry
            this.discoveredDevices[existingIdx] = {
                ip: ip,
                serialNumber: serialNumber ?? existing.serialNumber
            };
        } else {
            // Add new entry
            this.discoveredDevices.push({
                ip: ip,
                serialNumber: serialNumber
            });
        }

        // Set device state using intelligent defaults (preserves existing online state or uses cache freshness)
        this.setDeviceState({ serialNumber: serialNumber, ip: ip });

        // If a different device is now at this IP, reload configurations
        if (hasMismatch) {
            this.loadConfiguredDevices().catch(() => { });
        }
    }

    /**
     * Remove a discovered device by IP. Clears from discoveredDevices array,
     * clears lastUsedDeviceIp if it matches, and removes from lastSeenDevices cache.
     */
    private removeDiscoveredDevice(ip: string): void {
        // Find the device first to get its serial number
        const idx = this.discoveredDevices.findIndex(d => d.ip === ip);
        if (idx < 0) {
            return;
        }

        const device = this.discoveredDevices[idx];
        this.discoveredDevices.splice(idx, 1);

        // Clear lastUsedDeviceIp if it matches
        if (this.lastUsedDeviceIp === ip) {
            this.lastUsedDeviceIp = undefined;
        }

        // Remove from lastSeenDevices if we have a serial
        if (device?.serialNumber) {
            this.globalStateManager.removeLastSeenDevice(this.networkId, device.serialNumber);
        }
    }

    /**
     * Find configured and discovered device entries by key or lookup criteria.
     * Key format: "s:{serialNumber}" or "i:{ip}"
     * Lookup format: { ip?: string; serialNumber?: string }
     */
    private findDeviceEntries(keyOrLookup: string | { ip?: string; serialNumber?: string }): {
        configured: ConfiguredDeviceEntry | undefined;
        discovered: DiscoveredDeviceEntry | undefined;
    } {
        let configured: ConfiguredDeviceEntry | undefined;
        let discovered: DiscoveredDeviceEntry | undefined;

        if (typeof keyOrLookup === 'string') {
            // Decode encoded key
            const key = keyOrLookup;
            if (key.startsWith('s:')) {
                const serial = key.slice(2);
                if (serial) {
                    configured = this.configuredDevices.find(c => c.serialNumber === serial);
                    discovered = this.discoveredDevices.find(d => d.serialNumber === serial);
                }
            } else if (key.startsWith('i:')) {
                const ip = key.slice(2);
                if (ip) {
                    configured = this.configuredDevices.find(c => c.resolvedIp === ip || c.host === ip);
                    discovered = this.discoveredDevices.find(d => d.ip === ip);
                }
            }
        } else {
            // Lookup object
            const lookup = keyOrLookup;

            if (lookup.serialNumber) {
                configured = this.configuredDevices.find(c => c.serialNumber === lookup.serialNumber);
                discovered = this.discoveredDevices.find(d => d.serialNumber === lookup.serialNumber);
            }

            if (lookup.ip) {
                if (!configured) {
                    configured = this.configuredDevices.find(c => c.resolvedIp === lookup.ip || c.host === lookup.ip);
                }
                if (!discovered) {
                    discovered = this.discoveredDevices.find(d => d.ip === lookup.ip);
                }
            }
        }

        return { configured: configured, discovered: discovered };
    }

    /**
     * Build a merged RokuDevice from configured and discovered entries.
     * At least one of configured or discovered must be provided.
     */
    private buildMergedDevice(
        configuredEntry: ConfiguredDeviceEntry | undefined,
        discoveredEntry: DiscoveredDeviceEntry | undefined
    ): RokuDevice | undefined {
        if (!configuredEntry && !discoveredEntry) {
            return undefined;
        }

        // Determine IP: discovered > resolvedIp > host
        let ip: string;
        if (discoveredEntry) {
            ip = discoveredEntry.ip;
        } else if (configuredEntry?.resolvedIp) {
            ip = configuredEntry.resolvedIp;
        } else {
            ip = configuredEntry.host;
        }

        // Determine serial: configured > discovered > cache
        // Configured is user's explicit config, discovered is fresh network data,
        // cache is fallback for initial load before discovery runs
        const serialNumber = configuredEntry?.serialNumber ??
            discoveredEntry?.serialNumber ??
            this.globalStateManager.getSerialNumberForIp(ip, this.networkId);

        const deviceState = this.getDeviceState({ serialNumber: serialNumber, ip: ip }).state;

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
            isDiscovered: !!discoveredEntry,
            isConfigured: !!configuredEntry,
            configuredIn: configuredEntry?.configuredIn,
            configuredName: configuredEntry?.name,
            configuredPassword: configuredEntry?.password ?? this.getDefaultPassword()
        };
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
     * Set up event listeners for the RokuFinder.
     * This must be called regardless of deviceDiscoveryEnabled so that
     * active scan responses are processed.
     */
    private setupFinderListeners() {
        this.finder.removeAllListeners();
        this.finder.on('found', (ip: string, options?: { serialNumber?: string }) => {
            this.setDiscoveredDevice(ip, options?.serialNumber);
            this.emitDevicesChanged();
        });

        this.finder.on('device-online', (ip: string, serialNumber?: string) => {
            this.handleDeviceOnline(ip, serialNumber);
        });

        this.finder.on('lost', (ip: string) => {
            this.removeDiscoveredDevice(ip);
            this.emitDevicesChanged();
        });

        // Forward scan events from RokuFinder
        this.finder.on('scan-started', () => {
            this.emitter.emit('scan-started');
        });

        this.finder.on('scan-ended', () => {
            this.emitter.emit('scan-ended');
            // Health check devices that didn't respond to the scan (stale cache)
            this.healthCheckStaleDevices().catch(() => { });
        });
    }

    /**
     * Restart the RokuFinder to rebind UDP sockets to new network interfaces.
     * Called when network changes to ensure SSDP can communicate on the new network.
     */
    private restartRokuFinder() {
        // Keep reference to old finder for delayed disposal
        const oldFinder = this.finder;

        // Create new finder instance
        this.finder = new RokuFinder(this.globalStateManager, this.makeFinderLogger());

        // Re-attach event listeners
        this.setupFinderListeners();

        // Dispose old finder
        oldFinder?.dispose();

        // Restart if device discovery is enabled
        if (this.deviceDiscoveryEnabled) {
            this.startRokuFinder().catch((e) => {
                console.error('Failed to restart RokuFinder:', e);
            });
        }
    }

    /**
     * Start listening for passive SSDP announcements from Roku devices
     */
    private async startRokuFinder() {
        await this.finder.start();
        const ts = new Date().toLocaleTimeString();
        this.makeFinderLogger()(`[${ts}] RokuFinder started — passive ssdp:alive monitoring active`);
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

export type PasswordValidationResult = 'ok' | 'bad-password' | 'unreachable';

export type ConfigurationScope = 'user' | 'workspace';

/**
 * User-configured device from settings (brightscript.devices)
 */
export interface ConfiguredDevice {
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
}

/**
 * Key format for device state map: "s:{serial}" or "i:{ip}"
 */
type DeviceStateKey = `s:${string}` | `i:${string}`;

/**
 * Entry in the device state map
 */
interface DeviceStateEntry {
    state: DeviceState;
    lastUpdated: number;
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
