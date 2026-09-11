import type { DeviceStatus, DeviceType } from 'roku-deploy';

/**
 * Lives in its own file (rather than inside RceManagementViewProvider.ts) so the webview can import
 * RceStateDevice without pulling the provider's extension-side import graph into its typecheck program.
 */

/**
 * The device fields the management webview renders - a projection of roku-deploy's RceDevice that
 * leaves the instance's stream credentials behind (see projectDeviceForWebview).
 */
export interface RceStateDevice {
    id: number;
    name: string;
    note?: string | null;
    deviceType: DeviceType;
    status?: DeviceStatus;
    serialNumber?: string | null;
    createdAt: string;
    lastSnapshotId?: number | null;
    lastSnapshotName?: string | null;
    snapshots?: number[];
    firmwareVersionId?: string | null;
    runningDevice?: {
        startedAt?: string | null;
        maxRuntime: number;
    } | null;
}
