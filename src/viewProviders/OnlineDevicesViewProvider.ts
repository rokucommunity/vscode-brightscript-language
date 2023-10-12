import * as vscode from 'vscode';
import * as semver from 'semver';
import type { ActiveDeviceManager, RokuDeviceDetails } from '../ActiveDeviceManager';
import { icons } from '../icons';
import { firstBy } from 'thenby';
import { util } from '../util';
import { ViewProviderId } from './ViewProviderId';

/**
 * A sequence used to generate unique IDs for tree items that don't care about having a key
 */
let treeItemKeySequence = 0;

export class OnlineDevicesViewProvider implements vscode.TreeDataProvider<vscode.TreeItem> {

    public readonly id = ViewProviderId.onlineDevicesView;

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

    /**
     * Should the unique info about a device be obfuscated (i.e. randomly modified to protect the data)?
     */
    private get isConcealDeviceInfoEnabled() {
        return vscode.workspace.getConfiguration('brightscript.deviceDiscovery').get('concealDeviceInfo') === true;
    }

    private devices: Array<RokuDeviceDetails>;

    private getPriorityForDeviceFormFactor(device: RokuDeviceDetails): number {
        if (device.deviceInfo['is-stick']) {
            return 0;
        }
        if (device.deviceInfo['is-tv']) {
            return 2;
        }
        return 1;
    }

    getChildren(element?: DeviceTreeItem | DeviceInfoTreeItem): vscode.ProviderResult<DeviceTreeItem[] | DeviceInfoTreeItem[]> {
        if (!element) {
            if (this.devices) {

                // Process the root level devices in order by id

                let devices = this.devices.sort(
                    firstBy((a: RokuDeviceDetails, b: RokuDeviceDetails) => {
                        return this.getPriorityForDeviceFormFactor(a) - this.getPriorityForDeviceFormFactor(b);
                    }).thenBy((a: RokuDeviceDetails, b: RokuDeviceDetails) => {
                        if (a.id < b.id) {
                            return -1;
                        }
                        if (a.id > b.id) {
                            return 1;
                        }
                        // ids must be equal
                        return 0;
                    }));

                let items: DeviceTreeItem[] = [];
                for (const device of devices) {
                    // Make a rook item for each device
                    let treeItem = new DeviceTreeItem(
                        device.deviceInfo['user-device-name'] + ' - ' + this.concealString(device.deviceInfo['serial-number']),
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

            //conceal all of these unique keys
            const details = this.concealObject(element.details, ['udn', 'device-id', 'advertising-id', 'wifi-mac', 'ethernet-mac', 'serial-number', 'keyed-developer-id']);

            for (let [key, values] of details) {
                result.push(
                    this.createDeviceInfoTreeItem({
                        label: key,
                        parent: element,
                        collapsibleState: vscode.TreeItemCollapsibleState.None,
                        key: key,
                        //if this is one of the properties that need concealed
                        description: values.value?.toString(),
                        tooltip: 'Copy to clipboard',
                        // Prepare the copy to clipboard command
                        command: {
                            command: 'extension.brightscript.copyToClipboard',
                            title: 'Copy To Clipboard',
                            arguments: [values.originalValue]
                        }
                    })
                );
            }

            const device = this.findDeviceById(element.key);

            if (device.deviceInfo['is-tv']) {
                result.unshift(
                    this.createDeviceInfoTreeItem({
                        label: '📺 Switch TV Input',
                        parent: element,
                        collapsibleState: vscode.TreeItemCollapsibleState.None,
                        description: 'click to change',
                        tooltip: 'Change the current TV input',
                        command: {
                            command: 'extension.brightscript.changeTvInput',
                            title: 'Switch TV Input',
                            arguments: [device.ip]
                        }
                    })
                );
            }

            result.unshift(
                this.createDeviceInfoTreeItem({
                    label: '📷 Capture Screenshot',
                    parent: element,
                    collapsibleState: vscode.TreeItemCollapsibleState.None,
                    tooltip: 'Capture a screenshot',
                    command: {
                        command: 'extension.brightscript.captureScreenshot',
                        title: 'Capture Screenshot',
                        arguments: [device.ip]
                    }
                })
            );

            result.unshift(
                this.createDeviceInfoTreeItem({
                    label: '🔗 Open device web portal',
                    parent: element,
                    collapsibleState: vscode.TreeItemCollapsibleState.None,
                    tooltip: 'Open the web portal for this device',
                    description: device.ip,
                    command: {
                        command: 'extension.brightscript.openUrl',
                        title: 'Open',
                        arguments: [`http://${device.ip}`]
                    }
                })
            );


            if (semver.satisfies(element.details['software-version'], '>=11')) {
                // TODO: add ECP system hooks here in the future (like registry call, etc...)
            }

            // Return the device details
            return result;
        }
    }

    private createDeviceInfoTreeItem(options: {
        label: string;
        parent: DeviceTreeItem;
        collapsibleState: vscode.TreeItemCollapsibleState;
        key?: string;
        description?: string;
        details?: any;
        command?: vscode.Command;
        tooltip?: string;
    }) {
        const item = new DeviceInfoTreeItem(
            options.label,
            options.parent,
            options.collapsibleState,
            options.key ?? `tree-item-${treeItemKeySequence++}`,
            options.description ?? '',
            options.details ?? '',
            options.command
        );
        // Prepare the open url command
        item.tooltip = options.tooltip;
        return item;
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

    private concealObject(object: Record<string, any>, secretKeys: string[]) {
        return util.concealObject(
            object,
            this.isConcealDeviceInfoEnabled ? secretKeys : []
        );
    }


    /**
     * Given a string, return a new string with random numbers and letters of the same size.
     * Returns the same value for every input for the lifetime of the current extension uptime
     */
    private concealString(value: string) {
        if (this.isConcealDeviceInfoEnabled) {
            return util.concealString(value);
        } else {
            return value;
        }
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
