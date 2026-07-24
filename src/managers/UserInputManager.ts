import { Deferred } from 'brighterscript';
import type { DeviceInfoRaw, DeviceConfig, DeviceStatus } from 'roku-deploy';
import type {
    Disposable,
    QuickPickItem
} from 'vscode';
import * as vscode from 'vscode';
import type { ConfiguredDevice, DeviceManager, HostWithDeviceInfo, RokuDevice } from '../deviceDiscovery/DeviceManager';
import type { CredentialStore } from './CredentialStore';
import { icons } from '../icons';
import { vscodeContextManager } from './VscodeContextManager';
import { util } from '../util';
import {
    DEFAULT_DEVICE_FILTERS,
    DEVICE_FILTER_GROUPS,
    DEVICE_FILTER_KEYS,
    DEVICE_FILTER_LABELS,
    applyDeviceFilters,
    loadDeviceFilters,
    type DeviceFilters
} from '../deviceFilters';

const DEVICE_QUICK_PICK_FILTERS_SECTION = 'brightscript.deviceQuickPick.filters';

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

/**
 * The outcome of resolving a developer password for a device.
 */
export type DevicePasswordResolution =
    | { status: 'ok'; password: string }
    | { status: 'unreachable' }
    | { status: 'cancelled' };

export class UserInputManager {

    public constructor(
        private deviceManager: DeviceManager,
        private credentialStore: CredentialStore
    ) { }

