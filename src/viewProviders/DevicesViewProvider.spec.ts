import { expect } from 'chai';
import * as sinonImport from 'sinon';
import { EventEmitter } from 'eventemitter3';
import { vscode } from '../mockVscode.spec';

let Module = require('module');
const { require: oldRequire } = Module.prototype;

Module.prototype.require = function hijacked(file) {
    if (file === 'vscode') {
        return vscode;
    } else {
        return oldRequire.apply(this, arguments);
    }
};

import { DevicesViewProvider } from './DevicesViewProvider';
import type { DeviceFilters } from '../deviceFilters';

if (!(vscode as any).TreeItemCollapsibleState) {
    (vscode as any).TreeItemCollapsibleState = { None: 0, Collapsed: 1, Expanded: 2 };
}
if (!(vscode as any).ConfigurationTarget) {
    (vscode as any).ConfigurationTarget = { Global: 1, Workspace: 2, WorkspaceFolder: 3 };
}

const FILTERS_SECTION = 'brightscript.devicesView.filters';

function ensureConfigStore(): Record<string, any> {
    (vscode.workspace as any)._configuration ??= {};
    return (vscode.workspace as any)._configuration;
}

function seedFilters(partial: Partial<DeviceFilters>): void {
    const store = ensureConfigStore();
    for (const [key, value] of Object.entries(partial)) {
        store[`${FILTERS_SECTION}.${key}`] = value;
    }
}

function clearFilters(): void {
    const store = ensureConfigStore();
    for (const key of Object.keys(store)) {
        if (key.startsWith(`${FILTERS_SECTION}.`)) {
            delete store[key];
        }
    }
}

function readSavedFilters(): Record<string, boolean> {
    const store = ensureConfigStore();
    const result: Record<string, boolean> = {};
    for (const key of Object.keys(store)) {
        if (key.startsWith(`${FILTERS_SECTION}.`)) {
            result[key.slice(FILTERS_SECTION.length + 1)] = store[key];
        }
    }
    return result;
}

let sinon: sinonImport.SinonSandbox;
beforeEach(() => {
    sinon = sinonImport.createSandbox();
});
afterEach(() => {
    sinon.restore();
});

