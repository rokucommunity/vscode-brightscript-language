import * as os from 'os';
import { EventEmitter } from 'eventemitter3';
import * as NodeCache from 'node-cache';
import type { SsdpHeaders } from 'node-ssdp';
import { Client, Server } from 'node-ssdp';
import { URL } from 'url';
import { util } from './util';
import * as vscode from 'vscode';
import { firstBy } from 'thenby';
import type { Disposable } from 'vscode';
import { rokuDeploy } from 'roku-deploy';
import type { GlobalStateManager } from './GlobalStateManager';

const DEFAULT_TIMEOUT = 10000;

export class ActiveDeviceManager {

    constructor(globalStateManage: GlobalStateManager) {
        this.firstRequestForDevices = true;

        this.globalStateManager = globalStateManage;

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
                    void this.discoverAll();
                }
            }

        });

        vscode.window.onDidChangeWindowState((state) => {
            if (state.focused) {
                this.notifyFocusGained();
            } else {
                this.notifyFocusLost();
            }
        });

        this.deviceCache = new NodeCache({ stdTTL: 0, checkperiod: 0 });

        this.deviceCache.on('set', (deviceId, device) => {
            void this.emit('device-found', device);
            this.globalStateManager.addKnownDeviceIp((device as RokuDeviceDetails).ip);
        });

        //anytime a device leaves the cache (either expired or manually deleted)
        this.deviceCache.on('del', (deviceId, device) => {
            void this.emit('device-expired', device);
            this.globalStateManager.removeKnownDeviceIp((device as RokuDeviceDetails).ip);
        });

        this.systemSleepDetector = new SystemSleepDetector(() => {
            console.log('System sleep detected, refreshing device list');
            this.setNeedFutureBroadcast();
        });
        this.networkChangeDetector = new NetworkChangeDetector(() => {
            console.log('Network change detected, refreshing device list');
            this.setNeedFutureBroadcast();
        });

        if (this.enabled) {
            void this.activateMonitoring();
            void this.queryKnownDevices();
            const knownIps = this.globalStateManager.knownDeviceIps;
            if (knownIps.length === 0) {
                void this.discoverAll();
            } else {
                this.setNeedFutureBroadcast();
            }
        }
    }

    private emitter = new EventEmitter();
    private globalStateManager: GlobalStateManager;

    /**
     * Flag indicating that monitors have detected a condition requiring a broadcast
     * (e.g., network change, wake from sleep). Consumed by UI components when opened.
     */
    private _needFutureBroadcast = false;

    public get needsFutureBroadcast(): boolean {
        return this._needFutureBroadcast;
    }

    /**
     * Set the flag indicating a broadcast is needed. Emits 'need-future-broadcast' event
     * when the flag flips from false to true.
     */
    public setNeedFutureBroadcast(): void {
        if (!this._needFutureBroadcast) {
            this._needFutureBroadcast = true;
            this.emitter.emit('need-future-broadcast');
        }
    }

    /**
     * Clear the flag after a broadcast has been triggered
     */
    public clearNeedFutureBroadcast(): void {
        this._needFutureBroadcast = false;
    }

    private lastBroadcastDate: Date | null = null;
    get timeSinceLastBroadcast(): number {
        if (!this.lastBroadcastDate) {
            return 0;
        }
        return Date.now() - this.lastBroadcastDate.getTime();
    }

    private BROADCAST_COOLDOWN_MS = 30 * 60 * 1000; // 30 minutes

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

    private async emit(eventName: 'device-expired', device: RokuDeviceDetails);
    private async emit(eventName: 'device-found', device: RokuDeviceDetails);
    private async emit(eventName: string, data?: any) {
        //emit these events on next tick, otherwise they will be processed immediately which could cause issues
        await util.sleep(0);
        this.emitter?.emit(eventName, data);
    }

    public firstRequestForDevices: boolean;
    public lastUsedDevice: RokuDeviceDetails;
    public enabled: boolean;
    private showInfoMessages: boolean;
    private deviceCache: NodeCache;

    private async activateMonitoring() {
        if (!vscode.window.state.focused) {
            return;
        }
        this.systemSleepDetector.start();
        this.networkChangeDetector.start();

        await this.startPassiveListener();
    }

    private deactivateMonitoring() {
        this.systemSleepDetector.stop();
        this.networkChangeDetector.stop();

        this.stopPassiveListener();
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

    private getPriorityForDeviceFormFactor(device: RokuDeviceDetails): number {
        if (device.deviceInfo['is-stick']) {
            return 0;
        }
        if (device.deviceInfo['is-tv']) {
            return 2;
        }
        return 1;
    }

    // Returns the device cache statistics.
    public getCacheStats() {
        return this.deviceCache.getStats();
    }

    /**
     * Clear the list and re-scan the whole network for devices
     */
    public refresh() {
        void this.discoverAll();
    }

    /**
     * The number of milliseconds since a new device was discovered
     */
    public get timeSinceLastDiscoveredDevice() {
        if (!this.lastDiscoveredDeviceDate) {
            return 0;
        }
        return Date.now() - this.lastDiscoveredDeviceDate.getTime();
    }
    private lastDiscoveredDeviceDate: Date;


    private discoveryPromise: Promise<string[]> | null = null;
    // Discover all Roku devices on the network and watch for new ones that connect
    public async discoverAll(timeout: number = DEFAULT_TIMEOUT): Promise<string[]> {
        if (this.discoveryPromise !== null) {
            //already discovering
            return this.discoveryPromise;
        }
        this.lastBroadcastDate = new Date();

        this.discoveryPromise = new Promise((resolve, reject) => {
            const finder = new RokuFinder();
            const devices: string[] = [];

            finder.on('found', (device: RokuDeviceDetails) => {
                if (!devices.includes(device.id)) {
                    if (this.deviceCache.get(device.id) === undefined) {
                        this.lastDiscoveredDeviceDate = new Date();
                        if (this.showInfoMessages) {
                            // New device found
                            void vscode.window.showInformationMessage(`Device found: ${device.deviceInfo['default-device-name']}`);
                        }
                    }
                    this.deviceCache.set(device.id, device);
                    devices.push(device.id);
                }
            });

            finder.on('timeout', () => {
                if (devices.length === 0) {
                    // console.info(`Could not find any Roku devices after ${timeout / 1000} seconds`);
                }
                this.discoveryPromise = null;
                resolve(devices);
            });

            finder.start(timeout);
        });

        return this.discoveryPromise;
    }

    /**
     * On startup query any known devices from previous sessions
     */
    private async queryKnownDevices() {
        const knownIps = this.globalStateManager.knownDeviceIps;
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
                this.globalStateManager.removeKnownDeviceIp(ip);
            }
        }));
    }

    private passiveDiscovery: PassiveRokuDiscovery;

    /**
     * Start listening for passive SSDP announcements from Roku devices
     */
    private async startPassiveListener() {
        if (!this.passiveDiscovery) {
            this.passiveDiscovery = new PassiveRokuDiscovery();

            this.passiveDiscovery.on('found', (device: RokuDeviceDetails) => {
                if (this.deviceCache.get(device.id) === undefined) {
                    this.lastDiscoveredDeviceDate = new Date();
                    if (this.showInfoMessages) {
                        void vscode.window.showInformationMessage(`Device found: ${device.deviceInfo['default-device-name']}`);
                    }
                }
                this.deviceCache.set(device.id, device);
            });

            this.passiveDiscovery.on('lost', (ip: string) => {
                // Find and remove device by IP
                const devices = this.getActiveDevices();
                const device = devices.find(d => d.ip === ip);
                if (device) {
                    this.deviceCache.del(device.id);
                }
            });
        }

        await this.passiveDiscovery.start();
    }

    private stopPassiveListener() {
        if (this.passiveDiscovery) {
            this.passiveDiscovery.stop();
        }
    }

    private systemSleepDetector: SystemSleepDetector;
    private networkChangeDetector: NetworkChangeDetector;

    private notifyFocusGained() {
        this?.systemSleepDetector?.onFocusGain();
        this?.networkChangeDetector?.onFocusGain();

        this.passiveDiscovery?.onFocusGain();
    }

    private notifyFocusLost() {
        this?.systemSleepDetector?.onFocusLost();
        this?.networkChangeDetector?.onFocusLost();

        this.passiveDiscovery?.onFocusLost();
    }

}

