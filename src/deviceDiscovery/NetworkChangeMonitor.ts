import * as os from 'os';
import * as md5 from 'md5';

/**
 * Generate a hash of current network interfaces for detecting network changes
 */
export function getNetworkHash(): string {
    const interfaces = os.networkInterfaces();
    const parts: string[] = [];

    for (const name of Object.keys(interfaces)) {
        for (const net of interfaces[name] ?? []) {
            if (!net.internal) {
                parts.push(`${net.address}-${net.netmask}`);
            }
        }
    }

    if (parts.length === 0) {
        return 'no-network';
    }

    return md5(parts.sort().join('|'));
}

/**
 * Monitor for network changes by polling IP addresses
 */
export class NetworkChangeMonitor {

    private onNetworkChanged: () => void;
    private timer: NodeJS.Timeout | null = null;
    private lastExecutionTime = 0;
    private interval = 3 * 60 * 1_000; // 3 minutes
    private previousNetworkHash = '';

    constructor(onNetworkChanged: () => void) {
        this.onNetworkChanged = onNetworkChanged;
        // Take initial snapshot
        this.previousNetworkHash = getNetworkHash();
    }

    public start(): void {
        const now = Date.now();
        if (now - this.lastExecutionTime > this.interval) {
            this.executeTask();
        } else {
            this.setTimer();
        }
    }

    public stop(): void {
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
    }

    private executeTask() {
        this.doWork();
        this.lastExecutionTime = Date.now();
        this.setTimer();
    }

    private setTimer() {
        this.stop(); // Ensure no existing timer is running
        this.timer = setTimeout(() => this.executeTask(), this.interval - (Date.now() - this.lastExecutionTime));
    }

    private doWork() {
        const currentNetworkHash = getNetworkHash();
        if (currentNetworkHash === this.previousNetworkHash) {
            return; // No change detected
        }
        this.onNetworkChanged();
        this.previousNetworkHash = currentNetworkHash;
    }
}
