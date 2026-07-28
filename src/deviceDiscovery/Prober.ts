import { rokuDeploy, type DeviceInfoRaw } from 'roku-deploy';
import type { GlobalStateManager } from '../GlobalStateManager';

/**
 * The device-info probing machinery: how the extension talks to a device, independent of when
 * or why. Owns the spec's "de-dupe rule" (see docs/device-discovery.md):
 *
 * - Concurrent probes of the same `ip:port` share one in-flight HTTP request — the first caller
 *   starts it, everyone else joins.
 * - A per-IP sequence counter is the complementary guard on the *result* side: when overlapping
 *   checks finish out of order, only the newest check may apply its result.
 * - A trust window: cached device info younger than {@link Prober.DEVICE_FRESHNESS_MS} (and
 *   still mapped to the same IP) is treated as truth, so callers can skip the network entirely.
 *
 * Probes any IP — declared (configured) or observed (discovered). Successful probes write the
 * device-info cache and the network-scoped IP↔serial mapping.
 */
export class Prober {
    constructor(
        private globalStateManager: GlobalStateManager,
        /**
         * Provider for the current network id. A function (not a value) because the network id
         * changes when the machine's network changes.
         */
        private getNetworkId: () => string
    ) { }

    public static readonly HEALTH_CHECK_TIMEOUT_MS = 2_000;

    /**
     * The single "trust window" for cached device info: cache younger than this is treated as
     * truth (device assumed online on load, resolve flows short-circuit to cache instead of
     * hitting the network).
     */
    public static readonly DEVICE_FRESHNESS_MS = 5 * 60 * 1_000; // 5 minutes

    /**
     * In-flight device-info requests by `ip:port`. Concurrent callers share one HTTP request.
     */
    private inFlightDeviceInfo = new Map<string, Promise<DeviceInfoRaw | undefined>>();

    /**
     * Last-started probe sequence per IP. Newest-started wins when applying results.
     */
    private sequenceByIp = new Map<string, number>();

    /**
     * Begin a check for this IP: bump and return its sequence number. Pair with
     * {@link isCurrentSequence} after any awaits to decide whether this check may still apply
     * its result (last-STARTED-wins, which is the correct ordering key — a newer invocation
     * implies something newer triggered it).
     */
    public nextSequence(ip: string): number {
        const seq = (this.sequenceByIp.get(ip) ?? 0) + 1;
        this.sequenceByIp.set(ip, seq);
        return seq;
    }

    /**
     * Is this still the latest check started for this IP?
     */
    public isCurrentSequence(ip: string, sequence: number): boolean {
        return this.sequenceByIp.get(ip) === sequence;
    }

    /**
     * Forget all sequence tracking (e.g. when the device cache is cleared) — in-flight checks
     * become stale and will not apply their results.
     */
    public clearSequences(): void {
        this.sequenceByIp.clear();
    }

    /**
     * Return cached device info for the device at `ip` when it's inside the trust window:
     * cache younger than {@link Prober.DEVICE_FRESHNESS_MS} AND the serial is still mapped to
     * this IP (don't trust cache for a device that moved). Returns undefined otherwise.
     */
    public getFreshCachedDeviceInfo(ip: string, knownSerialNumber: string | undefined): DeviceInfoRaw | undefined {
        const networkId = this.getNetworkId();
        const serialForCache = knownSerialNumber ?? this.globalStateManager.getSerialNumberForIp(ip, networkId);
        const cached = serialForCache ? this.globalStateManager.getCachedDevice(serialForCache) : undefined;
        if (!cached) {
            return undefined;
        }
        const cachedIp = this.globalStateManager.getIpForSerial(serialForCache, networkId);
        const isFresh = (Date.now() - cached.createdAt < Prober.DEVICE_FRESHNESS_MS) && cachedIp === ip;
        return isFresh ? cached.deviceInfo as DeviceInfoRaw : undefined;
    }

    /**
     * Fetch device info from the network, sharing any request already in flight for the same
     * ip:port. Caches the result in globalStateManager for future lookups.
     */
    public fetchDeviceInfo(ip: string, port: number): Promise<DeviceInfoRaw | undefined> {
        const key = `${ip}:${port}`;
        let inFlight = this.inFlightDeviceInfo.get(key);
        if (inFlight === undefined) {
            //safe to share: fetchDeviceInfoInner never rejects (it catches and returns undefined)
            inFlight = this.fetchDeviceInfoInner(ip, port).finally(() => {
                this.inFlightDeviceInfo.delete(key);
            });
            this.inFlightDeviceInfo.set(key, inFlight);
        }
        return inFlight;
    }

    /**
     * Fetch device info from the network. Always makes a network request.
     */
    private async fetchDeviceInfoInner(ip: string, port: number): Promise<DeviceInfoRaw> {
        try {
            const info = await rokuDeploy.getDeviceInfo({
                host: ip,
                remotePort: port,
                timeout: Prober.HEALTH_CHECK_TIMEOUT_MS
            });
            if (info['serial-number']) {
                this.globalStateManager.setCachedDevice(info['serial-number'], {
                    serialNumber: info['serial-number'],
                    deviceInfo: info,
                    createdAt: Date.now()
                });
                this.globalStateManager.setSerialNumberForIp(this.getNetworkId(), ip, info['serial-number']);
            }

            return info;
        } catch (e) {
            console.error(e);
            return undefined;
        }
    }
}
