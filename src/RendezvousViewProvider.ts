import * as arraySort from 'array-sort';
import * as vscode from 'vscode';

import { RendezvousHistory } from './RendezvousTracker';

export class RendezvousViewProvider implements vscode.TreeDataProvider<vscode.TreeItem> {

    constructor(context: vscode.ExtensionContext) {
        this.toggleSmartSorting();

        // #region Register sorting commands
        let subscriptions = context.subscriptions;
        subscriptions.push(vscode.commands.registerCommand('extension.brightscript.rendezvous.toggleSortMethod', () => {
            this.toggleSmartSorting();
            this._onDidChangeTreeData.fire();
        }));

        subscriptions.push(vscode.commands.registerCommand('extension.brightscript.rendezvous.toggleSortDirection', () => {
            this.sortAscending = !this.sortAscending;
            this._onDidChangeTreeData.fire();
        }));
        // #endregion

        vscode.commands.registerCommand('RendezvousViewProvider.openFile', (resource) => this.openResource(resource));
    }

    // tslint:disable-next-line:variable-name
    private _onDidChangeTreeData: vscode.EventEmitter<vscode.TreeItem> = new vscode.EventEmitter<vscode.TreeItem>();
    public readonly onDidChangeTreeData: vscode.Event<vscode.TreeItem> = this._onDidChangeTreeData.event;

    private activeFilter: any;
    private isUsingSmartSorting: boolean;
    private rendezvousHistory: RendezvousHistory;
    private sortAscending: boolean = false;

    /**
     * Toggles between smart and simple sorting
     */
    private toggleSmartSorting() {
        if (!this.isUsingSmartSorting) {
            // Update the sorting logic to be totalTime > averageTime > hitCount > label text
            this.isUsingSmartSorting = true;
            this.activeFilter = [
                this.rendezvousTotalTimeSort,
                this.rendezvousAverageTimeSort,
                this.rendezvousHitCountSort,
                this.compare('label')
            ];
        } else {
            // Sorting is simply based on the label text
            this.isUsingSmartSorting = false;
            this.activeFilter = [this.compare('label')];
        }
    }

    /**
     * Handles the custom events
     */
    public onDidReceiveDebugSessionCustomEvent(e: any) {
        console.log('received event ' + e.event);
        if (e.event === 'BSRendezvousEvent') {
            // What changed?
            // let diff = this.objectDiff(e.body, this.viewedData);

            this.rendezvousHistory = e.body;
            this._onDidChangeTreeData.fire();
        }
    }

    /**
     * Called by VS Code to get the children tree items for a give tree view item
     * @param element whose children are needed
     */
    public getChildren(element: RendezvousTreeItem): RendezvousTreeItem[] {
        if (!element) {
            if (this.rendezvousHistory) {
                // There are no tree view items so we should be creating file tree items
                return arraySort(Object.keys(this.rendezvousHistory.occurrences).map((key) => {
                    return new RendezvousFileTreeItem(key, vscode.TreeItemCollapsibleState.Collapsed, null, this.rendezvousHistory.occurrences[key]);
                }), this.activeFilter);
            } else {
                return [];
            }
        } else {
            // VS code is asking for the children of the supplied tree item
            let treeElement = this.getTreeElementHistoryData(element);

            let result: RendezvousTreeItem[];
            if (treeElement.type === 'fileInfo') {
                result = arraySort(Object.keys(treeElement.occurrences).map((key) => {
                    if (treeElement.occurrences[key].totalTime > 0) {
                        let { hitCount, totalTime, clientPath, clientLineNumber } = treeElement.occurrences[key];
                        let label = `line: ${key} | hitCount: ${hitCount} | totalTime: ${totalTime.toFixed(3)} s | average: ${(totalTime / hitCount).toFixed(3) } s`;

                        // create the command used to open the file
                        let command = {
                            command: 'RendezvousViewProvider.openFile',
                            title: 'Open File',
                            arguments: [({
                                path: clientPath,
                                lineNumber: clientLineNumber,
                                devicePath: element.key
                            } as FileArgs)]
                        };

                        return new RendezvousTreeItem(label, vscode.TreeItemCollapsibleState.None, element, key, treeElement.occurrences[key], command);
                    }
                }), this.activeFilter);
            }
            return result;
        }
    }

    /**
     * Called by VS Code to get a give element.
     * Currently we don't modify this element so it is just returned back.
     * @param element the requested element
     */
    public getTreeItem(element: RendezvousTreeItem): RendezvousTreeItem {
        return element;
    }

    /**
     * Used to get the data for a give TreeItem from the tree of RendezvousHistory
     * @param element for which the data was requested
     */
    private getTreeElementHistoryData(element: RendezvousTreeItem): {[key: string]: any} {
        if (element.details.type === 'lineInfo') {

            // return the line item info
            return this.rendezvousHistory.occurrences[element.parent.key].occurrences[element.key];
        } else if (element.details.type === 'fileInfo') {
            // return the file item info
            return this.rendezvousHistory.occurrences[element.key];
        }
    }

