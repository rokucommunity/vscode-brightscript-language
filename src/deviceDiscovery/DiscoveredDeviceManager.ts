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
        const existing = this.devices.find(d => d.ip === ip);

        if (existing) {
            // Update the existing entry IN PLACE (never replace the object) — the orchestrator
            // holds references to entries and mutates their state fields directly, so swapping
            // in a new object would silently orphan those references
            if (serialNumber && existing.serialNumber && existing.serialNumber !== serialNumber) {
                // A DIFFERENT device is now at this IP (serial is primary key). Take over the
                // entry for the new device and reset its state fields — inheriting the previous
                // device's state (e.g. `online`) would both lie about the new device and block
                // lazy hydration from ever device-info'ing it.
                existing.serialNumber = serialNumber;
                existing.state = undefined;
                existing.lastState = undefined;
                existing.stateLastUpdated = undefined;
            } else {
                existing.serialNumber = serialNumber ?? existing.serialNumber;
            }
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
     * Read the persisted last-seen hints for the current network — the (ip, serial) pairs of
     * devices we successfully resolved in a previous session. Stale hints (no cached device info
     * or no IP mapping anymore) are pruned from storage as a side effect.
     *
     * Returns the hints instead of applying them: adding a device involves cross-cutting
     * concerns (state defaults, active-device re-pointing) owned by the orchestrator, which
     * feeds each hint through its own setDiscoveredDevice wrapper.
     */
    public loadLastSeen(networkId: string): Array<{ ip: string; serialNumber: string }> {
        const hints: Array<{ ip: string; serialNumber: string }> = [];
        for (const serialNumber of this.globalStateManager.getLastSeenDevices(networkId)) {
            const cached = this.globalStateManager.getCachedDevice(serialNumber);
            if (cached && typeof cached === 'object' && !Array.isArray(cached)) {
                const ip = this.globalStateManager.getIpForSerial(serialNumber, networkId);
                if (!ip) {
                    // No IP mapping found - remove stale entry
                    this.globalStateManager.removeLastSeenDevice(networkId, serialNumber);
                    continue;
                }
                hints.push({ ip: ip, serialNumber: serialNumber });
            } else {
                // No cached info - remove stale entry
                this.globalStateManager.removeLastSeenDevice(networkId, serialNumber);
            }
        }
        return hints;
    }

    /**
     * Empty the discovered-device list in place (keeps the array reference stable).
     */
    public clear(): void {
        this.devices.length = 0;
    }
}
