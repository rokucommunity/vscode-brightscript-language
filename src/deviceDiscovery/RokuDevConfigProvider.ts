import * as vscode from 'vscode';
import * as fsExtra from 'fs-extra';
import * as path from 'path';
import * as os from 'os';
import { util } from '../util';
import type { ConfiguredDevice } from './DeviceManager';

/**
 * Discovers Roku devices defined in `.roku/roku-dev-config.json` files and exposes them
 * as additional configured devices to the DeviceManager.
 *
 * Discovery sources, ordered from most-specific to least-specific:
 *   1. Every `.roku/roku-dev-config.json` found inside the workspace (any depth)
 *   2. Ancestor `.roku/roku-dev-config.json` files walked upward from each workspace folder
 *   3. `~/roku-dev-config.json` (or `$ROKU_DEV_CONFIG_PATH` when set, matching the sdk's
 *      override of the home-level config location)
 *
 * All unique devices found across all sources are returned. When the same device key (id, or
 * ip as fallback) appears in multiple configs, the more-specific config wins.
 *
 * Reactively reloads when workspace `.roku/roku-dev-config.json` files are created, changed,
 * or deleted, and when workspace folders change. Ancestor and home configs are re-read every
 * time devices are requested.
 *
 * This is rsg-specific and is kept in its own file to minimize conflicts when merging
 * upstream master changes into the DeviceManager.
 */
export class RokuDevConfigProvider implements vscode.Disposable {
    constructor() {
        this.setupWatcher();
        void this.refreshWorkspaceConfigPaths();
    }

    private readonly _onDidChange = new vscode.EventEmitter<void>();
    public readonly onDidChange = this._onDidChange.event;

    /** Config files found inside the workspace via findFiles / file watcher. */
    private workspaceConfigPaths = new Set<string>();

    /** Tracks last seen parse error per config path so we don't spam the same warning on every reload */
    private loadErrors = new Map<string, string>();

    private disposables: vscode.Disposable[] = [];

    private setupWatcher() {
        const watcher = vscode.workspace.createFileSystemWatcher('**/.roku/roku-dev-config.json');
        this.disposables.push(watcher);

        const onFound = (uri: vscode.Uri) => {
            this.workspaceConfigPaths.add(uri.fsPath);
            this._onDidChange.fire();
        };

        this.disposables.push(
            watcher.onDidCreate(onFound),
            watcher.onDidChange(onFound),
            watcher.onDidDelete((uri) => {
                this.workspaceConfigPaths.delete(uri.fsPath);
                this._onDidChange.fire();
            }),
            vscode.workspace.onDidChangeWorkspaceFolders(() => {
                void this.refreshWorkspaceConfigPaths();
                this._onDidChange.fire();
            })
        );
    }

    /** Find every `.roku/roku-dev-config.json` inside the current workspace (any depth). */
    private async refreshWorkspaceConfigPaths() {
        const uris = await vscode.workspace.findFiles(
            '**/.roku/roku-dev-config.json',
            util.buildExcludeGlob(['**/node_modules/**'])
        );
        this.workspaceConfigPaths.clear();
        for (const uri of uris) {
            this.workspaceConfigPaths.add(uri.fsPath);
        }
        this._onDidChange.fire();
    }

    /**
     * Force a full re-scan of all sources. Called when the user clicks the refresh
     * button in the devices view.
     */
    public async refresh(): Promise<void> {
        // Drop cached parse errors so any newly-fixed configs can warn again on next failure
        this.loadErrors.clear();
        await this.refreshWorkspaceConfigPaths();
        // ancestor + home paths are re-read on demand in getConfiguredDevices(),
        // so refreshing the workspace paths and firing onDidChange is enough.
    }

    /**
     * Walk upward from each workspace folder (deduped), starting at the folder itself,
     * collecting every `<dir>/.roku/roku-dev-config.json` that exists.
     */
    public findAncestorRokuDevConfigPaths(): string[] {
        const workspaceFolders = vscode.workspace.workspaceFolders ?? [];

        const startDirs = new Set<string>();
        for (const folder of workspaceFolders) {
            startDirs.add(folder.uri.fsPath);
        }

        const visitedDirs = new Set<string>();
        const result: string[] = [];

        for (const startDir of startDirs) {
            let current = startDir;
            while (true) {
                if (visitedDirs.has(current)) {
                    break;
                }
                visitedDirs.add(current);

                const candidate = path.join(current, '.roku', 'roku-dev-config.json');
                if (fsExtra.pathExistsSync(candidate)) {
                    result.push(candidate);
                }

                const parent = path.dirname(current);
                if (parent === current) {
                    break;
                }
                current = parent;
            }
        }

        return result;
    }

