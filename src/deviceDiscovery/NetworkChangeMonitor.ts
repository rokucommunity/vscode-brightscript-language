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

export type MonitorState = 'idle' | 'alert' | 'verifying';

/**
 * Monitor for network changes by polling IP addresses.
 *
 * Uses a state machine with backoff for wake-from-sleep scenarios:
 * - idle: Normal 3-minute polling
 * - alert: Aggressive polling after wake (tiers: 1s/5s/15s intervals)
 * - verifying: Validates network is stable (3 consecutive matching polls)
 */
export class NetworkChangeMonitor {

    private onNetworkChanged: () => void;
    private timer: NodeJS.Timeout | null = null;
    private lastExecutionTime = 0;

    // State machine
    private state: MonitorState = 'idle';
    private currentHash: string;
    private verifyingTarget = '';
    private verifyingCount = 0;
    private alertTier: 1 | 2 | 3 = 1;
    private alertTierStartTime = 0;

    // Timing configuration
    private readonly CONFIG = {
        idle: { interval: 3 * 60 * 1_000 },
        alert: {
            1: { interval: 1_000, duration: 30_000 },
            2: { interval: 5_000, duration: 30_000 },
            3: { interval: 15_000, duration: 180_000 }
        },
        verifying: { interval: 1_000, requiredCount: 3 }
    };

    private systemSleepMonitor: SystemSleepMonitor;

    constructor(onNetworkChanged: () => void) {
        this.onNetworkChanged = onNetworkChanged;
        // Take initial snapshot - this is the hash we've "broadcast" about
        this.currentHash = getNetworkHash();

        this.systemSleepMonitor = new SystemSleepMonitor(() => {
            this.enterAlert();
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
        this.doWork();
        this.lastExecutionTime = Date.now();
        this.setTimer();
    }

    private getCurrentInterval(): number {
        switch (this.state) {
            case 'idle':
                return this.CONFIG.idle.interval;
            case 'alert':
                return this.CONFIG.alert[this.alertTier].interval;
            case 'verifying':
                return this.CONFIG.verifying.interval;
        }
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

    private doWork() {
        switch (this.state) {
            case 'idle':
                this.handleIdle();
                break;
            case 'alert':
                this.handleAlert();
                break;
            case 'verifying':
                this.handleVerifying();
                break;
        }
    }

    /**
     * Idle: Normal polling mode
     * - Network changed (hash ≠ currentHash, hash ≠ 'no-network') → broadcast, stay idle
     * - Sleep detected → handled by SystemSleepMonitor callback
     */
    private handleIdle() {
        const hash = getNetworkHash();
        if (hash !== this.currentHash && hash !== 'no-network') {
            this.currentHash = hash;
            this.onNetworkChanged();
        }
        // Stay idle
    }

    /**
     * Alert: Aggressive polling after wake
     * - Network detected (hash ≠ 'no-network') → enter verifying (broadcast if hash changed)
     * - Tier timeout → advance to next tier (or return to idle if tier 3 times out)
     */
    private handleAlert() {
        const hash = getNetworkHash();
        const now = Date.now();
        const tierConfig = this.CONFIG.alert[this.alertTier];
        const tierElapsed = now - this.alertTierStartTime;

        // Check if we have a network
        if (hash !== 'no-network') {
            // Network detected - broadcast if it changed
            if (hash !== this.currentHash) {
                this.currentHash = hash;
                this.onNetworkChanged();
            }
            // Enter verifying to validate the network is stable
            this.enterVerifying(hash);
            return;
        }

        // No network - check for tier timeout
        if (tierElapsed >= tierConfig.duration) {
            this.advanceAlertTier();
        }
    }

    /**
     * Verifying: Validates network is stable
     * - 3 consecutive polls with same hash → stable, return to idle
     * - Hash changed (unstable) → back to alert
     * - 'no-network' detected → back to alert
     */
    private handleVerifying() {
        const hash = getNetworkHash();

        // Check for no-network or hash change (unstable)
        if (hash === 'no-network' || hash !== this.verifyingTarget) {
            // Network unstable - go back to alert
            this.enterAlert();
            return;
        }

        // Hash matches - increment verifying count
        this.verifyingCount++;

        const requiredCount = this.CONFIG.verifying.requiredCount;
        if (this.verifyingCount >= requiredCount) {
            // Stable! Return to idle
            this.returnToIdle();
        }
    }

    /**
     * Enter alert state after sleep detected
     */
    private enterAlert(): void {
        this.state = 'alert';
        this.alertTier = 1;
        this.alertTierStartTime = Date.now();
        this.lastExecutionTime = 0; // Force immediate execution
        this.setTimer();
    }

    /**
     * Enter verifying state
     */
    private enterVerifying(targetHash: string): void {
        this.state = 'verifying';
        this.verifyingTarget = targetHash;
        this.verifyingCount = 0;
        this.lastExecutionTime = Date.now();
        this.setTimer();
    }

    /**
     * Return to idle state
     */
    private returnToIdle(): void {
        this.state = 'idle';
        this.verifyingTarget = '';
        this.verifyingCount = 0;
        this.lastExecutionTime = Date.now();
        this.setTimer();
    }

    /**
     * Advance to the next alert tier, or return to idle if tier 3 times out
     */
    private advanceAlertTier(): void {
        if (this.alertTier < 3) {
            this.alertTier = (this.alertTier + 1) as 1 | 2 | 3;
            this.alertTierStartTime = Date.now();
            this.lastExecutionTime = Date.now();
            this.setTimer();
        } else {
            // Gave up - return to idle without broadcasting
            this.returnToIdle();
        }
    }

    /**
     * Get the current state (for testing)
     */
    public getState(): MonitorState {
        return this.state;
    }

    /**
     * Get the current alert tier (for testing)
     */
    public getAlertTier(): number {
        return this.alertTier;
    }

    /**
     * Get the current hash (for testing)
     */
    public getCurrentHash(): string {
        return this.currentHash;
    }

    /**
     * Simulate sleep detection (for testing)
     * @internal
     */
    public simulateSleep(): void {
        this.enterAlert();
    }

    public dispose(): void {
        this.stop();
        this.systemSleepMonitor?.dispose?.();
        delete this.onNetworkChanged;
    }
}
