/**
 * Monitor for system sleep/wake events
 */
export class SystemSleepMonitor {
    protected timer: NodeJS.Timeout | null = null;
    protected lastExecutionTime = 0;
    private interval = 60000;
    private gapThreshold = 120000; // 2 minutes

    constructor(private onSleepDetected: () => void) { }

    start() {
        console.log('SystemSleepDetector started');
        this.lastExecutionTime = Date.now();
        this.timer = setInterval(() => {
            if (Date.now() - this.lastExecutionTime > this.gapThreshold && this.lastExecutionTime !== 0) {
                this.onSleepDetected();
            }
            this.lastExecutionTime = Date.now();
            console.log(`SystemSleepDetector heartbeat at ${new Date().toLocaleTimeString()}`);
        }, this.interval);
    }
    stop() {
        console.log('SystemSleepDetector stopped');
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }
}
