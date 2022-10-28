import * as backoff from 'backoff';
import { EventEmitter } from 'events';
import * as xmlParser from 'fast-xml-parser';
import * as http from 'http';
import * as NodeCache from 'node-cache';
import type { SsdpHeaders } from 'node-ssdp';
import { Client } from 'node-ssdp';
import { URL } from 'url';
import { util } from './util';
import * as vscode from 'vscode';

const DEFAULT_TIMEOUT = 10000;

export class ActiveDeviceManager extends EventEmitter {

    constructor() {
        super();
        this.isRunning = false;
        this.firstRequestForDevices = true;

        let config: any = vscode.workspace.getConfiguration('brightscript') || {};
        this.enabled = config.deviceDiscovery?.enabled;
        this.showInfoMessages = config.deviceDiscovery?.showInfoMessages;
        vscode.workspace.onDidChangeConfiguration((event) => {
            let config: any = vscode.workspace.getConfiguration('brightscript') || {};
            this.enabled = config.deviceDiscovery?.enabled;
            this.showInfoMessages = config.deviceDiscovery?.showInfoMessages;

            //if the `scrambleDeviceInfo` setting was changed, refresh the list
            if (event.affectsConfiguration('brightscript.deviceDiscovery.scrambleDeviceInfo')) {
                //stop (which clears the list), and then the `processEnabledState` below will re-start it if enabled
                this.stop();
            }

            this.processEnabledState();
        });

        this.deviceCache = new NodeCache({ stdTTL: 3600, checkperiod: 120 });
        //anytime a device leaves the cache (either expired or manually deleted)
        this.deviceCache.on('del', (deviceId, device) => {
            this.emit('expiredDevice', deviceId, device);
        });
        this.processEnabledState();
    }

    public firstRequestForDevices: boolean;
    public lastUsedDevice: string;
    private enabled: boolean;
    private showInfoMessages: boolean;
    private deviceCache: NodeCache;
    private exponentialBackoff: any;
    private isRunning: boolean;

    // Returns an object will all the active devices by device id
    public getActiveDevices() {
        this.firstRequestForDevices = false;
        return this.deviceCache.mget(this.deviceCache.keys());
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

    // Discover all Roku devices on the network and watch for new ones that connect
    private discoverAll(timeout: number = DEFAULT_TIMEOUT): Promise<string[]> {
        return new Promise((resolve, reject) => {
            const finder = new RokuFinder();
            const devices: string[] = [];

            finder.on('found', (device: RokuDeviceDetails) => {
                if (!devices.includes(device.id)) {
                    if (this.showInfoMessages && this.deviceCache.get(device.id) === undefined) {
                        // New device found
                        void vscode.window.showInformationMessage(`Device found: ${device.deviceInfo['default-device-name']}`);
                    }
                    this.deviceCache.set(device.id, device);
                    devices.push(device.id);
                    this.emit('foundDevice', device.id, device);
                }
            });

            finder.on('timeout', () => {
                if (devices.length === 0) {
                    console.info(`Could not find any Roku devices after ${timeout / 1000} seconds`);
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
            if (!this.running) {
                return;
            }

            const { ST, LOCATION } = headers;
            if (ST && LOCATION && ST.includes('roku')) {
                http.get(`${LOCATION}/query/device-info`, {
                    headers: {
                        'User-Agent': 'https://github.com/RokuCommunity/vscode-brightscript-language'
                    }
                }, (resp) => {
                    // Get the device info
                    let data = '';

                    resp.on('data', (chunk) => {
                        // A chunk of data has been received.
                        data += chunk;
                    });

                    resp.on('end', () => {
                        // The whole response has been received.
                        let info = xmlParser.parse(data);
                        for (const key in info['device-info']) {
                            let value = info['device-info'][key];
                            if (typeof value === 'string') {
                                // Clean up the string results to make them more readable
                                info['device-info'][key] = util.decodeHtmlEntities(value);
                            }
                        }

                        let config: any = vscode.workspace.getConfiguration('brightscript') || {};
                        let includeNonDeveloperDevices = config?.deviceDiscovery?.includeNonDeveloperDevices === true;
                        if (includeNonDeveloperDevices || info['device-info']['developer-enabled']) {
                            const url = new URL(LOCATION);
                            const device: RokuDeviceDetails = {
                                location: url.origin,
                                ip: url.hostname,
                                id: info['device-info']['device-id'],
                                deviceInfo: info['device-info']
                            };
                            this.emit('found', device);
                        }
                    });
                });
            }
        });
    }

    private readonly client: Client;
    private intervalId: NodeJS.Timer | null = null;
    private timeoutId: NodeJS.Timer | null = null;
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
        // Anything nre they might add that we do not know about
        [key: string]: any;
    };
}