    /**
     * Read and parse every known roku-dev-config.json, ordered most-specific to least-specific:
     * workspace-internal → ancestor walk → home (or `$ROKU_DEV_CONFIG_PATH` when set). Missing
     * files are skipped; unreadable files are skipped with a once-per-error warning.
     */
    private readConfigs(): RokuDevConfigJson[] {
        const configs: RokuDevConfigJson[] = [];
        const seenPaths = new Set<string>();

        const homeConfigPath = process.env.ROKU_DEV_CONFIG_PATH
            ? path.resolve(process.env.ROKU_DEV_CONFIG_PATH)
            : path.join(os.homedir(), 'roku-dev-config.json');
        const orderedPaths = [
            ...this.workspaceConfigPaths,
            ...this.findAncestorRokuDevConfigPaths(),
            homeConfigPath
        ];

        for (const configPath of orderedPaths) {
            if (seenPaths.has(configPath)) {
                continue;
            }
            seenPaths.add(configPath);
            try {
                if (!fsExtra.existsSync(configPath)) {
                    continue;
                }
                configs.push(fsExtra.readJsonSync(configPath));
                this.loadErrors.delete(configPath);
            } catch (e) {
                // Dedupe per-path so a stale broken file doesn't spam on every reload.
                const message = e instanceof Error ? e.message : String(e);
                if (this.loadErrors.get(configPath) !== message) {
                    this.loadErrors.set(configPath, message);
                    console.warn(`Failed to load roku-dev-config.json from ${configPath}: ${message}`);
                }
            }
        }

        return configs;
    }

    /**
     * Read all known roku-dev-config.json files and return the merged device list.
     * Order: workspace-internal (most specific) → ancestor walk → home (least specific).
     * First write wins per key, so more-specific entries override less-specific ones.
     */
    public getConfiguredDevices(): ConfiguredDevice[] {
        const deviceMap = new Map<string, ConfiguredDevice>();

        for (const config of this.readConfigs()) {
            if (!Array.isArray(config?.devices)) {
                continue;
            }
            const defaultPassword = typeof config.defaultPassword === 'string' ? config.defaultPassword : undefined;
            for (const device of config.devices) {
                if (!device?.ip) {
                    continue;
                }
                const key = device.id || device.ip;
                if (deviceMap.has(key)) {
                    continue; // already set by a more-specific config
                }
                deviceMap.set(key, {
                    host: device.ip,
                    name: device.name,
                    // per-device password falls back to that file's defaultPassword, matching the sdk's merge
                    password: device.password ?? defaultPassword
                });
            }
        }

        return Array.from(deviceMap.values());
    }

    /**
     * Candidate passwords for `host`, ordered the way the sdk resolves them: the matched
     * device's password (falling back to that file's defaultPassword) from each config in
     * specificity order, then every remaining defaultPassword — the sdk requires
     * defaultPassword for sideload even when the device isn't registered in the config.
     */
    public getPasswordCandidates(host: string | undefined): string[] {
        const matched: string[] = [];
        const defaults: string[] = [];

        for (const config of this.readConfigs()) {
            const defaultPassword = typeof config?.defaultPassword === 'string' ? config.defaultPassword : undefined;
            if (host && Array.isArray(config?.devices)) {
                for (const device of config.devices) {
                    const password = device?.ip === host ? (device.password ?? defaultPassword) : undefined;
                    if (password) {
                        matched.push(password);
                    }
                }
            }
            if (defaultPassword) {
                defaults.push(defaultPassword);
            }
        }

        return [...matched, ...defaults];
    }

    public dispose() {
        for (const d of this.disposables) {
            d.dispose();
        }
        this.disposables = [];
        this._onDidChange.dispose();
    }
}

// ---- types ----

/**
 * Parsed roku-dev-config.json contents (the subset this provider reads). Matches the sdk's
 * `DevicesJson` shape; parsed from user-authored JSON so every field may be missing or malformed.
 */
interface RokuDevConfigJson {
    defaultPassword?: string;
    devices?: Array<{
        id?: string;
        ip?: string;
        name?: string;
        password?: string;
    }>;
}
