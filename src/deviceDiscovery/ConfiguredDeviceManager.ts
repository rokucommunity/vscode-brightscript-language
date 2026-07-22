import * as vscode from 'vscode';
import { util as rokuDebugUtil } from 'roku-debug/dist/util';
import type {
    ConfigurationScope,
    ConfiguredDevice,
    ConfiguredDeviceEntry
} from './types';

/**
 * Owns the list of user-configured devices (from the `brightscript.devices` setting).
 *
 * Responsibilities:
 * - Read devices from the user + workspace configuration scopes
 * - Resolve hostnames to IP addresses via DNS
 * - Track which scope(s) each device is configured in
 *
 * Configured devices persist even when offline; their runtime state (online/offline/etc.)
 * is stored inline on each entry and managed by the DeviceManager orchestrator.
 */
export class ConfiguredDeviceManager {
    /**
     * The live configured-device array. Returned by reference from {@link getAll} so callers can
     * iterate and mutate entry state in place.
     */
    private devices: ConfiguredDeviceEntry[] = [];

    /**
     * Return the live configured-device array (by reference).
     */
    public getAll(): ConfiguredDeviceEntry[] {
        return this.devices;
    }

    public findBySerial(serialNumber: string): ConfiguredDeviceEntry | undefined {
        return this.devices.find(d => d.serialNumber === serialNumber);
    }

    /**
     * Find a configured device by IP, matching either its resolved IP or its raw host value.
     */
    public findByIp(ip: string): ConfiguredDeviceEntry | undefined {
        return this.devices.find(d => d.resolvedIp === ip || d.host === ip);
    }

    /**
     * Reload configured devices from VSCode settings (user + workspace scopes), resolving
     * hostnames to IPs via DNS. Rebuilds the internal list in place (preserving the array
     * reference) so `getAll()` holders stay valid.
     *
     * Does not touch device state or emit events — the orchestrator applies state and notifies
     * listeners after calling this.
     */
    public async load(): Promise<void> {
        // Read config from all VSCode scopes
        const inspection = vscode.workspace.getConfiguration('brightscript').inspect<ConfiguredDevice[]>('devices');
        const userDevices = inspection?.globalValue ?? [];
        const workspaceDevices = inspection?.workspaceValue ?? [];

        // Build a map tracking which scopes each device is in
        interface ConfiguredDeviceWithScope extends ConfiguredDevice {
            configuredIn: ConfigurationScope[];
        }
        const deviceMap = new Map<string, ConfiguredDeviceWithScope>();

        function addDevicesFromScope(devices: ConfiguredDevice[], scope: ConfigurationScope) {
            for (const device of devices) {
                if (!device?.host) {
                    continue;
                }
                const key = device.serialNumber || device.host;
                const existing = deviceMap.get(key);
                const scopes = existing?.configuredIn ?? [];
                if (!scopes.includes(scope)) {
                    scopes.push(scope);
                }
                deviceMap.set(key, {
                    ...existing,
                    ...device,
                    configuredIn: scopes
                });
            }
        }

        addDevicesFromScope(userDevices, 'user');
        addDevicesFromScope(workspaceDevices, 'workspace');

        // Clear and rebuild the configured list in place (keep the array reference stable)
        this.devices.length = 0;

        // Sort devices by deterministic key for consistent ordering
        const sortedDevices = Array.from(deviceMap.values()).sort((a, b) => {
            const keyA = a.serialNumber || a.host;
            const keyB = b.serialNumber || b.host;
            return keyA.localeCompare(keyB);
        });

        for (const configured of sortedDevices) {
            // Resolve hostname to IP address (handles both hostnames and IPs)
            let resolvedIp: string | undefined;
            try {
                resolvedIp = await rokuDebugUtil.dnsLookup(configured.host);
            } catch {
                // DNS lookup failed - resolvedIp remains undefined
            }

            this.devices.push({
                ...configured,
                resolvedIp: resolvedIp
            });
        }
    }

    /**
     * Empty the configured-device list in place (keeps the array reference stable).
     */
    public clear(): void {
        this.devices.length = 0;
    }
}
