import * as vscode from 'vscode';
import * as semver from 'semver';
import type { ActiveDeviceManager, RokuDeviceDetails } from './ActiveDeviceManager';

export class OnlineDevicesViewProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
    constructor(context: vscode.ExtensionContext, private activeDeviceManager: ActiveDeviceManager) {
        this.devices = [];
        this.activeDeviceManager.on('foundDevice', (newDeviceId: string, newDevice: RokuDeviceDetails) => {
            if (!this.devices.find(device => device.id === newDeviceId)) {
                this.devices.push(newDevice);
                this._onDidChangeTreeData.fire(null);
            } else {
                const foundIndex = this.devices.findIndex(device => device.id === newDeviceId);
                this.devices[foundIndex] = newDevice;
            }
        });

        this.activeDeviceManager.on('expiredDevice', (deviceId: string, device: RokuDeviceDetails) => {
            const foundIndex = this.devices.findIndex(x => x.id === deviceId);
            this.devices.splice(foundIndex, 1);
            this._onDidChangeTreeData.fire(null);
        });
    }

    private devices: Array<RokuDeviceDetails>;

    getChildren(element?: DeviceTreeItem | DeviceInfoTreeItem): vscode.ProviderResult<DeviceTreeItem[] | DeviceInfoTreeItem[]> {
        if (!element) {
            if (this.devices) {
                let items: DeviceTreeItem[] = [];
                for (const device of this.devices) {
                    let treeItem = new DeviceTreeItem(
                        device.deviceInfo['user-device-name'] + ' - ' + device.deviceInfo['serial-number'],
                        vscode.TreeItemCollapsibleState.Collapsed,
                        device.id,
                        device.deviceInfo
                    );
                    treeItem.tooltip = `${device.ip} | ${device.deviceInfo['default-device-name']} - ${device.deviceInfo['model-number']} | ${device.deviceInfo['user-device-location']}`;
                    items.push(treeItem);
                }
                return items;
            } else {
                return [];
            }
        } else if (element instanceof DeviceTreeItem) {
            let result: Array<DeviceInfoTreeItem> = [];

            for (let property in element.details) {
                let treeItem = new DeviceInfoTreeItem(
                    property,
                    element,
                    vscode.TreeItemCollapsibleState.None,
                    property,
                    element.details[property].toString()
                );

                treeItem.tooltip = 'Copy to clipboard';
                treeItem.command = {
                    command: 'brightscript.extension.copyToClipboard',
                    title: 'Copy To Clipboard',
                    arguments: [element.details[property].toString()]
                };
                result.push(treeItem);
            }

            if (semver.satisfies(element.details['software-version'], '>=11')) {
                // TODO: add ECP system hooks here in the future
            }
            return result;
        }
    }

    /**
     * Called by VS Code to get a given element.
     * Currently we don't modify this element so it is just returned back.
     * @param element the requested element
     */
    getParent?(element: DeviceTreeItem | DeviceInfoTreeItem): vscode.ProviderResult<vscode.TreeItem> {
        return element?.parent;
    }

    /**
     * Called by VS Code to get a tree item for a given element.
     * Currently we don't modify this element so it is just returned back.
     * @param element the requested element
     */
    getTreeItem(element: vscode.TreeItem): vscode.TreeItem | Thenable<vscode.TreeItem> {
        return element;
    }

    /**
     * Called by VS Code to resolve tool tips when not populated.
     * Currently we don't modify this element so it is just returned back.
     * @param element the requested element
     */
    resolveTreeItem?(item: vscode.TreeItem, element: vscode.TreeItem): vscode.ProviderResult<vscode.TreeItem> {
        return element;
    }

    private _onDidChangeTreeData: vscode.EventEmitter<vscode.TreeItem> = new vscode.EventEmitter<vscode.TreeItem>();
    public readonly onDidChangeTreeData: vscode.Event<vscode.TreeItem> = this._onDidChangeTreeData.event;
}


class DeviceTreeItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly key: string,
        public readonly details?: any,
        public command?: vscode.Command
    ) {
        super(label, collapsibleState);
    }

    public readonly parent = null;
}
class DeviceInfoTreeItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly parent: DeviceTreeItem,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly key: string,
        public readonly description: string,
        public readonly details?: any,
        public command?: vscode.Command
    ) {
        super(label, collapsibleState);
    }
}
