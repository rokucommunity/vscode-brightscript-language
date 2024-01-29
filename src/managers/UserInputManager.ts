import { Deferred } from 'brighterscript';
import type {
    Disposable,
    QuickPickItem
} from 'vscode';
import * as vscode from 'vscode';
import type { ActiveDeviceManager, RokuDeviceDetails } from '../ActiveDeviceManager';

/**
 * An id to represent the "Enter manually" option in the host picker
 */
export const manualHostItemId = `${Number.MAX_SAFE_INTEGER}`;
const manualLabel = 'Enter manually';

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
        quickPick.onDidAccept(() => {
            deferred.resolve({
                ip: quickPick.value
            });
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
        const refreshList = () => {
            const items = this.createHostQuickPickList(
                this.activeDeviceManager.getActiveDevices(),
                this.activeDeviceManager.lastUsedDevice,
                itemCache
            );
            quickPick.items = items;

            // update the busy spinner based on how long it's been since the last discovered device
            quickPick.busy = this.activeDeviceManager.timeSinceLastDiscoveredDevice < discoveryTime;
            setTimeout(() => {
                quickPick.busy = this.activeDeviceManager.timeSinceLastDiscoveredDevice < discoveryTime;
            }, discoveryTime - this.activeDeviceManager.timeSinceLastDiscoveredDevice + 20);

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

        quickPick.onDidChangeSelection(selection => {
            const selectedItem = selection[0];
            if (selectedItem) {
                if (selectedItem.kind === vscode.QuickPickItemKind.Separator) {
                    // Handle separator selection
                } else {
                    if (selectedItem.label === manualLabel) {
                        deferred.resolve({ manual: true });
                    } else {
                        const device = (selectedItem as any).device as RokuDeviceDetails;
                        this.activeDeviceManager.lastUsedDevice = device;
                        deferred.resolve(device);
                    }
                    quickPick.dispose();
                }
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
        return `${device.ip} | ${device.deviceInfo['user-device-name']} - ${device.deviceInfo['serial-number']} - ${device.deviceInfo['model-number']}`;
    }

    /**
     * Generate the item list for the `this.promptForHost()` call
     */
    private createHostQuickPickList(devices: RokuDeviceDetails[], lastUsedDevice: RokuDeviceDetails, cache = new Map<string, QuickPickHostItem>()) {
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
                device: lastUsedDevice
            });
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
                    device: device
                });
            }
        }

        //include a divider between devices and "manual" option (only if we have devices)
        if (lastUsedDevice || devices.length) {
            items.push({ label: ' ', kind: vscode.QuickPickItemKind.Separator });
        }

        // allow user to manually type an IP address
        items.push(
            { label: 'Enter manually', device: { id: manualHostItemId } } as any
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