class RokuFinder extends EventEmitter {

    constructor() {
        super();

        this.client = new Client({
            //Bind sockets to each discovered interface explicitly instead of relying on the system. Might help with issues with multiple NICs.
            explicitSocketBind: true
        });

        this.client.on('response', (headers: SsdpHeaders) => {
            void this.processSsdpResponse(headers);
        });
    }

    private async processSsdpResponse(headers: SsdpHeaders) {
        if (!this.running) {
            return;
        }

        const { ST, LOCATION } = headers;
        if (LOCATION && ST?.includes('roku')) {
            const url = new URL(LOCATION);
            const deviceInfo = await rokuDeploy.getDeviceInfo({
                host: url.hostname,
                remotePort: parseInt(url.port ?? '8060')
            });

            //sanitize the data
            for (const key in deviceInfo) {
                deviceInfo[key] = rokuDeploy.normalizeDeviceInfoFieldValue(deviceInfo[key]);
            }

            let config: any = vscode.workspace.getConfiguration('brightscript') || {};
            let includeNonDeveloperDevices = config?.deviceDiscovery?.includeNonDeveloperDevices === true;
            if (includeNonDeveloperDevices || deviceInfo['developer-enabled']) {
                const url = new URL(LOCATION);
                const device: RokuDeviceDetails = {
                    location: url.origin,
                    ip: url.hostname,
                    id: deviceInfo['device-id']?.toString?.(),
                    deviceInfo: deviceInfo as any
                };
                this.emit('found', device);
            }
        }
    }

