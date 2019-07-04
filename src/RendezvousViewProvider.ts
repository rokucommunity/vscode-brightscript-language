import * as arraySort from 'array-sort';
import * as fs from 'fs';
import * as path from 'path';
import { Position, Range } from 'vscode';
import * as vscode from 'vscode';

import { isRendezvousDetailsField, RendezvousHistory } from './RendezvousTracker';

export class RendezvousViewProvider implements vscode.TreeDataProvider<vscode.TreeItem> {

    constructor(context: vscode.ExtensionContext) {
        this.tree = {};

        this.sortReverse = true;
        this.activeFilter = [
            'details.totalTime',
            rendezvousAverageTimeSort,
            rendezvousHitCountSort,
            compare('label'),
            { reverse: this.shouldSortBeReverse }
        ];

        // #region Register sorting commands
        let subscriptions = context.subscriptions;
        subscriptions.push(vscode.commands.registerCommand('extension.brightscript.sortRendezvousByFileName', () => {
            this._onDidChangeTreeData.fire();
        }));

        subscriptions.push(vscode.commands.registerCommand('extension.brightscript.clearRendezvousSorting', () => {
            this.activeFileFilter = noSort;
            this._onDidChangeTreeData.fire();
        }));

        vscode.commands.registerCommand('RendezvousViewProvider.openFile', (resource) => this.openResource(resource));
        // #endregion
    }

    // tslint:disable-next-line:variable-name
    private _onDidChangeTreeData: vscode.EventEmitter<vscode.TreeItem> = new vscode.EventEmitter<vscode.TreeItem>();
    public readonly onDidChangeTreeData: vscode.Event<vscode.TreeItem> = this._onDidChangeTreeData.event;

    private tree: RendezvousHistory;
    private activeFilter: any;
    private sortReverse: boolean;

    get shouldSortBeReverse(): boolean {
        return this.sortReverse;
    }

    public onDidReceiveDebugSessionCustomEvent(e: any) {
        console.log('received event ' + e.event);
        if (e.event === 'BSRendezvousEvent') {

            // What changed?
            // let diff = this.objectDiff(e.body, this.viewedData);

            this.tree = e.body;
            this._onDidChangeTreeData.fire();
        }
    }

    public getChildren(element: RendezvousTreeItem): RendezvousTreeItem[] {
        if (!element) {
            return arraySort(Object.keys(this.tree).map((key) => {
                if (!isRendezvousDetailsField(key)) {
                    return new RendezvousFileTreeItem(key, vscode.TreeItemCollapsibleState.Collapsed, null, this.tree[key]);
                }
            }), this.activeFilter);
        } else {
            let treeElement = this.getTreeElement(element);

            let result;
            if (treeElement.type === 'fileInfo') {
                result = arraySort(Object.keys(treeElement).map((key) => {
                    if (!isRendezvousDetailsField(key) && treeElement[key].totalTime > 0) {
                        let { hitCount, totalTime, clientPath, clientLineNumber } = treeElement[key];
                        let label = `line: (${key}) | hitCount: ${hitCount} | totalTime: ${totalTime.toFixed(3)} s | average: ${(totalTime / hitCount).toFixed(3) } s`;
                        let command = { command: 'RendezvousViewProvider.openFile', title: 'Open File', arguments: [{ path: clientPath, lineNumber: clientLineNumber }], };

                        return new RendezvousTreeItem(label, vscode.TreeItemCollapsibleState.None, element, key, treeElement[key], command);
                    }
                }), this.activeFilter);
            }
            return result;
        }
    }

    public getTreeItem(element: RendezvousTreeItem): RendezvousTreeItem {
        return element;
    }

    public getTreeElement(element: RendezvousTreeItem): {[key: string]: any} {
        let objectPath = [];
        let currentObject: {[key: string]: any} = this.tree;

        if (element.parent) {
            // fine the correct object key path to this element
            let currentParent = element;
            while (currentParent.parent) {
                currentParent = currentParent.parent;
                objectPath.unshift(currentParent.label);
            }

            objectPath.forEach((key) => {
                currentObject = currentObject[key];
            });
        }

        // return the contents of the current item
        return currentObject[element.key];
    }