    /**
     * attempts to open the file at the given line
     */
    private async openResource(fileArgs: FileArgs) {
        if (fileArgs.path && fileArgs.lineNumber) {
            let uri = vscode.Uri.file(fileArgs.path);
            let doc = await vscode.workspace.openTextDocument(uri);
            let range = new vscode.Range(new vscode.Position(fileArgs.lineNumber - 1, 0), new vscode.Position(fileArgs.lineNumber - 1, 0));
            await vscode.window.showTextDocument(doc, { preview: false, selection: range });
        } else {
            vscode.window.showErrorMessage(`Unable to open file for: ${fileArgs.devicePath}`);
        }
    }

    /**
     * Handled sorting the TreeItems by totalTime
     */
    private rendezvousTotalTimeSort: IRendezvousItemSort = (itemOne: RendezvousTreeItem, itemTwo: RendezvousTreeItem) => {
        if (itemOne.details.totalTime > itemTwo.details.totalTime) {
            return this.handleReverseSort(-1);
        } else if (itemOne.details.totalTime < itemTwo.details.totalTime) {
            return this.handleReverseSort(1);
        }
        return 0;
    }

    /**
     * Handled sorting the TreeItems by averageTime. Does not use zero cost rendezvous' in the average calculation
     */
    private rendezvousAverageTimeSort: IRendezvousItemSort = (itemOne: RendezvousTreeItem, itemTwo: RendezvousTreeItem) => {
        let zeroCostOffsetOne = itemOne.details.zeroCostHitCount ? itemOne.details.zeroCostHitCount : 0;
        let zeroCostOffsetTwo = itemTwo.details.zeroCostHitCount ? itemTwo.details.zeroCostHitCount : 0;

        if (itemOne.details.totalTime / (itemOne.details.hitCount - zeroCostOffsetOne) > itemTwo.details.totalTime / (itemTwo.details.hitCount - zeroCostOffsetTwo)) {
            return this.handleReverseSort(-1);
        } else if (itemOne.details.totalTime / (itemOne.details.hitCount - zeroCostOffsetOne) < itemTwo.details.totalTime / (itemTwo.details.hitCount - zeroCostOffsetTwo)) {
            return this.handleReverseSort(1);
        }
        return 0;
    }

    /**
     * Handled sorting the TreeItems by hitCount. Does not count zero cost rendezvous' in the hitCount calculation
     */
    private rendezvousHitCountSort: IRendezvousItemSort = (itemOne: RendezvousTreeItem, itemTwo: RendezvousTreeItem) => {
        let zeroCostOffsetOne = itemOne.details.zeroCostHitCount ? itemOne.details.zeroCostHitCount : 0;
        let zeroCostOffsetTwo = itemTwo.details.zeroCostHitCount ? itemTwo.details.zeroCostHitCount : 0;

        if ((itemOne.details.hitCount - zeroCostOffsetOne) > (itemTwo.details.hitCount - zeroCostOffsetTwo)) {
            return this.handleReverseSort(-1);
        } else if ((itemOne.details.hitCount - zeroCostOffsetOne) < (itemTwo.details.hitCount - zeroCostOffsetTwo)) {
            return this.handleReverseSort(1);
        }
        return 0;
    }

    /**
     * Prepares a generic simple sort
     * @param propertyName The field name to compare
     */
    private compare = (propertyName: string): IRendezvousItemSort => {
        return (itemOne, itemTwo): number => {
            if (itemOne[propertyName] > itemTwo[propertyName]) {
                return this.handleReverseSort(-1);
            } else if (itemOne[propertyName] < itemTwo[propertyName]) {
                return this.handleReverseSort(1);
            }
            return 0;
        };
    }

    /**
     * Will invert the sortResult based on wether we are doing ascending or descending sorting
     * @param sortResult the integer value from a sort function
     */
    private handleReverseSort(sortResult: number): number {
        return (!this.sortAscending) ? sortResult : (sortResult === 1) ? -1 : (sortResult === -1) ? 1 : sortResult;
    }
}

class RendezvousTreeItem extends vscode.TreeItem {

    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly parent: RendezvousTreeItem | null,
        public readonly key: string,
        public readonly details: any,
        public readonly command?: vscode.Command
    ) {
        super(label, collapsibleState);
    }

    get tooltip(): string {
        return `Click To Open File`;
    }
}

class RendezvousFileTreeItem extends vscode.TreeItem {
    constructor(
        public readonly key: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly parent: RendezvousTreeItem | null,
        public readonly details: any
    ) {
        super(key.split('/').pop(), collapsibleState);
    }

    get tooltip(): string {
        return `${this.key}`;
    }

    get description(): string {
        return `hitCount: ${this.details.hitCount - this.details.zeroCostHitCount} | totalTime: ${this.details.totalTime.toFixed(3)} s`;
    }
}

type IRendezvousItemSort = (itemOne: RendezvousTreeItem, itemTwo: RendezvousTreeItem) => number;

interface FileArgs {
    path: string;
    lineNumber: number;
    devicePath: string;
}
