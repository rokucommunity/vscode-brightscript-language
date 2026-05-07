import { Deferred } from 'brighterscript';
import type {
    Disposable,
    QuickPickItem
} from 'vscode';
import * as vscode from 'vscode';
import type { DeviceManager, RokuDevice } from '../deviceDiscovery/DeviceManager';
import { icons } from '../icons';
import { vscodeContextManager } from './VscodeContextManager';
import { util } from '../util';

/**
 * An id to represent the "Enter manually" option in the host picker
 */
export const manualHostItemId = `${Number.MAX_SAFE_INTEGER}`;
const manualLabel = 'Enter manually';
/**
 * An id to represent the "Scan for devices" option in the host picker
 */
export const scanForDevicesItemId = `${Number.MAX_SAFE_INTEGER - 1}`;
const scanForDevicesLabel = 'Scan for devices';

export class UserInputManager {

    public constructor(
        private deviceManager: DeviceManager
    ) { }

    public async promptForHostManual(): Promise<string | undefined> {
        while (true) {
            const value = await vscode.window.showInputBox({
                placeHolder: 'Please enter the IP address of your Roku device',
                value: ''
            });
            if (!value) {
                return undefined;
            }
            const probed = await vscode.window.withProgress(
                { location: vscode.ProgressLocation.Notification, title: `Contacting ${value}...` },
                async () => {
                    return this.deviceManager.validateAndAddDevice(value);
                }
            );
            if (probed) {
                return probed.ip;
            }
            await vscode.window.showErrorMessage(`Unable to connect to a Roku at ${value}. Check the IP and confirm developer mode is enabled.`);
        }
    }

