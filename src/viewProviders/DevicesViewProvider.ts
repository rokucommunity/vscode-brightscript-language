import * as vscode from 'vscode';
import * as semver from 'semver';
import type { ConfiguredDevice, DeviceManager, RokuDevice } from '../deviceDiscovery/DeviceManager';
import type { CredentialStore } from '../managers/CredentialStore';
import { util } from '../util';
import { ViewProviderId } from './ViewProviderId';
import {
    DEFAULT_DEVICE_FILTERS,
    DEVICE_FILTER_KEYS,
    applyDeviceFilters,
    loadDeviceFilters,
    type DeviceFilters
} from '../deviceFilters';

/**
 * A sequence used to generate unique IDs for tree items that don't care about having a key
 */
let treeItemKeySequence = 0;

/**
 * URI scheme used for device tree items to enable FileDecorationProvider
 */
const DEVICE_URI_SCHEME = 'roku-device';

/**
 * Configuration section that holds each filter's persisted value. Each filter facet
 * lives under this section as its own boolean key (e.g. brightscript.devicesView.filters.online).
 */
const DEVICES_VIEW_FILTERS_SECTION = 'brightscript.devicesView.filters';

export class DevicesViewProvider implements vscode.TreeDataProvider<vscode.TreeItem> {

    public readonly id = ViewProviderId.devicesView;

    private decorationProvider: DeviceDecorationProvider;

    private filters: DeviceFilters;

    constructor(
        private deviceManager: DeviceManager,
        private credentialStore: CredentialStore,
        private context: vscode.ExtensionContext
    ) {
        this.filters = this.loadFilters();
        void this.pushFilterContextKeys();
        this.context.subscriptions.push(
            vscode.workspace.onDidChangeConfiguration(event => {
                if (event.affectsConfiguration(DEVICES_VIEW_FILTERS_SECTION)) {
                    this.reloadFiltersFromSettings();
                }
            })
        );

        this.decorationProvider = new DeviceDecorationProvider();
        vscode.window.registerFileDecorationProvider(this.decorationProvider);

        // Pre-populate devices and decorations so they're ready before first render
        this.devices = this.deviceManager.getAllDevices();
        this.decorationProvider.updateDevices(this.devices);

        this.deviceManager.on('devices-changed', () => {
            this.handleDevicesChanged();
        });

        this.deviceManager.on('scanNeeded-changed', () => {
            if (!this.visible) {
                return;
            }
            this.deviceManager.refresh();
        });

        // Re-render when a device's stored password changes so the Clear item appears/disappears
        this.credentialStore.on('changed', () => {
            this._onDidChangeTreeData.fire(null);
        });
        vscode.workspace.onDidChangeConfiguration(event => {
            if (event.affectsConfiguration('brightscript.devices')) {
                this._onDidChangeTreeData.fire(null);
            }
        });
    }

    private visible = false;
    private scanProgressResolver: (() => void) | null = null;

    public setTreeView(treeView: vscode.TreeView<vscode.TreeItem>) {
        treeView.onDidChangeVisibility(e => {
            this.visible = e.visible;
            if (!this.visible) {
                return;
            }
            this.deviceManager.refresh();
        });

        // Health check device when expanded (not on every getChildren/devices-changed)
        treeView.onDidExpandElement(e => {
            const element = e.element as DeviceTreeItem;
            if (element?.contextValue === 'device' && element.key) {
                const device = this.deviceManager.getDevice(element.key);
                if (device) {
                    this.deviceManager.healthCheckDevice(device).catch(() => { });
                }
            }
        });

        this.deviceManager.on('scan-started', () => {
            this.showScanProgress();
        });

        this.deviceManager.on('scan-ended', () => {
            this.endScanProgress();
        });
    }

    private showScanProgress() {
        // If already showing progress, don't start another
        if (this.scanProgressResolver) {
            return;
        }

        void vscode.window.withProgress(
            {
                location: { viewId: this.id }
            },
            () => {
                return new Promise<void>((resolve) => {
                    this.scanProgressResolver = resolve;
                });
            }
        );
    }

    private endScanProgress() {
        if (this.scanProgressResolver) {
            this.scanProgressResolver();
            this.scanProgressResolver = null;
        }
    }

    private handleDevicesChanged(): void {
        this.devices = this.deviceManager.getAllDevices();
        this.decorationProvider.updateDevices(this.devices);
        this._onDidChangeTreeData.fire(null);
    }

    /**
     * Should the unique info about a device be obfuscated (i.e. randomly modified to protect the data)?
     */
    private get isConcealDeviceInfoEnabled() {
        return util.getConfiguration('brightscript.deviceDiscovery').get('concealDeviceInfo') === true;
    }

    private devices: Array<RokuDevice>;

