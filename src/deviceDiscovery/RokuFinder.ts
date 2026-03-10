import { EventEmitter } from 'eventemitter3';
import type { SsdpHeaders } from 'node-ssdp';
import { Client, Server } from 'node-ssdp';

export class RokuFinder extends EventEmitter {
    constructor() {
        super();

        this.client = new Client({
            //Bind sockets to each discovered interface explicitly instead of relying on the system. Might help with issues with multiple NICs.
            explicitSocketBind: true
        });

        this.client.on('response', (headers: SsdpHeaders) => {
            this.processSsdpResponse(headers);
        });

        this.server = new Server();

        this.server.on('advertise-alive', (headers: SsdpHeaders) => {
            this.processSsdpNotify(headers);
        });
        this.server.on('advertise-bye', (headers: SsdpHeaders) => {
            this.processSsdpNotify(headers);
        });
    }

    private client: Client;
    private server: Server;
    private running = false;
    private scanTimers: ReturnType<typeof setTimeout>[] = [];

    public scan() {
        if (this.client) {
            const search = () => {
                if (!this.client) {
                    return;
                }
                Promise.resolve(
                    this.client.search('roku:ecp')
                ).catch((error) => {
                    console.error(error);
                });
            };

            // UDP is unreliable, so we search multiple times
            search();
            this.scanTimers.push(setTimeout(search, 100));
            this.scanTimers.push(setTimeout(search, 200));
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

    private processSsdpResponse(headers: SsdpHeaders) {
        const { ST, LOCATION } = headers;
        if (LOCATION && ST?.includes('roku')) {
            try {
                const url = new URL(LOCATION);
                this.emit('found', url.hostname, { isAlive: false });
            } catch {
                // Invalid URL, ignore
            }
        }
    }

    /**
     * Process an SSDP notification (device announcing its presence)
     */
    private processSsdpNotify(data: any) {
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
                    this.emit('lost', url.hostname);
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
                this.emit('found', url.hostname, { isAlive: true });
            } catch {
                // Invalid URL, ignore
            }
        }
    }

    public dispose() {
        this.stop();

        for (const timer of this.scanTimers) {
            clearTimeout(timer);
        }
        this.scanTimers = [];

        this.client.removeAllListeners();
        this.client.stop();
        delete this.client;

        this.server.removeAllListeners();
        this.server.stop();
        delete this.server;
    }
}

export interface FoundEventOptions {
    isAlive: boolean;
}