    /**
     * Prompt the user to pick a host from a list of devices
     */
    public async promptForHost(options?: { defaultValue?: string }) {

        const deferred = new Deferred<{ ip: string; manual?: boolean } | { ip?: string; manual: true }>();
        const disposables: Array<Disposable> = [];

        //create the quickpick item
        const quickPick = vscode.window.createQuickPick();
        disposables.push(quickPick);
        quickPick.placeholder = `Please Select a Roku or manually type an IP address`;
        quickPick.keepScrollPosition = true;

        // Track multiple busy sources (scan, health check) with a counter
        let busyCount = 0;
        const setBusy = (isBusy: boolean) => {
            busyCount += isBusy ? 1 : -1;
            busyCount = Math.max(0, busyCount); // Prevent negative
            quickPick.busy = busyCount > 0;
        };

        // Subscribe to scan events before triggering refresh so we catch the scan-started event
        this.deviceManager.on('scan-started', () => {
            setBusy(true);
        }, disposables);

        this.deviceManager.on('scan-ended', () => {
            setBusy(false);
        }, disposables);

        const scanTimeoutMs = 7_000;
        let scanTimeoutId: NodeJS.Timeout | null = null;
        let hasScanned = this.deviceManager.scan();
        this.deviceManager.on('scanNeeded-changed', () => {
            hasScanned = true;
            if (scanTimeoutId) {
                clearTimeout(scanTimeoutId);
                scanTimeoutId = null;
            }
            this.deviceManager.scan();
        }, disposables);
        scanTimeoutId = setTimeout(() => {
            if (hasScanned) {
                return;
            }
            this.deviceManager.scan();
        }, scanTimeoutMs);

        function dispose() {
            for (const disposable of disposables) {
                disposable.dispose();
            }
        }

        //detect if the user types an IP address into the picker and presses enter.
        let selectedDevice: vscode.QuickPickItem | undefined;
        quickPick.onDidAccept(async () => {
            if (selectedDevice) {
                if (selectedDevice.kind !== vscode.QuickPickItemKind.Separator) {
                    if (selectedDevice.label === manualLabel) {
                        deferred.resolve({ manual: true });
                    } else if (selectedDevice.label === scanForDevicesLabel) {
                        this.deviceManager.refresh(true);
                        return;
                    } else {
                        const device = (selectedDevice as any).device as RokuDevice;
                        // if the selected device isn't healthy, show an error and keep the picker open so they can select a different device
                        setBusy(true);
                        const isHealthy = await this.deviceManager.healthCheckDevice(device, true, false);
                        setBusy(false);
                        if (!isHealthy) {
                            await vscode.window.showErrorMessage(`The selected device (${device.ip}) is not responding.`);
                            return;
                        }
                        this.deviceManager.setLastUsedDeviceIp(device.ip);
                        deferred.resolve(device);
                    }
                    quickPick.dispose();
                }
                selectedDevice = undefined;
                // If the user has typed a value, probe the IP before resolving so
                // the caller only ever receives a reachable device.
            } else if (quickPick.value) {
                const typedValue = quickPick.value;
                setBusy(true);
                const probed = await this.deviceManager.validateAndAddDevice(typedValue);
                setBusy(false);
                if (!probed) {
                    await vscode.window.showErrorMessage(`Unable to connect to a Roku at ${typedValue}. Check the IP and confirm developer mode is enabled.`);
                    return;
                }
                this.deviceManager.setLastUsedDeviceIp(probed.ip);
                deferred.resolve({ ip: probed.ip });
                quickPick.dispose();
            }
        });

        quickPick.onDidChangeSelection((selection) => {
            // only save the selectedDevice if the user explicitly clicks on an item
            // use the selected device in onDidAccept
            selectedDevice = selection[0];
        });

        let activeChangesSinceRefresh = 0;
        let activeItem: QuickPickItem;

        // remember the currently active item so we can maintain active selection when refreshing the list
        quickPick.onDidChangeActive((items) => {
            // reset our activeChanges tracker since users cannot cause items.length to be 0 (meaning a refresh has just happened)
            if (items.length === 0) {
                activeChangesSinceRefresh = 0;
                return;
            }
            if (activeChangesSinceRefresh > 0) {
                activeItem = items[0];
            }
            activeChangesSinceRefresh++;
        });

        const itemCache = new Map<string, QuickPickHostItem>();
        if (options?.defaultValue) {
            quickPick.value = options?.defaultValue;
        }
        quickPick.show();

        //set a timeout to automatically start scanning for devices after a short delay
        const SCAN_FOR_DEVICES = 'Scan for Devices';
        const CLEAR_DEVICE_LIST = 'Clear Device List';
        const ENABLE_DEVICE_DISCOVERY = 'Enable Device Discovery';
        const DISABLE_DEVICE_DISCOVERY = 'Disable Device Discovery';

        const refreshList = () => {
            const items = this.createHostQuickPickList(
                this.deviceManager.getDevicesForUI(),
                this.deviceManager.getLastUsedDeviceIp(),
                itemCache
            );
            quickPick.items = items;
            const discoveryEnabled = vscodeContextManager.get('brightscript.deviceDiscovery.enabled') === true;
            // Buttons render left-to-right; order is [toggleScanning, clearList, refresh] so right-to-left reads: refresh, clear list, toggle scanning
            quickPick.buttons = [
                {
                    iconPath: discoveryEnabled ? icons.radioTower : icons.radioTowerOff,
                    tooltip: discoveryEnabled ? DISABLE_DEVICE_DISCOVERY : ENABLE_DEVICE_DISCOVERY
                },
                {
                    iconPath: new vscode.ThemeIcon('clear-all'),
                    tooltip: CLEAR_DEVICE_LIST
                },
                {
                    iconPath: new vscode.ThemeIcon('refresh'),
                    tooltip: SCAN_FOR_DEVICES
                }
            ];

            // clear the activeItem if we can't find it in the list
            if (!quickPick.items.includes(activeItem)) {
                activeItem = undefined;
            }

            // if the user manually selected an item, re-focus that item now that we refreshed the list
            if (activeItem) {
                quickPick.activeItems = [activeItem];
            }
            // quickPick.show();
        };

        //anytime the device list changes, update the list
        this.deviceManager.on('devices-changed', refreshList, disposables);

        //anytime the deviceDiscovery.enabled setting changes, refresh the buttons so the toggle icon updates
        disposables.push(
            vscode.workspace.onDidChangeConfiguration(e => {
                if (e.affectsConfiguration('brightscript.deviceDiscovery.enabled')) {
                    refreshList();
                }
            })
        );

        quickPick.onDidHide(() => {
            dispose();
            deferred.reject(new Error('No host was selected'));
        });

        quickPick.onDidTriggerButton(button => {
            if (button.tooltip === SCAN_FOR_DEVICES) {
                this.deviceManager.refresh(true);
            } else if (button.tooltip === CLEAR_DEVICE_LIST) {
                this.deviceManager.clearCurrentDeviceList().catch(() => { });
                void util.showTimedNotification('Clearing device list');
            } else if (button.tooltip === ENABLE_DEVICE_DISCOVERY) {
                void util.setConfigurationValueAtUserOrClosestScope('brightscript.deviceDiscovery.enabled', true);
            } else if (button.tooltip === DISABLE_DEVICE_DISCOVERY) {
                void util.setConfigurationValueAtUserOrClosestScope('brightscript.deviceDiscovery.enabled', false);
            }
        });

        //run the list refresh once to show the popup
        refreshList();
        const result = await deferred.promise;
        dispose();
        if (result?.manual === true) {
            return this.promptForHostManual();
        } else {
            return result?.ip;
        }
    }

