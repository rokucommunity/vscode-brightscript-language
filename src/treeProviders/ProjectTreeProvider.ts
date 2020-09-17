import { Event, EventEmitter, TreeItem, TreeDataProvider, ExtensionContext, ProviderResult, TreeItemCollapsibleState } from 'vscode';
import * as vscode from 'vscode';
import { util } from '../util';
import { LanaguageServerManager } from '../LanguageServerManager';
import { Throttler, standardizePath } from 'brighterscript';

export class ProjectsViewTreeProvider implements TreeDataProvider<TreeItem> {

    constructor(
        private context: ExtensionContext,
        private languageServerManager: LanaguageServerManager
    ) {
        this.context?.subscriptions.push(vscode.commands.registerCommand('extension.brightscript.languageServer.reloadProject', async (arg1: string | { workspaceFolder: string }) => {
            const workspaceFolder = typeof arg1 === 'string' ? arg1 : arg1.workspaceFolder;
            this.languageServerManager.reloadProject(workspaceFolder);
            //remove this workspace from the tree (it will get re-added once the language server finishes)
            this.projects = this.projects.filter(x => standardizePath(x.workspaceFolder) !== standardizePath(workspaceFolder));
            this._onDidChangeTreeData.fire(null);
        }));

        //refresh the tree view anytime the projects view changes
        languageServerManager.onProjectsChanged(() => {
            this.throttler.run(() => {
                this.refresh();
            });
        });
    }

    private throttler = new Throttler(300);

    private _onDidChangeTreeData: EventEmitter<TreeItem> = new EventEmitter<TreeItem>();
    public readonly onDidChangeTreeData: Event<TreeItem> = this._onDidChangeTreeData.event;

    /**
     * Refresh the tree view with the latest file info from the language server
     */
    public async refresh() {
        let projectsInfo = await this.languageServerManager.getProjectsInfo();
        this.reset();
        for (let projectInfo of projectsInfo) {
            this.addProject(projectInfo.name, projectInfo.workspaceFolder, projectInfo.rootDir, projectInfo.files);
        }
        this._onDidChangeTreeData.fire(null);
    }

    private reset() {
        this.projects = [];
    }

    private projects = [] as Project[];

    public addProject(name: string, workspaceFolder: string, rootDir: string, files: File[]) {
        this.projects.push(
            new Project(name, workspaceFolder, rootDir, files)
        );
        this.projects.sort((a, b) => a.rootNode.treeItem.label.localeCompare(b.rootNode.treeItem.label))
    }

    /**
     * Clear all projects
     */
    public clear() {
        this.projects = [];
        this._onDidChangeTreeData.fire(null);
    }

    public getChildren(element?: TreeItem): ProviderResult<TreeItem[]> {
        if (element) {
            for (let project of this.projects) {
                const projectChildren = project.getChildren(element.id);
                //only one project will match the key, so return the children if found
                if (projectChildren) {
                    return projectChildren;
                }
            }
        } else {
            //return the root nodes
            return this.projects.map(x => x.rootNode.treeItem)

        }
    }

    public getTreeItem(element: TreeItem): TreeItem | Thenable<TreeItem> {
        return element;
    }
}

interface File {
    src: string;
    dest: string;
}
interface Node {
    treeItem: TreeItem;
    children: Node[]
}

export class Project {
    constructor(
        public name: string,
        public workspaceFolder: string,
        public rootDir: string,
        public files: File[]
    ) {
        this.projectId = util.getIdForKey(workspaceFolder);
        this.rootDir = util.removeTrailingSlash(rootDir);

        this.rootNode = {
            treeItem: {
                id: `${this.projectId}:/`,
                label: name,
                tooltip: rootDir,
                iconPath: new vscode.ThemeIcon('project'),
                collapsibleState: TreeItemCollapsibleState.Expanded,
                contextValue: 'project',
                workspaceFolder: workspaceFolder
            },
            children: []
        } as Node;
        this.nodes[this.rootNode.treeItem.id] = this.rootNode;

        this.addFiles(files);
    }

    /**
     * ID given to this project based on the workspace folder.
     */
    public projectId: number;

    public rootNode: Node;

    public nodes = {} as { [key: string]: Node };

    /**
     * Get the children of the given node, or undefined if not exist
     */
    public getChildren(parentKey: string) {
        const children = this.nodes[parentKey]?.children?.map(x => x.treeItem);
        if (children?.length > 0) {
            return children;
        } else {
            return undefined;
        }
    }

    public addFiles(files: File[]) {
        for (let file of files) {
            this.addFile(file);
        }
    }

    public addFile(file: File) {
        const parts = file.dest.split(/\/|\\/);
        let parentNode = this.rootNode;

        //ensure all nodes exist
        for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            const isLast = i === parts.length - 1;
            const slash = isLast ? '' : '/';
            const partId = `${parentNode.treeItem.id}${part}${slash}`;

            //if this part doesn't exist, create it
            if (!this.nodes[partId]) {
                this.nodes[partId] = {
                    children: [],
                    treeItem: {
                        id: partId,
                        label: part,
                        tooltip: isLast ? file.src : undefined,
                        resourceUri: isLast ? vscode.Uri.file(file.src) : undefined,
                        command: isLast ? {
                            command: 'vscode.open',
                            title: 'Open',
                            arguments: [vscode.Uri.file(file.src)]
                        } : undefined,
                        collapsibleState: isLast ? TreeItemCollapsibleState.None : TreeItemCollapsibleState.Collapsed
                    }
                };

                //add this node to its parent's children array
                parentNode.children.push(this.nodes[partId]);
            }

            parentNode = this.nodes[partId];
        }
    }
}