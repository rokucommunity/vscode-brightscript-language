import * as vscode from 'vscode';
import type { ConfiguredDevice } from './DeviceManager';

/**
 * Surfaces devices the rsg-sdk would target purely from environment variables, so they show
 * up in the device picker / devices view alongside config-file devices:
 *
 *   - `RK_DEVICE_IP` (+ `RK_DEVICE_PASSWORD`) — the device pool / test-client pinned device
 *   - `ROKU_DEV_TARGET` (+ `ROKU_DEV_PASSWORD`) — the rk CLI fallback device
 *
 * Note: the extension host captures its environment when VSCode launches. Changing these
 * variables in a shell has no effect on a running VSCode (even across a window reload) —
 * the user must fully restart VSCode from an environment with the new values.
 *
 * This is rsg-specific and is kept in its own file to minimize conflicts when merging
 * upstream master changes into the DeviceManager.
 */
export class SdkEnvDeviceProvider implements vscode.Disposable {
    private readonly _onDidChange = new vscode.EventEmitter<void>();
    /** The process environment never changes mid-session, so this never fires. */
    public readonly onDidChange = this._onDidChange.event;

    public getConfiguredDevices(): ConfiguredDevice[] {
        const devices: ConfiguredDevice[] = [];
        const seenHosts = new Set<string>();

        // RK_DEVICE_IP first: in the sdk it wins over every other device source
        const envPairs = [
            { ipVar: 'RK_DEVICE_IP', passwordVar: 'RK_DEVICE_PASSWORD' },
            { ipVar: 'ROKU_DEV_TARGET', passwordVar: 'ROKU_DEV_PASSWORD' }
        ];

        for (const { ipVar, passwordVar } of envPairs) {
            const host = process.env[ipVar]?.trim();
            if (!host || seenHosts.has(host)) {
                continue;
            }
            seenHosts.add(host);
            const device: ConfiguredDevice = {
                host: host,
                name: `${ipVar} (env)`
            };
            // omit the key entirely when unset so a later-merged source can't be clobbered by undefined
            const password = process.env[passwordVar]?.trim();
            if (password) {
                device.password = password;
            }
            devices.push(device);
        }

        return devices;
    }

    public dispose() {
        this._onDidChange.dispose();
    }
}