    async getChildren(element?: DeviceTreeItem | DeviceInfoTreeItem): Promise<DeviceTreeItem[] | DeviceInfoTreeItem[]> {
        if (!element) {
            // Fetch directly if devices haven't been populated yet (avoids debounce delay on initial load)
            if (this.devices.length === 0) {
                this.devices = this.deviceManager.getAllDevices();
                this.decorationProvider.updateDevices(this.devices);
            }
            if (this.devices) {
                let items: DeviceTreeItem[] = [];
                const visibleDevices = this.applyFilters(this.devices);
                for (const device of visibleDevices) {
                    // Make a rook item for each device
                    let treeItem = new DeviceTreeItem(
                        this.deviceManager.getDeviceDisplayName(device),
                        vscode.TreeItemCollapsibleState.Collapsed,
                        device.key,
                        device.deviceInfo
                    );
                    treeItem.tooltip = `${device.ip} | ${device.deviceInfo['friendly-model-name'] || ''} - ${this.concealString(device.deviceInfo['serial-number']?.toString() || '')} | ${device.deviceInfo['user-device-location'] || ''}`;

                    // Set resourceUri to enable FileDecorationProvider for text coloring
                    // Use the device key which is serial-based when available, IP-based as fallback
                    treeItem.resourceUri = vscode.Uri.parse(`${DEVICE_URI_SCHEME}:/${device.key}`);
                    treeItem.iconPath = this.deviceManager.getIconPath(device);

                    // Set contextValue for context menu actions
                    // Values: device, device-user, device-workspace, device-user-workspace
                    const inUser = device.configuredIn?.includes('user');
                    const inWorkspace = device.configuredIn?.includes('workspace');
                    let contextValue = 'device';
                    if (inUser && inWorkspace) {
                        contextValue = 'device-user-workspace';
                    } else if (inUser) {
                        contextValue = 'device-user';
                    } else if (inWorkspace) {
                        contextValue = 'device-workspace';
                    }
                    treeItem.contextValue = contextValue;

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

            const device = this.deviceManager.getDevice(element.key);
            if (!device) {
                return;
            }

            if (device.deviceInfo?.['is-tv'] === 'true') {
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

            if (device.serialNumber) {
                const hasPassword = await this.hasStoredPasswordForSerial(device.serialNumber);
                if (hasPassword) {
                    result.unshift(
                        this.createDeviceInfoTreeItem({
                            label: '🗑️ Clear Device Password',
                            parent: element,
                            collapsibleState: vscode.TreeItemCollapsibleState.None,
                            tooltip: 'Clear the stored developer password for this device',
                            command: {
                                command: 'extension.brightscript.clearDevicePassword',
                                title: 'Clear Device Password',
                                arguments: [device.serialNumber]
                            }
                        })
                    );
                }
                result.unshift(
                    this.createDeviceInfoTreeItem({
                        label: hasPassword ? '🔑 Change Device Password' : '🔑 Set Device Password',
                        parent: element,
                        collapsibleState: vscode.TreeItemCollapsibleState.None,
                        tooltip: hasPassword ? 'Change the stored developer password for this device' : 'Set password for this device',
                        command: {
                            command: 'extension.brightscript.setDevicePassword',
                            title: hasPassword ? 'Change Device Password' : 'Set Device Password',
                            arguments: [device.serialNumber]
                        }
                    })
                );
            }

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

            // Device actions that require software version 15.0.4 or later
            if (semver.satisfies(element.details['software-version'], '>=15.0.4')) {
                result.unshift(
                    this.createDeviceInfoTreeItem({
                        label: '🔄 Check for Software Updates',
                        parent: element,
                        collapsibleState: vscode.TreeItemCollapsibleState.None,
                        tooltip: 'Check for and install software updates',
                        command: {
                            command: 'extension.brightscript.devicesView.checkAndInstallUpdates',
                            title: 'Check for Updates',
                            arguments: [{ key: element.key }]
                        }
                    })
                );

                result.unshift(
                    this.createDeviceInfoTreeItem({
                        label: '🔁 Restart Device',
                        parent: element,
                        collapsibleState: vscode.TreeItemCollapsibleState.None,
                        tooltip: 'Restart this device',
                        command: {
                            command: 'extension.brightscript.devicesView.restartDevice',
                            title: 'Restart Device',
                            arguments: [{ key: element.key }]
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

    /**
     * Returns true when a password for the given serial number is stored in
     * the CredentialStore or in any `brightscript.devices[]` settings scope
     * (user, workspace, or workspace-folder). Used to decide whether the
     * "Clear Device Password" tree item should be shown.
     */
    private async hasStoredPasswordForSerial(serialNumber: string): Promise<boolean> {
        if (await this.credentialStore.getPassword(serialNumber)) {
            return true;
        }

        const scopeHasPassword = (devices: ConfiguredDevice[] | undefined): boolean => !!devices?.some(entry => entry.serialNumber === serialNumber && !!entry.password);

        const rootConfig = vscode.workspace.getConfiguration('brightscript');
        const rootInspection = rootConfig.inspect<ConfiguredDevice[]>('devices');
        if (scopeHasPassword(rootInspection?.globalValue) || scopeHasPassword(rootInspection?.workspaceValue)) {
            return true;
        }

        for (const folder of vscode.workspace.workspaceFolders ?? []) {
            const folderInspection = vscode.workspace.getConfiguration('brightscript', folder.uri).inspect<ConfiguredDevice[]>('devices');
            if (scopeHasPassword(folderInspection?.workspaceFolderValue)) {
                return true;
            }
        }

        return false;
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

    private applyFilters(devices: RokuDevice[]): RokuDevice[] {
        return applyDeviceFilters(devices, this.filters);
    }

    private loadFilters(): DeviceFilters {
        return loadDeviceFilters(DEVICES_VIEW_FILTERS_SECTION);
    }

    private reloadFiltersFromSettings(): void {
        const next = this.loadFilters();
        // Skip redundant work when our own update triggered the change event.
        const unchanged = DEVICE_FILTER_KEYS.every(filterKey => this.filters[filterKey] === next[filterKey]);
        if (unchanged) {
            return;
        }
        this.filters = next;
        void this.pushFilterContextKeys();
        this._onDidChangeTreeData.fire(null);
    }

    /**
     * Push per-facet context keys plus the aggregate hasActiveFilters key so
     * the title-bar submenu can choose which entry to render for each filter.
     */
    private pushFilterContextKeys(): Thenable<unknown> {
        const tasks: Thenable<unknown>[] = [];
        for (const key of DEVICE_FILTER_KEYS) {
            // Note the singular `filter` — matches the when-clauses in package.json's submenu.
            tasks.push(vscode.commands.executeCommand('setContext', `brightscript.devicesView.filter.${key}`, this.filters[key]));
        }
        return Promise.all(tasks);
    }

    /**
     * Flip a single filter facet, persist the new state to user settings, and refresh the tree.
     * Writing to the user-settings scope means the value syncs across windows via VS Code's
     * config change events and across machines via Settings Sync.
     */
    public async toggleFilter(key: keyof DeviceFilters): Promise<void> {
        if (!DEVICE_FILTER_KEYS.includes(key)) {
            return;
        }
        const nextValue = !this.filters[key];
        this.filters = { ...this.filters, [key]: nextValue };

        const config = vscode.workspace.getConfiguration(DEVICES_VIEW_FILTERS_SECTION);
        // Toggling back to a default value clears the user-settings entry instead of storing it explicitly.
        const valueToWrite = nextValue === DEFAULT_DEVICE_FILTERS[key] ? undefined : nextValue;
        try {
            await config.update(key, valueToWrite, vscode.ConfigurationTarget.Global);
        } catch {
            // Best-effort persistence — filter state is not critical.
        }

        await this.pushFilterContextKeys();
        this._onDidChangeTreeData.fire(null);
    }

    /**
     * Restore every filter facet to its default by clearing the user-settings entry for each key.
     */
    public async resetFilters(): Promise<void> {
        this.filters = { ...DEFAULT_DEVICE_FILTERS };

        const config = vscode.workspace.getConfiguration(DEVICES_VIEW_FILTERS_SECTION);
        try {
            await Promise.all(
                DEVICE_FILTER_KEYS.map(key => config.update(key, undefined, vscode.ConfigurationTarget.Global))
            );
        } catch {
            // Best-effort persistence — filter state is not critical.
        }

        await this.pushFilterContextKeys();
        this._onDidChangeTreeData.fire(null);
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

/**
 * Provides file decorations for device tree items to color text based on device state
 */
class DeviceDecorationProvider implements vscode.FileDecorationProvider {
    private _onDidChangeFileDecorations = new vscode.EventEmitter<vscode.Uri | vscode.Uri[]>();
    readonly onDidChangeFileDecorations = this._onDidChangeFileDecorations.event;

    private deviceStates = new Map<string, string>();

    updateDevices(devices: RokuDevice[]): void {
        const changedUris: vscode.Uri[] = [];
        for (const device of devices) {
            const oldState = this.deviceStates.get(device.key);
            if (oldState !== device.deviceState) {
                this.deviceStates.set(device.key, device.deviceState);
                changedUris.push(vscode.Uri.parse(`${DEVICE_URI_SCHEME}:/${device.key}`));
            }
        }
        if (changedUris.length > 0) {
            this._onDidChangeFileDecorations.fire(changedUris);
        }
    }

    provideFileDecoration(uri: vscode.Uri): vscode.FileDecoration | undefined {
        if (uri.scheme !== DEVICE_URI_SCHEME) {
            return undefined;
        }

        const deviceKey = uri.path.slice(1); // Remove leading slash (key is "s:..." or "i:...")
        const state = this.deviceStates.get(deviceKey);

        if (state !== 'online') {
            return {
                color: new vscode.ThemeColor('disabledForeground')
            };
        }

        return undefined;
    }
}
