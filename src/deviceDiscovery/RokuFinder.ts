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
    private aliveDebounceMap = new Map<string, number>();
    private readonly ALIVE_DEBOUNCE_MS = 500;
    private lastCleanupTime = 0;
    private readonly CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

    private readonly SCAN_MIN_DURATION_MS = 3_000;
    private readonly SCAN_SETTLE_MS = 1_500;
    private scanMinTimer: ReturnType<typeof setTimeout> | null = null;
    private scanSettleTimer: ReturnType<typeof setTimeout> | null = null;
    private isScanning = false;
    private scanMinTimeElapsed = false;

    /**
     * Start a scan for devices. Emits scan-started, then scan-ended when complete.
     * Scan ends when both: minimum duration (3s) has passed AND 1.5s since last device response.
     */
    public scan() {
        if (this.isScanning) {
            return; // Already scanning
        }

        this.isScanning = true;
        this.scanMinTimeElapsed = false;
        this.emit('scan-started');

        // Start minimum duration timer
        this.scanMinTimer = setTimeout(() => {
            this.scanMinTimeElapsed = true;
            this.checkScanComplete();
        }, this.SCAN_MIN_DURATION_MS);

        // Start initial settle timer
        this.resetSettleTimer();

        // Trigger the actual SSDP searches
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
        this.emit('scan-ended');
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
        const { ST, LOCATION, USN } = headers;
        if (LOCATION && ST?.includes('roku')) {
            try {
                const url = new URL(LOCATION);
                const serialNumber = this.extractSerialFromUsn(USN);
                this.emit('found', url.hostname, { serialNumber: serialNumber });

                // Reset settle timer when device found during active scan
                if (this.isScanning) {
                    this.resetSettleTimer();
                }
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
                const ip = url.hostname;
                const now = Date.now();

                // Periodic cleanup of stale entries
                if (now - this.lastCleanupTime > this.CLEANUP_INTERVAL_MS) {
                    this.lastCleanupTime = now;
                    for (const [cachedIp, timestamp] of this.aliveDebounceMap) {
                        if (now - timestamp > this.CLEANUP_INTERVAL_MS) {
                            this.aliveDebounceMap.delete(cachedIp);
                        }
                    }
                }

                const lastEmit = this.aliveDebounceMap.get(ip);
                if (lastEmit === undefined || now - lastEmit >= this.ALIVE_DEBOUNCE_MS) {
                    this.aliveDebounceMap.set(ip, now);
                    const serialNumber = this.extractSerialFromUsn(usn);
                    this.emit('found', ip, { serialNumber: serialNumber });
                    this.emit('device-online', ip, serialNumber);

                    // Reset settle timer when device found during active scan
                    if (this.isScanning) {
                        this.resetSettleTimer();
                    }
                }
            } catch {
                // Invalid URL, ignore
            }
        }
    }

    /**
     * Extract serial number from USN header.
     * USN format: "uuid:roku:ecp:SERIALNUMBER"
     */
    private extractSerialFromUsn(usn: string | undefined): string | undefined {
        if (!usn) {
            return undefined;
        }
        // USN format is typically "uuid:roku:ecp:SERIALNUMBER"
        // Extract the last segment after the final colon
        const parts = usn.split(':');
        const serial = parts.pop();
        // Validate it looks like a serial (not empty, not another uuid segment)
        if (serial && serial.length > 0 && !serial.includes('-')) {
            return serial;
        }
        return undefined;
    }

    public dispose() {
        this.stop();

        // Clear all timers
        for (const timer of this.scanTimers) {
            clearTimeout(timer);
        }
        this.scanTimers = [];
        this.clearScanTimers();
        this.aliveDebounceMap.clear();

        this.client.removeAllListeners();
        this.client.stop();
        delete this.client;

        this.server.removeAllListeners();
        this.server.stop();
        delete this.server;
    }
}

export interface FoundEventOptions {
    serialNumber?: string;
}