    /**
     * Generate the label used when showing "host" entries in a quick picker
     * @param device the device containing all the info
     * @returns a properly formatted host string
     */
    private getDeviceIcon(device: RokuDevice) {
        if (device.deviceState === 'offline') {
            // For offline devices, check cache to distinguish:
            // - warning icon: never successfully contacted (no cache)
            // - disconnect icon: was online before (has cache)
            const hasCache = device.serialNumber && this.deviceManager.hasDeviceCache(device.serialNumber);
            if (hasCache) {
                return new vscode.ThemeIcon('debug-disconnect', new vscode.ThemeColor('disabledForeground'));
            } else {
                return new vscode.ThemeIcon('warning', new vscode.ThemeColor('disabledForeground'));
            }
        } else if (device.deviceState === 'pending') {
            return new vscode.ThemeIcon('circle-small', new vscode.ThemeColor('disabledForeground'));
        }
        return icons.getDeviceType(device.deviceInfo);
    }

    private createHostLabel(device: RokuDevice) {
        return [
            device.deviceInfo['model-number'] || '',
            device.deviceInfo['user-device-name'] || '',
            `OS ${device.deviceInfo['software-version'] || ''}`,
            device.ip
        ].join(' – ');
    }

    /**
     * Generate the item list for the `this.promptForHost()` call
     */
    private createHostQuickPickList(
        devices: RokuDevice[],
        lastUsedDeviceIp: string | undefined,
        cache = new Map<string, QuickPickHostItem>()
    ) {
        //the collection of items we will eventually return
        let items: QuickPickHostItem[] = [];

        //find the lastUsedDevice from the devices list
        const lastUsedDevice = lastUsedDeviceIp ? devices.find(x => x.ip === lastUsedDeviceIp) : undefined;
        //remove the lastUsedDevice from the devices list so we can more easily reason with the rest of the list
        devices = devices.filter(x => x.ip !== lastUsedDeviceIp);

        // Ensure the most recently used device is at the top of the list
        if (lastUsedDevice) {
            //add a separator for "last used"
            items.push({
                label: 'last used',
                kind: vscode.QuickPickItemKind.Separator
            });

            //add the device
            items.push({
                label: this.createHostLabel(lastUsedDevice),
                device: lastUsedDevice,
                iconPath: this.getDeviceIcon(lastUsedDevice)
            } as any);
        }

        //add all other devices
        if (devices.length > 0) {
            items.push({
                label: lastUsedDevice ? 'other devices' : 'devices',
                kind: vscode.QuickPickItemKind.Separator
            });

            //add each device
            for (const device of devices) {
                //add the device
                items.push({
                    label: this.createHostLabel(device),
                    device: device,
                    iconPath: this.getDeviceIcon(device)
                });
            }
        }

        //include a divider between devices and "manual" option (only if we have devices)
        if (lastUsedDevice || devices.length) {
            items.push({ label: ' ', kind: vscode.QuickPickItemKind.Separator });
        }

        // allow user to manually type an IP address
        items.push(
            {
                label: manualLabel,
                device: { id: manualHostItemId },
                iconPath: new vscode.ThemeIcon('keyboard')
            } as any,
            {
                label: scanForDevicesLabel,
                device: { id: scanForDevicesItemId },
                iconPath: new vscode.ThemeIcon('radio-tower')
            } as any
        );

        // replace items with their cached versions if found (to maintain references)
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            if (cache.has(item.label)) {
                items[i] = cache.get(item.label);
                items[i].device = item.device;
                items[i].iconPath = item.iconPath;
            } else {
                cache.set(item.label, item);
            }
        }

        return items;
    }
}

type QuickPickHostItem = QuickPickItem & { device?: RokuDevice; iconPath?: vscode.ThemeIcon | { light: vscode.Uri; dark: vscode.Uri } };
