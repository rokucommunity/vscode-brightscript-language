import { EventEmitter } from 'eventemitter3';
import * as NodeCache from 'node-cache';
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

export class ActiveDeviceManager {

    // #region Properties

    private emitter = new EventEmitter();
    private globalStateManager: GlobalStateManager;
    private networkId: string;
    private systemSleepMonitor: SystemSleepMonitor;
    private networkChangeMonitor: NetworkChangeMonitor;
    private deviceCache: NodeCache;
    private showInfoMessages: boolean;
    private lastBroadcastDate: Date | null = null;
    private lastDiscoveredDeviceDate: Date;
    private finder: RokuFinder = new RokuFinder();
    private lastHealthCheckTime = new Map<string, number>();
    private readonly HEALTH_CHECK_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

    private _needFutureBroadcast = false;

    public firstRequestForDevices: boolean;
    public lastUsedDevice: RokuDeviceDetails;
    public enabled: boolean;

    public get needsFutureBroadcast(): boolean {
        return this._needFutureBroadcast;
    }

    /**
     * Set the flag indicating a broadcast is needed. Emits 'need-future-broadcast' event
     * when the flag flips from false to true.
     */
    public set needsFutureBroadcast(value: boolean) {
        const wasChanged = value !== this._needFutureBroadcast;
        this._needFutureBroadcast = value;
        if (wasChanged && value === true) {
            this.emitter.emit('need-future-broadcast');
        }
    }

