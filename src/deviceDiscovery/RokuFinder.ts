import { EventEmitter } from 'eventemitter3';
import type { SsdpHeaders } from 'node-ssdp';
import { Client, Server } from 'node-ssdp';
import * as vscode from 'vscode';
import { rokuDeploy } from 'roku-deploy';
import type { RokuDeviceDetails } from './DeviceManager';

export class RokuFinder extends EventEmitter {

    private readonly client: Client;
    private readonly server: Server;
    private running = false;
    private focused = true;
    private queuedNotifications: QueuedNotification[] = [];

    constructor() {
        super();

        this.client = new Client({
            //Bind sockets to each discovered interface explicitly instead of relying on the system. Might help with issues with multiple NICs.
            explicitSocketBind: true
        });

        this.client.on('response', (headers: SsdpHeaders) => {
            void this.processSsdpResponse(headers);
        });

        this.server = new Server();

        this.server.on('advertise-alive', (headers: SsdpHeaders) => {
            void this.processSsdpNotify(headers);
        });
        this.server.on('advertise-bye', (headers: SsdpHeaders) => {
            void this.processSsdpNotify(headers);
        });
    }

    public scan() {
        const search = () => {
            void this.client.search('roku:ecp');
        };

        // UDP is unreliable, so we search multiple times
        search();
        setTimeout(search, 100);
        setTimeout(search, 200);
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
                if (notification.type === 'found') {
                    this.emit('found', notification.device, notification.options);
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

    private async processSsdpResponse(headers: SsdpHeaders) {
        if (!this.running) {
            return;
        }

        const { ST, LOCATION } = headers;
        if (LOCATION && ST?.includes('roku')) {
            const device = await this.fetchDeviceDetails(LOCATION);
            if (device) {
                this.emit('found', device, { isAlive: false });
            }
        }
    }

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
                    this.emitOrQueue('lost', url.hostname);
                } catch {
                    // Invalid URL, ignore
                }
            }
            return;
        }

        // Handle device announcing (ssdp:alive)
        if (nts === 'ssdp:alive' && location) {
            const device = await this.fetchDeviceDetails(location);
            if (device) {
                this.emitOrQueue('found', device.ip, device, { isAlive: true });
            }
        }
    }

    /**
     * Fetch device info from a Roku device and build RokuDeviceDetails
     */
    private async fetchDeviceDetails(location: string): Promise<RokuDeviceDetails | null> {
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
                return {
                    location: url.origin,
                    ip: url.hostname,
                    id: deviceInfo['device-id']?.toString?.(),
                    deviceState: 'online',
                    deviceInfo: deviceInfo as any
                };
            }
            return null;
        } catch {
            // Could not reach device
            return null;
        }
    }

    /**
     * Emit an event immediately if focused, otherwise queue it for later
     */
    private emitOrQueue(type: 'found', hostname: string, device: RokuDeviceDetails, options: FoundEventOptions): void;
    private emitOrQueue(type: 'lost', hostname: string): void;
    private emitOrQueue(type: 'found' | 'lost', hostname: string, device?: RokuDeviceDetails, options?: FoundEventOptions): void {
        // Remove any existing notification for this hostname
        this.queuedNotifications = this.queuedNotifications.filter(n => n.hostname !== hostname);

        if (this.focused) {
            if (type === 'found') {
                this.emit('found', device, options);
            } else {
                this.emit('lost', hostname);
            }
        } else {
            this.queuedNotifications.push({ type: type, hostname: hostname, device: device, options: options });
        }
    }
}

export interface FoundEventOptions {
    isAlive: boolean;
}

interface QueuedNotification {
    type: 'found' | 'lost';
    hostname: string;
    device?: RokuDeviceDetails;
    options?: FoundEventOptions;
}
