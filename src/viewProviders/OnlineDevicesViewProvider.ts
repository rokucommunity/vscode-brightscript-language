import * as vscode from 'vscode';
import * as semver from 'semver';
import type { DeviceManager, RokuDeviceDetails } from '../deviceDiscovery/DeviceManager';
import { icons } from '../icons';
import { util } from '../util';
import { ViewProviderId } from './ViewProviderId';

/**
 * A sequence used to generate unique IDs for tree items that don't care about having a key
 */
let treeItemKeySequence = 0;

export class OnlineDevicesViewProvider implements vscode.TreeDataProvider<vscode.TreeItem> {

    public readonly id = ViewProviderId.onlineDevicesView;

    constructor(
        private deviceManager: DeviceManager
    ) {
        this.devices = [];
        this.deviceManager.on('devices-changed', () => {
            this.devices = this.deviceManager.getActiveDevices();
            this._onDidChangeTreeData.fire(null);
        });

        this.deviceManager.on('scanNeeded-changed', () => {
            if (!this.visible) {
                return;
            }
            this.deviceManager.refresh();
        });
    }

    private visible = false;

    public setTreeView(treeView: vscode.TreeView<vscode.TreeItem>) {
        treeView.onDidChangeVisibility(e => {
            this.visible = e.visible;
            if (!this.visible) {
                return;
            }
            this.deviceManager.refresh();
        });
    }

    /**
     * Should the unique info about a device be obfuscated (i.e. randomly modified to protect the data)?
     */
    private get isConcealDeviceInfoEnabled() {
        return vscode.workspace.getConfiguration('brightscript.deviceDiscovery').get('concealDeviceInfo') === true;
    }

    private devices: Array<RokuDeviceDetails>;

    private makeName(device: RokuDeviceDetails) {
        return [
            device.deviceInfo['model-number'],
            device.deviceInfo['user-device-name'],
            `OS ${device.deviceInfo['software-version']}`
        ].join(' – ');
    }

    getChildren(element?: DeviceTreeItem | DeviceInfoTreeItem): vscode.ProviderResult<DeviceTreeItem[] | DeviceInfoTreeItem[]> {
        if (!element) {
            if (this.devices) {
                let items: DeviceTreeItem[] = [];
                for (const device of this.devices) {
                    // Make a rook item for each device
                    let treeItem = new DeviceTreeItem(
                        this.makeName(device),
                        vscode.TreeItemCollapsibleState.Collapsed,
                        device.id,
                        device.deviceInfo
                    );
                    treeItem.tooltip = `${device.ip} | ${device.deviceInfo['friendly-model-name']} - ${this.concealString(device.deviceInfo['serial-number'])} | ${device.deviceInfo['user-device-location']}`;

                    // Set icon based on device state
                    if (device.deviceState === 'pending') {
                        treeItem.description = '$(loading~spin)';
                        treeItem.iconPath = new vscode.ThemeIcon('circle-outline');
                    } else if (device.deviceState === 'offline') {
                        treeItem.iconPath = new vscode.ThemeIcon('circle-slash', new vscode.ThemeColor('errorForeground'));
                    } else {
                        treeItem.iconPath = icons.getDeviceType(device);
                    }

                    // Enable inline refresh button on hover
                    treeItem.contextValue = 'device';

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
            if (device) {
                this.deviceManager.checkDeviceHealthIfStale(device).catch(() => { });
            }

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
                    label: '⭐ Set as Active Device',
                    parent: element,
                    collapsibleState: vscode.TreeItemCollapsibleState.None,
                    tooltip: 'Set as active device',
                    command: {
                        command: 'extension.brightscript.setActiveDevice',
                        title: 'Set Active Device',
                        arguments: [device.ip]
                    }
                })
            );

            if (semver.satisfies(element.details['software-version'], '>=11')) {
                // TODO: add ECP system hooks here in the future (like registry call, etc...)
                result.unshift(
                    this.createDeviceInfoTreeItem({
                        label: '📋 View Registry',
                        parent: element,
                        collapsibleState: vscode.TreeItemCollapsibleState.None,
                        tooltip: 'View the ECP Registry',
                        description: device.ip,
                        command: {
                            command: 'extension.brightscript.openRegistryInBrowser',
                            title: 'Open',
                            arguments: [device.ip]
                        }
                    })
                );
            }

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
