/**
 * Monitor for system sleep/wake events by detecting gaps in timer execution
 */
export class SystemSleepMonitor {

    private timer: NodeJS.Timeout | null = null;
    private lastExecutionTime = 0;
    private interval = 60000; // 1 minute
    private gapThreshold = 120000; // 2 minutes

    constructor(private onSleepDetected: () => void) { }

    public start(): void {
        this.lastExecutionTime = Date.now();
        this.timer = setInterval(() => {
            if (Date.now() - this.lastExecutionTime > this.gapThreshold && this.lastExecutionTime !== 0) {
                this.onSleepDetected();
            }
            this.lastExecutionTime = Date.now();
        }, this.interval);
    }

    public stop(): void {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }
}
