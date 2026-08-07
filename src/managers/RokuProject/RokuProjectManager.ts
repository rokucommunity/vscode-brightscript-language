import * as path from 'path';
import * as vscode from 'vscode';
import type { BrightScriptTaskProvider, TaskConfig } from '../../BrightScriptTaskProvider';
import type { RokuProjectsViewProvider } from '../../viewProviders/RokuProjectsViewProvider';
import { BrsConfigProjectProvider } from './BrsConfigProjectProvider';
import { BsConfigProjectProvider } from './BsConfigProjectProvider';
import { ManifestProjectProvider } from './ManifestProjectProvider';
import { VscodeCommand } from '../../commands/VscodeCommand';
import { util } from '../../util';
import { createLogger } from '../../logging';

const logger = createLogger('RokuProjectManager');

export class RokuProjectManager {

    constructor(
        private taskRegistry: BrightScriptTaskProvider,
        private viewProvider?: RokuProjectsViewProvider
    ) { }

    // Resolved when the initial syncProjects() call completes. Callers that need
    // a complete project list (e.g. debug config providers) should await this.
    private _syncReadyResolve!: () => void;
    private readonly _syncReady: Promise<void> = new Promise<void>(resolve => {
        this._syncReadyResolve = resolve;
    });

    private readonly providers: ProjectConfigProvider[] = [
        new BsConfigProjectProvider(),
        new BrsConfigProjectProvider(),
        new ManifestProjectProvider()
    ];

    public register(context: vscode.ExtensionContext) {
        context.subscriptions.push(
            ...this.providers.map(provider => vscode.languages.registerCodeLensProvider(provider.configFileSelector, this)),
            vscode.debug.onDidStartDebugSession(() => this.statusBarItem?.hide()),
            vscode.debug.onDidTerminateDebugSession(() => this.syncStatusBar())
        );

        this.syncStatusBar(context);

        // Watch for config file changes across all providers
        for (const provider of this.providers) {
            for (const selector of provider.configFileSelector) {
                if (!selector.pattern) {
                    continue;
                }
                const watcher = vscode.workspace.createFileSystemWatcher(selector.pattern);
                const isExcluded = (uri: vscode.Uri) => util.isUriExcluded(uri, provider.excludePatterns);
                context.subscriptions.push(
                    watcher,
                    watcher.onDidCreate(uri => {
                        if (!isExcluded(uri)) {
                            this.registerProject(uri).catch(err => {
                                logger.error('Error registering Roku project:', err);
                            });
                        }
                    }),
                    watcher.onDidDelete(uri => {
                        if (!isExcluded(uri)) {
                            this.unregisterProject(uri);
                            // A previously-suppressed lower-priority project (e.g. a manifest beside
                            // the just-deleted bsconfig) may now be eligible. Debounced so a rapid
                            // delete/create rename pair only triggers one resync.
                            this.scheduleResync();
                        }
                    }),
                    watcher.onDidChange(uri => {
                        if (!isExcluded(uri)) {
                            // rebuilds the project from the updated file
                            this.unregisterProject(uri);
                            this.registerProject(uri).catch(err => {
                                logger.error('Error registering Roku project after change:', err);
                            });
                        }
                    })
                );
            }
        }

        context.subscriptions.push(
            vscode.workspace.onDidChangeConfiguration(e => {
                if (e.affectsConfiguration('files.exclude') || e.affectsConfiguration('search.exclude')) {
                    for (const project of [...this.discoveredProjects.values()]) {
                        this.unregisterProject(project.configUri);
                    }
                    this.syncProjects().catch(err => {
                        logger.error('Error resyncing Roku projects after exclude change:', err);
                    });
                }
            }),
            vscode.workspace.onDidChangeWorkspaceFolders(event => {
                // Unregister all projects from removed folders
                for (const removed of event.removed) {
                    for (const [projectDir] of [...this.discoveredProjects]) {
                        if (isSubdirectoryOf(removed.uri.fsPath, projectDir)) {
                            this.unregisterProject(this.discoveredProjects.get(projectDir).configUri);
                        }
                    }
                }
                // Discover projects in newly added folders.
                // findProjectConfigs() returns results across all workspace folders, so we
                // filter down to only the URIs that belong to the folder being added.
                for (const added of event.added) {
                    for (const provider of this.providers) {
                        Promise.resolve(provider.findProjectConfigs()).then(async uris => {
                            for (const uri of uris) {
                                if (isSubdirectoryOf(added.uri.fsPath, uri.fsPath)) {
                                    await this.registerProject(uri);
                                }
                            }
                        }).catch((err: unknown) => {
                            logger.error('Error syncing Roku projects for added workspace folder:', err);
                        });
                    }
                }
            })
        );

        // Populate the task registry with whatever is currently in the workspace
        this.syncProjects().catch(err => {
            logger.error('Error syncing Roku projects:', err);
        });
    }

