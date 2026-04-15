import * as path from 'path';
import * as vscode from 'vscode';
import type { BrightScriptTaskProvider, TaskConfig } from '../../BrightScriptTaskProvider';
import type { RokuProjectsViewProvider } from '../../viewProviders/RokuProjectsViewProvider';
import { ProjectTreeItem } from '../../viewProviders/RokuProjectsViewProvider';
import { BrsConfigProjectProvider } from './BrsConfigProjectProvider';
import { BsConfigProjectProvider } from './BsConfigProjectProvider';

export const DEBUG_ROKU_PROJECT_COMMAND = 'extension.brightscript.debugRokuProject';

export interface DiscoveredRokuProject {
    configUri: vscode.Uri;
    projectDir: string;
    projectName: string;
}

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
    /** Returns true if this provider is responsible for the given config URI. */
    ownsConfig(uri: vscode.Uri): boolean;
    /** Find all project config file URIs in the workspace. */
    findProjectConfigs(): Thenable<vscode.Uri[]>;
    /**
     * Given an open file URI, return all config URIs that own it.
     * A file may be claimed by more than one config (e.g. a shared source file
     * referenced by multiple bsconfigs), so callers must handle multiple results.
     * Providers without a file index may walk up the directory tree and return
     * at most one result.
     */
    findProjectConfigFromFile(fileUri: vscode.Uri): Promise<vscode.Uri[]>;
    /** Build project info, task metadata, and a debug config from a project config URI. */
    buildProject(configUri: vscode.Uri): ProjectBuildResult;
    /**
     * Called after a config URI is registered. Providers may use this to update
     * internal file-ownership indexes.
     */
    afterConfigRegistered?(configUri: vscode.Uri): void;
    /**
     * Called after a config URI is unregistered. Providers may use this to clean
     * up entries in internal file-ownership indexes.
     */
    afterConfigUnregistered?(configUri: vscode.Uri): void;
}

export class RokuProjectManager {

    constructor(
        private taskRegistry: BrightScriptTaskProvider,
        private viewProvider?: RokuProjectsViewProvider
    ) { }

    private readonly providers: ProjectConfigProvider[] = [
        new BsConfigProjectProvider(),
        new BrsConfigProjectProvider()
    ];

    public register(context: vscode.ExtensionContext) {
        const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 0);
        statusBarItem.command = DEBUG_ROKU_PROJECT_COMMAND;
        statusBarItem.text = '$(debug-start) Debug Roku Project';
        statusBarItem.tooltip = 'Debug Roku Project';

        context.subscriptions.push(
            statusBarItem,
            vscode.commands.registerCommand(DEBUG_ROKU_PROJECT_COMMAND, (arg?: vscode.Uri | ProjectTreeItem) => {
                const uri = arg instanceof ProjectTreeItem ? arg.project.configUri : arg;
                void this.debugProject(uri);
            }),
            ...this.providers.map(provider => vscode.languages.registerCodeLensProvider(provider.configFileSelector, this)),
            vscode.debug.onDidStartDebugSession(() => statusBarItem.hide()),
            vscode.debug.onDidTerminateDebugSession(() => this.updateStatusBar(statusBarItem))
        );

        this.setStatusBar(statusBarItem);

        // Watch for config file changes across all providers
        for (const provider of this.providers) {
            for (const selector of provider.configFileSelector) {
                if (!selector.pattern) {
                    continue;
                }
                const watcher = vscode.workspace.createFileSystemWatcher(selector.pattern);
                context.subscriptions.push(
                    watcher,
                    watcher.onDidCreate(uri => this.registerProject(uri)),
                    watcher.onDidDelete(uri => this.unregisterProject(uri)),
                    watcher.onDidChange(uri => {
                        // rebuilds the project from the updated file
                        this.unregisterProject(uri);
                        this.registerProject(uri);
                    })
                );
            }
        }

        context.subscriptions.push(
            vscode.workspace.onDidChangeWorkspaceFolders(event => {
                // Unregister all projects from removed folders
                for (const removed of event.removed) {
                    for (const [projectDir] of [...this.discoveredProjects]) {
                        if (projectDir.startsWith(removed.uri.fsPath + path.sep)) {
                            this.unregisterProject(this.discoveredProjects.get(projectDir).configUri);
                        }
                    }
                }
                // Discover projects in newly added folders.
                // findProjectConfigs() returns results across all workspace folders, so we
                // filter down to only the URIs that belong to the folder being added.
                for (const added of event.added) {
                    for (const provider of this.providers) {
                        Promise.resolve(provider.findProjectConfigs()).then(uris => {
                            for (const uri of uris) {
                                if (uri.fsPath.startsWith(added.uri.fsPath + path.sep)) {
                                    this.registerProject(uri);
                                }
                            }
                        }).catch((err: unknown) => {
                            console.error('Error syncing Roku projects for added workspace folder:', err);
                        });
                    }
                }
            })
        );

