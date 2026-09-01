import type { DeviceStatus, DeviceType } from 'roku-deploy';

/**
 * Lives in its own file (rather than inside RceManagementViewProvider.ts) so the webview can import
 * RceStateDevice without pulling the provider's extension-side import graph into its typecheck program.
 */

/* eslint-disable camelcase -- the RCE management api uses snake_case fields */
/**
 * The device fields the management webview renders - a projection of roku-deploy's RceDevice that
 * leaves the instance's stream credentials behind (see projectDeviceForWebview).
 */
export interface RceStateDevice {
    id: number;
    name: string;
    note?: string | null;
    device_type: DeviceType;
    status?: DeviceStatus;
    serial_number?: string | null;
    created_at: string;
    last_snapshot_id?: number | null;
    last_snapshot_name?: string | null;
    snapshots?: number[];
    firmware_version_id?: string | null;
    running_device?: {
        started_at?: string | null;
        max_runtime: number;
    } | null;
}
/* eslint-enable camelcase */
