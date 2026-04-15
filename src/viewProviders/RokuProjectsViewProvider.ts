import * as path from 'path';
import * as vscode from 'vscode';
import { DEBUG_ROKU_PROJECT_COMMAND } from '../managers/RokuProject/RokuProjectManager';
import type { DiscoveredRokuProject } from '../managers/RokuProject/RokuProjectManager';
import { ViewProviderId } from './ViewProviderId';

export class RokuProjectsViewProvider implements vscode.TreeDataProvider<ProjectTreeItem> {

    public readonly id = ViewProviderId.rokuProjectsView;

    private _onDidChangeTreeData = new vscode.EventEmitter<ProjectTreeItem | null>();
    public readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    private projects: DiscoveredRokuProject[] = [];
    private sessionActive = false;

    constructor() {
        vscode.debug.onDidStartDebugSession(() => {
            this.sessionActive = true;
            this._onDidChangeTreeData.fire(null);
        });

        vscode.debug.onDidTerminateDebugSession(() => {
            this.sessionActive = false;
            this._onDidChangeTreeData.fire(null);
        });
    }

    public setProjects(projects: DiscoveredRokuProject[]) {
        this.projects = projects;
        this._onDidChangeTreeData.fire(null);
    }

    public getTreeItem(element: ProjectTreeItem): vscode.TreeItem {
        return element;
    }

    public getChildren(): ProjectTreeItem[] {
        if (this.projects.length === 0) {
            return [];
        }
        return this.projects.map(project => new ProjectTreeItem(project, this.sessionActive));
    }
}

export class ProjectTreeItem extends vscode.TreeItem {
    constructor(
        public readonly project: DiscoveredRokuProject,
        sessionActive: boolean
    ) {
        super(project.projectName, vscode.TreeItemCollapsibleState.None);
        this.description = path.relative(
            vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '',
            project.projectDir
        );
        this.tooltip = project.projectDir;
        this.iconPath = new vscode.ThemeIcon('folder');
        this.contextValue = sessionActive ? 'rokuProject.sessionActive' : 'rokuProject';
        this.command = sessionActive ? undefined : {
            title: 'Debug Roku Project',
            command: DEBUG_ROKU_PROJECT_COMMAND,
            arguments: [project.configUri]
        };
    }
}
