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
 * Looks in three places, in this priority order (later overrides earlier):
 *   1. `~/roku-dev-config.json` (user home directory)
 *   2. `.roku/roku-dev-config.json` files walked upward from each workspace folder's parent
 *   3. `.roku/roku-dev-config.json` files discovered inside the workspace via file watcher
 *
 * Reactively reloads when any watched config file is created, changed, or deleted.
 *
 * This is rsg-specific and is kept in its own file to minimize conflicts when merging
 * upstream master changes into the DeviceManager.
 */
export class RokuDevConfigProvider implements vscode.Disposable {
    constructor() {
        this.parentConfigPaths = this.findParentRokuDevConfigPaths();
        this.setupWatcher();
    }

    private readonly _onDidChange = new vscode.EventEmitter<void>();
    public readonly onDidChange = this._onDidChange.event;

    /** Config files found by the workspace file watcher / findFiles (inside workspace) */
    private workspaceConfigPaths = new Set<string>();

    /** Config files found by walking upward from workspace folder parents */
    private parentConfigPaths: string[] = [];

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
                this.parentConfigPaths = this.findParentRokuDevConfigPaths();
                this._onDidChange.fire();
            })
        );

        // Discover existing config files in workspace, then notify
        void vscode.workspace.findFiles(
            '**/.roku/roku-dev-config.json',
            util.buildExcludeGlob(['**/node_modules/**'])
        ).then((uris) => {
            for (const uri of uris) {
                this.workspaceConfigPaths.add(uri.fsPath);
            }
            this._onDidChange.fire();
        });
    }

    /**
     * Walk upward from each workspace folder (deduped) looking for .roku/roku-dev-config.json files.
     * Returns only paths that actually exist on disk.
     */
    public findParentRokuDevConfigPaths(): string[] {
        const workspaceFolders = vscode.workspace.workspaceFolders ?? [];

        // Collect unique starting directories: the immediate parent of each workspace folder.
        // Deduping here means two sibling workspace folders sharing a parent only produce one walk.
        const startDirs = new Set<string>();
        for (const folder of workspaceFolders) {
            startDirs.add(path.dirname(folder.uri.fsPath));
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
     * Build the ordered list of config file paths to read.
     * Order matters: later entries override earlier ones during merge.
     */
    private getAllConfigPaths(): string[] {
        // Re-evaluate parent paths in case workspace state changed
        this.parentConfigPaths = this.findParentRokuDevConfigPaths();
        return [
            path.join(os.homedir(), 'roku-dev-config.json'),
            ...this.workspaceConfigPaths,
            ...this.parentConfigPaths
        ];
    }

    /**
     * Read all known roku-dev-config.json files and return the merged device list.
     */
    public getConfiguredDevices(): ConfiguredDevice[] {
        const deviceMap = new Map<string, ConfiguredDevice>();

        for (const configPath of this.getAllConfigPaths()) {
            try {
                if (!fsExtra.existsSync(configPath)) {
                    continue;
                }
                const config = fsExtra.readJsonSync(configPath);
                if (Array.isArray(config?.devices)) {
                    for (const device of config.devices) {
                        if (!device?.ip) {
                            continue;
                        }
                        const key = device.id || device.ip;
                        const existing = deviceMap.get(key);
                        deviceMap.set(key, {
                            host: device.ip,
                            name: device.name,
                            password: device.password,
                            ...existing
                        });
                    }
                }
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

        return Array.from(deviceMap.values());
    }

    public dispose() {
        for (const d of this.disposables) {
            d.dispose();
        }
        this.disposables = [];
        this._onDidChange.dispose();
    }
}
