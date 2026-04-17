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
    // Suppresses duplicate `found` emits within the debounce window; entries self-clean
    // when their timer fires, so there's no long-lived state for devices that go away.
    private aliveDebounceMap = new Map<string, ReturnType<typeof setTimeout>>();
    private readonly ALIVE_DEBOUNCE_MS = 500;

    // Burst detection: Roku devices send multiple ssdp:alive packets in quick succession
    // when they first come online; steady-state heartbeats are spaced minutes apart. We
    // infer "just came online" from the burst pattern rather than any single alive.
    // Entries self-clean when their timer fires after the window goes quiet.
    private aliveBurstMap = new Map<string, { timestamps: number[]; emitted: boolean; cleanupTimer: ReturnType<typeof setTimeout> }>();
    private readonly ALIVE_BURST_WINDOW_MS = 5_000;
    private readonly ALIVE_BURST_MIN_COUNT = 2;

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
     * Stop listening for SSDP advertisements.
     * Also ends any in-progress scan (emitting scan-ended).
     */
    public stop() {
        // End any in-progress scan first (emits scan-ended)
        if (this.isScanning) {
            this.endScan();
        }
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
                const serialNumber = this.extractSerialFromUsn(usn);

                // Always run the `found` path first, independent of burst detection — every
                // alive needs to feed discovery, even if the burst tracker decides not to fire
                // `device-online` or something downstream of it throws.
                if (!this.aliveDebounceMap.has(ip)) {
                    this.aliveDebounceMap.set(
                        ip,
                        setTimeout(() => this.aliveDebounceMap.delete(ip), this.ALIVE_DEBOUNCE_MS)
                    );
                    this.emit('found', ip, { serialNumber: serialNumber });

                    // Reset settle timer when device found during active scan
                    if (this.isScanning) {
                        this.resetSettleTimer();
                    }
                }

                // Then track every alive for burst detection (may emit `device-online`)
                this.detectDeviceOnlineBurst(ip, serialNumber, Date.now());
            } catch {
                // Invalid URL, ignore
            }
        }
    }

    /**
     * Detect a burst of ssdp:alive packets from the same IP, which implies the
     * device just came online (Rokus send several alives in quick succession on
     * boot/join; steady-state heartbeats are far apart and won't accumulate).
     * Emits 'device-online' once per burst, then clears the window so lingering
     * alives in the same burst don't trigger additional emits.
     */
    private detectDeviceOnlineBurst(ip: string, serialNumber: string | undefined, now: number): void {
        const existing = this.aliveBurstMap.get(ip);
        if (existing) {
            clearTimeout(existing.cleanupTimer);
        }
        const recent = existing
            ? existing.timestamps.filter(time => now - time <= this.ALIVE_BURST_WINDOW_MS)
            : [];

        // Re-arm once the burst window goes quiet, so a future burst can fire again.
        let emitted = existing?.emitted ?? false;
        if (emitted && recent.length === 0) {
            emitted = false;
        }

        recent.push(now);

        if (!emitted && recent.length >= this.ALIVE_BURST_MIN_COUNT) {
            emitted = true;
            this.emit('device-online', ip, serialNumber);
        }

        // Entry self-cleans once the burst window elapses with no new alives
        this.aliveBurstMap.set(ip, {
            timestamps: recent,
            emitted: emitted,
            cleanupTimer: setTimeout(() => this.aliveBurstMap.delete(ip), this.ALIVE_BURST_WINDOW_MS)
        });
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
        for (const timer of this.aliveDebounceMap.values()) {
            clearTimeout(timer);
        }
        this.aliveDebounceMap.clear();
        for (const tracker of this.aliveBurstMap.values()) {
            clearTimeout(tracker.cleanupTimer);
        }
        this.aliveBurstMap.clear();

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