    public async promptForHostManual(): Promise<HostWithDeviceInfo | undefined> {
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
                //probing gathers the device info the same way as the picker; return it alongside the host
                return { host: probed.ip, deviceInfo: probed.deviceInfo, device: probed.device };
            }
            await vscode.window.showErrorMessage(`Unable to connect to a Roku at ${value}. Check the IP and confirm developer mode is enabled.`);
        }
    }

    /**
     * Resolve a developer password that the device at `host` accepts.
     *
     * Every known candidate is tried in order (stored credential, configured
     * `brightscript.devices[].password`, the default device password, and any caller-provided
     * `extraCandidates`), each validated against the device. The first accepted candidate wins.
     * If none are accepted, the user is prompted, re-prompting after each rejection until they
     * enter a working password or cancel. An accepted password refreshes the credential store
     * entry when one already exists; callers that keep a global password fallback persist that
     * themselves.
     *
     * @returns `ok` with the accepted password, `unreachable` when the device can't be contacted,
     *          or `cancelled` when the user dismisses the prompt.
     */
    public async resolveDevicePassword(options: { host: string; serialNumber: string | undefined; extraCandidates?: Array<string | undefined> }): Promise<DevicePasswordResolution> {
        const { host, serialNumber } = options;
        const candidates = await this.collectDevicePasswordCandidates(serialNumber, options.extraCandidates);

        for (const candidate of candidates) {
            const validation = await this.deviceManager.validateDevicePassword(host, candidate);
            if (validation === 'ok') {
                await this.persistDevicePassword(serialNumber, candidate);
                return { status: 'ok', password: candidate };
            }
            if (validation === 'unreachable') {
                return { status: 'unreachable' };
            }
            // 'bad-password' — fall through to the next candidate
        }

        // No stored / configured candidate was accepted. Prompt, re-prompting after each
        // bad-password attempt until the user enters a working one or cancels (empty / Esc).
        let placeholder = candidates.length > 0
            ? 'The password was rejected by the device. Try again, or press Esc to cancel.'
            : 'The Roku development webserver password.';
        while (true) {
            const value = await this.promptForDevicePassword(placeholder);
            if (!value) {
                return { status: 'cancelled' };
            }
            const validation = await this.deviceManager.validateDevicePassword(host, value);
            if (validation === 'ok') {
                await this.persistDevicePassword(serialNumber, value);
                return { status: 'ok', password: value };
            }
            if (validation === 'unreachable') {
                return { status: 'unreachable' };
            }
            placeholder = 'The password was rejected by the device. Try again, or press Esc to cancel.';
        }
    }

    /**
     * Build the ordered, de-duplicated list of candidate passwords to try when resolving
     * credentials for a device. Variable placeholders and empty values are filtered out so the
     * validation loop only sees real passwords. `extraCandidates` are appended after the
     * standard sources (e.g. launch-config values for a debug session).
     */
    private async collectDevicePasswordCandidates(serialNumber: string | undefined, extraCandidates?: Array<string | undefined>): Promise<string[]> {
        const candidates: string[] = [];
        const addCandidate = (value: string | undefined | null) => {
            const trimmed = value?.trim();
            // eslint-disable-next-line no-template-curly-in-string
            if (!trimmed || trimmed === '${promptForPassword}' || trimmed === '${activeHostPassword}') {
                return;
            }
            candidates.push(trimmed);
        };

        if (serialNumber) {
            addCandidate(await this.credentialStore.getPassword(serialNumber));

            const scanScope = (devices: ConfiguredDevice[] | undefined) => {
                for (const entry of devices ?? []) {
                    if (entry.serialNumber === serialNumber) {
                        addCandidate(entry.password);
                    }
                }
            };
            const rootInspection = vscode.workspace.getConfiguration('brightscript').inspect<ConfiguredDevice[]>('devices');
            scanScope(rootInspection?.globalValue);
            scanScope(rootInspection?.workspaceValue);
            for (const folder of vscode.workspace.workspaceFolders ?? []) {
                const folderInspection = vscode.workspace.getConfiguration('brightscript', folder.uri).inspect<ConfiguredDevice[]>('devices');
                scanScope(folderInspection?.workspaceFolderValue);
            }
        }

        addCandidate(this.deviceManager.getDefaultPassword());
        for (const extra of extraCandidates ?? []) {
            addCandidate(extra);
        }

        // Dedupe while preserving insertion order so a password referenced by multiple
        // sources is only validated once.
        return Array.from(new Set(candidates));
    }

    /**
     * Persist an accepted password by refreshing the credential store, but only when an entry
     * already exists for this serial (storing a brand-new entry is an explicit opt-in elsewhere).
     */
    private async persistDevicePassword(serialNumber: string | undefined, password: string): Promise<void> {
        if (serialNumber && (await this.credentialStore.getPassword(serialNumber)) !== undefined) {
            await this.credentialStore.setPassword(serialNumber, password);
        }
    }

    /**
     * Password input dialog. Returns the typed value, or undefined on Esc / hide.
     */
    private async promptForDevicePassword(placeholder: string): Promise<string | undefined> {
        const input = vscode.window.createInputBox();
        input.placeholder = placeholder;
        input.password = true;
        try {
            return await new Promise<string | undefined>(resolve => {
                input.onDidAccept(() => {
                    resolve(input.value);
                    input.hide();
                });
                input.onDidHide(() => {
                    resolve(undefined);
                });
                input.show();
            });
        } finally {
            input.dispose();
        }
    }

    /**
     * Prompt the user to pick a host from a list of devices
     */
    public async promptForHost(options?: { defaultValue?: string }): Promise<HostWithDeviceInfo | undefined> {

        const deferred = new Deferred<{ ip: string; deviceInfo: DeviceInfoRaw; device: DeviceConfig; rce?: { status: DeviceStatus }; manual?: false } | { manual: true }>();
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
                        if (device.rce) {
                            //cloud emulator devices skip the LAN health-check gate below; a pick that
                            //isn't running yet is allowed through so the caller (DebugConfigurationProvider)
                            //can show a more specific "start it from the Cloud Emulator panel" message
                            //instead of the generic "not responding" one
                            deferred.resolve({
                                ip: device.ip,
                                deviceInfo: device.deviceInfo,
                                device: device.device,
                                rce: { status: device.rce.status }
                            });
                        } else {
                            // if the selected device isn't healthy, show an error and keep the picker open so they can select a different device
                            setBusy(true);
                            const isHealthy = await this.deviceManager.healthCheckDevice(device, true, false);
                            setBusy(false);
                            if (!isHealthy) {
                                await vscode.window.showErrorMessage(`The selected device (${device.ip}) is not responding.`);
                                return;
                            }
                            this.deviceManager.setLastUsedDeviceIp(device.ip);
                            deferred.resolve({ ip: device.ip, deviceInfo: device.deviceInfo, device: device.device });
                        }
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
                deferred.resolve({ ip: probed.ip, deviceInfo: probed.deviceInfo, device: probed.device });
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
        const FILTER_DEVICES = 'Filter Devices';

        const refreshList = () => {
            const filters = loadDeviceFilters(DEVICE_QUICK_PICK_FILTERS_SECTION);
            const items = this.createHostQuickPickList(
                applyDeviceFilters(this.deviceManager.getAllDevices(), filters),
                this.deviceManager.getLastUsedDeviceIp(),
                itemCache
            );
            quickPick.items = items;
            const discoveryEnabled = vscodeContextManager.get('brightscript.deviceDiscovery.enabled') === true;
            // Buttons render left-to-right; the rightmost button is the most prominent.
            quickPick.buttons = [
                {
                    iconPath: new vscode.ThemeIcon('filter'),
                    tooltip: FILTER_DEVICES
                },
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

        //refresh the list when the toggle icon's source setting changes, or when any of the
        //device-quick-pick filter facets change (so other windows toggling a filter affect this picker)
        disposables.push(
            vscode.workspace.onDidChangeConfiguration(e => {
                if (
                    e.affectsConfiguration('brightscript.deviceDiscovery.enabled') ||
                    e.affectsConfiguration(DEVICE_QUICK_PICK_FILTERS_SECTION)
                ) {
                    refreshList();
                }
            })
        );

        //while the filter submenu is showing, the parent picker briefly hides — don't treat that as a dismissal
        let filterSubmenuOpen = false;
        quickPick.onDidHide(() => {
            if (filterSubmenuOpen) {
                return;
            }
            dispose();
            deferred.reject(new Error('No host was selected'));
        });

        const openFilterSubmenu = () => {
            filterSubmenuOpen = true;
            this.showFilterSubmenu().finally(() => {
                filterSubmenuOpen = false;
                // Re-render items before re-showing — without this the parent picker
                // appears empty after a hide/show cycle when no settings changed during the submenu.
                refreshList();
                quickPick.show();
            });
        };

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
            } else if (button.tooltip === FILTER_DEVICES) {
                openFilterSubmenu();
            }
        });

        //run the list refresh once to show the popup
        refreshList();
        const result = await deferred.promise;
        dispose();
        if (result.manual === true) {
            return this.promptForHostManual();
        } else {
            return {
                host: result.ip,
                deviceInfo: result.deviceInfo,
                device: result.device,
                //omitted entirely (rather than included as undefined) for a LAN pick, so existing
                //callers that only look at host/deviceInfo/device see the same shape as before
                ...(result.rce ? { rce: result.rce } : {})
            };
        }
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
                label: this.deviceManager.getDeviceDisplayName(lastUsedDevice, true),
                device: lastUsedDevice,
                iconPath: this.deviceManager.getIconPath(lastUsedDevice)
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
                    label: this.deviceManager.getDeviceDisplayName(device, true),
                    device: device,
                    iconPath: this.deviceManager.getIconPath(device)
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

    /**
     * Open a checkbox-style quick pick (canSelectMany) listing each filter facet.
     * Follows VS Code's standard multi-select pattern: Space toggles checkboxes,
     * Enter commits the current selection to user settings, Escape cancels. A title-bar
     * Reset button resets the picker's selection to defaults (still committed on Enter).
     */
    private showFilterSubmenu(): Promise<void> {
        return new Promise<void>((resolve) => {
            const RESET_FILTERS = 'Reset Filters';
            const filterPick = vscode.window.createQuickPick<QuickPickFilterItem>();
            filterPick.title = 'Filter Devices';
            filterPick.placeholder = 'Space to toggle, Enter to apply, Escape to cancel';
            filterPick.canSelectMany = true;
            filterPick.buttons = [{
                iconPath: new vscode.ThemeIcon('discard'),
                tooltip: RESET_FILTERS
            }];

            const buildItems = (filters: DeviceFilters): QuickPickFilterItem[] => {
                const result: QuickPickFilterItem[] = [];
                for (let groupIndex = 0; groupIndex < DEVICE_FILTER_GROUPS.length; groupIndex++) {
                    if (groupIndex > 0) {
                        result.push({ label: '', kind: vscode.QuickPickItemKind.Separator });
                    }
                    for (const facetKey of DEVICE_FILTER_GROUPS[groupIndex]) {
                        result.push({
                            label: DEVICE_FILTER_LABELS[facetKey],
                            picked: filters[facetKey],
                            facetKey: facetKey
                        });
                    }
                }
                return result;
            };

            // Initial load — render items from current settings and pre-select the picked ones
            const initialFilters = loadDeviceFilters(DEVICE_QUICK_PICK_FILTERS_SECTION);
            const items = buildItems(initialFilters);
            filterPick.items = items;
            filterPick.selectedItems = items.filter(i => i.picked);

            filterPick.onDidTriggerButton((button) => {
                if (button.tooltip !== RESET_FILTERS) {
                    return;
                }
                // Reset the picker's selection to the in-code defaults — user still has to
                // press Enter to commit or Escape to discard, matching the rest of the flow.
                filterPick.selectedItems = items.filter(item => {
                    return item.facetKey ? DEFAULT_DEVICE_FILTERS[item.facetKey] : false;
                });
            });

            filterPick.onDidAccept(async () => {
                const selectedFacets = new Set<keyof DeviceFilters>();
                for (const item of filterPick.selectedItems) {
                    if (item.facetKey) {
                        selectedFacets.add(item.facetKey);
                    }
                }
                const currentFilters = loadDeviceFilters(DEVICE_QUICK_PICK_FILTERS_SECTION);
                const config = vscode.workspace.getConfiguration(DEVICE_QUICK_PICK_FILTERS_SECTION);
                const writes: Thenable<unknown>[] = [];
                for (const facetKey of DEVICE_FILTER_KEYS) {
                    const nextValue = selectedFacets.has(facetKey);
                    if (nextValue === currentFilters[facetKey]) {
                        continue;
                    }
                    const valueToWrite = nextValue === DEFAULT_DEVICE_FILTERS[facetKey] ? undefined : nextValue;
                    writes.push(config.update(facetKey, valueToWrite, vscode.ConfigurationTarget.Global));
                }
                if (writes.length > 0) {
                    try {
                        await Promise.all(writes);
                    } catch {
                        // best-effort persistence
                    }
                }
                filterPick.hide();
            });

            filterPick.onDidHide(() => {
                filterPick.dispose();
                resolve();
            });

            filterPick.show();
        });
    }
}

type QuickPickFilterItem = QuickPickItem & { facetKey?: keyof DeviceFilters };

type QuickPickHostItem = QuickPickItem & { device?: RokuDevice; iconPath?: vscode.ThemeIcon | { light: vscode.Uri; dark: vscode.Uri } };
