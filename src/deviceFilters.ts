import * as vscode from 'vscode';
import type { RokuDevice } from './deviceDiscovery/DeviceManager';

/**
 * The set of filter facets used by both the Devices view and the device quick pick.
 * Each consumer persists its own values under its own settings section but shares this shape.
 */
export interface DeviceFilters {
    devModeEnabled: boolean;
    devModeDisabled: boolean;
    tv: boolean;
    setTopBox: boolean;
    stick: boolean;
    online: boolean;
    offline: boolean;
    userDefined: boolean;
    autoDetected: boolean;
}

export const DEVICE_FILTER_KEYS: Array<keyof DeviceFilters> = [
    'devModeEnabled',
    'devModeDisabled',
    'tv',
    'setTopBox',
    'stick',
    'online',
    'offline',
    'userDefined',
    'autoDetected'
];

/**
 * Human-readable labels for each filter facet — kept in one place so the
 * Devices view submenu titles and the device picker submenu items stay aligned.
 */
export const DEVICE_FILTER_LABELS: Record<keyof DeviceFilters, string> = {
    devModeEnabled: 'Dev Mode Enabled',
    devModeDisabled: 'Dev Mode Disabled',
    tv: 'TV',
    setTopBox: 'Set Top Box',
    stick: 'Streaming Stick',
    online: 'Online',
    offline: 'Offline',
    userDefined: 'User Defined',
    autoDetected: 'Auto Detected'
};

/**
 * Visual groupings shared with the Devices view submenu (dev mode / form factor
 * / connectivity / source). Used to render separators in the picker's filter submenu.
 */
export const DEVICE_FILTER_GROUPS: Array<Array<keyof DeviceFilters>> = [
    ['devModeEnabled', 'devModeDisabled'],
    ['tv', 'setTopBox', 'stick'],
    ['online', 'offline'],
    ['userDefined', 'autoDetected']
];

export const DEFAULT_DEVICE_FILTERS: DeviceFilters = {
    devModeEnabled: true,
    devModeDisabled: false,
    tv: true,
    setTopBox: true,
    stick: true,
    online: true,
    offline: false,
    userDefined: true,
    autoDetected: true
};

/**
 * Read each filter facet from a configuration section, falling back to defaults
 * for missing or non-boolean values.
 */
export function loadDeviceFilters(section: string): DeviceFilters {
    const config = vscode.workspace.getConfiguration(section);
    const result = { ...DEFAULT_DEVICE_FILTERS };
    for (const filterKey of DEVICE_FILTER_KEYS) {
        const value = config.get<boolean>(filterKey);
        if (typeof value === 'boolean') {
            result[filterKey] = value;
        }
    }
    return result;
}

/**
 * Strict-AND filter: a device must satisfy every enabled facet to be retained.
 * Pending devices stay visible to the online facet only when their last known
 * state was online; otherwise they fall under the offline facet.
 *
 * A Roku Cloud Emulator device (device.rce is set) gets one additional carve-out:
 * a pending RCE device always counts as effectively online, since it is booting
 * at the user's request rather than recovering from an unknown prior state.
 */
export function applyDeviceFilters(devices: RokuDevice[], filters: DeviceFilters): RokuDevice[] {
    return devices.filter(device => {
        const info = device.deviceInfo ?? {};
        const isTv = info['is-tv'] === 'true';
        const isStick = info['is-stick'] === 'true';
        const isSetTopBox = !isTv && !isStick;
        if (isTv && !filters.tv) {
            return false;
        }
        if (isStick && !filters.stick) {
            return false;
        }
        if (isSetTopBox && !filters.setTopBox) {
            return false;
        }

        const isRceDevice = !!device.rce;
        const isEffectivelyOnline = device.deviceState === 'online' ||
            (device.deviceState === 'pending' && device.lastDeviceState === 'online') ||
            (device.deviceState === 'pending' && isRceDevice);
        if (!isEffectivelyOnline && !filters.offline) {
            return false;
        }
        if (isEffectivelyOnline && !filters.online) {
            return false;
        }

        // developer-enabled may be missing on older firmware or before the first health check;
        // treat unknown as enabled so we don't hide working devices.
        const devEnabled = info['developer-enabled'] !== 'false';
        if (devEnabled && !filters.devModeEnabled) {
            return false;
        }
        if (!devEnabled && !filters.devModeDisabled) {
            return false;
        }

        // A device that appears in both settings and the network scan is treated as user-defined.
        if (device.isConfigured && !filters.userDefined) {
            return false;
        }
        if (!device.isConfigured && !filters.autoDetected) {
            return false;
        }

        return true;
    });
}
