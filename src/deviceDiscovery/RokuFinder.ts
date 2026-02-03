import { EventEmitter } from 'eventemitter3';
import type { SsdpHeaders } from 'node-ssdp';
import { Client, Server } from 'node-ssdp';
import * as vscode from 'vscode';
import { rokuDeploy } from 'roku-deploy';
import type { RokuDeviceDetails } from './ActiveDeviceManager';

export class RokuFinder extends EventEmitter {

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

    private readonly client: Client;
    private readonly server: Server;
    private running = false;
    private focused = true;
    private queuedNotifications: any[] = [];

    public scan() {
        const search = () => {
            void this.client.search('roku:ecp');
        };

        // UDP is unreliable, so we search multiple times
        search();
        setTimeout(search, 100);
        setTimeout(search, 200);
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