describe('DevicesViewProvider', () => {
    function makeDevice(overrides: { key: string; isTv?: boolean; isStick?: boolean; deviceState?: string; lastDeviceState?: string; developerEnabled?: 'true' | 'false' | undefined; isConfigured?: boolean; serialNumber?: string; softwareVersion?: string; configuredIn?: string[] }) {
        return {
            key: overrides.key,
            ip: '1.2.3.4',
            deviceState: overrides.deviceState ?? 'online',
            lastDeviceState: overrides.lastDeviceState ?? 'unknown',
            isConfigured: overrides.isConfigured ?? false,
            ...(overrides.serialNumber !== undefined ? { serialNumber: overrides.serialNumber } : {}),
            ...(overrides.configuredIn !== undefined ? { configuredIn: overrides.configuredIn } : {}),
            deviceInfo: {
                'is-tv': overrides.isTv ? 'true' : 'false',
                'is-stick': overrides.isStick ? 'true' : 'false',
                ...(overrides.softwareVersion !== undefined ? { 'software-version': overrides.softwareVersion } : {}),
                ...(overrides.developerEnabled !== undefined ? { 'developer-enabled': overrides.developerEnabled } : {})
            } as any
        } as any;
    }

    function createProvider(devices: any[], options?: { storedPasswords?: Record<string, string> }) {
        const emitter = new EventEmitter();
        const deviceManager: any = {
            on: (event: string, handler: any) => emitter.on(event, handler),
            getAllDevices: () => devices,
            getDevice: (key: string) => devices.find(d => d.key === key),
            getDeviceDisplayName: (device: any) => device.key,
            getIconPath: () => undefined,
            hasDeviceCache: () => false,
            refresh: () => undefined,
            healthCheckDevice: () => Promise.resolve()
        };
        const credentialStore: any = {
            on: () => undefined,
            getPassword: (serialNumber: string) => Promise.resolve(options?.storedPasswords?.[serialNumber])
        };
        const provider = new DevicesViewProvider(deviceManager, credentialStore, vscode.context as any);
        return { provider: provider, deviceManager: deviceManager, emitter: emitter };
    }

    beforeEach(() => {
        clearFilters();
        (vscode.workspace as any)._onDidChangeConfigurationEmitter?.removeAllListeners();
    });

    describe('applyFilters via getChildren', () => {
        it('with the default filters: shows online TV/STB/Stick, hides offline and dev-mode-disabled', async () => {
            const devices = [
                makeDevice({ key: 'tv-online', isTv: true }),
                makeDevice({ key: 'stick-online', isStick: true }),
                makeDevice({ key: 'stb-online' }),
                makeDevice({ key: 'stb-offline', deviceState: 'offline' }),
                makeDevice({ key: 'stb-nondev', developerEnabled: 'false' })
            ];
            const { provider } = createProvider(devices);
            const items = await provider.getChildren();
            expect(items.map(i => (i as any).key)).to.deep.equal(['tv-online', 'stick-online', 'stb-online']);
        });

        it('hides TVs when the TV filter is off', async () => {
            const devices = [
                makeDevice({ key: 'tv1', isTv: true }),
                makeDevice({ key: 'stb1' }),
                makeDevice({ key: 'stick1', isStick: true })
            ];
            seedFilters({ tv: false });
            const { provider } = createProvider(devices);
            const items = await provider.getChildren();
            expect(items.map(i => (i as any).key)).to.deep.equal(['stb1', 'stick1']);
        });

        it('hides offline devices when the offline filter is off (pending with prior online stays visible)', async () => {
            const devices = [
                makeDevice({ key: 'on1' }),
                makeDevice({ key: 'off1', deviceState: 'offline' }),
                makeDevice({ key: 'pending-was-online', deviceState: 'pending', lastDeviceState: 'online' }),
                makeDevice({ key: 'pending-first-load', deviceState: 'pending', lastDeviceState: 'unknown' })
            ];
            const { provider } = createProvider(devices);
            const items = await provider.getChildren();
            expect(items.map(i => (i as any).key)).to.deep.equal(['on1', 'pending-was-online']);
        });

        it('hides online devices when the online filter is off (pending with prior online counts as online)', async () => {
            const devices = [
                makeDevice({ key: 'on1' }),
                makeDevice({ key: 'off1', deviceState: 'offline' }),
                makeDevice({ key: 'pending-was-online', deviceState: 'pending', lastDeviceState: 'online' }),
                makeDevice({ key: 'pending-first-load', deviceState: 'pending', lastDeviceState: 'unknown' })
            ];
            seedFilters({ online: false, offline: true });
            const { provider } = createProvider(devices);
            const items = await provider.getChildren();
            expect(items.map(i => (i as any).key)).to.deep.equal(['off1', 'pending-first-load']);
        });

        it('treats missing developer-enabled as enabled', async () => {
            const devices = [
                makeDevice({ key: 'unknown' }),
                makeDevice({ key: 'explicit-on', developerEnabled: 'true' }),
                makeDevice({ key: 'explicit-off', developerEnabled: 'false' })
            ];
            seedFilters({ devModeEnabled: false, devModeDisabled: true, offline: true });
            const { provider } = createProvider(devices);
            const items = await provider.getChildren();
            expect(items.map(i => (i as any).key)).to.deep.equal(['explicit-off']);
        });

        it('hides user-defined devices when the userDefined filter is off', async () => {
            const devices = [
                makeDevice({ key: 'configured1', isConfigured: true }),
                makeDevice({ key: 'discovered1', isConfigured: false })
            ];
            seedFilters({ userDefined: false });
            const { provider } = createProvider(devices);
            const items = await provider.getChildren();
            expect(items.map(i => (i as any).key)).to.deep.equal(['discovered1']);
        });

        it('hides auto-detected devices when the autoDetected filter is off', async () => {
            const devices = [
                makeDevice({ key: 'configured1', isConfigured: true }),
                makeDevice({ key: 'discovered1', isConfigured: false })
            ];
            seedFilters({ autoDetected: false });
            const { provider } = createProvider(devices);
            const items = await provider.getChildren();
            expect(items.map(i => (i as any).key)).to.deep.equal(['configured1']);
        });

        it('uses defaults when no filter settings are present', async () => {
            const devices = [makeDevice({ key: 'stb-online' })];
            const { provider } = createProvider(devices);
            const items = await provider.getChildren();
            expect(items.map(i => (i as any).key)).to.deep.equal(['stb-online']);
        });
    });

    describe('device tree structure', () => {
        it('builds a capability-token contextValue for a fully-capable device', async () => {
            const devices = [makeDevice({ key: 'tv1', isTv: true, softwareVersion: '15.3.4', serialNumber: 'SERIAL1' })];
            const { provider } = createProvider(devices);
            const items = await provider.getChildren();
            expect(items[0].contextValue).to.equal('device-notInUser-notInWorkspace-noPassword-isTv-canViewRegistry-canRestart');
        });

        it('includes hasPassword and configured-in tokens, and gates version-specific tokens', async () => {
            const devices = [makeDevice({ key: 'stb1', softwareVersion: '12.0.0', serialNumber: 'SERIAL2', configuredIn: ['user', 'workspace'] })];
            const { provider } = createProvider(devices, { storedPasswords: { SERIAL2: 'secret' } });
            const items = await provider.getChildren();
            expect(items[0].contextValue).to.equal('device-inUser-inWorkspace-hasPassword-canViewRegistry');
        });

        it('omits password and version-gated tokens when serial number and software version are unknown', async () => {
            const devices = [makeDevice({ key: 'stb1' })];
            const { provider } = createProvider(devices);
            const items = await provider.getChildren();
            expect(items[0].contextValue).to.equal('device-notInUser-notInWorkspace');
        });

        it('lists the action items followed by an expandable Device Info group holding the info fields', async () => {
            const devices = [makeDevice({ key: 'stb1' })];
            const { provider } = createProvider(devices);
            const [deviceItem] = await provider.getChildren();

            const deviceChildren = await provider.getChildren(deviceItem);
            expect(deviceChildren.map(child => child.label)).to.deep.equal([
                '🔗 Open device web portal',
                '⭐ Set as Active Device',
                '📷 Capture Screenshot',
                'Device Info'
            ]);

            const deviceInfoGroup = deviceChildren[deviceChildren.length - 1];
            expect(deviceInfoGroup.collapsibleState).to.equal((vscode as any).TreeItemCollapsibleState.Collapsed);

            const infoItems = await provider.getChildren(deviceInfoGroup);
            expect(infoItems.map(item => (item as any).key)).to.include.members(['is-tv', 'is-stick']);
            for (const infoItem of infoItems) {
                expect((infoItem as any).command?.command).to.equal('extension.brightscript.copyToClipboard');
            }
        });

        it('includes the version-gated and device-specific action items when the device supports them', async () => {
            const devices = [makeDevice({ key: 'tv1', isTv: true, softwareVersion: '15.3.4', serialNumber: 'SERIAL1' })];
            const { provider } = createProvider(devices, { storedPasswords: { SERIAL1: 'secret' } });
            const [deviceItem] = await provider.getChildren();

            const deviceChildren = await provider.getChildren(deviceItem);
            expect(deviceChildren.map(child => child.label)).to.deep.equal([
                '🔗 Open device web portal',
                '🔁 Restart Device',
                '🔄 Check for Software Updates',
                '📋 View Registry',
                '🔑 Change Device Password',
                '🗑️ Clear Device Password',
                '⭐ Set as Active Device',
                '📷 Capture Screenshot',
                '📺 Switch TV Input',
                'Device Info'
            ]);
        });
    });

    describe('toggleFilter', () => {
        it('persists a non-default value into the matching settings key', async () => {
            const { provider } = createProvider([]);
            const treeChanged = sinon.spy();
            provider.onDidChangeTreeData(treeChanged);

            await provider.toggleFilter('tv');

            expect(readSavedFilters()).to.deep.equal({ tv: false });
            expect(treeChanged.called).to.be.true;
        });

        it('clears the settings key when toggled back to its default', async () => {
            const { provider } = createProvider([]);
            await provider.toggleFilter('online');
            expect(readSavedFilters()).to.deep.equal({ online: false });
            await provider.toggleFilter('online');
            expect(readSavedFilters()).to.deep.equal({});
        });

        it('records a toggled-on facet that defaults off', async () => {
            const { provider } = createProvider([]);
            await provider.toggleFilter('offline');
            expect(readSavedFilters()).to.deep.equal({ offline: true });
        });

        it('ignores keys that are not part of the filter set', async () => {
            const { provider } = createProvider([]);
            await provider.toggleFilter('nonexistent' as any);
            expect(readSavedFilters()).to.deep.equal({});
        });

        it('updates each facet under its own settings key', async () => {
            const { provider } = createProvider([]);
            await provider.toggleFilter('tv');
            await provider.toggleFilter('online');
            await provider.toggleFilter('offline');
            expect(readSavedFilters()).to.deep.equal({ tv: false, online: false, offline: true });
        });
    });

    describe('resetFilters', () => {
        it('clears every persisted filter override', async () => {
            const { provider } = createProvider([]);
            await provider.toggleFilter('tv');
            await provider.toggleFilter('online');
            await provider.toggleFilter('offline');
            expect(readSavedFilters()).to.deep.equal({ tv: false, online: false, offline: true });

            await provider.resetFilters();
            expect(readSavedFilters()).to.deep.equal({});
        });

        it('restores the live filter set to defaults and fires a tree change', async () => {
            const devices = [
                makeDevice({ key: 'tv1', isTv: true }),
                makeDevice({ key: 'stb1' })
            ];
            seedFilters({ tv: false });
            const { provider } = createProvider(devices);
            // Confirm seeded override is honored before the reset
            let items = await provider.getChildren();
            expect(items.map(i => (i as any).key)).to.deep.equal(['stb1']);

            const treeChanged = sinon.spy();
            provider.onDidChangeTreeData(treeChanged);

            await provider.resetFilters();

            expect(treeChanged.called).to.be.true;
            items = await provider.getChildren();
            expect(items.map(i => (i as any).key)).to.deep.equal(['tv1', 'stb1']);
        });

        it('is a no-op on persistence when nothing was overridden', async () => {
            const { provider } = createProvider([]);
            await provider.resetFilters();
            expect(readSavedFilters()).to.deep.equal({});
        });
    });

    describe('configuration change subscription', () => {
        it('reloads filters and fires a tree change when a filter setting changes externally', async () => {
            const { provider } = createProvider([
                makeDevice({ key: 'tv1', isTv: true }),
                makeDevice({ key: 'stb1' })
            ]);
            const treeChanged = sinon.spy();
            provider.onDidChangeTreeData(treeChanged);

            // Simulate another window writing this setting — directly update the store, then fire the event
            (vscode.workspace as any)._configuration[`${FILTERS_SECTION}.tv`] = false;
            (vscode.workspace as any)._onDidChangeConfigurationEmitter.emit('event', {
                affectsConfiguration: (section: string) => `${FILTERS_SECTION}.tv` === section || `${FILTERS_SECTION}.tv`.startsWith(`${section}.`)
            });

            expect(treeChanged.called).to.be.true;
            const items = await provider.getChildren();
            expect(items.map(i => (i as any).key)).to.deep.equal(['stb1']);
        });

        it('ignores changes to unrelated configuration sections', () => {
            const { provider } = createProvider([]);
            const treeChanged = sinon.spy();
            provider.onDidChangeTreeData(treeChanged);

            (vscode.workspace as any)._onDidChangeConfigurationEmitter.emit('event', {
                affectsConfiguration: (_section: string) => false
            });

            expect(treeChanged.called).to.be.false;
        });

        it('does not fire a tree change when the reload yields the same values (self-write)', async () => {
            const { provider } = createProvider([]);
            await provider.toggleFilter('tv'); // toggles and emits change — provider already up to date
            const treeChanged = sinon.spy();
            provider.onDidChangeTreeData(treeChanged);

            // Fire another change event with the same settings still in place — reload sees no diff
            (vscode.workspace as any)._onDidChangeConfigurationEmitter.emit('event', {
                affectsConfiguration: (section: string) => `${FILTERS_SECTION}.tv` === section || `${FILTERS_SECTION}.tv`.startsWith(`${section}.`)
            });

            expect(treeChanged.called).to.be.false;
        });
    });
});