    private statusBarItem: vscode.StatusBarItem | undefined;

    /**
     * Creates the status bar item on first call (registering it for disposal when a context is
     * provided), then syncs its visibility and the brightscript VS Code context variables to the
     * current project state. Safe to call any time projects change — no-ops gracefully if the
     * item hasn't been initialized yet.
     */
    private syncStatusBar(context?: vscode.ExtensionContext) {
        if (!this.statusBarItem) {
            this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 0);
            this.statusBarItem.command = VscodeCommand.debugRokuProject;
            this.statusBarItem.text = '$(debug-start) Debug Roku Project';
            this.statusBarItem.tooltip = 'Debug Roku Project';
            context?.subscriptions.push(this.statusBarItem);
        }
        const hasProjects = this.discoveredProjects.size > 0;
        void vscode.commands.executeCommand('setContext', 'brightscript.hasRokuProjects', hasProjects);
        const configPaths = Array.from(this.discoveredProjects.values()).map(p => p.configUri.fsPath);
        void vscode.commands.executeCommand('setContext', 'brightscript.rokuProjectConfigFiles', configPaths);
        if (hasProjects) {
            this.statusBarItem.show();
        } else {
            this.statusBarItem.hide();
        }
    }

    private discoveredProjects = new Map<string, DiscoveredRokuProject>();
    /** Tracks which provider index registered each projectDir, for priority-based exclusion. */
    private providerIndexByProjectDir = new Map<string, number>();

    private async syncProjects() {
        // findProjectConfigs() uses vscode.workspace.findFiles which searches across
        // all workspace folders automatically — no need to iterate them explicitly here.
        try {
            for (const provider of this.providers) {
                const uris = await provider.findProjectConfigs();
                for (const uri of uris) {
                    await this.registerProject(uri);
                }
            }
        } finally {
            this._syncReadyResolve();
        }
    }

    private async registerProject(uri: vscode.Uri) {
        const providerIndex = this.providers.findIndex(configProvider => configProvider.ownsConfig(uri));
        if (providerIndex === -1) {
            return;
        }
        const provider = this.providers[providerIndex];
        const { taskName, taskConfig, project } = provider.createProject(uri);

        // Idempotent: another project (typically registered via refreshLowerPriorityRegistrations
        // or a duplicate watcher event) already owns this dir. Skip without re-firing side effects.
        if (this.discoveredProjects.has(project.projectDir)) {
            return;
        }

        if (await this.isSupersededByHigherPriorityProvider(uri, providerIndex, project.projectDir)) {
            return;
        }

        if (taskName) {
            this.taskRegistry.registerTask(taskName, taskConfig);
        }
        this.discoveredProjects.set(project.projectDir, project);
        this.providerIndexByProjectDir.set(project.projectDir, providerIndex);
        this.viewProvider?.setProjects(Array.from(this.discoveredProjects.values()));
        this.syncStatusBar();
        provider.afterConfigRegistered?.(uri);
    }

    /** Debounce window before a queued resync actually runs, to coalesce delete+create rename pairs and bursts of file events. */
    private static readonly resyncDebounceMs = 250;
    private resyncTimer: ReturnType<typeof setTimeout> | undefined;

    /**
     * Schedules a debounced syncProjects() so previously-suppressed lower-priority projects can
     * surface after a higher-priority config is removed. Idempotency in registerProject keeps this
     * safe — already-registered projects are no-ops.
     */
    private scheduleResync(): void {
        if (this.resyncTimer) {
            clearTimeout(this.resyncTimer);
        }
        this.resyncTimer = setTimeout(() => {
            this.resyncTimer = undefined;
            this.syncProjects().catch(err => {
                logger.error('Error during scheduled resync of Roku projects:', err);
            });
        }, RokuProjectManager.resyncDebounceMs);
    }

    /**
     * Returns true if a higher-priority (lower-index) provider already owns this project's
     * territory. Cheap dir-overlap check first, then falls back to the more expensive
     * cross-provider claim query so most calls short-circuit without IO.
     */
    private async isSupersededByHigherPriorityProvider(uri: vscode.Uri, providerIndex: number, projectDir: string): Promise<boolean> {
        for (const [claimedDir, claimedIndex] of this.providerIndexByProjectDir) {
            if (claimedIndex < providerIndex && isSubdirectoryOf(claimedDir, projectDir)) {
                return true;
            }
        }
        for (let higherIndex = 0; higherIndex < providerIndex; higherIndex++) {
            const claims = await this.providers[higherIndex].findProjectConfigFromFile(uri);
            if (claims.length > 0) {
                return true;
            }
        }
        return false;
    }

    private unregisterProject(uri: vscode.Uri) {
        const provider = this.providers.find(configProvider => configProvider.ownsConfig(uri));
        if (!provider) {
            return;
        }
        provider.afterConfigUnregistered?.(uri);
        const { taskName, project } = provider.createProject(uri);
        if (taskName) {
            this.taskRegistry.unregisterTask(taskName);
        }
        this.discoveredProjects.delete(project.projectDir);
        this.providerIndexByProjectDir.delete(project.projectDir);
        this.viewProvider?.setProjects(Array.from(this.discoveredProjects.values()));
        this.syncStatusBar();
    }

    public provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
        return [
            new vscode.CodeLens(new vscode.Range(0, 0, 0, 0), {
                title: '$(debug-alt) Debug Roku Project',
                command: VscodeCommand.debugRokuProject,
                arguments: [document.uri]
            })
        ];
    }

    public async provideDebugConfigurations(folder?: vscode.WorkspaceFolder): Promise<vscode.DebugConfiguration[]> {
        await this._syncReady;
        const configs: vscode.DebugConfiguration[] = [];
        for (const project of this.discoveredProjects.values()) {
            if (folder && !isSubdirectoryOf(folder.uri.fsPath, project.projectDir)) {
                continue;
            }
            const provider = this.providers.find(configProvider => configProvider.ownsConfig(project.configUri));
            if (provider) {
                configs.push(provider.createProject(project.configUri).debugConfig);
            }
        }
        return configs;
    }

    /**
     * Called by BrightScriptDebugConfigurationProvider when F5 is pressed with no launch.json.
     * Collects every config URI that claims the active file across all providers. If exactly one
     * match is found it is used directly; if multiple configs claim the file the user is prompted
     * to pick one.
     */
    public async resolveDebugConfigFromActiveFile(): Promise<vscode.DebugConfiguration | undefined> {
        await this._syncReady;
        const activeFile = vscode.window.activeTextEditor?.document.uri;
        if (!activeFile) {
            return undefined;
        }

        const allMatches: vscode.Uri[] = [];
        for (const provider of this.providers) {
            const uris = await provider.findProjectConfigFromFile(activeFile);
            allMatches.push(...uris);
        }

        // Mirror registerProject's precedence so F5 silently picks the richer config
        // (e.g. bsconfig.json wins over a manifest it already owns).
        const filteredMatches: vscode.Uri[] = [];
        for (const uri of allMatches) {
            const providerIndex = this.providers.findIndex(configProvider => configProvider.ownsConfig(uri));
            if (providerIndex === -1) {
                continue;
            }
            const projectDir = this.providers[providerIndex].createProject(uri).project.projectDir;
            if (!(await this.isSupersededByHigherPriorityProvider(uri, providerIndex, projectDir))) {
                filteredMatches.push(uri);
            }
        }

        if (filteredMatches.length === 0) {
            return undefined;
        }

        let targetUri: vscode.Uri;
        if (filteredMatches.length === 1) {
            targetUri = filteredMatches[0];
        } else {
            const multiRoot = (vscode.workspace.workspaceFolders?.length ?? 0) > 1;
            const items = filteredMatches.map(uri => {
                const provider = this.providers.find(configProvider => configProvider.ownsConfig(uri));
                return {
                    label: provider?.createProject(uri).debugConfig.name ?? path.basename(path.dirname(uri.fsPath)),
                    // asRelativePath with false omits the workspace folder prefix, keeping it concise
                    description: vscode.workspace.asRelativePath(uri, false),
                    // In multi-root workspaces show the workspace folder name below so it's clear which root owns the config
                    detail: multiRoot ? vscode.workspace.getWorkspaceFolder(uri)?.name : undefined,
                    uri: uri
                };
            });
            const picked = await vscode.window.showQuickPick(items, {
                placeHolder: 'Select a project to debug:'
            });
            if (!picked) {
                return undefined;
            }
            targetUri = picked.uri;
        }

        const provider = this.providers.find(configProvider => configProvider.ownsConfig(targetUri));
        if (!provider) {
            return undefined;
        }
        const { taskName, taskConfig, debugConfig } = provider.createProject(targetUri);
        if (taskName) {
            this.taskRegistry.registerTask(taskName, taskConfig);
        }
        return debugConfig;
    }

    public async debugProject(uri?: vscode.Uri) {
        let targetUri = uri;

        if (!targetUri) {
            const configs = Array.from(this.discoveredProjects.values()).map(p => p.configUri);
            if (configs.length === 0) {
                void vscode.window.showWarningMessage('Something went wrong.');
                return;
            }
            if (configs.length === 1) {
                targetUri = configs[0];
            } else {
                const multiRoot = (vscode.workspace.workspaceFolders?.length ?? 0) > 1;
                const items = configs.map(uri => {
                    const provider = this.providers.find(configProvider => configProvider.ownsConfig(uri));
                    return {
                        label: provider?.createProject(uri).debugConfig.name ?? path.basename(path.dirname(uri.fsPath)),
                        description: vscode.workspace.asRelativePath(uri, false),
                        detail: multiRoot ? vscode.workspace.getWorkspaceFolder(uri)?.name : undefined,
                        uri: uri
                    };
                });
                const picked = await vscode.window.showQuickPick(items, {
                    placeHolder: 'Select a project to debug:'
                });
                if (!picked) {
                    return;
                }
                targetUri = picked.uri;
            }
        }

        const provider = this.providers.find(configProvider => configProvider.ownsConfig(targetUri));
        if (!provider) {
            return;
        }
        const { taskName, taskConfig, debugConfig } = provider.createProject(targetUri);
        // Register the task before startDebugging so the preLaunchTask lookup succeeds
        // regardless of whether syncProjects() has completed yet.
        if (taskName) {
            this.taskRegistry.registerTask(taskName, taskConfig);
        }
        await vscode.debug.startDebugging(
            vscode.workspace.getWorkspaceFolder(targetUri),
            debugConfig
        );
    }

}

