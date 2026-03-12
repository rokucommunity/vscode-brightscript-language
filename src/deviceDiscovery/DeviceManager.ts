import { EventEmitter } from 'eventemitter3';
import { URL } from 'url';
import * as vscode from 'vscode';
import { firstBy } from 'thenby';
import type { Disposable } from 'vscode';
import { rokuDeploy, type DeviceInfoRaw } from 'roku-deploy';
import type { GlobalStateManager } from '../GlobalStateManager';
import { RokuFinder } from './RokuFinder';
import { NetworkChangeMonitor, getNetworkHash } from './NetworkChangeMonitor';
import { SystemSleepMonitor } from './SystemSleepMonitor';
import { util } from '../util';
import { vscodeContextManager } from '../managers/VscodeContextManager';
import { debounce } from 'lodash';

export class DeviceManager {
    constructor(
        private context: vscode.ExtensionContext,
        private globalStateManager: GlobalStateManager
    ) {
        this.firstRequestForDevices = true;
        this.networkId = getNetworkHash();

        this.setupConfiguration();
        this.setupWindowFocusHandling();
        this.setupMonitors();
        this.initialize();
        this.context.subscriptions.push(this);
    }

    private emitter = new EventEmitter();
    private networkId: string;
    private systemSleepMonitor: SystemSleepMonitor;
    private networkChangeMonitor: NetworkChangeMonitor;
    private devices: RokuDeviceDetails[] = [];

    private lastScanDate: Date | null = null;
    private lastDiscoveredDeviceDate: Date = new Date(0); // Epoch as default
    private finder = new RokuFinder();
    private lastHealthCheckTime = new Map<string, number>();
    private resolveDeviceSequence = new Map<string, number>();
    private readonly HEALTH_CHECK_COOLDOWN_MS = 5 * 60 * 1_000; // 5 minutes
    public static readonly HEALTH_CHECK_TIMEOUT_MS = 2_000; // 2 seconds
    private readonly DEVICES_CHANGED_DEBOUNCE_MS = 50;
    private readonly DEVICE_INFO_CACHE_TTL_MS = 5_000; // 5 seconds
    private readonly CACHE_CLEANUP_DELAY_MS = 10_000; // 10 seconds of inactivity
    private deviceInfoCache = new Map<string, { info: DeviceInfoRaw; timestamp: number }>();
    private deviceOnlineNotifiers = new Map<string, ReturnType<typeof debounce>>();
    private cacheCleanupTimer: ReturnType<typeof setTimeout> | null = null;

    // Scan state management
    private readonly SCAN_MIN_DURATION_MS = 3_000;
    private readonly SCAN_SETTLE_MS = 1_500;
    private scanMinTimer: ReturnType<typeof setTimeout> | null = null;
    private scanSettleTimer: ReturnType<typeof setTimeout> | null = null;
    private isScanning = false;
    private scanMinTimeElapsed = false;

    /**
     * If timeSinceLastScan exceeds this threshold, a new scan should be triggered
     */
    public static readonly STALE_SCAN_THRESHOLD_MS = 30 * 60 * 1_000; // 30 minutes

    private scanNeeded = false;

    public firstRequestForDevices: boolean;
    public lastUsedDevice: RokuDeviceDetails | undefined = undefined;

    /**
     * Is device discovery enabled (i.e. passive scans are permitted)
     */
    public get deviceDiscoveryEnabled() {
        return vscode.workspace.getConfiguration('brightscript')?.deviceDiscovery?.enabled ?? true;
    }

    /**
     * Should info messages be shown when new devices are discovered (e.g. "Device found: Roku TV")?
     */
    private get showInfoMessages() {
        return vscode.workspace.getConfiguration('brightscript')?.deviceDiscovery?.showInfoMessages ?? true;
    }

    /**
     * Set the flag indicating a scan is needed. Emits 'scanNeeded-changed' event
     * when the flag flips from false to true.
     */
    public setScanNeeded(force = false): void {
        if (!this.scanNeeded || force) {
            this.scanNeeded = true;
            this.emitter.emit('scanNeeded-changed');
        }
    }

    public get timeSinceLastScan(): number {
        if (!this.lastScanDate) {
            return Infinity; // Never scanned, so always stale
        }
        return Date.now() - this.lastScanDate.getTime();
    }

    /**
     * The number of milliseconds since a new device was discovered
     */
    public get timeSinceLastDiscoveredDevice(): number {
        if (!this.lastDiscoveredDeviceDate) {
            return Infinity;
        }
        return Date.now() - this.lastDiscoveredDeviceDate.getTime();
    }

