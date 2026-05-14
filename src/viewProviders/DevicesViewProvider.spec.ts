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
import type { DevicesViewFilters } from './DevicesViewProvider';

if (!(vscode as any).TreeItemCollapsibleState) {
    (vscode as any).TreeItemCollapsibleState = { None: 0, Collapsed: 1, Expanded: 2 };
}

let sinon: sinonImport.SinonSandbox;
beforeEach(() => {
    sinon = sinonImport.createSandbox();
});
afterEach(() => {
    sinon.restore();
});

describe('DevicesViewProvider', () => {
    function makeDevice(overrides: { key: string; isTv?: boolean; isStick?: boolean; deviceState?: string; developerEnabled?: 'true' | 'false' | undefined }) {
        return {
            key: overrides.key,
            ip: '1.2.3.4',
            deviceState: overrides.deviceState ?? 'online',
            deviceInfo: {
                'is-tv': overrides.isTv ? 'true' : 'false',
                'is-stick': overrides.isStick ? 'true' : 'false',
                ...(overrides.developerEnabled !== undefined ? { 'developer-enabled': overrides.developerEnabled } : {})
            } as any
        } as any;
    }

    function createProvider(devices: any[]) {
        const emitter = new EventEmitter();
        const deviceManager: any = {
            on: (event: string, handler: any) => emitter.on(event, handler),
            getDevicesForUI: () => devices,
            getDevice: (key: string) => devices.find(d => d.key === key),
            hasDeviceCache: () => false,
            refresh: () => undefined,
            healthCheckDevice: () => Promise.resolve()
        };
        const credentialStore: any = {
            on: () => undefined,
            getPassword: () => Promise.resolve(undefined)
        };
        const provider = new DevicesViewProvider(deviceManager, credentialStore, vscode.context as any);
        return { provider: provider, deviceManager: deviceManager, emitter: emitter };
    }

    beforeEach(() => {
        vscode.context.workspaceState['_data'] = {};
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
            expect(items.map(i => (i).key)).to.deep.equal(['tv-online', 'stick-online', 'stb-online']);
        });

        it('hides TVs when the TV filter is off', async () => {
            const devices = [
                makeDevice({ key: 'tv1', isTv: true }),
                makeDevice({ key: 'stb1' }),
                makeDevice({ key: 'stick1', isStick: true })
            ];
            vscode.context.workspaceState['_data']['brightscript.devicesView.filters'] = {
                devModeEnabled: true, devModeDisabled: true, tv: false, setTopBox: true, stick: true, online: true, offline: true
            };
            const { provider } = createProvider(devices);
            const items = await provider.getChildren();
            expect(items.map(i => (i).key)).to.deep.equal(['stb1', 'stick1']);
        });

        it('hides offline devices when the offline filter is off', async () => {
            const devices = [
                makeDevice({ key: 'on1' }),
                makeDevice({ key: 'off1', deviceState: 'offline' }),
                makeDevice({ key: 'pending1', deviceState: 'pending' })
            ];
            vscode.context.workspaceState['_data']['brightscript.devicesView.filters'] = {
                devModeEnabled: true, devModeDisabled: true, tv: true, setTopBox: true, stick: true, online: true, offline: false
            };
            const { provider } = createProvider(devices);
            const items = await provider.getChildren();
            expect(items.map(i => (i).key)).to.deep.equal(['on1', 'pending1']);
        });

        it('hides online devices when the online filter is off (pending counts as online)', async () => {
            const devices = [
                makeDevice({ key: 'on1' }),
                makeDevice({ key: 'off1', deviceState: 'offline' }),
                makeDevice({ key: 'pending1', deviceState: 'pending' })
            ];
            vscode.context.workspaceState['_data']['brightscript.devicesView.filters'] = {
                devModeEnabled: true, devModeDisabled: true, tv: true, setTopBox: true, stick: true, online: false, offline: true
            };
            const { provider } = createProvider(devices);
            const items = await provider.getChildren();
            expect(items.map(i => (i).key)).to.deep.equal(['off1']);
        });

        it('treats missing developer-enabled as enabled', async () => {
            const devices = [
                makeDevice({ key: 'unknown' }),
                makeDevice({ key: 'explicit-on', developerEnabled: 'true' }),
                makeDevice({ key: 'explicit-off', developerEnabled: 'false' })
            ];
            vscode.context.workspaceState['_data']['brightscript.devicesView.filters'] = {
                devModeEnabled: false, devModeDisabled: true, tv: true, setTopBox: true, stick: true, online: true, offline: true
            };
            const { provider } = createProvider(devices);
            const items = await provider.getChildren();
            expect(items.map(i => (i).key)).to.deep.equal(['explicit-off']);
        });
    });

    describe('toggleFilter', () => {
        it('saves only the keys that diverge from defaults', async () => {
            const { provider } = createProvider([]);
            const treeChanged = sinon.spy();
            provider.onDidChangeTreeData(treeChanged);

            await provider.toggleFilter('tv');

            const saved = vscode.context.workspaceState['_data']['brightscript.devicesView.filters'] as Partial<DevicesViewFilters>;
            expect(saved).to.deep.equal({ tv: false });
            expect(treeChanged.called).to.be.true;
        });

        it('drops the saved entry when filters return to defaults', async () => {
            const { provider } = createProvider([]);
            await provider.toggleFilter('online');
            expect(vscode.context.workspaceState['_data']['brightscript.devicesView.filters']).to.deep.equal({ online: false });
            await provider.toggleFilter('online');
            expect(vscode.context.workspaceState['_data']['brightscript.devicesView.filters']).to.be.undefined;
        });

        it('records a toggled-on facet that defaults off', async () => {
            const { provider } = createProvider([]);
            await provider.toggleFilter('offline');
            const saved = vscode.context.workspaceState['_data']['brightscript.devicesView.filters'] as Partial<DevicesViewFilters>;
            expect(saved).to.deep.equal({ offline: true });
        });

        it('ignores keys that are not part of the filter set', async () => {
            const { provider } = createProvider([]);
            await provider.toggleFilter('nonexistent' as any);
            const saved = vscode.context.workspaceState['_data']['brightscript.devicesView.filters'];
            expect(saved).to.be.undefined;
        });
    });
});