function isSubdirectoryOf(parent: string, child: string): boolean {
    const rel = path.relative(parent, child);
    return rel !== '' && !rel.startsWith('..');
}

/** A Roku project discovered in the workspace, identified by its config file. */
export interface DiscoveredRokuProject {
    configUri: vscode.Uri;
    projectDir: string;
    projectName: string;
}

/**
 * The output of a provider's createProject() call. Bundles together everything
 * RokuProjectManager needs to register a project: the discovered project metadata,
 * an optional pre-launch build task, and the VS Code debug configuration to launch.
 */
export interface ProjectBuildResult {
    project: DiscoveredRokuProject;
    taskName?: string;
    taskConfig?: TaskConfig;
    debugConfig: vscode.DebugConfiguration;
}

/**
 * Implemented by project-type-specific providers to supply the config discovery
 * and build logic that RokuProjectManager orchestrates.
 */
export interface ProjectConfigProvider {
    /** DocumentFilter(s) used to register CodeLens over project config files. */
    readonly configFileSelector: vscode.DocumentFilter[];
    /** Glob patterns this provider excludes from file discovery and watcher events. */
    readonly excludePatterns: string[];
    /** Returns true if this provider is responsible for the given config URI. */
    ownsConfig(uri: vscode.Uri): boolean;
    /** Find all project config file URIs in the workspace. */
    findProjectConfigs(): Thenable<vscode.Uri[]>;
    /**
     * Given an open file URI, return all config URIs that own it.
     * A file may be claimed by more than one config (e.g. a shared source file
     * referenced by multiple project configs), so callers must handle multiple results.
     * Providers without a file index may walk up the directory tree and return
     * at most one result.
     */
    findProjectConfigFromFile(fileUri: vscode.Uri): Promise<vscode.Uri[]>;
    /** Build project info, task metadata, and a debug config from a project config URI. */
    createProject(configUri: vscode.Uri): ProjectBuildResult;
    /**
     * Called after a config URI is registered. Providers may use this to update
     * internal file-ownership lookups.
     */
    afterConfigRegistered?(configUri: vscode.Uri): void;
    /**
     * Called after a config URI is unregistered. Providers may use this to clean
     * up entries in internal file-ownership lookups.
     */
    afterConfigUnregistered?(configUri: vscode.Uri): void;
}
