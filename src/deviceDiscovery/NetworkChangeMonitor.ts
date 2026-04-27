import * as os from 'os';
import * as md5 from 'md5';
import { SystemSleepMonitor } from './SystemSleepMonitor';

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
 * Monitor for network changes by polling IP addresses.
 *
 * Uses a simple counter-based approach for wake-from-sleep scenarios:
 * - When sleep is detected, counter resets to 0 (fast 1s polling)
 * - Each poll increments counter
 * - Once counter >= threshold, switches to slower 15s polling
 */
export class NetworkChangeMonitor {

    private onNetworkChanged: () => void;
    private timer: NodeJS.Timeout | null = null;
    private lastExecutionTime = 0;
    private currentHash: string;

    // Counter-based polling
    private alertCounter = 0;
    private readonly ALERT_THRESHOLD = 30; // After 30 polls at 1s, switch to slow mode
    private readonly ALERT_INTERVAL = 1_000; // 1 second
    private readonly NORMAL_INTERVAL = 15_000; // 15 seconds

    private systemSleepMonitor: SystemSleepMonitor;

    constructor(onNetworkChanged: () => void) {
        this.onNetworkChanged = onNetworkChanged;
        this.currentHash = getNetworkHash();

        this.systemSleepMonitor = new SystemSleepMonitor(() => {
            this.alertCounter = 0;
            this.lastExecutionTime = 0; // Force immediate execution
            this.setTimer();
        });
    }

    public start(): void {
        this.systemSleepMonitor.start();
        const now = Date.now();
        if (now - this.lastExecutionTime > this.getCurrentInterval()) {
            this.executeTask();
        } else {
            this.setTimer();
        }
    }

    public stop(): void {
        this.systemSleepMonitor.stop();
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
    }

    private executeTask() {
        this.checkForNetworkChange();
        this.alertCounter++;
        this.lastExecutionTime = Date.now();
        this.setTimer();
    }

    private getCurrentInterval(): number {
        return this.alertCounter < this.ALERT_THRESHOLD
            ? this.ALERT_INTERVAL
            : this.NORMAL_INTERVAL;
    }

    private setTimer() {
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
        const interval = this.getCurrentInterval();
        const elapsed = Date.now() - this.lastExecutionTime;
        const remaining = Math.max(0, interval - elapsed);
        this.timer = setTimeout(() => {
            this.executeTask();
        }, remaining);
    }

    private checkForNetworkChange() {
        const hash = getNetworkHash();
        if (hash !== this.currentHash) {
            this.currentHash = hash;
            this.onNetworkChanged();
        }
    }

    /**
     * Get the current alert counter (for testing)
     */
    public getAlertCounter(): number {
        return this.alertCounter;
    }

    /**
     * Check if currently in alert mode (for testing)
     */
    public isInAlertMode(): boolean {
        return this.alertCounter < this.ALERT_THRESHOLD;
    }

    /**
     * Simulate sleep detection (for testing)
     * @internal
     */
    public simulateSleep(): void {
        this.alertCounter = 0;
        this.lastExecutionTime = 0;
        this.setTimer();
    }

    public dispose(): void {
        this.stop();
        this.systemSleepMonitor?.dispose?.();
        delete this.onNetworkChanged;
    }
}
