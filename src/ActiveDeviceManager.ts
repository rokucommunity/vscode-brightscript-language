import * as backoff from 'backoff';
import { EventEmitter } from 'eventemitter3';
import * as NodeCache from 'node-cache';
import type { SsdpHeaders } from 'node-ssdp';
import { Client } from 'node-ssdp';
import { URL } from 'url';
import { util } from './util';
import * as vscode from 'vscode';
import { firstBy } from 'thenby';
import type { Disposable } from 'vscode';
import { rokuDeploy } from 'roku-deploy';

const DEFAULT_TIMEOUT = 10000;

export class ActiveDeviceManager {

    constructor() {
        this.isRunning = false;
        this.firstRequestForDevices = true;

        let config: any = vscode.workspace.getConfiguration('brightscript') || {};
        this.enabled = config.deviceDiscovery?.enabled;
        this.showInfoMessages = config.deviceDiscovery?.showInfoMessages;
        vscode.workspace.onDidChangeConfiguration((event) => {
            let config: any = vscode.workspace.getConfiguration('brightscript') || {};
            this.enabled = config.deviceDiscovery?.enabled;
            this.showInfoMessages = config.deviceDiscovery?.showInfoMessages;

            //if the `concealDeviceInfo` setting was changed, refresh the list
            if (event.affectsConfiguration('brightscript.deviceDiscovery.concealDeviceInfo')) {
                //stop (which clears the list), and then the `processEnabledState` below will re-start it if enabled
                this.stop();
            }

            this.processEnabledState();
        });

        this.deviceCache = new NodeCache({ stdTTL: 3600, checkperiod: 120 });
        //anytime a device leaves the cache (either expired or manually deleted)
        this.deviceCache.on('del', (deviceId, device) => {
            void this.emit('device-expired', device);
        });
        this.processEnabledState();
    }

    private emitter = new EventEmitter();

    public on(eventName: 'device-expired', handler: (device: RokuDeviceDetails) => void, disposables?: Disposable[]): () => void;
    public on(eventName: 'device-found', handler: (device: RokuDeviceDetails) => void, disposables?: Disposable[]): () => void;
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
    private exponentialBackoff: any;
    private isRunning: boolean;

    /**
     * Get a list of all devices discovered on the network
     */
    public getActiveDevices(): RokuDeviceDetails[] {
        this.firstRequestForDevices = false;
        const devices = Object.values(
            this.deviceCache.mget(this.deviceCache.keys()) as Record<string, RokuDeviceDetails>
        ).sort(firstBy((a: RokuDeviceDetails, b: RokuDeviceDetails) => {
            return this.getPriorityForDeviceFormFactor(a) - this.getPriorityForDeviceFormFactor(b);
        }).thenBy((a: RokuDeviceDetails, b: RokuDeviceDetails) => {
            if (a.id < b.id) {
                return -1;
            }
            if (a.id > b.id) {
                return 1;
            }
            // ids must be equal
            return 0;
        }));
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
        this.stop();
        this.start();
    }

    // Will ether stop or start the watching process based on the running state and user settings
    private processEnabledState() {
        if (this.enabled && !this.isRunning) {
            this.start();
        } else if (!this.enabled && this.isRunning) {
            this.stop();
        }
    }

    private stop() {
        if (this.exponentialBackoff) {
            this.exponentialBackoff.reset();
        }

        this.deviceCache.del(
            this.deviceCache.keys()
        );
        this.deviceCache.flushAll();
        this.isRunning = false;
    }

    /**
     * Begin searching and watching for devices
     */
    private start() {
        if (!this.isRunning) {
            this.exponentialBackoff = backoff.exponential({
                randomisationFactor: 0,
                initialDelay: 2000,
                maxDelay: 60000
            });

            void this.discoverAll(1000);

            this.exponentialBackoff.on('ready', (eventNumber, delay) => {
                void this.discoverAll(delay);
                this.exponentialBackoff.backoff();
            });

            this.exponentialBackoff.backoff();
            this.isRunning = true;
        }
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


    // Discover all Roku devices on the network and watch for new ones that connect
    private discoverAll(timeout: number = DEFAULT_TIMEOUT): Promise<string[]> {
        return new Promise((resolve, reject) => {
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
                    this.emit('device-found', device);
                }
            });

            finder.on('timeout', () => {
                if (devices.length === 0) {
                    // console.info(`Could not find any Roku devices after ${timeout / 1000} seconds`);
                }
                resolve(devices);
            });

            finder.start(timeout);
        });
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
    private intervalId: NodeJS.Timeout | null = null;
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

        search();
        this.intervalId = setInterval(search, 1000);
        this.timeoutId = setTimeout(done, timeout);
    }

    public stop() {
        clearInterval(this.intervalId);
        clearTimeout(this.timeoutId);
        this.running = false;
        this.client.stop();
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
