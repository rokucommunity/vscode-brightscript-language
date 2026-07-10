import * as vscode from 'vscode';
import * as fsExtra from 'fs-extra';
import * as path from 'path';
import type { DeviceManager } from './DeviceManager';
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
 *   4. Environment variables the sdk reads: `ROKU_DEV_PASSWORD` (rk CLI fallback) and
 *      `RK_DEVICE_PASSWORD` (device pool / test client)
 *
 * Candidates are only ever *tried* against the device by UserInputManager, so a stale or
 * mismatched value costs one failed validation request and nothing else.
 *
 * Environment variables are read live on each collection, but the extension host captures
 * its environment when VSCode launches — changing them in a shell has no effect on a running
 * VSCode (even across a window reload); a full restart is required.
 *
 * This is rsg-specific and is kept in its own file to minimize conflicts when merging
 * upstream master changes into UserInputManager.
 */
export class SdkPasswordCandidateProvider implements DevicePasswordCandidateProvider {
    constructor(
        private deviceManager: DeviceManager,
        private rokuDevConfigProvider: RokuDevConfigProvider
    ) { }

    public getPasswordCandidates(host: string | undefined, serialNumber: string | undefined): Array<string | undefined> {
        return [
            this.getMergedDevicePassword(host),
            ...this.rokuDevConfigProvider.getPasswordCandidates(host),
            ...this.getLeasePasswords(host),
            process.env.ROKU_DEV_PASSWORD,
            process.env.RK_DEVICE_PASSWORD
        ];
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
}
