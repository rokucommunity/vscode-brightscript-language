/**
 * Monitor for system sleep/wake events by detecting gaps in timer execution
 */
export class SystemSleepMonitor {

    private timer: NodeJS.Timeout | null = null;
    private lastExecutionTime = 0;
    private interval = 1 * 60 * 1_000; // 1 minute
    private gapThreshold = 2 * 60 * 1_000; // 2 minutes

    constructor(private onSleepDetected: () => void) { }

    public start(): void {
        this.lastExecutionTime = Date.now();
        this.scheduleNext();
    }

    public stop(): void {
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
    }

    private scheduleNext(): void {
        this.timer = setTimeout(() => {
            const lastExecutionTime = this.lastExecutionTime;
            this.lastExecutionTime = Date.now();
            this.scheduleNext(); // Schedule next execution before calling callback to ensure consistent intervals
            if (Date.now() - lastExecutionTime > this.gapThreshold) {
                this.onSleepDetected();
            }
        }, this.interval);
    }

    public dispose(): void {
        this.stop();
        delete this.onSleepDetected;
    }
}