    private readonly client: Client;
    private timeoutId: NodeJS.Timeout | null = null;
    private running = false;

    public start(timeout: number) {
        this.running = true;

        const search = () => {
            void this.client.search('roku:ecp');
        };

        const done = () => {
            this.stop();
            this.emit('timeout');
        };

        // UDP is unreliable, so we search multiple times
        search();
        setTimeout(search, 100);
        setTimeout(search, 200);
        this.timeoutId = setTimeout(done, timeout);
    }

    public stop() {
        clearTimeout(this.timeoutId);
        this.running = false;
        this.client.stop();
    }
}

/**
 * Passive SSDP listener that receives device announcements without actively searching.
 * Roku devices periodically broadcast NOTIFY messages to announce their presence.
 */
class PassiveRokuDiscovery extends EventEmitter {

    constructor() {
        super();

        this.server = new Server();

        this.server.on('advertise-alive', (headers: SsdpHeaders) => {
            void this.processSsdpNotify(headers);
        });
        this.server.on('advertise-bye', (headers: SsdpHeaders) => {
            void this.processSsdpNotify(headers);
        });
    }

    private readonly server: Server;
    private running = false;
    private focused = true;

    private queuedNotifications: any[] = [];

    /**
     * Process an SSDP notification (device announcing its presence)
     */
    private async processSsdpNotify(data: any) {
        if (!this.running) {
            return;
        }

        const nts = data.NTS;
        const nt = data.NT;
        const location = data.LOCATION;
        const usn = data.USN;

        // Check if this is a Roku device
        const isRoku = nt?.includes('roku') || usn?.includes('roku');
        if (!isRoku) {
            return;
        }

        // Handle device leaving (ssdp:byebye)
        if (nts === 'ssdp:byebye') {
            if (location) {
                try {
                    const url = new URL(location);
                    if (this.focused) {
                        this.emit('lost', url.hostname);
                    } else {
                        this.queuedNotifications = this.queuedNotifications.filter(n => n.hostname !== url.hostname);
                        this.queuedNotifications.push({
                            'Notification': 'lost',
                            'hostname': url.hostname
                        });
                    }
                } catch {
                    // Invalid URL, ignore
                }
            }
            return;
        }

        // Handle device announcing (ssdp:alive)
        if (nts === 'ssdp:alive' && location) {
            try {
                const url = new URL(location);
                const deviceInfo = await rokuDeploy.getDeviceInfo({
                    host: url.hostname,
                    remotePort: parseInt(url.port ?? '8060')
                });

                // Sanitize the data
                for (const key in deviceInfo) {
                    deviceInfo[key] = rokuDeploy.normalizeDeviceInfoFieldValue(deviceInfo[key]);
                }

                let config: any = vscode.workspace.getConfiguration('brightscript') || {};
                let includeNonDeveloperDevices = config?.deviceDiscovery?.includeNonDeveloperDevices === true;
                if (includeNonDeveloperDevices || deviceInfo['developer-enabled']) {
                    const device: RokuDeviceDetails = {
                        location: url.origin,
                        ip: url.hostname,
                        id: deviceInfo['device-id']?.toString?.(),
                        deviceInfo: deviceInfo as any
                    };
                    if (this.focused) {
                        this.emit('found', device);
                    } else {
                        this.queuedNotifications = this.queuedNotifications.filter(n => n.hostname !== url.hostname);
                        this.queuedNotifications.push({
                            'Notification': 'found',
                            'device': device,
                            'hostname': url.hostname
                        });
                    }
                }
            } catch (e) {
                // Could not reach device, ignore
            }
        }
    }

