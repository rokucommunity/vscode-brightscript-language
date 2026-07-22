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
     * Previous state, updated by setDeviceState before each transition. Undefined when no
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
     * Previous state, updated by setDeviceState before each transition. Undefined when no
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

// #region Orders
/**
 * Two kinds of work the views can order from the DeviceManager:
 * - `broadcast` — SSDP M-SEARCH to find devices on the network
 * - `reconcile` — health-check all currently-known devices
 */
export type OrderType = 'broadcast' | 'reconcile';

/**
 * Why a broadcast (SSDP scan) was ordered. Views filter on this — e.g. a visible
 * view ignores `stale` (timer-driven) broadcasts to avoid surprise scans.
 */
export type BroadcastReason =
    | 'startup'
    | 'network'
    | 'sleep'
    | 'refresh-clicked'
    | 'stale'
    | 'unhealthy-device';

/**
 * Why a reconcile (health-check) was ordered.
 */
export type ReconcileReason =
    | 'startup'
    | 'network'
    | 'sleep'
    | 'refresh-clicked'
    | 'stale'
    | 'config-changed';

export type OrderReason = BroadcastReason | ReconcileReason;

/**
 * A unit of deferred work. Queued by triggers, consumed by views.
 */
export interface Order {
    type: OrderType;
    reason: OrderReason;
    /**
     * When the order was submitted (ms epoch)
     */
    timestamp: number;
}

export interface BroadcastOrder extends Order {
    type: 'broadcast';
    reason: BroadcastReason;
}

export interface ReconcileOrder extends Order {
    type: 'reconcile';
    reason: ReconcileReason;
}
// #endregion
