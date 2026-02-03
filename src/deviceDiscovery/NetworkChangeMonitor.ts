import * as os from 'os';
import * as md5 from 'md5';

/**
 * Monitor for network changes by checking IP addresses
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

export class NetworkChangeMonitor {
    private previousIps = new Set<string>();
    private onNetworkChanged: () => void;

    private timer: NodeJS.Timeout | null = null;
    private lastExecutionTime = 0;
    private interval = 8000; // default to 2 minutes

    constructor(onNetworkChanged: () => void) {
        this.onNetworkChanged = onNetworkChanged;
        // Take initial snapshot
        this.previousIps = this.getCurrentIps();
    }

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