    /**
     * Start listening for SSDP advertisements
     */
    public async start() {
        if (!this.running) {
            this.running = true;
            await this.server.start();
        }
    }

    /**
     * Stop listening for SSDP advertisements
     */
    public stop() {
        if (this.running) {
            this.running = false;
            this.server.stop();
        }
    }

    public onFocusGain(): void {
        if (!this.focused && this.queuedNotifications.length > 0) {
            for (const notification of this.queuedNotifications) {
                if (notification.Notification === 'found') {
                    this.emit('found', notification.device);
                } else {
                    this.emit('lost', notification.hostname);
                }
            }
            this.queuedNotifications = [];
        }
        this.focused = true;
    }

    public onFocusLost(): void {
        this.focused = false;
    }
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

/**
 * Base class for monitors that need to be aware of focus changes
 */
abstract class FocusAwareMonitorBase {
    protected timer: NodeJS.Timeout | null = null;
    protected lastExecutionTime = 0;
    protected interval = 120000; // default to 2 minutes

    protected abstract doWork(): void;

    executeTask() {
        this.doWork();
        this.lastExecutionTime = Date.now();
        this.setTimer();
    }

    setTimer() {
        this.stop(); // Ensure no existing timer is running
        this.timer = setTimeout(() => this.executeTask(), this.interval);
    }

    start(): void {
        const now = Date.now();
        if (now - this.lastExecutionTime > this.interval) {
            this.executeTask();
        } else {
            this.setTimer();
        }
    }

    stop() {
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
    }

    onFocusGain(): void {
        this.start();
    }

    onFocusLost(): void {
        this.stop();
    }
}

/**
 * Monitor for system sleep/wake events
 */
class SystemSleepDetector extends FocusAwareMonitorBase {
    private gapThreshold = 120000; // 2 minutes
    private onSleepDetected: () => void;
    private count = 0;
    constructor(onSleepDetected: () => void) {
        super();
        this.interval = 60000; // Check every 1 minute
        this.onSleepDetected = onSleepDetected;
    }

    protected doWork() {
        console.log(`Checking for system sleep... ${++this.count}`);
        if (Date.now() - this.lastExecutionTime > this.gapThreshold && this.lastExecutionTime !== 0) {
            this.onSleepDetected();
        }
    }
}

/**
 * Monitor for network changes by checking IP addresses
 */
class NetworkChangeDetector extends FocusAwareMonitorBase {
    private previousIps = new Set<string>();
    private onNetworkChanged: () => void;

    constructor(onNetworkChanged: () => void) {
        super();
        this.onNetworkChanged = onNetworkChanged;
        // Take initial snapshot
        this.previousIps = this.getCurrentIps();
    }

    protected doWork() {
        const currentIps = this.getCurrentIps();

        // Check if IPs changed
        const added = [...currentIps].filter(ip => !this.previousIps.has(ip));
        const removed = [...this.previousIps].filter(ip => !currentIps.has(ip));

        if (added.length > 0 || removed.length > 0) {
            console.log('Network change detected');
            if (added.length > 0) {
                console.log(`  Added IPs: ${added.join(', ')}`);
            }
            if (removed.length > 0) {
                console.log(`  Removed IPs: ${removed.join(', ')}`);
            }
            this.onNetworkChanged();
        }

        this.previousIps = currentIps;
    }

    /**
     * Get current IPv4 addresses, excluding loopback and link-local
     */
    private getCurrentIps(): Set<string> {
        const ips = new Set<string>();
        const interfaces = os.networkInterfaces();

        for (const name of Object.keys(interfaces)) {
            for (const net of interfaces[name] ?? []) {
                // Skip non-IPv4, internal (loopback), and link-local addresses
                if (
                    net.family === 'IPv4' &&
                    !net.internal &&
                    !net.address.startsWith('169.254.') // link-local
                ) {
                    ips.add(net.address);
                }
            }
        }

        return ips;
    }
}