    private async openResource(fileArgs: any) {
        let uri = vscode.Uri.file(fileArgs.path);
        let doc = await vscode.workspace.openTextDocument(uri);
        let range = new Range(new Position(fileArgs.lineNumber - 1, 0), new Position(fileArgs.lineNumber - 1, 0));
        await vscode.window.showTextDocument(doc, { preview: false, selection: range });
    }

    private objectDiff(obj1, obj2, exclude?) {
        let r = {};

        if (!exclude) {	exclude = []; }

        for (let prop in obj1) {
            if (obj1.hasOwnProperty(prop) && prop !== '__proto__') {
                if (exclude.indexOf(obj1[prop]) === -1) {

                    // check if obj2 has prop
                    if (!obj2.hasOwnProperty(prop)) { r[prop] = obj1[prop]; } else if (obj1[prop] === Object(obj1[prop])) {
                        let difference = this.objectDiff(obj1[prop], obj2[prop]);
                        if (Object.keys(difference).length > 0) { r[prop] = difference; }
                    } else if (obj1[prop] !== obj2[prop]) {
                        if (obj1[prop] === undefined) {
                            r[prop] = 'undefined';
                        }

                        if (obj1[prop] === null) {
                            r[prop] = null;
                        } else if (typeof obj1[prop] === 'function') {
                            r[prop] = 'function';
                        } else if (typeof obj1[prop] === 'object') {
                            r[prop] = 'object';
                        } else {
                            r[prop] = obj1[prop];
                        }
                    }
                }
            }
        }

        return r;
    }
}

export class RendezvousTreeItem extends vscode.TreeItem {

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
        return `${this.label}`;
    }

    // get description(): string {
    //     return this.version;
    // }

    // public iconPath = {
    //     light: path.join(__filename, '..', '..', 'resources', 'light', 'dependency.svg'),
    //     dark: path.join(__filename, '..', '..', 'resources', 'dark', 'dependency.svg')
    // };

    // public contextValue = 'dependency';
}

export class RendezvousFileTreeItem extends vscode.TreeItem {
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

const noSort: IRendezvousItemSort = (itemOne: RendezvousTreeItem, itemTwo: RendezvousTreeItem) => {
    return 0;
};

const rendezvousAverageTimeSort: IRendezvousItemSort = (itemOne: RendezvousTreeItem, itemTwo: RendezvousTreeItem) => {
    let zeroCostOffsetOne = itemOne.details.zeroCostHitCount ? itemOne.details.zeroCostHitCount : 0;
    let zeroCostOffsetTwo = itemTwo.details.zeroCostHitCount ? itemTwo.details.zeroCostHitCount : 0;

    if (itemOne.details.totalTime / (itemOne.details.hitCount - zeroCostOffsetOne)  > itemTwo.details.totalTime / (itemTwo.details.hitCount - zeroCostOffsetTwo)) {
        return -1;
    } else if (itemOne.details.totalTime / (itemOne.details.hitCount - zeroCostOffsetOne) < itemTwo.details.totalTime / (itemTwo.details.hitCount - zeroCostOffsetTwo)) {
        return 1;
    } else {
        return 0;
    }
};

const rendezvousHitCountSort: IRendezvousItemSort = (itemOne: RendezvousTreeItem, itemTwo: RendezvousTreeItem) => {
    let zeroCostOffsetOne = itemOne.details.zeroCostHitCount ? itemOne.details.zeroCostHitCount : 0;
    let zeroCostOffsetTwo = itemTwo.details.zeroCostHitCount ? itemTwo.details.zeroCostHitCount : 0;

    if ((itemOne.details.hitCount - zeroCostOffsetOne) > (itemTwo.details.hitCount - zeroCostOffsetTwo)) {
        return -1;
    } else if ((itemOne.details.hitCount - zeroCostOffsetOne) < (itemTwo.details.hitCount - zeroCostOffsetTwo)) {
        return 1;
    } else {
        return 0;
    }
};

// reusable compare function
function compare(prop) {
    return function(a, b) {
        return a[prop].localeCompare(b[prop]);
    };
}