    private setupConfiguration() {
        const applyConfig = (event?: vscode.ConfigurationChangeEvent) => {
            let config: any = vscode.workspace.getConfiguration('brightscript') || {};

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

        this.loadLastSeenDevices();

        // Always set up finder event listeners so scan responses are processed
        this.setupFinderEventListeners();

        if (this.deviceDiscoveryEnabled) {
            // Sleep monitor runs all the time when enabled (ignores focus state)
            this.systemSleepMonitor.start();

            this.activateMonitoring().then(() => {
                const lastSeenDeviceIds = this.globalStateManager.getLastSeenDeviceIds(this.networkId);
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
     * Get a list of all roku devices known by this extension (by scanning, hardcoded lists, etc)
     */
    public getAllDevices(): RokuDeviceDetails[] {
        this.firstRequestForDevices = false;
        return [...this.devices].sort(
            firstBy<RokuDeviceDetails>((a, b) => {
                return this.getPriorityForDeviceFormFactor(a) - this.getPriorityForDeviceFormFactor(b);
            }).thenBy<RokuDeviceDetails>((a, b) => {
                return a.deviceInfo['default-device-name'].localeCompare(b.deviceInfo['default-device-name']);
            }).thenBy<RokuDeviceDetails>((a, b) => {
                if (a.id < b.id) {
                    return -1;
                }
                if (a.id > b.id) {
                    return 1;
                }
                // ids must be equal
                return 0;
            })
        );
    }

    /**
     * Get a device by its ID
     */
    public getDeviceById(deviceId: string): RokuDeviceDetails | undefined {
        return this.devices.find(d => d.id === deviceId);
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
     * Clear the current list of devices and the cached last-seen-devices list
     */
    public clearCurrentDeviceList() {
        this.devices = [];
        this.deviceInfoCache.clear();
        this.globalStateManager.setLastSeenDeviceIds(this.networkId, []);

        // Clear lastUsedDevice since we don't have any device anymore
        this.lastUsedDevice = undefined;

        //TODO when we support hardcoded devices, we should keep those around (or reload them?) instead of clearing everything

        this.emitDevicesChanged();
    }

    public clearAllCache() {
        this.clearCurrentDeviceList();
        this.globalStateManager.clearLastSeenDevices();
        this.globalStateManager.clearDeviceCache();
    }

    /**
     * Discover all Roku devices on the network and watch for new ones that connect
     */
    private discoverAll(force: boolean): boolean {
        if (force || this.scanNeeded || this.timeSinceLastScan > DeviceManager.STALE_SCAN_THRESHOLD_MS) {
            this.scanNeeded = false;
            this.lastScanDate = new Date();
            this.startScan();
            return true;
        }
        return false;
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

    private async resolveDevice(device: RokuDeviceDetails): Promise<boolean> {
        // Increment and capture sequence number to handle concurrent refresh calls
        const currentSeq = (this.resolveDeviceSequence.get(device.id) ?? 0) + 1;
        this.resolveDeviceSequence.set(device.id, currentSeq);

        // Set to pending during health check with immediate UI feedback
        const existingDevice = this.devices.find(d => d.id === device.id);
        if (existingDevice && existingDevice.deviceState !== 'pending') {
            existingDevice.deviceState = 'pending';
            this.emitDevicesChanged();
        }

        // Fetch latest device info from the network (with short-lived cache)
        let freshDevice: RokuDeviceDetails | undefined;
        try {
            const deviceInfo = await this.getDeviceInfoCached(
                device.ip,
                parseInt(new URL(device.location).port || '8060')
            );

            await this.randomDelay(400, 1_000);
            freshDevice = {
                location: device.location,
                ip: device.ip,
                id: device.id,
                deviceState: 'online',
                deviceInfo: deviceInfo
            };
        } catch {
            freshDevice = undefined;
        }

        // Only apply result if this is still the latest request for this device
        if (this.resolveDeviceSequence.get(device.id) !== currentSeq) {
            // Stale response - a newer check was started, ignore this result
            return !!freshDevice;
        }

        if (freshDevice) {
            this.setDevice(freshDevice);
            return true;
        } else {
            this.removeDevice(device.id);
            return false;
        }
    }

    public async checkDeviceHealth(device: RokuDeviceDetails, force = false): Promise<boolean> {
        // If not forcing, respect the per-device cooldown
        if (!force) {
            const lastCheck = this.lastHealthCheckTime.get(device.id) ?? 0;
            const now = Date.now();
            if (now - lastCheck <= this.HEALTH_CHECK_COOLDOWN_MS) {
                return true;
            }
            this.lastHealthCheckTime.set(device.id, now);
        }

        const isHealthy = await this.resolveDevice(device);
        if (!isHealthy) {
            // force a scan if passive scan is permitted
            this.refresh(this.deviceDiscoveryEnabled);
        }
        return isHealthy;
    }

    private async checkDevicesHealth(force = false): Promise<void> {
        const devices = this.getAllDevices();

        // Filter to devices that need checking
        const devicesToCheck = force ? devices : devices.filter(d => {
            const lastCheck = this.lastHealthCheckTime.get(d.id) ?? 0;
            return Date.now() - lastCheck > this.HEALTH_CHECK_COOLDOWN_MS;
        });

        if (devicesToCheck.length === 0) {
            return;
        }

        // Set all to pending and emit before async work
        for (const device of devicesToCheck) {
            device.deviceState = 'pending';
            this.lastHealthCheckTime.set(device.id, Date.now());
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

    private emitDevicesChanged = throttleBounce(() => {
        this.emitter.emit('devices-changed');
    }, this.DEVICES_CHANGED_DEBOUNCE_MS);

    private async randomDelay(min: number, max: number) {
        const randomness = Math.random() * ((max - min) + min);
        await util.sleep(randomness);
    }

    /**
     * Process a discovered IP address from SSDP.
     * Fetches device info, applies filtering, and upserts if valid.
     */
    private async processDiscoveredIp(ip: string, isAlive: boolean): Promise<void> {
        const location = `http://${ip}:8060`;

        try {
            const deviceInfo = await this.getDeviceInfoCached(ip, 8060);

            const config: any = vscode.workspace.getConfiguration('brightscript') || {};
            const includeNonDeveloperDevices = config?.deviceDiscovery?.includeNonDeveloperDevices === true;
            const developerEnabled = deviceInfo['developer-enabled'] === 'true';

            if (!includeNonDeveloperDevices && !developerEnabled) {
                return;
            }

            await this.randomDelay(400, 1_000);

            const deviceId = deviceInfo['device-id']?.toString?.();
            const isNewDevice = !this.devices.find(d => d.id === deviceId);

            const device: RokuDeviceDetails = {
                location: location,
                ip: ip,
                id: deviceId,
                deviceState: 'online',
                deviceInfo: deviceInfo
            };

            if (isNewDevice) {
                this.lastDiscoveredDeviceDate = new Date();
                if (isAlive && this.showInfoMessages) {
                    if (!this.deviceOnlineNotifiers.has(deviceId)) {
                        this.deviceOnlineNotifiers.set(deviceId, debounce((name: string) => {
                            this.deviceOnlineNotifiers.delete(deviceId);
                            void util.showTimedNotification(`Device Online: ${name}`);
                        }, 500));
                    }
                    this.deviceOnlineNotifiers.get(deviceId)(deviceInfo['default-device-name']);
                }
            }

            this.setDevice(device);
        } catch {
            // Device unreachable, ignore
        }
    }

    /**
     * Start a scan for devices. Emits scan-started, then scan-ended when complete.
     * Scan ends when both: minimum duration (3s) has passed AND 1.5s since last device response.
     */
    private startScan(): void {
        if (this.isScanning) {
            return; // Already scanning
        }

        this.isScanning = true;
        this.scanMinTimeElapsed = false;
        this.emitter.emit('scan-started');

        // Start minimum duration timer
        this.scanMinTimer = setTimeout(() => {
            this.scanMinTimeElapsed = true;
            this.checkScanComplete();
        }, this.SCAN_MIN_DURATION_MS);

        // Start initial settle timer
        this.resetSettleTimer();

        // Trigger the actual SSDP scan
        this.finder.scan();
    }

    private resetSettleTimer(): void {
        if (this.scanSettleTimer) {
            clearTimeout(this.scanSettleTimer);
        }
        this.scanSettleTimer = setTimeout(() => {
            this.scanSettleTimer = null;
            this.checkScanComplete();
        }, this.SCAN_SETTLE_MS);
    }

    private checkScanComplete(): void {
        if (!this.isScanning) {
            return;
        }
        // Only complete if both conditions met: min time elapsed AND settle timer fired
        if (this.scanMinTimeElapsed && this.scanSettleTimer === null) {
            this.endScan();
        }
    }

    private endScan(): void {
        if (!this.isScanning) {
            return;
        }

        this.isScanning = false;
        this.clearScanTimers();
        this.emitter.emit('scan-ended');
    }

    private clearScanTimers(): void {
        if (this.scanMinTimer) {
            clearTimeout(this.scanMinTimer);
            this.scanMinTimer = null;
        }
        if (this.scanSettleTimer) {
            clearTimeout(this.scanSettleTimer);
            this.scanSettleTimer = null;
        }
    }

    private async activateMonitoring() {
        this.networkChangeMonitor.start();
        await this.startRokuFinder();
    }

    private deactivateMonitoring() {
        this.networkChangeMonitor.stop();
        this.stopRokuFinder();
    }

    private getPriorityForDeviceFormFactor(device: RokuDeviceDetails): number {
        if (device.deviceInfo['is-stick'] === 'true') {
            return 0;
        }
        if (device.deviceInfo['is-tv'] === 'true') {
            return 2;
        }
        return 1;
    }

    /**
     * On startup, load last seen devices from cache.
     * Devices are added as 'pending' - health checks happen lazily when UI requests devices.
     */
    private loadLastSeenDevices() {
        // Clear existing devices before loading cached ones for the current network
        this.devices = [];

        const lastSeenDeviceIds = this.globalStateManager.getLastSeenDeviceIds(this.networkId);
        for (const deviceId of lastSeenDeviceIds) {
            const cached = this.globalStateManager.getCachedDevice(deviceId);
            //ensure our cached object is actually an object
            if (cached && typeof cached === 'object' && !Array.isArray(cached)) {
                // Add cached device as pending (no network request)
                const device: RokuDeviceDetails = {
                    ...cached,
                    deviceState: 'pending'
                };
                this.devices.push(device);
            } else {
                // No cached info - remove stale entry
                this.globalStateManager.removeLastSeenDevice(this.networkId, deviceId);
            }
        }
        this.emitDevicesChanged();
    }

    /**
     * Set up event listeners for the RokuFinder.
     * This must be called regardless of passiveScanPermitted so that
     * active scan responses are processed.
     */
    private setupFinderEventListeners() {
        this.finder.removeAllListeners();
        this.finder.on('found', (ip: string, options?: { isAlive: boolean }) => {
            void this.processDiscoveredIp(ip, options?.isAlive ?? false);
        });

        this.finder.on('lost', (ip: string) => {
            // Find and remove device by IP
            const device = this.devices.find(d => d.ip === ip);
            if (device) {
                this.removeDevice(device.id);
            }
        });
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
     * Add or update a device in the devices array
     */
    private setDevice(device: RokuDeviceDetails): void {
        const index = this.devices.findIndex(d => d.id === device.id);
        const isNewDevice = index < 0;

        if (isNewDevice) {
            this.devices.push(device);
        } else {
            // Update existing - merge new info while preserving existing state if not provided
            this.devices[index] = { ...this.devices[index], ...device };
        }

        // Cache device info for future sessions (exclude transient deviceState)
        this.globalStateManager.setCachedDevice(device.id, {
            location: device.location,
            id: device.id,
            ip: device.ip,
            deviceInfo: device.deviceInfo,
            createdAt: Date.now()
        });

        // Reset scan settle timer when device response comes in
        if (this.isScanning) {
            this.resetSettleTimer();
        }

        if (isNewDevice) {
            this.globalStateManager.addLastSeenDevice(this.networkId, device.id);
        }
        this.emitDevicesChanged();
    }

    /**
     * Remove a device from the devices array
     */
    private removeDevice(deviceId: string): void {
        const device = this.devices.find(d => d.id === deviceId);
        if (device) {
            this.devices = this.devices.filter(d => d.id !== deviceId);
            this.globalStateManager.removeLastSeenDevice(this.networkId, device.id);

            // Clear lastUsedDevice if the removed device was the last used
            if (this.lastUsedDevice?.id === deviceId) {
                this.lastUsedDevice = undefined;
            }

            this.emitDevicesChanged();
        }
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
        clearTimeout(this.scanMinTimer);
        clearTimeout(this.scanSettleTimer);
    }
}

export type DeviceState = 'offline' | 'pending' | 'online';

export interface RokuDeviceDetails {
    location: string;
    id: string;
    ip: string;
    deviceState: DeviceState;
    deviceInfo: DeviceInfoRaw;
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