    public get timeSinceLastBroadcast(): number {
        if (!this.lastBroadcastDate) {
            return 0;
        }
        return Date.now() - this.lastBroadcastDate.getTime();
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

        this.setupConfiguration();
        this.setupWindowFocusHandling();
        this.setupDeviceCache();
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
                    void this.activateMonitoring();
                    void this.queryKnownDevices();
                } else {
                    this.deactivateMonitoring();
                }
            }

            //if the `concealDeviceInfo` setting was changed, refresh the list
            if (event.affectsConfiguration('brightscript.deviceDiscovery.concealDeviceInfo')) {
                if (this.enabled) {
                    void this.queryKnownDevices();
                    this.discoverAll();
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

    private setupDeviceCache() {
        this.networkId = getNetworkHash();
        this.deviceCache = new NodeCache({ stdTTL: 0, checkperiod: 0 });

        this.deviceCache.on('set', (deviceId, device) => {
            void this.emit('device-found', device);
            this.globalStateManager.addKnownDeviceIp(this.networkId, (device as RokuDeviceDetails).ip);
        });

        //anytime a device leaves the cache (either expired or manually deleted)
        this.deviceCache.on('del', (deviceId, device) => {
            void this.emit('device-expired', device);
            this.globalStateManager.removeKnownDeviceIp(this.networkId, (device as RokuDeviceDetails).ip);
        });
    }

    private setupMonitors() {
        this.systemSleepMonitor = new SystemSleepMonitor(() => {
            this.needsFutureBroadcast = true;
        });
        this.networkChangeMonitor = new NetworkChangeMonitor(() => {
            this.networkId = getNetworkHash();
            void this.queryKnownDevices();
            this.needsFutureBroadcast = true;
        });
    }

    private initializeIfEnabled() {
        if (this.enabled) {
            this.activateMonitoring().then(async () => {
                await this.queryKnownDevices();
                const knownIps = this.globalStateManager.getKnownDeviceIpsByNetwork(this.networkId);
                if (knownIps.length === 0) {
                    this.discoverAll();
                } else {
                    this.needsFutureBroadcast = true;
                }
            }).catch(() => { });
        }
    }

    // #endregion Constructor

    // #region Public Methods

    public on(eventName: 'device-expired', handler: (device: RokuDeviceDetails) => void, disposables?: Disposable[]): () => void;
    public on(eventName: 'device-found', handler: (device: RokuDeviceDetails) => void, disposables?: Disposable[]): () => void;
    public on(eventName: 'need-future-broadcast', handler: () => void, disposables?: Disposable[]): () => void;
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
     * Get a list of all devices discovered on the network
     */
    public getActiveDevices(): RokuDeviceDetails[] {
        this.firstRequestForDevices = false;
        const devices = Object.values(
            this.deviceCache.mget(this.deviceCache.keys()) as Record<string, RokuDeviceDetails>
        ).sort(
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
        return devices;
    }

    /**
     * Returns the device cache statistics.
     */
    public getCacheStats() {
        return this.deviceCache.getStats();
    }

    /**
     * Clear the list and re-scan the whole network for devices
     */
    public refresh() {
        this.deviceCache.flushAll();
        this.discoverAll();
    }

    /**
     * Discover all Roku devices on the network and watch for new ones that connect
     */
    public discoverAll() {
        this.needsFutureBroadcast = false;
        this.lastBroadcastDate = new Date();
        this.finder.scan();
    }

    public async checkDeviceHealth(device: RokuDeviceDetails): Promise<boolean> {
        if (await this.isDeviceResponding(device)) {
            return true;
        } else {
            this.deviceCache.del(device.id);
            this.healthCheckAllDevices().catch(() => { });
            this.discoverAll();
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

    private async emit(eventName: 'device-expired', device: RokuDeviceDetails);
    private async emit(eventName: 'device-found', device: RokuDeviceDetails);
    private async emit(eventName: string, data?: any) {
        //emit these events on next tick, otherwise they will be processed immediately which could cause issues
        await util.sleep(0);
        this.emitter?.emit(eventName, data);
    }

    private async activateMonitoring() {
        if (!vscode.window.state.focused) {
            return;
        }
        this.systemSleepMonitor.start();
        this.networkChangeMonitor.start();

        await this.startRokuFinder();
    }

    private deactivateMonitoring() {
        this.systemSleepMonitor.stop();
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
     * On startup query any known devices from previous sessions
     */
    private async queryKnownDevices() {
        const knownIps = this.globalStateManager.getKnownDeviceIpsByNetwork(this.networkId);
        await Promise.all(knownIps.map(async (ip) => {
            try {
                const deviceInfo = await rokuDeploy.getDeviceInfo({ host: ip });
                //sanitize the data
                for (const key in deviceInfo) {
                    deviceInfo[key] = rokuDeploy.normalizeDeviceInfoFieldValue(deviceInfo[key]);
                }

                const device: RokuDeviceDetails = {
                    location: `http://${ip}:8060`,
                    ip: ip,
                    id: deviceInfo['device-id']?.toString?.(),
                    deviceInfo: deviceInfo as any
                };
                this.deviceCache.set(device.id, device);
            } catch (e) {
                //Device isn't in the cache, remove it from known devices
                this.globalStateManager.removeKnownDeviceIp(this.networkId, ip);
            }
        }));
    }

    /**
     * Start listening for passive SSDP announcements from Roku devices
     */
    private async startRokuFinder() {
        this.finder.removeAllListeners();
        this.finder.on('found', (device: RokuDeviceDetails) => {
            if (this.deviceCache.get(device.id) === undefined) {
                this.lastDiscoveredDeviceDate = new Date();
                if (this.showInfoMessages) {
                    void vscode.window.showInformationMessage(`Device found: ${device.deviceInfo['default-device-name']}`);
                }
            }
            this.deviceCache.set(device.id, device);
        });

        this.finder.on('lost', (ip: string) => {
            // Find and remove device by IP
            const devices = this.getActiveDevices();
            const device = devices.find(d => d.ip === ip);
            if (device) {
                this.deviceCache.del(device.id);
            }
        });

        await this.finder.start();
    }

    private stopRokuFinder() {
        this.finder.stop();
        this.finder.removeAllListeners();
    }

    private notifyFocusGained() {
        this.networkChangeMonitor.onFocusGain();
        this.finder.onFocusGain();
    }

    private notifyFocusLost() {
        this.networkChangeMonitor.onFocusLost();
        this.finder.onFocusLost();
    }

    private async isDeviceResponding(device: RokuDeviceDetails): Promise<boolean> {
        try {
            await rokuDeploy.getDeviceInfo({
                host: device.ip,
                remotePort: parseInt(new URL(device.location).port ?? '8060')
            });
            return true;
        } catch (e) {
            return false;
        }
    }

    private async healthCheckAllDevices(): Promise<void> {
        const devices = this.getActiveDevices();
        let needsBroadcast = false;
        await Promise.all(devices.map(async (device) => {
            const isHealthy = await this.isDeviceResponding(device);
            if (!isHealthy) {
                this.deviceCache.del(device.id);
                needsBroadcast = true;
            }
        }));
        if (needsBroadcast) {
            this.discoverAll();
        }
    }

    // #endregion Private Methods
}

export interface RokuDeviceDetails {
    location: string;
    id: string;
    ip: string;
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
