import * as vscode from 'vscode';
import type { ActiveDeviceManager } from './ActiveDeviceManager';

export class OnlineDevicesViewProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
    constructor(context: vscode.ExtensionContext, private activeDeviceManager: ActiveDeviceManager) {
        this.devices = [{
            'location': 'http://192.168.8.174:8060',
            'ip': '192.168.8.174',
            'deviceInfo': {
                'udn': '1234568',
                'serial-number': '1234568',
                'device-id': '1234568',
                'advertising-id': '1234568',
                'vendor-name': 'Roku',
                'model-name': 'Roku Ultra',
                'model-number': '4660X',
                'model-region': 'US',
                'is-tv': false,
                'is-stick': false,
                'ui-resolution': '1080p',
                'supports-ethernet': true,
                'wifi-mac': '1234568',
                'wifi-driver': 'realtek',
                'has-wifi-extender': false,
                'has-wifi-5G-support': true,
                'can-use-wifi-extender': true,
                'ethernet-mac': '1234568',
                'network-type': 'wifi',
                'network-name': 'network',
                'friendly-device-name': 'Roku Ultra (CA)',
                'friendly-model-name': 'Roku Ultra',
                'default-device-name': 'Roku Ultra - 1234568',
                'user-device-name': 'Roku Ultra (CA)',
                'user-device-location': 'Office',
                'build-number': '46C.00E04157A',
                'software-version': '11.0.0',
                'software-build': 4157,
                'secure-device': true,
                'language': 'en',
                'country': 'US',
                'locale': 'en_US',
                'time-zone-auto': true,
                'time-zone': 'Canada/Atlantic',
                'time-zone-name': 'Canada/Atlantic',
                'time-zone-tz': 'America/Halifax',
                'time-zone-offset': -180,
                'clock-format': '12-hour',
                'uptime': 92316,
                'power-mode': 'PowerOn',
                'supports-suspend': false,
                'supports-find-remote': true,
                'find-remote-is-possible': true,
                'supports-audio-guide': true,
                'supports-rva': true,
                'developer-enabled': true,
                'keyed-developer-id': '1234568',
                'search-enabled': true,
                'search-channels-enabled': true,
                'voice-search-enabled': true,
                'notifications-enabled': true,
                'notifications-first-use': false,
                'supports-private-listening': true,
                'headphones-connected': false,
                'supports-audio-settings': false,
                'supports-ecs-textedit': true,
                'supports-ecs-microphone': true,
                'supports-wake-on-wlan': false,
                'supports-airplay': true,
                'has-play-on-roku': true,
                'has-mobile-screensaver': true,
                'support-url': 'roku.com/support',
                'grandcentral-version': '7.0.59',
                'trc-version': 3,
                'trc-channel-version': '6.0.15',
                'davinci-version': '2.8.20',
                'av-sync-calibration-enabled': 2
            }
        }];
    }

    private devices;

    private _onDidChangeTreeData: vscode.EventEmitter<vscode.TreeItem> = new vscode.EventEmitter<vscode.TreeItem>();
    public readonly onDidChangeTreeData: vscode.Event<vscode.TreeItem> = this._onDidChangeTreeData.event;

    getTreeItem(element: vscode.TreeItem): vscode.TreeItem | Thenable<vscode.TreeItem> {
        return element;
    }

    getChildren(element?: vscode.TreeItem): vscode.ProviderResult<vscode.TreeItem[]> {
        if (!element) {
            if (this.devices) {
                let items: vscode.TreeItem[] = [];
                for (const device of this.devices) {
                    let treeItem = new vscode.TreeItem(device.deviceInfo['user-device-name'] + ' - ' + device.deviceInfo['serial-number'], vscode.TreeItemCollapsibleState.Collapsed);
                    treeItem.id = device.deviceInfo['device-id'];
                    treeItem.tooltip = `${device.ip} | ${device.deviceInfo['default-device-name']} - ${device.deviceInfo['model-number']} | ${device.deviceInfo['user-device-location']}`;
                    items.push(treeItem);
                }
                return items;
            } else {
                return [];
            }
        } else {
            let result: vscode.TreeItem[] = [];
            let device = this.devices.find(device => device.deviceInfo['device-id'] === element.id);

            for (let property in device.deviceInfo) {
                let treeItem = new vscode.TreeItem(property);
                treeItem.description = device.deviceInfo[property].toString();
                treeItem.id = property + '|' + element.id;
                result.push(treeItem);
            }

            console.log(element);
            return result;
        }
    }

    // getParent?(element: vscode.TreeItem): vscode.ProviderResult<vscode.TreeItem> {
    //     throw new Error('Method not implemented.');
    // }

    // resolveTreeItem?(item: vscode.TreeItem, element: vscode.TreeItem): vscode.ProviderResult<vscode.TreeItem> {
    //     throw new Error('Method not implemented.');
    // }
}
