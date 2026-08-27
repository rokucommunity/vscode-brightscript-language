import * as path from 'path';
import * as vscode from 'vscode';
import { util as bsUtil } from 'brighterscript';
import { util } from '../../util';
import { util as rokuDeployUtil } from 'roku-deploy';
import type { FileEntry } from 'roku-deploy';
import type { TaskConfig } from '../../BrightScriptTaskProvider';
import type { DiscoveredRokuProject, ProjectBuildResult, ProjectConfigProvider } from './RokuProjectManager';

/** Default staging dir used by bsc when stagingDir is not set in bsconfig */
const BSC_DEFAULT_STAGING_DIR = path.join('out', '.roku-deploy-staging');

interface IndexedConfig {
    configUri: vscode.Uri;
    files: FileEntry[];
    rootDir: string;
    stagingDir: string;
}

export class BsConfigProjectProvider implements ProjectConfigProvider {

    public readonly configFileSelector: vscode.DocumentFilter[] = [
        { pattern: '**/bsconfig*.json', scheme: 'file' }
    ];

    public readonly excludePatterns = ['**/node_modules/**'];

    /**
     * Per-config store keyed by configUri.fsPath.
     * Populated by afterConfigRegistered; used by findProjectConfigFromFile.
     */
    private readonly configByPath = new Map<string, IndexedConfig>();

    public ownsConfig(uri: vscode.Uri): boolean {
        const basename = path.basename(uri.fsPath);
        return this.configFileSelector.some(selector => {
            if (selector.scheme && selector.scheme !== uri.scheme) {
                return false;
            }
            if (!selector.pattern) {
                return false;
            }
            // Convert the basename portion of the glob to a regex (e.g. "bsconfig*.json" → /^bsconfig.*\.json$/)
            const baseGlob = (selector.pattern as string).split('/').pop() ?? (selector.pattern as string);
            const regex = new RegExp('^' + baseGlob.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
            return regex.test(basename);
        });
    }

    public async findProjectConfigs(): Promise<vscode.Uri[]> {
        const exclude = util.buildExcludeGlob(this.excludePatterns);
        const results = await Promise.all(
            this.configFileSelector
                .filter(selector => selector.pattern)
                .map(selector => vscode.workspace.findFiles(selector.pattern as string, exclude))
        );
        return results.flat();
    }

    /**
     * Uses roku-deploy's getDestPath against each indexed config's files/rootDir.
     * Returns undefined (not owned) when getDestPath returns undefined for all configs.
     */
    public findProjectConfigFromFile(fileUri: vscode.Uri): Promise<vscode.Uri[]> {
        const filePath = bsUtil.driveLetterToLower(fileUri.fsPath);
        const matches: vscode.Uri[] = [];
        for (const entry of this.configByPath.values()) {
            // getDestPath returns undefined at runtime when the file doesn't match
            // (TypeScript types the return as string, but the implementation returns undefined for no match)
            if (rokuDeployUtil.getDestPath(filePath, entry.files, entry.rootDir)) {
                matches.push(entry.configUri);
            }
        }
        return Promise.resolve(matches);
    }

    /**
     * Loads and normalizes the bsconfig (handling extends chains) then stores
     * the resolved files + rootDir in the index for findProjectConfigFromFile lookups.
     */
    public afterConfigRegistered(configUri: vscode.Uri): void {
        const projectDir = path.dirname(configUri.fsPath);
        try {
            const rawConfig = bsUtil.loadConfigFile(configUri.fsPath, undefined, projectDir);
            const config = bsUtil.normalizeConfig(rawConfig);
            this.configByPath.set(configUri.fsPath, {
                configUri: configUri,
                files: config.files ?? [],
                rootDir: config.rootDir ?? projectDir,
                stagingDir: this.stagingDirFromConfig(config, projectDir)
            });
        } catch {
            // bsconfig is invalid — skip silently
        }
    }

    public afterConfigUnregistered(configUri: vscode.Uri): void {
        this.configByPath.delete(configUri.fsPath);
    }

    public createProject(configUri: vscode.Uri): ProjectBuildResult {
        const project = this.toProject(configUri);
        const { projectDir, projectName } = project;
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(configUri);
        const configFilename = path.basename(configUri.fsPath);
        // "bsconfig.build.json" → "build", "bsconfig.json" → ""
        const flavor = configFilename.replace(/^bsconfig\W?(.*)\.json$/, '$1').replace(/\W+/g, ' ').trim();
        const taskName = `build ${vscode.workspace.asRelativePath(configUri)}`;

        const taskConfig: TaskConfig = {
            // --project: explicit so bsc doesn't have to search for the config file
            // --retain-staging-folder: keep the staging dir after the build so the debugger can use it as rootDir
            // --source-map: generate source maps for debugging
            // --copy-to-staging: copy files to the staging dir even if they don't need to be transformed by bsc, so that the staging dir is a complete set of the files needed for debugging
            // --create-package false: don't create a zip package since the staging dir is used directly as the debug root
            command: `npx --no bsc --project "${configFilename}" --retain-staging-folder --source-map --copy-to-staging --create-package false`,
            cwd: projectDir,
            workspaceFolder: workspaceFolder
        };

        // Use the already-indexed stagingDir if available; otherwise resolve from file
        const stagingDir = this.configByPath.get(configUri.fsPath)?.stagingDir ??
            this.resolveStagingDir(configUri, projectDir);
        const debugConfig: vscode.DebugConfiguration = {
            type: 'brightscript',
            request: 'launch',
            name: flavor ? `Debug ${projectName} (${flavor})` : `Debug ${projectName}`,
            rootDir: stagingDir,
            // bsc already staged all files into stagingDir; include everything so the debugger deploys them
            files: ['**/*'],
            preLaunchTask: `BrightScript: ${taskName}`,
            host: '${promptForHost}',
            password: '${promptForPassword}'
        };

        return { project: project, taskName: taskName, taskConfig: taskConfig, debugConfig: debugConfig };
    }

    /**
     * Resolves the staging dir from a normalized config.
     * `loadConfigFile` resolves `stagingDir` to an absolute path but leaves the
     * deprecated `stagingFolderPath` as-is, so we must check both.
     */
    private stagingDirFromConfig(config: ReturnType<typeof bsUtil.normalizeConfig>, projectDir: string): string {
        if (config.stagingDir) {
            return config.stagingDir;
        }
        if (config.stagingFolderPath) {
            return path.resolve(projectDir, config.stagingFolderPath);
        }
        return path.join(projectDir, BSC_DEFAULT_STAGING_DIR);
    }

    /**
     * Fallback staging-dir resolution used when the config hasn't been indexed yet
     * (e.g. createProject is called before afterConfigRegistered fires).
     */
    private resolveStagingDir(configUri: vscode.Uri, projectDir: string): string {
        try {
            const rawConfig = bsUtil.loadConfigFile(configUri.fsPath, undefined, projectDir);
            const config = bsUtil.normalizeConfig(rawConfig);
            return this.stagingDirFromConfig(config, projectDir);
        } catch {
            return path.join(projectDir, BSC_DEFAULT_STAGING_DIR);
        }
    }

    private toProject(configUri: vscode.Uri): DiscoveredRokuProject {
        const projectDir = path.dirname(configUri.fsPath);
        return {
            configUri: configUri,
            projectDir: projectDir,
            projectName: path.basename(projectDir)
        };
    }
}
