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
import { icons } from '../icons';

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

            //reset all configured device states to unknown - need to re-verify on new network
            for (const entry of this.configuredDevices) {
                entry.lastState = entry.state;
                entry.state = 'unknown';
                entry.stateLastUpdated = Date.now();
            }

            //clear and reload discovered devices anytime this network changes (state goes with them)
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
     * Generate a display name for a device.
     * Handles missing device info gracefully (no ugly " - - - " strings).
     * @param device - The device to generate a name for
     * @param includeIp - Whether to always append IP at the end (default: false, IP only used as fallback)
     */
    public getDeviceDisplayName(device: RokuDevice, includeIp = false): string {
        // Coerce to a trimmed string, or undefined when the value is missing/blank.
        // Whitespace-only values would otherwise pass `Boolean` and render as empty segments.
        const clean = (value: unknown): string | undefined => {
            if (value === null || value === undefined || typeof value !== 'string') {
                return undefined;
            }
            const str = value.trim();
            return str.length > 0 ? str : undefined;
        };

        const displayName = clean(device.configuredName) ?? clean(device.deviceInfo['user-device-name']);
        const modelNumber = clean(device.deviceInfo['model-number']);
        const softwareVersion = clean(device.deviceInfo['software-version']);
        const ip = clean(device.ip);

        const parts = [
            modelNumber,
            displayName,
            softwareVersion ? `OS ${softwareVersion}` : undefined
        ].filter(Boolean);

        if (includeIp && ip) {
            parts.push(ip);
        }

        return parts.join(' – ') || ip || '';
    }

    /**
     * Generate the label used when showing "host" entries in a quick picker
     * @param device the device containing all the info
     * @returns a properly formatted host string
     */
    public getIconPath(device: RokuDevice) {
        const hasCache = device.serialNumber && this.hasDeviceCache(device.serialNumber);

        if (device.deviceState === 'pending') {
            return new vscode.ThemeIcon('circle-small', new vscode.ThemeColor('disabledForeground'));
        }

        if (device.deviceState === 'offline') {
            const iconId = hasCache ? 'debug-disconnect' : 'warning';
            return new vscode.ThemeIcon(iconId, new vscode.ThemeColor('disabledForeground'));
        }

        if (device.deviceState === 'unknown' && !hasCache) {
            return new vscode.ThemeIcon('warning', new vscode.ThemeColor('disabledForeground'));
        }

        return icons.getDeviceType(device.deviceInfo);
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
     * Get device state from inline state on entries.
     * Priority: discovered > configured > default unknown
     * Searches by IP first (if provided), then by serial number
     * @param lookup - Device lookup by serial and/or IP
     * @returns The device state, defaulting to 'unknown' if not found
     */
    public getDeviceState(lookup: { serialNumber?: string; ip?: string }): DeviceStateEntry {
        let match = this.findStateEntry(this.discoveredDevices, lookup);
        if (match) {
            return { state: match.state, lastUpdated: match.stateLastUpdated ?? Date.now() };
        }

        match = this.findStateEntry(this.configuredDevices, lookup);
        if (match) {
            return { state: match.state, lastUpdated: match.stateLastUpdated ?? Date.now() };
        }
        return { state: 'unknown', lastUpdated: Date.now() };
    }

    /**
     * Find the highest-priority state-bearing entry across discovered then configured
     * sources. Within each source, try the IP first (skipping IP matches whose serial
     * points to a different device — otherwise changing a configured device's serial to
     * a new value at an IP that already hosts an online discovered device would briefly
     * inherit that online state), then fall back to a serial-only match. Returns the
     * first entry that actually has a `state` set.
     */
    private findStateEntry(entries: Array<ConfiguredDeviceEntry | DiscoveredDeviceEntry>, lookup: { serialNumber?: string; ip?: string }) {
        let match: ConfiguredDeviceEntry | DiscoveredDeviceEntry | undefined;
        if (lookup.ip) {
            match = entries.find(entry => {
                const ipMatches = (entry as DiscoveredDeviceEntry).ip === lookup.ip || (entry as ConfiguredDeviceEntry).host === lookup.ip || (entry as ConfiguredDeviceEntry).resolvedIp === lookup.ip;
                // when both sides carry a serial, they must agree — otherwise this IP belongs to a different device
                const serialMatches = !lookup.serialNumber || !entry.serialNumber || entry.serialNumber === lookup.serialNumber;
                return ipMatches && serialMatches;
            });
        }
        if (!match && lookup.serialNumber) {
            match = entries.find(entry => entry.serialNumber === lookup.serialNumber);
        }
        if (match?.state) {
            return match;
        }
        return undefined;
    }

    /**
     * Set device state directly on entries that match the IP.
     * Updates all configured and discovered entries at the given IP.
     * When called without explicit state, uses intelligent defaults:
     * - If already online, stays online
     * - Else checks cache freshness (5 min threshold) to determine online vs unknown
     *
     * @param lookup - Device lookup by IP (and optionally serial for cache lookup)
     * @param state - Explicit state to set, or undefined for intelligent default
     */
    public setDeviceState(lookup: { serialNumber?: string; ip?: string }, state?: DeviceState): void {
        const now = Date.now();
        let resolvedState: DeviceState;

        //if we were given a state, use it
        if (state !== undefined) {
            resolvedState = state;
        } else {
            const currentState = this.getDeviceState(lookup).state;
            if (currentState === 'online') {
                resolvedState = 'online';
            } else {
                // For non-online devices, check cache freshness
                const cached = lookup.serialNumber ? this.globalStateManager.getCachedDevice(lookup.serialNumber) : undefined;
                const isFreshCache = cached && (now - cached.createdAt < this.FRESH_CACHE_THRESHOLD_MS);
                resolvedState = isFreshCache ? 'online' : 'unknown';
            }
        }

        // Update configured entries at this IP that match the serial (or have no serial conflict).
        // stateLastUpdated bumps on every call so consumers see the latest check time, but
        // lastState/state only move when the state actually changes.
        for (const entry of this.configuredDevices) {
            const ipMatches = entry.host === lookup.ip || entry.resolvedIp === lookup.ip;
            // Only update if IP matches AND (no serial conflict OR serials match)
            const serialConflict = lookup.serialNumber && entry.serialNumber && entry.serialNumber !== lookup.serialNumber;
            if (ipMatches && !serialConflict) {
                if (entry.state !== resolvedState) {
                    entry.lastState = entry.state;
                    entry.state = resolvedState;
                }
                entry.stateLastUpdated = now;
            }
        }

        // Update discovered entries at this IP that match the serial (or have no serial conflict).
        // Same nested guard as the configured loop above.
        for (const entry of this.discoveredDevices) {
            const ipMatches = entry.ip === lookup.ip;
            const serialConflict = lookup.serialNumber && entry.serialNumber && entry.serialNumber !== lookup.serialNumber;
            if (ipMatches && !serialConflict) {
                if (entry.state !== resolvedState) {
                    entry.lastState = entry.state;
                    entry.state = resolvedState;
                }
                entry.stateLastUpdated = now;
            }
        }
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
    public async clearCurrentDeviceList() {
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

        await this.healthCheckAllDevices(false, false).catch(() => { });
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

        // Reset configured device states to unknown
        for (const entry of this.configuredDevices) {
            entry.lastState = entry.state;
            entry.state = 'unknown';
            entry.stateLastUpdated = Date.now();
        }

        // Clear discovered devices (state goes with them)
        this.clearCurrentDeviceList().catch(() => { });
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
            const accepted = await rokuDeploy.validateDeveloperPassword({ device: { host: host }, password: password });
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

        // Load cached devices for current network - add to discoveredDevices (state determined by cache freshness)
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
        // Check if the serial was last seen at this IP (don't trust cache if device moved)
        const cachedIp = serialForCache ? this.globalStateManager.getIpForSerial(serialForCache, this.networkId) : undefined;
        const cacheIsFresh = cached && (Date.now() - cached.createdAt < this.DEVICE_INFO_CACHE_MS) && cachedIp === device.ip;
        console.log('[TRACE] resolveDevice', device.ip, 'serialForCache=', serialForCache, 'cachedIp=', cachedIp, 'cacheIsFresh=', cacheIsFresh);

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

            // Set state to offline on any remaining entries at this IP (configured devices persist)
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
                // Mark the configured entry directly as offline
                entry.state = 'offline';
                entry.stateLastUpdated = Date.now();
            }
        }
    }

    private async healthCheckAllDevices(force = false, doSyntheticDelay = true): Promise<void> {
        // Collect all unique IPs from both sources (same serial at different IPs = different entries to check)
        const discoveredIpSet = new Set(this.discoveredDevices.map(entry => entry.ip));
        const allIps = new Set([
            ...this.configuredDevices.map(entry => entry.resolvedIp ?? entry.host),
            ...discoveredIpSet
        ]);

        if (allIps.size === 0) {
            return;
        }

        // Set all to pending and emit before async work
        for (const ip of allIps) {
            this.setDeviceState({ ip: ip }, 'pending');
        }
        this.emitDevicesChanged();

        // Health check all devices - if any discovered device is unhealthy, trigger a scan
        let needsScan = false;
        await Promise.all([...allIps].map(async (ip) => {
            const isHealthy = await this.resolveDevice({ ip: ip }, doSyntheticDelay, force);
            if (!isHealthy && discoveredIpSet.has(ip)) {
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
     * Iterates over both source arrays to ensure all devices are checked even when
     * the same serial exists at multiple IPs.
     */
    private async healthCheckStaleDevices() {
        const now = Date.now();

        // Helper to check if a device with given serial is stale
        const isStale = (serialNumber: string | undefined): boolean => {
            if (!serialNumber) {
                return true; // No serial = no cache, consider stale
            }
            const cached = this.globalStateManager.getCachedDevice(serialNumber);
            if (!cached) {
                return true;
            }
            const cacheAge = now - cached.createdAt;
            return cacheAge > this.STALE_DEVICE_AFTER_SCAN_MS;
        };

        // Collect unique stale IPs from both source arrays
        const staleIps = new Set([
            ...this.configuredDevices
                .filter(entry => entry.state !== 'offline' && isStale(entry.serialNumber))
                .map(entry => entry.resolvedIp ?? entry.host),
            ...this.discoveredDevices
                .filter(entry => entry.state !== 'offline' && isStale(entry.serialNumber))
                .map(entry => entry.ip)
        ]);

        if (staleIps.size === 0) {
            return;
        }

        // Cooldown is handled by fetchDeviceInfo cache
        await Promise.all([...staleIps].map(ip => this.resolveDevice({ ip: ip }, false)));
    }

    /**
     * Fetch device info from the network. Always makes a network request.
     * Caches the result in globalStateManager for future lookups.
     */
    private async fetchDeviceInfo(ip: string, port: number): Promise<DeviceInfoRaw> {
        try {
            const info = await rokuDeploy.getDeviceInfo({
                device: { host: ip },
                ecpPort: port,
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
            // Update existing entry (preserve state fields so setDeviceState below sees the prior state)
            this.discoveredDevices[existingIdx] = {
                ...existing,
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

        // Determine state: discovered > configured > unknown (discovered is ground truth)
        const deviceState = discoveredEntry?.state ?? configuredEntry?.state ?? 'unknown';
        // Determine previous state: discovered > configured > unknown (discovered is ground truth)
        const lastState = discoveredEntry?.lastState ?? configuredEntry?.lastState ?? 'unknown';

        // Build key
        const key = serialNumber ? `s:${serialNumber}` : `i:${ip}`;

        // Hydrate deviceInfo from cache
        const cached = serialNumber ? this.globalStateManager.getCachedDevice(serialNumber) : undefined;

        return {
            ip: ip,
            serialNumber: serialNumber,
            key: key,
            deviceState: deviceState,
            lastDeviceState: lastState,
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
     * Health checks the device if focused and no cache, and shows notification if enabled.
     */
    private handleDeviceOnline(ip: string, serialNumber?: string): void {
        // Use provided serial, fall back to IP→serial mapping if not provided
        const actualSerial = serialNumber ?? this.globalStateManager.getSerialNumberForIp(ip, this.networkId);

        // Health check if VS Code is focused and device has no cache
        const hasCache = actualSerial ? this.hasDeviceCache(actualSerial) : false;
        if (vscode.window.state.focused && !hasCache) {
            this.resolveUncachedDiscoveredDevices().catch(() => { });
        }

        if (!this.showInfoMessages) {
            return;
        }

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
        // Resolve any discovered devices without cache that appeared while unfocused
        this.resolveUncachedDiscoveredDevices().catch(() => { });
    }

    /**
     * Health check discovered devices that don't have cached info.
     * Called on focus gain to resolve devices that appeared while VS Code was unfocused.
     */
    private async resolveUncachedDiscoveredDevices(): Promise<void> {
        const uncached = this.discoveredDevices.filter(entry => {
            return !entry.serialNumber || !this.hasDeviceCache(entry.serialNumber);
        });

        if (uncached.length === 0) {
            return;
        }

        // Health check each uncached device in parallel
        await Promise.all(
            uncached.map(entry => this.healthCheckDevice({ ip: entry.ip, serialNumber: entry.serialNumber }, false, false).catch(() => { }))
        );
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

export type DeviceState = 'offline' | 'unknown' | 'pending' | 'online';

export type PasswordValidationResult = 'ok' | 'bad-password' | 'unreachable';

export type ConfigurationScope = 'user' | 'workspace';

/**
 * A resolved host paired with the raw `device-info` gathered while probing it. Returned by the
 * host-resolution flows (device picker, manual entry, active-host lookup) so callers can reuse the
 * device info without issuing another request to the device.
 */
export interface HostWithDeviceInfo {
    host: string;
    deviceInfo: DeviceInfoRaw;
}

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
    /**
     * Current device state (inline on entry)
     */
    state?: DeviceState;
    /**
     * Previous state, updated by setDeviceState before each transition. Undefined when no
     * state has been recorded yet — readers should treat that as 'unknown'.
     */
    lastState?: DeviceState;
    /**
     * Timestamp of last state update
     */
    stateLastUpdated?: number;
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
     * Current device state (inline on entry)
     */
    state?: DeviceState;
    /**
     * Previous state, updated by setDeviceState before each transition. Undefined when no
     * state has been recorded yet — readers should treat that as 'unknown'.
     */
    lastState?: DeviceState;
    /**
     * Timestamp of last state update
     */
    stateLastUpdated?: number;
}

/**
 * Device state with timestamp, returned by getDeviceState
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
     * Device state: online, offline, pending (currently checking), or unknown (never checked)
     */
    deviceState: DeviceState;
    /**
     * Previous device state: online, offline, pending (currently checking), or unknown (never checked)
     */
    lastDeviceState: DeviceState;
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
