import * as vscode from 'vscode';
import * as semver from 'semver';
import type { ActiveDeviceManager, RokuDeviceDetails } from './ActiveDeviceManager';
import { icons } from './icons';

export class OnlineDevicesViewProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
    constructor(
        private context: vscode.ExtensionContext,
        private activeDeviceManager: ActiveDeviceManager
    ) {
        this.devices = [];
        this.activeDeviceManager.on('foundDevice', (newDeviceId: string, newDevice: RokuDeviceDetails) => {
            if (!this.findDeviceById(newDeviceId)) {
                // Add the device to the list
                this.devices.push(newDevice);
                this._onDidChangeTreeData.fire(null);
            } else {
                // Update the device
                const foundIndex = this.devices.findIndex(device => device.id === newDeviceId);
                this.devices[foundIndex] = newDevice;
            }
        });

        this.activeDeviceManager.on('expiredDevice', (deviceId: string, device: RokuDeviceDetails) => {
            // Remove the device from the list
            const foundIndex = this.devices.findIndex(x => x.id === deviceId);
            this.devices.splice(foundIndex, 1);
            this._onDidChangeTreeData.fire(null);
        });
    }

    private devices: Array<RokuDeviceDetails>;

    getChildren(element?: DeviceTreeItem | DeviceInfoTreeItem): vscode.ProviderResult<DeviceTreeItem[] | DeviceInfoTreeItem[]> {
        if (!element) {
            if (this.devices) {
                // Process the root level devices in order by id
                let devices = this.devices.sort((a, b) => {
                    if (a.id < b.id) {
                        return -1;
                    }
                    if (a.id > b.id) {
                        return 1;
                    }
                    // ids must be equal
                    return 0;
                });

                let items: DeviceTreeItem[] = [];
                for (const device of devices) {
                    // Make a rook item for each device
                    let treeItem = new DeviceTreeItem(
                        device.deviceInfo['user-device-name'] + ' - ' + device.deviceInfo['serial-number'],
                        vscode.TreeItemCollapsibleState.Collapsed,
                        device.id,
                        device.deviceInfo
                    );
                    treeItem.tooltip = `${device.ip} | ${device.deviceInfo['default-device-name']} - ${device.deviceInfo['model-number']} | ${device.deviceInfo['user-device-location']}`;
                    if (device.deviceInfo?.['is-stick']) {
                        treeItem.iconPath = icons.streamingStick;
                    } else if (device.deviceInfo?.['is-tv']) {
                        treeItem.iconPath = icons.tv;
                        //fall back to settop box in all other cases
                    } else {
                        treeItem.iconPath = icons.setTopBox;
                    }
                    console.log(treeItem.iconPath);
                    items.push(treeItem);
                }

                // Return the created root items
                return items;
            } else {
                // No devices
                return [];
            }
        } else if (element instanceof DeviceTreeItem) {
            // Process the details of a device
            let result: Array<DeviceInfoTreeItem> = [];

            for (let property in element.details) {
                // Create a tree item for every detail property on the device
                let treeItem = new DeviceInfoTreeItem(
                    property,
                    element,
                    vscode.TreeItemCollapsibleState.None,
                    property,
                    element.details[property].toString()
                );

                // Prepare the copy to clipboard command
                treeItem.tooltip = 'Copy to clipboard';
                treeItem.command = {
                    command: 'brightscript.extension.copyToClipboard',
                    title: 'Copy To Clipboard',
                    arguments: [element.details[property].toString()]
                };
                result.push(treeItem);
            }

            const device = this.findDeviceById(element.key);
            let openWebpageItem = new DeviceInfoTreeItem(
                'Open device web portal',
                element,
                vscode.TreeItemCollapsibleState.None,
                '',
                device.ip
            );

            // Prepare the open url command
            openWebpageItem.tooltip = 'Open';
            openWebpageItem.command = {
                command: 'brightscript.extension.openUrl',
                title: 'Open',
                arguments: [`http://${device.ip}`]
            };

            result.unshift(openWebpageItem);

            if (semver.satisfies(element.details['software-version'], '>=11')) {
                // TODO: add ECP system hooks here in the future
            }

            // Return the device details
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

    private findDeviceById(deviceId: string): RokuDeviceDetails {
        return this.devices.find(device => device.id === deviceId);
    }
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
