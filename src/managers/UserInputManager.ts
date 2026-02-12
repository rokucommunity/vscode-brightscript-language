import { Deferred } from 'brighterscript';
import type {
    Disposable,
    QuickPickItem
} from 'vscode';
import * as vscode from 'vscode';
import type { ActiveDeviceManager, RokuDeviceDetails } from '../deviceDiscovery/ActiveDeviceManager';
import { icons } from '../icons';

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
const scanningForDevicesLabel = 'Scanning...';

const scanForDeviceBusyTime = 5_000;

export class UserInputManager {

    public constructor(
        private activeDeviceManager: ActiveDeviceManager
    ) { }

    public async promptForHostManual() {
        return vscode.window.showInputBox({
            placeHolder: 'Please enter the IP address of your Roku device',
            value: ''
        });
    }

    /**
     * Prompt the user to pick a host from a list of devices
     */
    public async promptForHost(options?: { defaultValue?: string }) {

        const deferred = new Deferred<{ ip: string; manual?: boolean } | { ip?: string; manual: true }>();
        const disposables: Array<Disposable> = [];

        const discoveryTime = 5_000;

        const scanTimeoutMs = 7_000;
        let scanTimeoutId: NodeJS.Timeout | null = null;
        let hasScanned = this.activeDeviceManager.refresh();
        let isScanning = false;
        this.activeDeviceManager.on('scanNeeded-changed', () => {
            hasScanned = true;
            if (scanTimeoutId) {
                clearTimeout(scanTimeoutId);
                scanTimeoutId = null;
            }
            this.activeDeviceManager.refresh();
        }, disposables);
        scanTimeoutId = setTimeout(() => {
            if (hasScanned) {
                return;
            }
            this.activeDeviceManager.refresh();
        }, scanTimeoutMs);

        //create the quickpick item
        const quickPick = vscode.window.createQuickPick();
        disposables.push(quickPick);
        quickPick.placeholder = `Please Select a Roku or manually type an IP address`;
        quickPick.keepScrollPosition = true;

        function dispose() {
            for (const disposable of disposables) {
                disposable.dispose();
            }
        }

        //detect if the user types an IP address into the picker and presses enter.
        let selectedDevice: vscode.QuickPickItem | undefined;
        quickPick.onDidAccept(async () => {
            if (selectedDevice) {
                if (selectedDevice.kind === vscode.QuickPickItemKind.Separator) {
                    // Handle separator selection
                } else {
                    if (selectedDevice.label === manualLabel) {
                        deferred.resolve({ manual: true });
                    } else if (selectedDevice.label === scanningForDevicesLabel) {
                        // do nothing if they click the "Scanning..." item since that is just a status and not actionable
                        return;
                    } else if (selectedDevice.label === scanForDevicesLabel) {
                        isScanning = true;
                        quickPick.busy = true;
                        refreshList();
                        this.activeDeviceManager.refresh(true);
                        setTimeout(() => {
                            isScanning = false;
                            quickPick.busy = false;
                            refreshList();
                        }, scanForDeviceBusyTime);
                        return;
                    } else {
                        const device = (selectedDevice as any).device as RokuDeviceDetails;
                        // if the selected device isn't healthy, show an error and keep the picker open so they can select a different device
                        const isHealthy = await this.activeDeviceManager.checkDeviceHealth(device);
                        if (!isHealthy) {
                            await vscode.window.showErrorMessage(`The selected device (${device.ip}) is not responding.`);
                            return;
                        }
                        this.activeDeviceManager.lastUsedDevice = device;
                        deferred.resolve(device);
                    }
                    quickPick.dispose();
                }
                selectedDevice = undefined;
                // If the user has typed a value, resolve with value
            } else if (quickPick.value) {
                deferred.resolve({
                    ip: quickPick.value
                });
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

        const refreshList = () => {
            const items = this.createHostQuickPickList(
                this.activeDeviceManager.getActiveDevices(),
                this.activeDeviceManager.lastUsedDevice,
                itemCache,
                isScanning
            );
            quickPick.items = items;
            quickPick.buttons = [
                {
                    iconPath: new vscode.ThemeIcon('refresh'),
                    tooltip: 'Scan for devices'
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

        //anytime the device picker adds/removes a device, update the list
        this.activeDeviceManager.on('device-found', refreshList, disposables);
        this.activeDeviceManager.on('device-expired', refreshList, disposables);

        quickPick.onDidHide(() => {
            dispose();
            deferred.reject(new Error('No host was selected'));
        });

        quickPick.onDidTriggerButton(button => {
            if (button.tooltip === 'Scan for devices') {
                isScanning = true;
                quickPick.busy = true;
                refreshList();
                this.activeDeviceManager.refresh(true);
                setTimeout(() => {
                    isScanning = false;
                    quickPick.busy = false;
                    refreshList();
                }, scanForDeviceBusyTime);
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
    private createHostLabel(device: RokuDeviceDetails) {
        return [
            device.deviceInfo['model-number'],
            device.deviceInfo['user-device-name'],
            `OS ${device.deviceInfo['software-version']}`,
            device.ip
        ].join(' – ');
    }

    /**
     * Generate the item list for the `this.promptForHost()` call
     */
    private createHostQuickPickList(
        devices: RokuDeviceDetails[],
        lastUsedDevice: RokuDeviceDetails,
        cache = new Map<string, QuickPickHostItem>(),
        isScanning = false
    ) {
        //the collection of items we will eventually return
        let items: QuickPickHostItem[] = [];

        //find the lastUsedDevice from the devices list if possible, or use the data from the lastUsedDevice if not
        lastUsedDevice = devices.find(x => x.id === lastUsedDevice?.id) ?? lastUsedDevice;
        //remove the lastUsedDevice from the devices list so we can more easily reason with the rest of the list
        devices = devices.filter(x => x.id !== lastUsedDevice?.id);

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
                iconPath: icons.getDeviceType(lastUsedDevice)
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
                    iconPath: icons.getDeviceType(device)
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
            } else {
                cache.set(item.label, item);
            }
        }

        return items;
    }
}

type QuickPickHostItem = QuickPickItem & { device?: RokuDeviceDetails };
