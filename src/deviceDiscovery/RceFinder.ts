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
        this.rceManager.onTokenChanged(() => {
            void this.scan();
        });
    }

    private pollTimer: ReturnType<typeof setInterval> | undefined;

    private isScanning = false;

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
     * Overlapping calls are coalesced (a scan already in flight makes this a no-op).
     */
    public async scan(): Promise<void> {
        if (this.isScanning) {
            return;
        }
        this.isScanning = true;
        try {
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
        } finally {
            this.isScanning = false;
        }
    }

    /**
     * Build a roku-deploy device option for a cloud emulator device (live instance url preferred,
     * management-api id as fallback). Returns undefined when no token is available.
     */
    public async getDeviceOption(device: { instanceUrl?: string; id?: string }): Promise<DeviceOption | undefined> {
        const token = await this.rceManager.getToken();
        if (!token) {
            return undefined;
        }
        if (device.instanceUrl) {
            return { instanceUrl: device.instanceUrl, rceToken: token };
        }
        if (device.id) {
            return { id: device.id, rceToken: token };
        }
        return undefined;
    }

    public dispose(): void {
        this.stop();
        this.removeAllListeners();
    }
}