        // Populate the task registry with whatever is currently in the workspace
        this.syncProjects().catch(err => {
            console.error('Error syncing Roku projects:', err);
        });
    }

    // -------------------------------------------------------------------------
    // Status bar
    // -------------------------------------------------------------------------

    private statusBarItem: vscode.StatusBarItem | undefined;

    public setStatusBar(item: vscode.StatusBarItem) {
        this.statusBarItem = item;
    }

    public updateStatusBar(item: vscode.StatusBarItem = this.statusBarItem) {
        const hasProjects = this.discoveredProjects.size > 0;
        void vscode.commands.executeCommand('setContext', 'brightscript.hasRokuProjects', hasProjects);
        const configPaths = Array.from(this.discoveredProjects.values()).map(provider => provider.configUri.fsPath);
        void vscode.commands.executeCommand('setContext', 'brightscript.rokuProjectConfigFiles', configPaths);
        if (!item) {
            return;
        }
        if (hasProjects) {
            item.show();
        } else {
            item.hide();
        }
    }

    // -------------------------------------------------------------------------
    // Project registry management
    // -------------------------------------------------------------------------

    private discoveredProjects = new Map<string, DiscoveredRokuProject>();
    /** Tracks which provider index registered each projectDir, for priority-based exclusion. */
    private providerIndexByProjectDir = new Map<string, number>();

    public async syncProjects() {
        // findProjectConfigs() uses vscode.workspace.findFiles which searches across
        // all workspace folders automatically — no need to iterate them explicitly here.
        for (const provider of this.providers) {
            const uris = await provider.findProjectConfigs();
            for (const uri of uris) {
                this.registerProject(uri);
            }
        }
    }

    public registerProject(uri: vscode.Uri) {
        const providerIndex = this.providers.findIndex(configProvider => configProvider.ownsConfig(uri));
        if (providerIndex === -1) {
            return;
        }
        const provider = this.providers[providerIndex];
        const { taskName, taskConfig, project } = provider.buildProject(uri);

        // Skip if a higher-priority provider (lower index) already owns an ancestor directory.
        for (const [claimedDir, claimedIndex] of this.providerIndexByProjectDir) {
            if (claimedIndex < providerIndex && project.projectDir.startsWith(claimedDir + path.sep)) {
                return;
            }
        }

        if (taskName) {
            this.taskRegistry.registerTask(taskName, taskConfig);
        }
        this.discoveredProjects.set(project.projectDir, project);
        this.providerIndexByProjectDir.set(project.projectDir, providerIndex);
        this.viewProvider?.setProjects(Array.from(this.discoveredProjects.values()));
        this.updateStatusBar();
        provider.afterConfigRegistered?.(uri);
    }

    public unregisterProject(uri: vscode.Uri) {
        const provider = this.providers.find(configProvider => configProvider.ownsConfig(uri));
        if (!provider) {
            return;
        }
        provider.afterConfigUnregistered?.(uri);
        const { taskName, project } = provider.buildProject(uri);
        if (taskName) {
            this.taskRegistry.unregisterTask(taskName);
        }
        this.discoveredProjects.delete(project.projectDir);
        this.providerIndexByProjectDir.delete(project.projectDir);
        this.viewProvider?.setProjects(Array.from(this.discoveredProjects.values()));
        this.updateStatusBar();
    }

    // -------------------------------------------------------------------------
    // CodeLensProvider
    // -------------------------------------------------------------------------

    public provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
        return [
            new vscode.CodeLens(new vscode.Range(0, 0, 0, 0), {
                title: '$(debug-alt) Debug Roku Project',
                command: DEBUG_ROKU_PROJECT_COMMAND,
                arguments: [document.uri]
            })
        ];
    }

    // -------------------------------------------------------------------------
    // DebugConfigurationProvider (Dynamic + Initial)
    // -------------------------------------------------------------------------

    public provideDebugConfigurations(folder?: vscode.WorkspaceFolder): vscode.DebugConfiguration[] {
        const configs: vscode.DebugConfiguration[] = [];
        for (const project of this.discoveredProjects.values()) {
            if (folder && !project.projectDir.startsWith(folder.uri.fsPath + path.sep)) {
                continue;
            }
            const provider = this.providers.find(configProvider => configProvider.ownsConfig(project.configUri));
            if (provider) {
                configs.push(provider.buildProject(project.configUri).debugConfig);
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
        const activeFile = vscode.window.activeTextEditor?.document.uri;
        if (!activeFile) {
            return undefined;
        }

        const allMatches: vscode.Uri[] = [];
        for (const provider of this.providers) {
            const uris = await provider.findProjectConfigFromFile(activeFile);
            allMatches.push(...uris);
        }

        if (allMatches.length === 0) {
            return undefined;
        }

        let targetUri: vscode.Uri;
        if (allMatches.length === 1) {
            targetUri = allMatches[0];
        } else {
            const multiRoot = (vscode.workspace.workspaceFolders?.length ?? 0) > 1;
            const items = allMatches.map(uri => {
                const provider = this.providers.find(configProvider => configProvider.ownsConfig(uri));
                return {
                    label: provider?.buildProject(uri).debugConfig.name ?? path.basename(path.dirname(uri.fsPath)),
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
        const { taskName, taskConfig, debugConfig } = provider.buildProject(targetUri);
        if (taskName) {
            this.taskRegistry.registerTask(taskName, taskConfig);
        }
        return debugConfig;
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    private async debugProject(uri?: vscode.Uri) {
        let targetUri = uri;

        if (!targetUri) {
            const allUris = await Promise.all(this.providers.map(provider => provider.findProjectConfigs()));
            const configs = allUris.flat();
            if (configs.length === 0) {
                void vscode.window.showWarningMessage('Something went wrong.');
                return;
            }
            if (configs.length === 1) {
                targetUri = configs[0];
            } else {
                const items = configs.map(uri => ({
                    label: path.basename(path.dirname(uri.fsPath)),
                    description: vscode.workspace.asRelativePath(uri),
                    uri: uri
                }));
                const picked = await vscode.window.showQuickPick(items, {
                    placeHolder: 'Please select to debug:'
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
        const { taskName, taskConfig, debugConfig } = provider.buildProject(targetUri);
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
