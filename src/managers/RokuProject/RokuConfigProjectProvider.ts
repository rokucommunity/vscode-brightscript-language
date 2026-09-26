import * as path from 'path';
import * as vscode from 'vscode';
import type { TaskConfig } from '../../BrightScriptTaskProvider';
import type { DiscoveredRokuProject, ProjectBuildResult, ProjectConfigProvider } from './RokuProjectManager';
import { util } from '../../util';

const ROKU_CONFIG_FILENAME = 'roku-config.ts';

export class RokuConfigProjectProvider implements ProjectConfigProvider {

    public readonly configFileSelector: vscode.DocumentFilter[] = [
        { pattern: `**/${ROKU_CONFIG_FILENAME}`, scheme: 'file' }
    ];

    public readonly excludePatterns = ['**/node_modules/**'];

    public ownsConfig(uri: vscode.Uri): boolean {
        return path.basename(uri.fsPath) === ROKU_CONFIG_FILENAME;
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

    public async findProjectConfigFromFile(fileUri: vscode.Uri): Promise<vscode.Uri[]> {
        let dir = path.dirname(fileUri.fsPath);
        const root = vscode.workspace.getWorkspaceFolder(fileUri)?.uri.fsPath;

        while (true) {
            const candidate = vscode.Uri.file(path.join(dir, ROKU_CONFIG_FILENAME));
            try {
                await vscode.workspace.fs.stat(candidate);
                return [candidate];
            } catch {
                // not found at this level
            }

            if (!root || dir === root || path.dirname(dir) === dir) {
                break;
            }
            dir = path.dirname(dir);
        }

        return [];
    }

    public getOwnedPaths(configUri: vscode.Uri): Promise<string[]> {
        return Promise.resolve([configUri.fsPath, path.dirname(configUri.fsPath)]);
    }

    public createProject(configUri: vscode.Uri): ProjectBuildResult {
        const project = this.toProject(configUri);
        const { projectDir, projectName } = project;
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(configUri);
        const taskName = `build ${vscode.workspace.asRelativePath(configUri)}`;
        const taskConfig: TaskConfig = {
            command: 'npx --no rk build --dev',
            cwd: projectDir,
            workspaceFolder: workspaceFolder
        };
        const debugConfig: vscode.DebugConfiguration = {
            type: 'brightscript',
            request: 'launch',
            name: `Debug ${projectName}`,
            rootDir: path.join(projectDir, 'dist-build', 'bundle'),
            files: ['**/*'],
            preLaunchTask: `BrightScript: ${taskName}`,
            host: '${promptForHost}',
            password: '${promptForPassword}'
        };
        return { project: project, taskName: taskName, taskConfig: taskConfig, debugConfig: debugConfig };
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
