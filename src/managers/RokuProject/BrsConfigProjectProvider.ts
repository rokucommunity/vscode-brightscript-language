import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { util as bsUtil } from 'brighterscript';
import { util } from '../../util';
import { util as rokuDeployUtil } from 'roku-deploy';
import type { FileEntry } from 'roku-deploy';
import type { DiscoveredRokuProject, ProjectBuildResult, ProjectConfigProvider } from './RokuProjectManager';

interface IndexedConfig {
    configUri: vscode.Uri;
    files: FileEntry[];
    rootDir: string;
}

export class BrsConfigProjectProvider implements ProjectConfigProvider {

    public readonly configFileSelector: vscode.DocumentFilter[] = [
        { pattern: '**/brsconfig*.json', scheme: 'file' }
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
            // Convert the basename portion of the glob to a regex (e.g. "brsconfig*.json" → /^brsconfig.*\.json$/)
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
            if (rokuDeployUtil.getDestPath(filePath, entry.files, entry.rootDir)) {
                matches.push(entry.configUri);
            }
        }
        return Promise.resolve(matches);
    }

    /**
     * Reads the brsconfig JSON file and stores the resolved files + rootDir in the
     * index for findProjectConfigFromFile lookups.
     */
    public afterConfigRegistered(configUri: vscode.Uri): void {
        const projectDir = path.dirname(configUri.fsPath);
        try {
            const raw = JSON.parse(fs.readFileSync(configUri.fsPath, 'utf8'));
            this.configByPath.set(configUri.fsPath, {
                configUri: configUri,
                files: raw.files ?? [],
                rootDir: raw.rootDir ? path.resolve(projectDir, raw.rootDir) : projectDir
            });
        } catch {
            // brsconfig is invalid — skip silently
        }
    }

    public afterConfigUnregistered(configUri: vscode.Uri): void {
        this.configByPath.delete(configUri.fsPath);
    }

    public createProject(configUri: vscode.Uri): ProjectBuildResult {
        const project = this.toProject(configUri);
        const { projectDir, projectName } = project;
        const configFilename = path.basename(configUri.fsPath);
        // "brsconfig.build.json" → "build", "brsconfig.json" → ""
        const flavor = configFilename.replace(/^brsconfig\W?(.*)\.json$/, '$1').replace(/\W+/g, ' ').trim();
        const indexed = this.configByPath.get(configUri.fsPath);
        const files = indexed?.files ?? [];
        const rootDir = indexed?.rootDir ?? projectDir;

        const debugConfig: vscode.DebugConfiguration = {
            type: 'brightscript',
            request: 'launch',
            name: flavor ? `Debug ${projectName} (${flavor})` : `Debug ${projectName}`,
            rootDir: rootDir,
            files: files,
            host: '${promptForHost}',
            password: '${promptForPassword}'
        };

        return { project: project, debugConfig: debugConfig };
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
