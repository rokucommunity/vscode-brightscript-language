import type { GlobalStateManager } from '../GlobalStateManager';
import type { DiscoveredDeviceEntry } from './types';

/**
 * Owns the list of devices discovered on the network (via SSDP, last-seen hints, or manual entry).
 *
 * Discovered devices are ephemeral — removed when they fail a health check. This class handles the
 * array bookkeeping: serial-based deduplication (a device that moved IPs), IP-based deduplication,
 * and removal (including clearing the persisted last-seen hint).
 *
 * Cross-cutting concerns that span both device buckets — device state, active-device re-pointing,
 * configured-device reloads, and serial-mismatch detection — remain in the DeviceManager
 * orchestrator, which wraps {@link setDevice}/{@link removeDevice}.
 */
export class DiscoveredDeviceManager {
    constructor(
        private globalStateManager: GlobalStateManager,
        /**
         * Provider for the current network id. A function (not a value) because the network id
         * changes when the machine's network changes.
         */
        private getNetworkId: () => string
    ) { }

    /**
     * The live discovered-device array. Returned by reference from {@link getAll} so callers can
     * iterate and mutate entry state in place.
     */
    private devices: DiscoveredDeviceEntry[] = [];

    /**
     * Return the live discovered-device array (by reference).
     */
    public getAll(): DiscoveredDeviceEntry[] {
        return this.devices;
    }

    public findBySerial(serialNumber: string): DiscoveredDeviceEntry | undefined {
        return this.devices.find(d => d.serialNumber === serialNumber);
    }

    public findByIp(ip: string): DiscoveredDeviceEntry | undefined {
        return this.devices.find(d => d.ip === ip);
    }

    /**
     * Add or update a discovered device.
     * - Serial dedupe: if the same serial exists at a different IP, the old-IP entry is removed
     *   (the device moved). Its IP is returned so the orchestrator can transfer any pointers.
     * - IP dedupe: an existing entry at this IP is updated in place (preserving its state fields);
     *   otherwise a new entry is appended.
     *
     * State is intentionally NOT set here — the orchestrator applies device state after calling this.
     *
     * @returns `removedIp` — the IP of an old entry removed by serial dedupe, if any.
     */
    public setDevice(ip: string, serialNumber: string | undefined): { removedIp?: string } {
        let removedIp: string | undefined;

        // Serial dedupe: if same serial exists at different IP, remove old entry
        if (serialNumber) {
            const oldIdx = this.devices.findIndex(d => d.ip !== ip && d.serialNumber === serialNumber);
            if (oldIdx >= 0) {
                removedIp = this.devices[oldIdx].ip;
                this.devices.splice(oldIdx, 1);
            }
        }

        // IP dedupe: find existing entry at same IP
        const existingIdx = this.devices.findIndex(d => d.ip === ip);
        const existing = existingIdx >= 0 ? this.devices[existingIdx] : undefined;

        if (existing) {
            // Update existing entry (preserve state fields so the orchestrator sees the prior state)
            this.devices[existingIdx] = {
                ...existing,
                ip: ip,
                serialNumber: serialNumber ?? existing.serialNumber
            };
        } else {
            // Add new entry
            this.devices.push({
                ip: ip,
                serialNumber: serialNumber
            });
        }

        return { removedIp: removedIp };
    }

    /**
     * Remove a discovered device by IP. Also clears the persisted last-seen hint when the entry
     * carried a serial number.
     *
     * @returns the removed entry, or undefined if no device was at that IP.
     */
    public removeDevice(ip: string): DiscoveredDeviceEntry | undefined {
        const idx = this.devices.findIndex(d => d.ip === ip);
        if (idx < 0) {
            return undefined;
        }

        const device = this.devices[idx];
        this.devices.splice(idx, 1);

        // Remove from lastSeenDevices if we have a serial
        if (device?.serialNumber) {
            this.globalStateManager.removeLastSeenDevice(this.getNetworkId(), device.serialNumber);
        }

        return device;
    }

    /**
     * Empty the discovered-device list in place (keeps the array reference stable).
     */
    public clear(): void {
        this.devices.length = 0;
    }
}
