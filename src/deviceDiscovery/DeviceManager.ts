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
            // Find and remove device by IP
            const device = this.getDeviceEntry({ ip: ip });
            if (device) {
                this.removeDevice(device.ip);
            }
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
    private devices: DeviceEntry[] = [];
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
        // Normalize input to lookup object
        let lookup: { ip?: string; serialNumber?: string };
        if (typeof keyOrLookup === 'string') {
            // Decode string key - require explicit "s:" or "i:" prefix
            if (keyOrLookup.startsWith('s:')) {
                const serial = keyOrLookup.slice(2);
                if (!serial) {
                    return undefined;
                }
                lookup = { serialNumber: serial };
            } else if (keyOrLookup.startsWith('i:')) {
                const ip = keyOrLookup.slice(2);
                if (!ip) {
                    return undefined;
                }
                lookup = { ip: ip };
            } else {
                return undefined;
            }
        } else {
            lookup = keyOrLookup;
        }

        const device = this.getDeviceEntry(lookup);
        if (!device) {
            return undefined;
        }

        // Hydrate deviceInfo from cache (use getSerial for fallback to IP→serial mapping)
        const serial = this.getSerial(device);
        const cached = serial ? this.globalStateManager.getCachedDevice(serial) : undefined;

        return {
            ...device,
            deviceInfo: cached?.deviceInfo ?? {}
        };
    }

    /**
     * Get a list of all roku devices known by this extension (by scanning, hardcoded lists, etc)
     * Returns full devices with deviceInfo hydrated from cache.
     * Configured devices are sorted first, then by form factor, name, and id.
     */
    public getAllDevices(): RokuDevice[] {
        // Hydrate each device using getDevice()
        const devices: RokuDevice[] = [];
        for (const device of this.devices) {
            const deviceDetail = this.getDevice({ ip: device.ip });
            if (deviceDetail) {
                devices.push(deviceDetail);
            }
        }

        return devices.sort(
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
     * Check if a device has cached info (has been successfully resolved before).
     * Used by view providers to determine icon: warning (no cache) vs disconnect (has cache).
     */
    public hasDeviceCache(serialNumber: string): boolean {
        return !!this.globalStateManager.getCachedDevice(serialNumber);
    }

    /**
     * Re-scan the network for devices and health-check existing ones
     */
    public refresh(force = false): boolean {
        this.checkDevicesHealth(force).catch(() => { });
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
        // Keep configured devices, remove discovered-only devices
        this.devices = this.devices.filter(d => d.isConfigured);

        // Clear short-lived device info cache
        this.deviceInfoCache.clear();

        // Only clear lastUsedDeviceIp if it belonged to a discovered device that was removed
        if (this.lastUsedDeviceIp && !this.devices.some(d => d.ip === this.lastUsedDeviceIp)) {
            this.lastUsedDeviceIp = undefined;
        }

        this.emitDevicesChanged();
    }

    public clearAllCache() {
        // Stop any in-progress scan (finder.stop() emits scan-ended if scanning)
        this.finder.stop();

        // Clear current device list
        this.clearCurrentDeviceList();

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
        this.devices = [];
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

    /**
     * Get device reference from array (lightweight, no cache lookup).
     * For internal use only - doesn't hydrate from cache.
     *
     * @param lookup - Object with optional ip and/or serialNumber
     * @returns Device reference from array or undefined
     */
    private getDeviceEntry(lookup: { ip?: string; serialNumber?: string }): DeviceEntry | undefined {
        if (!lookup.ip && !lookup.serialNumber) {
            return undefined;
        }

        if (lookup.ip && lookup.serialNumber) {
            // Both provided: Must match both
            return this.devices.find(d => d.ip === lookup.ip && this.getSerial(d) === lookup.serialNumber);
        } else if (lookup.ip) {
            // IP only: Match by IP (primary key)
            return this.devices.find(d => d.ip === lookup.ip);
        } else if (lookup.serialNumber) {
            // Serial only: Match by serial in deviceInfo
            return this.devices.find(d => this.getSerial(d) === lookup.serialNumber);
        }

        return undefined;
    }

    /**
     * Get serial number for a device.
     * Checks device.serialNumber first, falls back to IP→serial mapping.
     */
    private getSerial(device: DeviceEntry): string | undefined {
        return device.serialNumber ?? this.globalStateManager.getSerialNumberForIp(device.ip, this.networkId);
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
     * Add or update a device in the devices array.
     * Computes the device key from serialNumber (or falls back to IP).
     */
    private setDevice(input: Omit<DeviceEntry, 'key'>): void {
        const index = this.devices.findIndex(d => d.ip === input.ip);
        const isNewDevice = index < 0;

        // Compute key: serial-based when available, IP-based as fallback
        const key = input.serialNumber ? `s:${input.serialNumber}` : `i:${input.ip}`;
        const device: DeviceEntry = { ...input, key: key };

        if (isNewDevice) {
            this.devices.push(device);
        } else {
            // Merge: incoming wins for most fields, but preserve configured properties
            const existing = this.devices[index];
            this.devices[index] = {
                ...existing,
                ...device,
                // Preserve configured status from either side
                isDiscovered: device.isDiscovered ?? existing.isDiscovered,
                isConfigured: device.isConfigured ?? existing.isConfigured,
                configuredIn: device.configuredIn ?? existing.configuredIn,
                configuredName: device.configuredName ?? existing.configuredName,
                configuredPassword: device.configuredPassword ?? existing.configuredPassword
            };
        }

        this.emitDevicesChanged();
    }

    /**
     * Mark a device as unreachable after a failed health check.
     * - Configured devices: marked 'offline', isDiscovered = false
     * - Discovered-only devices: removed from the list
     */
    private markDeviceUnreachable(deviceIp: string): void {
        const device = this.getDeviceEntry({ ip: deviceIp });
        if (!device) {
            return;
        }

        if (device.isConfigured) {
            // Configured devices stay but marked offline and not discovered
            device.deviceState = 'offline';
            device.isDiscovered = false;
            this.emitDevicesChanged();
        } else {
            // Discovered-only device: remove it
            this.removeDevice(deviceIp);
        }
    }

    /**
     * Remove a device from the devices array.
     */
    private removeDevice(deviceIp: string): void {
        const device = this.getDeviceEntry({ ip: deviceIp });
        if (device) {
            this.devices = this.devices.filter(d => d.ip !== deviceIp);

            // Remove from last seen devices (if has serial)
            const serial = this.getSerial(device);
            if (serial) {
                this.globalStateManager.removeLastSeenDevice(this.networkId, serial);
            }

            // Clear lastUsedDeviceIp if the removed device was the last used
            if (this.lastUsedDeviceIp === deviceIp) {
                this.lastUsedDeviceIp = undefined;
            }

            this.emitDevicesChanged();
        }
    }

    /**
     * Load last seen devices from cache.
     * Removes non-configured devices and resets configured devices to pending (no-op at startup).
     * Then loads cached devices for the current network.
     */
    private loadLastSeenDevices(): void {
        // flip configured devices to pending and remove all the rest
        for (let i = this.devices.length - 1; i >= 0; i--) {
            const device = this.devices[i];
            if (device.isConfigured) {
                device.deviceState = 'pending';
            } else {
                this.devices.splice(i, 1);
            }
        }

        // Load cached devices for current network
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
                // Create device with serial (key computed by setDevice)
                this.setDevice({
                    ip: ip,
                    serialNumber: serialNumber,
                    deviceState: 'pending',
                    isDiscovered: false
                });
                // Ensure IP→serial mapping is set up
                this.globalStateManager.setSerialNumberForIp(this.networkId, ip, serialNumber);
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

        const configuredDevices = Array.from(deviceMap.values());

        for (let i = this.devices.length - 1; i >= 0; i--) {
            const device = this.devices[i];

            // Skip non-configured devices
            if (!device.isConfigured) {
                continue;
            }

            // Check if still in config (by IP or serial)
            const serial = this.getSerial(device);
            const stillConfigured = configuredDevices.some(c => c.host === device.ip ||
                (serial && c.serialNumber === serial)
            );

            if (stillConfigured) {
                continue; // Still configured, keep it
            }

            // Device removed from config
            if (device.isDiscovered) {
                // Keep as discovered-only device
                device.isConfigured = false;
                device.configuredIn = [];
                device.configuredName = undefined;
                device.configuredPassword = undefined;
            } else {
                // Not discovered either, remove completely
                this.devices.splice(i, 1);
            }
        }

        for (const configured of configuredDevices) {
            // Determine serial number
            let serialNumber = configured.serialNumber;
            if (!serialNumber) {
                serialNumber = this.globalStateManager.getSerialNumberForIp(configured.host, this.networkId);
            }

            // Resolve hostname to IP address (handles both hostnames and IPs)
            let ip = configured.host;
            try {
                ip = await rokuDebugUtil.dnsLookup(configured.host);
            } catch {
                // DNS lookup failed - keep original host value as fallback
                // This allows IP addresses to work even if DNS resolution fails
            }

            // Check if device already exists by IP (primary key)
            const existingDevice = this.getDeviceEntry({ ip: ip });

            // Preserve state if device exists
            const deviceState = existingDevice?.deviceState ?? 'pending';
            const isDiscovered = existingDevice?.isDiscovered ?? false;

            // Set up IP→serial mapping if we have serial (deviceInfo already cached if it exists)
            if (serialNumber) {
                this.globalStateManager.setSerialNumberForIp(this.networkId, ip, serialNumber);
            }

            // Create device with serial if known (key computed by setDevice)
            this.setDevice({
                ip: ip,
                serialNumber: serialNumber,
                deviceState: deviceState,
                isConfigured: true,
                configuredIn: configured.configuredIn,
                isDiscovered: isDiscovered,
                configuredName: configured.name,
                configuredPassword: configured.password
            });
        }
    }

    private async resolveDevice(device: DeviceEntry, doSyntheticDelay = true): Promise<boolean> {

        // Increment and capture sequence number to handle concurrent refresh calls
        // Use IP for sequence tracking (primary key)
        const currentSeq = (this.resolveDeviceSequence.get(device.ip) ?? 0) + 1;
        this.resolveDeviceSequence.set(device.ip, currentSeq);

        // Set to pending during health check with immediate UI feedback
        const existingDevice = this.getDeviceEntry({ ip: device.ip });
        if (existingDevice && existingDevice.deviceState !== 'pending') {
            existingDevice.deviceState = 'pending';
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

            // Create device with serial (key computed by setDevice)
            this.setDevice({
                ip: device.ip,
                serialNumber: serial,
                deviceState: 'online',
                isConfigured: device.isConfigured,
                isDiscovered: true,
                configuredName: device.configuredName,
                configuredPassword: device.configuredPassword
            });

            return true;
        } else {
            this.markDeviceUnreachable(device.ip);
            return false;
        }
    }

    private async checkDevicesHealth(force = false): Promise<void> {
        // Use internal devices array directly - no need to hydrate from cache
        const devices = this.devices;

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
            device.deviceState = 'pending';
            this.lastHealthCheckTime.set(device.ip, Date.now());
        }
        this.emitDevicesChanged();

        // Check all devices
        let needsScan = false;
        await Promise.all(devicesToCheck.map(async (device) => {
            const isHealthy = await this.resolveDevice(device);
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

            // Check if device already exists (by IP)
            const existingDevice = this.getDeviceEntry({ ip: ip });

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

            // Create device with serial (key computed by setDevice)
            this.setDevice({
                ip: ip,
                serialNumber: serial,
                deviceState: 'online',
                isConfigured: existingDevice?.isConfigured ?? false,
                isDiscovered: true,
                configuredName: existingDevice?.configuredName,
                configuredPassword: existingDevice?.configuredPassword
            });
        } catch {
            // Device unreachable, ignore
        }
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
export interface ConfiguredDevice {
    host: string;
    name?: string;
    serialNumber?: string;
    password?: string;
}

/**
 * Internal device entry with runtime state
 * Used internally by DeviceManager for tracking devices
 */
interface DeviceEntry {
    ip: string;
    /**
     * Device serial number, when known. Set when device is resolved.
     */
    serialNumber?: string;
    /**
     * Encoded device key for identification.
     * Format: "s:{serialNumber}" when serial is available, "i:{ip}" as fallback.
     * Computed in setDevice() whenever device state changes.
     */
    key: string;
    deviceState: DeviceState;
    /**
     * Current discovery state. True when device is actively discovered on network.
     * Toggles false when device becomes unreachable.
     */
    isDiscovered?: boolean;
    /**
     * If true, this device was configured by the user (in any scope).
     * Configured devices are never auto-removed.
     */
    isConfigured?: boolean;
    /**
     * Which settings scopes this device is configured in.
     */
    configuredIn?: ConfigurationScope[];
    /**
     * User-provided name from config (brightscript.devices).
     * UI should display this over deviceInfo['user-device-name'] when present.
     */
    configuredName?: string;
    /**
     * User-provided password from config.
     */
    configuredPassword?: string;
}

/**
 * Full device details returned by public API (extends DeviceEntry with cached data)
 * Includes runtime state plus cached deviceInfo from GlobalStateManager
 */
export interface RokuDevice extends DeviceEntry {
    deviceInfo: Record<string, any>;
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
