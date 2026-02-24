import { EventEmitter } from 'eventemitter3';
import { URL } from 'url';
import { util } from '../util';
import * as vscode from 'vscode';
import { firstBy } from 'thenby';
import type { Disposable } from 'vscode';
import { rokuDeploy } from 'roku-deploy';
import type { GlobalStateManager } from '../GlobalStateManager';
import { RokuFinder } from './RokuFinder';
import { NetworkChangeMonitor, getNetworkHash } from './NetworkChangeMonitor';
import { SystemSleepMonitor } from './SystemSleepMonitor';

export class DeviceManager {

    // #region Properties

    private emitter = new EventEmitter();
    private globalStateManager: GlobalStateManager;
    private networkId: string;
    private systemSleepMonitor: SystemSleepMonitor;
    private networkChangeMonitor: NetworkChangeMonitor;
    private devices: RokuDeviceDetails[] = [];
    private showInfoMessages: boolean;
    private lastScanDate: Date | null = null;
    private lastDiscoveredDeviceDate: Date;
    private finder: RokuFinder = new RokuFinder();
    private lastHealthCheckTime = new Map<string, number>();
    private healthCheckSequence = new Map<string, number>();
    private readonly HEALTH_CHECK_COOLDOWN_MS = 5 * 60 * 1_000; // 5 minutes
    public static readonly HEALTH_CHECK_TIMEOUT_MS = 5_000; // 5 seconds

    // Debounce for devices-changed event
    private devicesChangedDebounceTimer: ReturnType<typeof setTimeout> | null = null;
    private readonly DEVICES_CHANGED_DEBOUNCE_MS = 100;

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
    public lastUsedDevice: RokuDeviceDetails;
    public enabled: boolean;

