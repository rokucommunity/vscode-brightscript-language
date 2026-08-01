import { expect } from 'chai';
import { createSandbox } from 'sinon';
import { vscode } from '../mockVscode.spec';
import { ExperimentalFeature, ExperimentalFeaturesManager } from './ExperimentalFeaturesManager';
import { vscodeContextManager } from './VscodeContextManager';

const sinon = createSandbox();
const Module = require('module');

//override the "require" call to mock certain items
const { require: oldRequire } = Module.prototype;
Module.prototype.require = function hijacked(file) {
    if (file === 'vscode') {
        return vscode;
    } else {
        return oldRequire.apply(this, arguments);
    }
};

describe('ExperimentalFeaturesManager', () => {

    let contextSetStub: ReturnType<typeof sinon.stub>;
    let managerContext: { subscriptions: any[]; workspaceState: typeof vscode.context.workspaceState };
    //the config-change callback the manager registered, captured so tests can fire it directly.
    //Emitting through the mock's shared configuration emitter would also wake broken listeners
    //leaked by earlier suites, so the shared emitter is deliberately bypassed here.
    let configChangeHandler: (event: { affectsConfiguration(section: string): boolean }) => void;

    beforeEach(() => {
        //the mock's global afterEach deletes the configuration store; recreate it per test
        vscode.workspace['_configuration'] = {};
        managerContext = { subscriptions: [], workspaceState: vscode.context.workspaceState };
        contextSetStub = sinon.stub(vscodeContextManager, 'set').resolves();
        sinon.stub(vscode.workspace, 'onDidChangeConfiguration').callsFake(((callback) => {
            configChangeHandler = callback;
            return { dispose: () => { } };
        }) as any);
    });

    afterEach(() => {
        sinon.restore();
    });

    function setSetting(name: string, value: boolean) {
        vscode.workspace['_configuration'][`brightscript.${name}`] = value;
    }

    function fireExperimentalConfigChange() {
        configChangeHandler({
            affectsConfiguration: (section: string) => 'brightscript.experimental'.startsWith(section) || section.startsWith('brightscript.experimental')
        });
    }

    it('reports features disabled by default and sets the context key', () => {
        const manager = new ExperimentalFeaturesManager(managerContext as any);

        expect(manager.isEnabled(ExperimentalFeature.rokuCloudEmulator)).to.be.false;
        expect(contextSetStub.calledWith('brightscript.experimental.rokuCloudEmulator', false)).to.be.true;
    });

    it('enables a feature through its own setting', () => {
        setSetting('experimental.rokuCloudEmulator', true);

        const manager = new ExperimentalFeaturesManager(managerContext as any);

        expect(manager.isEnabled(ExperimentalFeature.rokuCloudEmulator)).to.be.true;
        expect(contextSetStub.calledWith('brightscript.experimental.rokuCloudEmulator', true)).to.be.true;
    });

    it('enables every feature through experimental.all', () => {
        setSetting('experimental.all', true);

        const manager = new ExperimentalFeaturesManager(managerContext as any);

        expect(manager.isEnabled(ExperimentalFeature.rokuCloudEmulator)).to.be.true;
    });

    it('reflects a toggle live: isEnabled, the context key, and the change event all follow', () => {
        const manager = new ExperimentalFeaturesManager(managerContext as any);
        const enablementChanges: Array<[ExperimentalFeature, boolean]> = [];
        manager.onEnablementChanged((feature, enabled) => enablementChanges.push([feature, enabled]));

        setSetting('experimental.rokuCloudEmulator', true);
        fireExperimentalConfigChange();

        expect(manager.isEnabled(ExperimentalFeature.rokuCloudEmulator)).to.be.true;
        expect(contextSetStub.calledWith('brightscript.experimental.rokuCloudEmulator', true)).to.be.true;
        expect(enablementChanges).to.eql([[ExperimentalFeature.rokuCloudEmulator, true]]);

        setSetting('experimental.rokuCloudEmulator', false);
        fireExperimentalConfigChange();

        expect(manager.isEnabled(ExperimentalFeature.rokuCloudEmulator)).to.be.false;
        expect(enablementChanges).to.eql([
            [ExperimentalFeature.rokuCloudEmulator, true],
            [ExperimentalFeature.rokuCloudEmulator, false]
        ]);
    });

    it('does not emit when a settings edit lands on the same effective enablement', () => {
        setSetting('experimental.all', true);
        const manager = new ExperimentalFeaturesManager(managerContext as any);
        const enablementChanges: Array<[ExperimentalFeature, boolean]> = [];
        manager.onEnablementChanged((feature, enabled) => enablementChanges.push([feature, enabled]));

        //`all` keeps the feature enabled regardless of its own setting
        setSetting('experimental.rokuCloudEmulator', true);
        fireExperimentalConfigChange();
        setSetting('experimental.rokuCloudEmulator', false);
        fireExperimentalConfigChange();

        expect(manager.isEnabled(ExperimentalFeature.rokuCloudEmulator)).to.be.true;
        expect(enablementChanges).to.eql([]);
    });

    it('clears the workspace device-identity keys pointing at cloud devices when the feature turns off', async () => {
        setSetting('experimental.rokuCloudEmulator', true);
        const manager = new ExperimentalFeaturesManager(managerContext as any);
        //only 's:CLOUD-ESN' resolves to a cloud device; the other keys are LAN or unknown
        manager.setDeviceManager({
            getDevice: (key: string) => (key === 's:CLOUD-ESN' ? { rce: { id: '83' } } : undefined)
        } as any);
        await vscode.context.workspaceState.update('activeDeviceKey', 's:CLOUD-ESN');
        await vscode.context.workspaceState.update('remoteControlDeviceKey', 's:CLOUD-ESN');

        setSetting('experimental.rokuCloudEmulator', false);
        fireExperimentalConfigChange();

        expect(vscode.context.workspaceState.get('activeDeviceKey')).to.be.undefined;
        expect(vscode.context.workspaceState.get('remoteControlDeviceKey')).to.be.undefined;
    });

    it('leaves device-identity keys pointing at anything else alone when the feature turns off', async () => {
        setSetting('experimental.rokuCloudEmulator', true);
        const manager = new ExperimentalFeaturesManager(managerContext as any);
        manager.setDeviceManager({
            getDevice: (key: string) => (key === 's:LAN-SERIAL' ? { ip: '192.168.1.30' } : undefined)
        } as any);
        await vscode.context.workspaceState.update('activeDeviceKey', 's:LAN-SERIAL');
        await vscode.context.workspaceState.update('remoteControlDeviceKey', 'i:192.168.1.40');

        setSetting('experimental.rokuCloudEmulator', false);
        fireExperimentalConfigChange();

        expect(vscode.context.workspaceState.get('activeDeviceKey')).to.equal('s:LAN-SERIAL');
        expect(vscode.context.workspaceState.get('remoteControlDeviceKey')).to.equal('i:192.168.1.40');
    });

    it('stops notifying an unsubscribed handler', () => {
        const manager = new ExperimentalFeaturesManager(managerContext as any);
        const enablementChanges: Array<[ExperimentalFeature, boolean]> = [];
        const unsubscribe = manager.onEnablementChanged((feature, enabled) => enablementChanges.push([feature, enabled]));

        unsubscribe();
        setSetting('experimental.rokuCloudEmulator', true);
        fireExperimentalConfigChange();

        expect(enablementChanges).to.eql([]);
    });
});
