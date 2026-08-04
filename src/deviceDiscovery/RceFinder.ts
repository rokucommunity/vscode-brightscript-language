import { EventEmitter } from 'eventemitter3';
import type { DeviceOption, DeviceOut } from 'roku-deploy';
import type { RceManager } from '../managers/RceManager';

/**
 * Discovers Roku Cloud Emulator (RCE) devices by polling the RCE management api.
 * Mirrors the RokuFinder surface: `start()`/`stop()` for continuous polling, `scan()` for a
 * one-shot poll, and events the DeviceManager consumes. Emits a `devices` event with the full
 * device list on every successful poll (the management api always returns the complete
 * inventory, so consumers replace rather than accumulate).
 */
export class RceFinder extends EventEmitter {
    constructor(
        private rceManager: RceManager,
        private log: (message: string) => void = () => { }
    ) {
        super();
        //a token change means devices may have appeared or disappeared; re-poll right away
        this.unsubscribeFromTokenChanged = this.rceManager.onTokenChanged(() => {
            void this.scan();
        });
    }

    private unsubscribeFromTokenChanged: () => void;

    private pollTimer: ReturnType<typeof setInterval> | undefined;

    private activeScan: Promise<void> | undefined;

    private queuedScan: Promise<void> | undefined;

    //the token used for the most recent scan, set right where scan() resolves the client. Since a
    //token change re-triggers a scan (see the constructor), this stays in sync with whichever token
    //is actually in effect rather than going stale between scans.
    private cachedToken: string | undefined;

    public static readonly POLL_INTERVAL_MS = 15_000;

    public get running(): boolean {
        return this.pollTimer !== undefined;
    }

    /**
     * Begin continuous polling. Polls immediately, then on an interval.
     */
    public start(): void {
        if (this.running) {
            return;
        }
        void this.scan();
        this.pollTimer = setInterval(() => {
            void this.scan();
        }, RceFinder.POLL_INTERVAL_MS);
        //don't let the poll timer keep the process alive
        this.pollTimer.unref?.();
    }

    public stop(): void {
        if (this.pollTimer) {
            clearInterval(this.pollTimer);
            this.pollTimer = undefined;
        }
    }

    /**
     * One-shot poll of the management api. Resolves without emitting when no token is configured.
     * A call that lands while a scan is mid-flight resolves with a single trailing scan (shared by
     * every such caller) rather than the in-flight one, since the in-flight scan's results can
     * predate the call - for example a token change during the poll, or a health check asking for
     * the device's current status.
     */
    public scan(): Promise<void> {
        if (this.activeScan === undefined) {
            this.activeScan = this.runScan().finally(() => {
                this.activeScan = undefined;
            });
            return this.activeScan;
        }
        this.queuedScan ??= this.activeScan.then(() => {
            this.queuedScan = undefined;
            return this.scan();
        });
        return this.queuedScan;
    }

    private async runScan(): Promise<void> {
        try {
            this.cachedToken = await this.rceManager.getToken();
            const client = await this.rceManager.getClient();
            if (!client) {
                //no token means no cloud devices; tell consumers the list is empty so removed tokens clear the view
                this.emit('devices', []);
                return;
            }
            const devices: DeviceOut[] = await client.listDevices();
            this.emit('devices', devices);
        } catch (e) {
            this.log(`RCE device poll failed: ${(e as Error).message}`);
            this.emit('error', e);
        }
    }

    /**
     * The token used for the most recent scan. Undefined before any scan has run, or when the most
     * recent scan found no account token configured. Synchronous so a caller building a
     * roku-deploy-compatible device option for an RCE device (see DeviceManager.onRceDevices) doesn't
     * need to await another token lookup.
     */
    public getCachedToken(): string | undefined {
        return this.cachedToken;
    }

    /**
     * Build a roku-deploy device option for a cloud emulator device (live instance url preferred,
     * management-api id as fallback). Returns undefined when no token is available.
     */
    public async getDeviceOption(device: { instanceUrl?: string; id?: number }): Promise<DeviceOption | undefined> {
        const token = await this.rceManager.getToken();
        if (!token) {
            return undefined;
        }
        if (device.instanceUrl) {
            return { instanceUrl: device.instanceUrl, rceToken: token };
        }
        if (device.id !== undefined) {
            return { id: device.id, rceToken: token };
        }
        return undefined;
    }

    public dispose(): void {
        this.stop();
        this.unsubscribeFromTokenChanged();
        this.removeAllListeners();
    }
}