    /**
     * Set the flag indicating a scan is needed. Emits 'scanNeeded-changed' event
     * when the flag flips from false to true.
     */
    public setScanNeeded() {
        if (!this.scanNeeded) {
            this.emitter.emit('scanNeeded-changed');
        }
        this.scanNeeded = true;
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
            return 0;
        }
        return Date.now() - this.lastDiscoveredDeviceDate.getTime();
    }

    // #endregion Properties

    // #region Constructor

    constructor(globalStateManager: GlobalStateManager) {
        this.globalStateManager = globalStateManager;
        this.firstRequestForDevices = true;
        this.networkId = getNetworkHash();

        this.setupConfiguration();
        this.setupWindowFocusHandling();
        this.setupMonitors();
        this.initializeIfEnabled();
    }

    private setupConfiguration() {
        let config: any = vscode.workspace.getConfiguration('brightscript') || {};
        this.enabled = config.deviceDiscovery?.enabled;
        this.showInfoMessages = config.deviceDiscovery?.showInfoMessages;

        vscode.workspace.onDidChangeConfiguration((event) => {
            let config: any = vscode.workspace.getConfiguration('brightscript') || {};
            this.enabled = config.deviceDiscovery?.enabled;
            this.showInfoMessages = config.deviceDiscovery?.showInfoMessages;

            //if the `deviceDiscovery.enabled` setting was changed, start or stop monitoring
            if (event.affectsConfiguration('brightscript.deviceDiscovery.enabled')) {
                if (this.enabled) {
                    this.systemSleepMonitor.start();
                    void this.activateMonitoring();
                    this.loadLastSeenDevices();
                } else {
                    this.systemSleepMonitor.stop();
                    this.deactivateMonitoring();
                }
            }

            //if the `concealDeviceInfo` setting was changed, refresh the list
            if (event.affectsConfiguration('brightscript.deviceDiscovery.concealDeviceInfo')) {
                if (this.enabled) {
                    this.loadLastSeenDevices();
                    this.refresh();
                }
            }
        });
    }

    private setupWindowFocusHandling() {
        vscode.window.onDidChangeWindowState((state) => {
            if (state.focused) {
                this.notifyFocusGained();
            } else {
                this.notifyFocusLost();
            }
        });
    }

    private setupMonitors() {
        this.systemSleepMonitor = new SystemSleepMonitor(() => {
            this.setScanNeeded();
        });
        this.networkChangeMonitor = new NetworkChangeMonitor(() => {
            this.networkId = getNetworkHash();
            this.loadLastSeenDevices();
            this.setScanNeeded();
        });
    }

    private initializeIfEnabled() {
        if (this.enabled) {
            // Sleep monitor runs all the time when enabled (ignores focus state)
            this.systemSleepMonitor.start();

            this.activateMonitoring().then(() => {
                this.loadLastSeenDevices();
                const lastSeenDeviceIds = this.globalStateManager.getLastSeenDeviceIds(this.networkId);
                if (lastSeenDeviceIds.length === 0) {
                    this.refresh();
                } else {
                    this.setScanNeeded();
                }
            }).catch(() => { });
        }
    }

    // #endregion Constructor

    // #region Public Methods

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
     * Get a list of all devices discovered on the network.
     * Triggers health checks for any pending devices (lazy loading).
     */
    public getActiveDevices(): RokuDeviceDetails[] {
        this.firstRequestForDevices = false;
        this.healthCheckPendingDevices();
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
        this.healthCheckAllDevices().catch(() => { });
        return this.discoverAll(force);
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

    public async checkDeviceHealth(device: RokuDeviceDetails): Promise<boolean> {
        // Increment and capture sequence number to handle concurrent health checks
        const currentSeq = (this.healthCheckSequence.get(device.id) ?? 0) + 1;
        this.healthCheckSequence.set(device.id, currentSeq);

        // Set to pending during health check (note: could cause UI flickering if checks are frequent)
        this.updateDeviceState(device.id, 'pending');

        const isHealthy = await this.isDeviceResponding(device);

        // Only apply result if this is still the latest request for this device
        if (this.healthCheckSequence.get(device.id) !== currentSeq) {
            // Stale response - a newer check was started, ignore this result
            return isHealthy;
        }

        if (isHealthy) {
            this.updateDeviceState(device.id, 'online');
            return true;
        } else {
            this.removeDevice(device.id);
            this.refresh(true);
            return false;
        }
    }

    public async checkDeviceHealthIfStale(device: RokuDeviceDetails): Promise<boolean> {
        const lastCheck = this.lastHealthCheckTime.get(device.id) ?? 0;
        const now = Date.now();
        if (now - lastCheck > this.HEALTH_CHECK_COOLDOWN_MS) {
            this.lastHealthCheckTime.set(device.id, now);
            return this.checkDeviceHealth(device);
        }
        return true;
    }

    // #endregion Public Methods

    // #region Private Methods

    /**
     * Emit devices-changed event with debouncing to avoid rapid-fire updates
     */
    private emitDevicesChanged(): void {
        if (this.devicesChangedDebounceTimer) {
            clearTimeout(this.devicesChangedDebounceTimer);
        }
        this.devicesChangedDebounceTimer = setTimeout(() => {
            this.devicesChangedDebounceTimer = null;
            this.emitter.emit('devices-changed');
        }, this.DEVICES_CHANGED_DEBOUNCE_MS);
    }

    /**
     * Trigger health checks for devices in 'pending' state.
     * Runs asynchronously - doesn't block the caller.
     */
    private healthCheckPendingDevices(): void {
        const pendingDevices = this.devices.filter(d => d.deviceState === 'pending');
        for (const device of pendingDevices) {
            // Fire and forget - health check updates state and emits events when done
            this.checkDeviceHealthIfStale(device).catch(() => { });
        }
    }

    /**
     * Update a device's state and emit change event
     */
    private updateDeviceState(deviceId: string, state: DeviceState): void {
        const device = this.devices.find(d => d.id === deviceId);
        if (device && device.deviceState !== state) {
            device.deviceState = state;
            this.emitDevicesChanged();
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
        if (!vscode.window.state.focused) {
            return;
        }
        this.networkChangeMonitor.start();

        await this.startRokuFinder();
    }

    private deactivateMonitoring() {
        this.networkChangeMonitor.stop();
        this.stopRokuFinder();
    }

    private getPriorityForDeviceFormFactor(device: RokuDeviceDetails): number {
        if (device.deviceInfo['is-stick']) {
            return 0;
        }
        if (device.deviceInfo['is-tv']) {
            return 2;
        }
        return 1;
    }

    /**
     * On startup, load last seen devices from cache.
     * Devices are added as 'pending' - health checks happen lazily when UI requests devices.
     */
    private loadLastSeenDevices() {
        const lastSeenDeviceIds = this.globalStateManager.getLastSeenDeviceIds(this.networkId);
        for (const deviceId of lastSeenDeviceIds) {
            const cached = this.globalStateManager.getCachedDevice(deviceId);
            if (cached) {
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
     * Start listening for passive SSDP announcements from Roku devices
     */
    private async startRokuFinder() {
        this.finder.removeAllListeners();
        this.finder.on('found', (device: RokuDeviceDetails, options?: { isAlive: boolean }) => {
            const isNewDevice = !this.devices.find(d => d.id === device.id);
            if (isNewDevice) {
                this.lastDiscoveredDeviceDate = new Date();
                // Only show popup for ssdp:alive broadcasts, not scan responses
                if (options?.isAlive && this.showInfoMessages) {
                    void vscode.window.showInformationMessage(`Device found: ${device.deviceInfo['default-device-name']}`);
                }
            }
            this.upsertDevice(device);
        });

        this.finder.on('lost', (ip: string) => {
            // Find and remove device by IP
            const device = this.devices.find(d => d.ip === ip);
            if (device) {
                this.removeDevice(device.id);
            }
        });

        await this.finder.start();
    }

    private stopRokuFinder() {
        this.finder.stop();
        this.finder.removeAllListeners();
    }

    private notifyFocusGained() {
        this.networkChangeMonitor.start();
        this.finder.onFocusGain();
    }

    private notifyFocusLost() {
        this.networkChangeMonitor.stop();
        this.finder.onFocusLost();
    }

    /**
     * Add or update a device in the devices array
     */
    private upsertDevice(device: RokuDeviceDetails): void {
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
            deviceInfo: device.deviceInfo
        });

        // Reset scan settle timer when device response comes in
        if (this.isScanning) {
            this.resetSettleTimer();
        }

        if (vscode.window.state.focused) {
            if (isNewDevice) {
                this.globalStateManager.addLastSeenDevice(this.networkId, device.id);
            }
            this.emitDevicesChanged();
        }
    }

    /**
     * Remove a device from the devices array
     */
    private removeDevice(deviceId: string): void {
        const device = this.devices.find(d => d.id === deviceId);
        if (device) {
            this.devices = this.devices.filter(d => d.id !== deviceId);
            this.globalStateManager.removeCachedDevice(deviceId);
            this.globalStateManager.removeLastSeenDevice(this.networkId, device.id);
            if (vscode.window.state.focused) {
                this.emitDevicesChanged();
            }
        }
    }

    private async isDeviceResponding(device: RokuDeviceDetails): Promise<boolean> {
        try {
            await rokuDeploy.getDeviceInfo({
                host: device.ip,
                remotePort: parseInt(new URL(device.location).port ?? '8060'),
                timeout: DeviceManager.HEALTH_CHECK_TIMEOUT_MS
            });
            return true;
        } catch (e) {
            return false;
        }
    }

    private async healthCheckAllDevices(): Promise<void> {
        const devices = this.getActiveDevices();
        let needsScan = false;
        await Promise.all(devices.map(async (device) => {
            const isHealthy = await this.checkDeviceHealth(device);
            if (!isHealthy) {
                this.removeDevice(device.id);
                needsScan = true;
            }
        }));
        if (needsScan) {
            this.discoverAll(true);
        }
    }

    // #endregion Private Methods
}

export type DeviceState = 'offline' | 'pending' | 'online';

export interface RokuDeviceDetails {
    location: string;
    id: string;
    ip: string;
    deviceState: DeviceState;
    deviceInfo: {
        'udn'?: string;
        'serial-number'?: string;
        'device-id'?: string;
        'advertising-id'?: string;
        'vendor-name'?: string;
        'model-name'?: string;
        'model-number'?: string;
        'model-region'?: string;
        'is-tv'?: boolean;
        'is-stick'?: boolean;
        'ui-resolution'?: string;
        'supports-ethernet'?: boolean;
        'wifi-mac'?: string;
        'wifi-driver'?: string;
        'has-wifi-extender'?: boolean;
        'has-wifi-5G-support'?: boolean;
        'can-use-wifi-extender'?: boolean;
        'ethernet-mac'?: string;
        'network-type'?: string;
        'network-name'?: string;
        'friendly-device-name'?: string;
        'friendly-model-name'?: string;
        'default-device-name'?: string;
        'user-device-name'?: string;
        'user-device-location'?: string;
        'build-number'?: string;
        'software-version'?: string;
        'software-build'?: number;
        'secure-device'?: boolean;
        'language'?: string;
        'country'?: string;
        'locale'?: string;
        'time-zone-auto'?: boolean;
        'time-zone'?: string;
        'time-zone-name'?: string;
        'time-zone-tz'?: string;
        'time-zone-offset'?: number;
        'clock-format'?: string;
        'uptime'?: number;
        'power-mode'?: string;
        'supports-suspend'?: boolean;
        'supports-find-remote'?: boolean;
        'find-remote-is-possible'?: boolean;
        'supports-audio-guide'?: boolean;
        'supports-rva'?: boolean;
        'developer-enabled'?: boolean;
        'keyed-developer-id'?: string;
        'search-enabled'?: boolean;
        'search-channels-enabled'?: boolean;
        'voice-search-enabled'?: boolean;
        'notifications-enabled'?: boolean;
        'notifications-first-use'?: boolean;
        'supports-private-listening'?: boolean;
        'headphones-connected'?: boolean;
        'supports-audio-settings'?: boolean;
        'supports-ecs-textedit'?: boolean;
        'supports-ecs-microphone'?: boolean;
        'supports-wake-on-wlan'?: boolean;
        'supports-airplay'?: boolean;
        'has-play-on-roku'?: boolean;
        'has-mobile-screensaver'?: boolean;
        'support-url'?: string;
        'grandcentral-version'?: string;
        'trc-version'?: number;
        'trc-channel-version'?: string;
        'davinci-version'?: string;
        'av-sync-calibration-enabled'?: number;
        // Anything they might add that we do not know about
        [key: string]: any;
    };
}
