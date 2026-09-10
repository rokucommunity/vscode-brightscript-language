import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { util as bsUtil } from 'brighterscript';
import { util as rokuDeployUtil } from 'roku-deploy';
import { util } from '../../util';
import { BrightScriptDebugConfigurationProvider } from '../../DebugConfigurationProvider';
import type { DiscoveredRokuProject, ProjectBuildResult, ProjectConfigProvider } from './RokuProjectManager';

export class ManifestProjectProvider implements ProjectConfigProvider {

    public readonly configFileSelector: vscode.DocumentFilter[] = [
        { pattern: '**/manifest', scheme: 'file' }
    ];

    // Roku build output trees often contain a staged copy of manifest + source/ + components/,
    // which trips the looksLikeRokuProject signal and surfaces a phantom duplicate project.
    // Excluding the common output dirs keeps discovery focused on the real source tree.
    public readonly excludePatterns = [
        '**/node_modules/**',
        '**/out/**',
        '**/.roku-deploy-staging/**',
        '**/dist/**',
        '**/build/**'
    ];

    /** Tracks registered project dirs so findProjectConfigFromFile can answer ownership without FS walks. */
    private readonly configByProjectDir = new Map<string, vscode.Uri>();

    public ownsConfig(uri: vscode.Uri): boolean {
        return path.basename(uri.fsPath) === 'manifest' && this.looksLikeRokuProject(uri);
    }

    public async findProjectConfigs(): Promise<vscode.Uri[]> {
        const exclude = util.buildExcludeGlob(this.excludePatterns);
        const results = await Promise.all(
            this.configFileSelector
                .filter(selector => selector.pattern)
                .map(selector => vscode.workspace.findFiles(selector.pattern as string, exclude))
        );
        return results.flat().filter(uri => this.looksLikeRokuProject(uri));
    }

    public findProjectConfigFromFile(fileUri: vscode.Uri): Promise<vscode.Uri[]> {
        const filePath = bsUtil.driveLetterToLower(fileUri.fsPath);
        const files = [...BrightScriptDebugConfigurationProvider.defaultFiles];
        const matches: vscode.Uri[] = [];
        for (const [projectDir, configUri] of this.configByProjectDir) {
            // Drive letters must be normalized on both sides — getDestPath does a case-sensitive
            // comparison and Windows uri.fsPath casing isn't always consistent with path.dirname output.
            if (rokuDeployUtil.getDestPath(filePath, files, bsUtil.driveLetterToLower(projectDir))) {
                matches.push(configUri);
            }
        }
        return Promise.resolve(matches);
    }

    public afterConfigRegistered(configUri: vscode.Uri): void {
        this.configByProjectDir.set(path.dirname(configUri.fsPath), configUri);
    }

    public afterConfigUnregistered(configUri: vscode.Uri): void {
        this.configByProjectDir.delete(path.dirname(configUri.fsPath));
    }

    public createProject(configUri: vscode.Uri): ProjectBuildResult {
        const project = this.toProject(configUri);
        const { projectDir, projectName } = project;
        const debugConfig: vscode.DebugConfiguration = {
            type: 'brightscript',
            request: 'launch',
            name: `Debug ${projectName}`,
            rootDir: projectDir,
            files: [...BrightScriptDebugConfigurationProvider.defaultFiles],
            host: '${promptForHost}',
            password: '${promptForPassword}'
        };
        return { project: project, debugConfig: debugConfig };
    }

    /**
     * A bare `manifest` file is too generic to be a Roku-project signal on its own
     * (npm, webpack, browser-extensions, etc. also use that name), so we require an
     * adjacent `source/` or `components/` dir before treating it as a Roku project.
     */
    private looksLikeRokuProject(manifestUri: vscode.Uri): boolean {
        const dir = path.dirname(manifestUri.fsPath);
        return fs.existsSync(path.join(dir, 'source')) || fs.existsSync(path.join(dir, 'components'));
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
