import * as vscode from 'vscode';
import * as fsExtra from 'fs-extra';
import * as path from 'path';
import type { ConfiguredDevice, ConfiguredDeviceProvider, DeviceManager } from './DeviceManager';
import type { RokuDevConfigProvider } from './RokuDevConfigProvider';
import type { DevicePasswordCandidateProvider } from '../managers/UserInputManager';

/**
 * Supplies device password candidates from every source the rsg-sdk itself checks, so a
 * password that already works for `rk` CLI / test-client workflows never triggers a prompt:
 *
 *   1. The merged device's `configuredPassword` (covers provider-supplied devices matched by
 *      host, which the settings-based serial-number scan misses)
 *   2. roku-dev-config.json entries — `devices[].password` falling back to `defaultPassword`,
 *      workspace → ancestors → home (see {@link RokuDevConfigProvider.getPasswordCandidates})
 *   3. `.roku/leases/*.json` lease files — `passwordRef` indirection (`env:NAME` resolved from
 *      the environment; `literal:VALUE` only when `RK_ALLOW_LITERAL_PASSWORD=1`, the same gate
 *      the sdk applies)
 *   4. The env-var device pairs the sdk reads: `RK_DEVICE_IP`/`RK_DEVICE_PASSWORD` (device
 *      pool / test client) and `ROKU_DEV_TARGET`/`ROKU_DEV_PASSWORD` (rk CLI fallback)
 *
 * Also acts as a ConfiguredDeviceProvider so the env-var device pairs surface in the device
 * picker / devices view alongside config-file devices.
 *
 * Candidates are only ever *tried* against the device by UserInputManager, so a stale or
 * mismatched value costs one failed validation request and nothing else.
 *
 * Environment variables are read live on each collection, but the extension host captures
 * its environment when VSCode launches — changing them in a shell has no effect on a running
 * VSCode (even across a window reload); a full restart is required.
 *
 * This is rsg-specific and is kept in its own file to minimize conflicts when merging
 * upstream master changes into UserInputManager / DeviceManager.
 */
export class RsgSdkPasswordCandidateProvider implements DevicePasswordCandidateProvider, ConfiguredDeviceProvider, vscode.Disposable {
    constructor(
        private deviceManager: DeviceManager,
        private rokuDevConfigProvider: RokuDevConfigProvider
    ) { }

    private readonly _onDidChange = new vscode.EventEmitter<void>();
    /** The process environment never changes mid-session, so this never fires. */
    public readonly onDidChange = this._onDidChange.event;

    public getPasswordCandidates(host: string | undefined, serialNumber: string | undefined): Array<string | undefined> {
        return [
            this.getMergedDevicePassword(host),
            ...this.rokuDevConfigProvider.getPasswordCandidates(host),
            ...this.getLeasePasswords(host),
            ...this.getEnvDevices().map(x => x.password)
        ];
    }

    /**
     * ConfiguredDeviceProvider contract: surface the env-var device pairs as configured
     * devices. When both pairs point at the same host, `RK_DEVICE_IP` wins, matching the
     * sdk precedence.
     */
    public getConfiguredDevices(): ConfiguredDevice[] {
        const devices: ConfiguredDevice[] = [];
        const seenHosts = new Set<string>();

        for (const { name, host, password } of this.getEnvDevices()) {
            if (!host || seenHosts.has(host)) {
                continue;
            }
            seenHosts.add(host);
            const device: ConfiguredDevice = {
                host: host,
                name: name
            };
            // omit the key entirely when unset so a later-merged source can't be clobbered by undefined
            if (password) {
                device.password = password;
            }
            devices.push(device);
        }

        return devices;
    }

    /**
     * The single place the sdk's device-targeting environment pairs are read. Ordered
     * `RK_DEVICE_IP`/`RK_DEVICE_PASSWORD` (device pool / test client) first since it wins
     * over every other device source in the sdk, then `ROKU_DEV_TARGET`/`ROKU_DEV_PASSWORD`
     * (rk CLI fallback). Empty or whitespace-only values are treated as unset.
     */
    private getEnvDevices(): Array<{ name: string; host: string | undefined; password: string | undefined }> {
        const envPairs = [
            { ipVar: 'RK_DEVICE_IP', passwordVar: 'RK_DEVICE_PASSWORD' },
            { ipVar: 'ROKU_DEV_TARGET', passwordVar: 'ROKU_DEV_PASSWORD' }
        ];
        return envPairs.map(({ ipVar, passwordVar }) => ({
            name: `${ipVar} (env)`,
            host: process.env[ipVar]?.trim() || undefined,
            password: process.env[passwordVar]?.trim() || undefined
        }));
    }

    /**
     * The `configuredPassword` already resolved onto the DeviceManager's merged device for this
     * host, from whichever configured-device source supplied it.
     */
    private getMergedDevicePassword(host: string | undefined): string | undefined {
        if (!host) {
            return undefined;
        }
        return this.deviceManager.getAllDevices().find(x => x.ip === host)?.configuredPassword;
    }

    /**
     * Passwords from sdk device-pool lease files whose `ip` matches `host`. When
     * `RK_DEVICE_LEASE_ID` pins a specific lease (the sdk's attach mechanism), that lease is
     * tried before its siblings.
     */
    private getLeasePasswords(host: string | undefined): string[] {
        if (!host) {
            return [];
        }
        const results: string[] = [];
        const pinnedLeaseFileName = process.env.RK_DEVICE_LEASE_ID ? `${process.env.RK_DEVICE_LEASE_ID}.json` : undefined;

        for (const leaseDir of this.getLeaseDirs()) {
            let fileNames: string[];
            try {
                fileNames = fsExtra.readdirSync(leaseDir).filter(x => x.endsWith('.json'));
            } catch {
                continue; // no leases directory here
            }
            if (pinnedLeaseFileName) {
                fileNames.sort((a, b) => Number(b === pinnedLeaseFileName) - Number(a === pinnedLeaseFileName));
            }
            for (const fileName of fileNames) {
                try {
                    const lease = fsExtra.readJsonSync(path.join(leaseDir, fileName));
                    if (lease?.ip !== host) {
                        continue;
                    }
                    const password = this.resolvePasswordRef(lease.passwordRef);
                    if (password) {
                        results.push(password);
                    }
                } catch {
                    // unreadable or malformed lease — skip
                }
            }
        }
        return results;
    }

    /**
     * Directories to scan for lease files: `$RK_DEVICE_LEASE_DIR` when set, otherwise
     * `.roku/leases` under each workspace folder (the sdk's default is `<cwd>/.roku/leases`).
     */
    private getLeaseDirs(): string[] {
        if (process.env.RK_DEVICE_LEASE_DIR) {
            return [path.resolve(process.env.RK_DEVICE_LEASE_DIR)];
        }
        return (vscode.workspace.workspaceFolders ?? []).map(x => path.join(x.uri.fsPath, '.roku', 'leases'));
    }

    /**
     * Resolve a lease `passwordRef` the same way the sdk does: `env:NAME` reads the named
     * environment variable; `literal:VALUE` is honored only when `RK_ALLOW_LITERAL_PASSWORD=1`.
     */
    private resolvePasswordRef(ref: unknown): string | undefined {
        if (typeof ref !== 'string') {
            return undefined;
        }
        if (ref.startsWith('env:')) {
            return process.env[ref.slice('env:'.length)];
        }
        if (ref.startsWith('literal:') && process.env.RK_ALLOW_LITERAL_PASSWORD === '1') {
            return ref.slice('literal:'.length);
        }
        return undefined;
    }

    public dispose() {
        this._onDidChange.dispose();
    }
}
