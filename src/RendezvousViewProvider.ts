import * as arraySort from 'array-sort';
import * as fs from 'fs';
import * as path from 'path';
import { Position, Range } from 'vscode';
import * as vscode from 'vscode';

import { isRendezvousDetailsField, RendezvousHistory } from './RendezvousTracker';

export class RendezvousViewProvider implements vscode.TreeDataProvider<vscode.TreeItem> {

    constructor(context: vscode.ExtensionContext) {
        this.tree = {};
        this.enableSmartSorting();

        // #region Register sorting commands
        let subscriptions = context.subscriptions;
        subscriptions.push(vscode.commands.registerCommand('extension.brightscript.toggleSortingMethod', () => {
            if (!this.enableSmartSorting()) {
                this.disableSmartSorting();
            }
            this._onDidChangeTreeData.fire();
        }));

        subscriptions.push(vscode.commands.registerCommand('extension.brightscript.toggleSortingAscDesc', () => {
            this.sortAscending = !this.sortAscending;
            this._onDidChangeTreeData.fire();
        }));
        // #endregion

        vscode.commands.registerCommand('RendezvousViewProvider.openFile', (resource) => this.openResource(resource));
    }

    // tslint:disable-next-line:variable-name
    private _onDidChangeTreeData: vscode.EventEmitter<vscode.TreeItem> = new vscode.EventEmitter<vscode.TreeItem>();
    public readonly onDidChangeTreeData: vscode.Event<vscode.TreeItem> = this._onDidChangeTreeData.event;

    private tree: RendezvousHistory;
    private activeFilter: any;
    private sortAscending: boolean = false;
    private isUsingSmartSorting: boolean;

    private enableSmartSorting(): boolean {
        if (!this.isUsingSmartSorting) {
            this.isUsingSmartSorting = true;
            this.activeFilter = [
                this.rendezvousTotalTimeSort,
                this.rendezvousAverageTimeSort,
                this.rendezvousHitCountSort,
                this.compare('label')
            ];
            return true;
        }
        return false;
    }

    private disableSmartSorting() {
        if (this.isUsingSmartSorting) {
            this.isUsingSmartSorting = false;
            this.activeFilter = [this.compare('label')];
            return true;
        }
        return false;
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
            // There are no tree view items so we should be creating file tree items
            return arraySort(Object.keys(this.tree).map((key) => {
                if (!isRendezvousDetailsField(key)) {
                    return new RendezvousFileTreeItem(key, vscode.TreeItemCollapsibleState.Collapsed, null, this.tree[key]);
                }
            }), this.activeFilter);
        } else {
            // VS code is asking for the children of the supplied tree item
            let treeElement = this.getTreeElement(element);

            let result;
            if (treeElement.type === 'fileInfo') {
                result = arraySort(Object.keys(treeElement).map((key) => {
                    if (!isRendezvousDetailsField(key) && treeElement[key].totalTime > 0) {
                        let { hitCount, totalTime, clientPath, clientLineNumber } = treeElement[key];
                        let label = `line: ${key} | hitCount: ${hitCount} | totalTime: ${totalTime.toFixed(3)} s | average: ${(totalTime / hitCount).toFixed(3) } s`;
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

    private getTreeElement(element: RendezvousTreeItem): {[key: string]: any} {
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

    private rendezvousTotalTimeSort: IRendezvousItemSort = (itemOne: RendezvousTreeItem, itemTwo: RendezvousTreeItem) => {
        if (itemOne.details.totalTime > itemTwo.details.totalTime) {
            return this.handleReverseSort(-1);
        } else if (itemOne.details.totalTime < itemTwo.details.totalTime) {
            return this.handleReverseSort(1);
        }
        return 0;
    }

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

    private compare = (propertyName): IRendezvousItemSort => {
        return (itemOne, itemTwo): number => {
            if (itemOne[propertyName] > itemTwo[propertyName]) {
                return this.handleReverseSort(-1);
            } else if (itemOne[propertyName] < itemTwo[propertyName]) {
                return this.handleReverseSort(1);
            }
            return 0;
        };
    }

    private handleReverseSort(sortResult: number): number {
        return (!this.sortAscending) ? sortResult : (sortResult === 1) ? -1 : (sortResult === -1) ? 1 : sortResult;
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
