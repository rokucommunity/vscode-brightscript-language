import type { DeviceInfoRaw } from 'roku-deploy';

/**
 * Shared device-discovery types.
 *
 * This is the single source of truth for the interfaces that flow between the
 * DeviceManager orchestrator, its sub-managers (Configured/Discovered), and the
 * OrderManager. `DeviceManager` re-exports the public ones so existing
 * `import { RokuDevice } from '.../DeviceManager'` call sites keep working.
 */

export type DeviceState = 'offline' | 'unknown' | 'pending' | 'online';

export type PasswordValidationResult = 'ok' | 'bad-password' | 'unreachable';

export type ConfigurationScope = 'user' | 'workspace';

/**
 * A resolved host paired with the raw `device-info` gathered while probing it. Returned by the
 * host-resolution flows (device picker, manual entry, active-host lookup) so callers can reuse the
 * device info without issuing another request to the device.
 */
export interface HostWithDeviceInfo {
    host: string;
    deviceInfo: DeviceInfoRaw;
}

/**
 * User-configured device from settings (brightscript.devices)
 */
export interface ConfiguredDevice {
    host: string;
    name?: string;
    serialNumber?: string;
    password?: string;
}

/**
 * Internal: configured device from settings
 * Extends the raw settings shape with runtime tracking fields.
 * Persists even when device goes offline.
 */
export interface ConfiguredDeviceEntry extends ConfiguredDevice {
    /**
     * IP from DNS lookup (updated on resolution)
     */
    resolvedIp?: string;
    /**
     * Which settings scopes this device is configured in
     */
    configuredIn?: ConfigurationScope[];
    /**
     * Current device state (inline on entry)
     */
    state?: DeviceState;
    /**
     * Previous state, updated by DeviceManager.applyEntryState before each transition. Undefined when no
     * state has been recorded yet — readers should treat that as 'unknown'.
     */
    lastState?: DeviceState;
    /**
     * Timestamp of last state update
     */
    stateLastUpdated?: number;
}

/**
 * Internal: discovered device from network
 * Removed when device goes offline (ephemeral)
 */
export interface DiscoveredDeviceEntry {
    /**
     * Current IP from SSDP/resolution
     */
    ip: string;
    /**
     * Serial number from device-info response
     */
    serialNumber?: string;
    /**
     * Current device state (inline on entry)
     */
    state?: DeviceState;
    /**
     * Previous state, updated by DeviceManager.applyEntryState before each transition. Undefined when no
     * state has been recorded yet — readers should treat that as 'unknown'.
     */
    lastState?: DeviceState;
    /**
     * Timestamp of last state update
     */
    stateLastUpdated?: number;
}

/**
 * Device state with timestamp, returned by getDeviceState
 */
export interface DeviceStateEntry {
    state: DeviceState;
    lastUpdated: number;
}

/**
 * Active device pointer persisted in workspaceState under `DeviceManager.ACTIVE_DEVICE_STATE_KEY`.
 * The serial number is the durable identity; the ip is the last IP the device was seen at.
 */
export interface ActiveDeviceEntry {
    serialNumber?: string;
    ip?: string;
}

/**
 * Full device details returned by public API
 * Built on-demand by merging configured and discovered device data
 */
export interface RokuDevice {
    /**
     * Computed IP from resolution order: discovered > resolvedIp > host
     */
    ip: string;
    /**
     * Serial number from discovered or configured
     */
    serialNumber?: string;
    /**
     * Encoded device key: "s:{serial}" or "i:{ip}"
     */
    key: string;
    /**
     * Device state: online, offline, pending (currently checking), or unknown (never checked)
     */
    deviceState: DeviceState;
    /**
     * Previous device state: online, offline, pending (currently checking), or unknown (never checked)
     */
    lastDeviceState: DeviceState;
    /**
     * Cached device info from GlobalStateManager
     */
    deviceInfo: Record<string, any>;
    /**
     * True if device exists in discoveredDevices array
     */
    isDiscovered: boolean;
    /**
     * True if device exists in configuredDevices array
     */
    isConfigured: boolean;
    /**
     * Which settings scopes this device is configured in
     */
    configuredIn?: ConfigurationScope[];
    /**
     * User-provided name from config
     */
    configuredName?: string;
    /**
     * User-provided password from config
     */
    configuredPassword?: string;
}

