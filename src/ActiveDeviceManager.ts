import * as backoff from 'backoff';
import { EventEmitter } from 'events';
import * as xmlParser from 'fast-xml-parser';
import * as http from 'http';
import * as NodeCache from 'node-cache';
import { Client as Client, SsdpHeaders } from 'node-ssdp';
import * as url from 'url';
import * as vscode from 'vscode';

const DEFAULT_TIMEOUT = 10000;

export class ActiveDeviceManager extends EventEmitter {

    constructor() {
        super();

        let config: any = vscode.workspace.getConfiguration('brightscript') || {};
        this.showDeviceDetectionMessages = (config.info || {}).showDeviceDetectionMessages;
        vscode.workspace.onDidChangeConfiguration((e) => {
            let config: any = vscode.workspace.getConfiguration('brightscript') || {};
            this.showDeviceDetectionMessages = (config.info || {}).showDeviceDetectionMessages;
        });

        this.deviceCache = new NodeCache({ stdTTL: 3600, checkperiod: 120 });
        this.activeDevices = [];
    }

    public activeDevices: any[] = [];
    public lastUsedDevice: string;
    private showDeviceDetectionMessages: boolean;
    private deviceCache: NodeCache;
    private exponentialBackoff: any;

    public findDevices() {
        this.exponentialBackoff = backoff.exponential({
            randomisationFactor: 0,
            initialDelay: 1000,
            maxDelay: 30000
        });

        this.exponentialBackoff.on('ready', (eventNumber, delay) => {
            this.discoverAll(delay).then((ip) => {
                ip = ip;
            });
            this.exponentialBackoff.backoff();
        });

        this.exponentialBackoff.backoff();
    }

    public stop() {
        if (this.exponentialBackoff) {
            this.exponentialBackoff.reset();
        }
    }

    /**
     * Discover all Roku devices on the network. This method always waits the full
     * timeout, resolving to a list of all Roku device addresses that responded
     * within `timeout` ms.
     * @param timeout The time to wait in ms before giving up.
     * @return A promise resolving to a list of Roku device addresses.
     */
    private discoverAll( timeout: number = DEFAULT_TIMEOUT ): Promise<string[]> {
        return new Promise((resolve, reject) => {
            const finder = new RokuFinder();
            const addresses: string[] = [];
            const startTime = Date.now();

            function elapsedTime() {
                return Date.now() - startTime;
            }

            finder.on('found', (address) => {
                if (addresses.indexOf(address) === -1) {
                    // debug(`found Roku device at ${address} after ${elapsedTime()}ms`);
                    this.accessDevice(address);
                    addresses.push(address);
                }
            });

            finder.on('timeout', () => {
                if (addresses.length > 0) {
                    // debug('found Roku devices at %o after %dms', addresses, elapsedTime());
                    resolve(addresses);
                } else {
                    reject(new Error(`Could not find any Roku devices after ${timeout / 1000} seconds`));
                }
            });

            finder.start(timeout);
        });
    }

    public getActiveDevices() {
        let keys = this.deviceCache.keys();
        let cache = this.deviceCache.mget(this.deviceCache.keys());
        return this.deviceCache.mget(this.deviceCache.keys());
    }

    private async accessDevice(address: any) {
        if (this.deviceCache.get(address.deviceInfo['device-id']) === undefined) {
            // New device found
            vscode.window.showInformationMessage(`Device found: ${address.deviceInfo['default-device-name']}`);
        }

        this.deviceCache.set(address.deviceInfo['device-id'], address);
    }
}

class RokuFinder extends EventEmitter {

    constructor() {
        super();

        this.client = new Client();

        this.client.on('response', (headers: SsdpHeaders) => {
            if (!this.running) {
                return;
            }
            let localHeaders = headers;
            const { ST, LOCATION } = headers;
            if (ST && LOCATION && ST.indexOf('roku') !== -1) {
                http.get(`${LOCATION}/query/device-info`, (resp) => {
                    let data = '';
                    let header = localHeaders;
                    let loc = header.LOCATION;

                    // A chunk of data has been received.
                    resp.on('data', (chunk) => {
                        data += chunk;
                    });

                    // The whole response has been received. Print out the result.
                    resp.on('end', () => {
                        let head = header;
                        let info = xmlParser.parse(data);
                        // console.log(data);
                        const address = this.parseAddress(LOCATION);
                        address.deviceInfo = info['device-info'];
                        // address.CacheControl = headers['CACHE-CONTROL'].substring(headers['CACHE-CONTROL'].lastIndexOf('=') + 1);
                        this.emit('found', address);
                    });
                });
            }
        });
    }

    private readonly client: Client;
    private intervalId: NodeJS.Timer | null = null;
    private timeoutId: NodeJS.Timer | null = null;
    private running: boolean = false;

    private parseAddress(location: string): any {
        const parts = url.parse(location);
        parts.path = undefined;
        parts.pathname = undefined;
        return { location: url.format(parts), ip: parts.hostname, deviceInfo: {} };
    }

    public start(timeout: number) {
        // debug('beginning search for roku devices');

        this.running = true;

        const search = () => {
            this.client.search('roku:ecp');
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
        clearInterval(this.intervalId!);
        clearTimeout(this.timeoutId!);
        this.running = false;
        this.client.stop();
    }
}
