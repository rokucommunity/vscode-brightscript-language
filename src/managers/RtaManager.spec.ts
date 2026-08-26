import { expect } from 'chai';
import type { SinonStub } from 'sinon';
import { createSandbox } from 'sinon';
import * as rta from 'roku-test-automation';
import { RtaManager } from './RtaManager';
import { vscode } from '../mockVscode.spec';

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

describe('RtaManager', () => {

    let rtaManager: RtaManager;
    let odcSetConfigStub: SinonStub;
    let getDeviceStub: SinonStub;
    let getTokenStub: SinonStub;
    let deviceManager: { getDevice: SinonStub };
    let rceManager: { getToken: SinonStub };

    beforeEach(() => {
        getDeviceStub = sinon.stub().returns(undefined);
        deviceManager = { getDevice: getDeviceStub };
        getTokenStub = sinon.stub().resolves('management-api-token');
        rceManager = { getToken: getTokenStub };
        rtaManager = new RtaManager(vscode.context as any, rceManager as any, deviceManager as any);
        //RTA setup pushes device availability to the webview providers; none exist in these tests
        rtaManager.setWebviewViewProviderManager({ getWebviewViewProviders: () => [] } as any);
        odcSetConfigStub = sinon.stub(rta.odc, 'setConfig');
        sinon.stub(rta.ecp, 'setConfig');
    });

    afterEach(() => {
        sinon.restore();
    });

    describe('setupRtaWithConfig', () => {
        it('resolves a local device through the remote-control device key and ignores the launch config host', async () => {
            getDeviceStub.withArgs('s:abc123').returns({ key: 's:abc123', ip: '1.2.3.4' });
            await vscode.context.workspaceState.update('remoteControlDeviceKey', 's:abc123');

            await rtaManager.setupRtaWithConfig({ host: '9.9.9.9', password: 'aaaa' } as any);

            expect(odcSetConfigStub.calledOnce).to.be.true;
            expect(odcSetConfigStub.firstCall.args[0].RokuDevice.devices[0].host).to.equal('1.2.3.4');
            expect(rtaManager.device).to.exist;
            expect(rtaManager.isRceDebugSession).to.be.false;
        });

        it('resolves a cloud emulator device through the remote-control device key, fetching a token from RceManager', async () => {
            getDeviceStub.withArgs('rce:83').returns({
                key: 'rce:83',
                serialNumber: 'ESN123',
                rce: { id: 83, status: 'running', instanceUrl: 'https://rce.example.com' }
            });
            await vscode.context.workspaceState.update('remoteControlDeviceKey', 'rce:83');

            await rtaManager.setupRtaWithConfig({ password: 'aaaa' } as any);

            expect(odcSetConfigStub.calledOnce).to.be.true;
            const device = odcSetConfigStub.firstCall.args[0].RokuDevice.devices[0];
            expect(device.id).to.equal(83);
            expect(device.esn).to.equal('ESN123');
            expect(device.instanceUrl).to.equal('https://rce.example.com');
            expect(device.rceToken).to.equal('management-api-token');
            expect(rtaManager.isRceDebugSession).to.be.true;
        });

        it('warns but still configures RTA when the resolved cloud emulator device has no token', async () => {
            const warnStub = sinon.stub(console, 'warn');
            getDeviceStub.withArgs('rce:83').returns({
                key: 'rce:83',
                serialNumber: 'ESN123',
                rce: { id: 83, status: 'running' }
            });
            getTokenStub.resolves(undefined);
            await vscode.context.workspaceState.update('remoteControlDeviceKey', 'rce:83');

            await rtaManager.setupRtaWithConfig({ password: 'aaaa' } as any);

            expect(odcSetConfigStub.calledOnce).to.be.true;
            expect(warnStub.called).to.be.true;
        });

        it('falls back to the launch config host when the remote-control device key resolves to no device', async () => {
            await vscode.context.workspaceState.update('remoteControlDeviceKey', 's:unknown');

            await rtaManager.setupRtaWithConfig({ host: '1.2.3.4', password: 'aaaa' } as any);

            expect(odcSetConfigStub.calledOnce).to.be.true;
            expect(odcSetConfigStub.firstCall.args[0].RokuDevice.devices[0].host).to.equal('1.2.3.4');
            expect(rtaManager.isRceDebugSession).to.be.false;
        });

        it('bails and still notifies the webviews when neither the key nor the launch config resolve a device', async () => {
            const updateDeviceAvailabilityStub = sinon.stub();
            rtaManager.setWebviewViewProviderManager({ getWebviewViewProviders: () => [{ updateDeviceAvailability: updateDeviceAvailabilityStub }] } as any);

            await rtaManager.setupRtaWithConfig({ password: 'aaaa' } as any);

            expect(odcSetConfigStub.called).to.be.false;
            expect(rtaManager.device).to.be.undefined;
            expect(updateDeviceAvailabilityStub.called).to.be.true;
        });

        it('marks an RCE debug session and notifies the webviews so they can show the unsupported message', async () => {
            const updateDeviceAvailabilityStub = sinon.stub();
            rtaManager.setWebviewViewProviderManager({ getWebviewViewProviders: () => [{ updateDeviceAvailability: updateDeviceAvailabilityStub }] } as any);
            getDeviceStub.withArgs('rce:83').returns({ key: 'rce:83', serialNumber: 'ESN123', rce: { id: 83, status: 'running' } });
            await vscode.context.workspaceState.update('remoteControlDeviceKey', 'rce:83');

            await rtaManager.setupRtaWithConfig({ password: 'aaaa' } as any);

            expect(rtaManager.isRceDebugSession).to.be.true;
            expect(updateDeviceAvailabilityStub.called).to.be.true;
        });

        it('clears the RCE debug session flag when RTA is subsequently set up against a LAN device', async () => {
            getDeviceStub.withArgs('rce:83').returns({ key: 'rce:83', serialNumber: 'ESN123', rce: { id: 83, status: 'running' } });
            await vscode.context.workspaceState.update('remoteControlDeviceKey', 'rce:83');
            await rtaManager.setupRtaWithConfig({ password: 'aaaa' } as any);

            getDeviceStub.withArgs('s:abc123').returns({ key: 's:abc123', ip: '1.2.3.4' });
            await vscode.context.workspaceState.update('remoteControlDeviceKey', 's:abc123');
            await rtaManager.setupRtaWithConfig({ password: 'aaaa' } as any);

            expect(rtaManager.isRceDebugSession).to.be.false;
        });
    });

    describe('setupRtaWithManualHost', () => {
        it('sets up RTA from the given host, ignoring the remote-control device key', () => {
            getDeviceStub.withArgs('rce:83').returns({ key: 'rce:83', serialNumber: 'ESN123', rce: { id: 83, status: 'running' } });
            void vscode.context.workspaceState.update('remoteControlDeviceKey', 'rce:83');

            rtaManager.setupRtaWithManualHost({ host: '1.2.3.4', password: 'aaaa' } as any);

            expect(odcSetConfigStub.calledOnce).to.be.true;
            expect(odcSetConfigStub.firstCall.args[0].RokuDevice.devices[0].host).to.equal('1.2.3.4');
            expect(getDeviceStub.called).to.be.false;
            expect(rtaManager.isRceDebugSession).to.be.false;
        });
    });

    describe('onDidTerminateDebugSession', () => {
        it('clears the RCE debug session state and notifies the webviews', async () => {
            getDeviceStub.withArgs('rce:83').returns({ key: 'rce:83', serialNumber: 'ESN123', rce: { id: 83, status: 'running' } });
            await vscode.context.workspaceState.update('remoteControlDeviceKey', 'rce:83');
            await rtaManager.setupRtaWithConfig({ password: 'aaaa' } as any);
            const updateDeviceAvailabilityStub = sinon.stub();
            rtaManager.setWebviewViewProviderManager({ getWebviewViewProviders: () => [{ updateDeviceAvailability: updateDeviceAvailabilityStub }] } as any);

            rtaManager.onDidTerminateDebugSession();

            expect(rtaManager.isRceDebugSession).to.be.false;
            expect(updateDeviceAvailabilityStub.called).to.be.true;
        });

        it('does nothing when the session was not for an RCE device', async () => {
            getDeviceStub.withArgs('s:abc123').returns({ key: 's:abc123', ip: '1.2.3.4' });
            await vscode.context.workspaceState.update('remoteControlDeviceKey', 's:abc123');
            await rtaManager.setupRtaWithConfig({ password: 'aaaa' } as any);
            const updateDeviceAvailabilityStub = sinon.stub();
            rtaManager.setWebviewViewProviderManager({ getWebviewViewProviders: () => [{ updateDeviceAvailability: updateDeviceAvailabilityStub }] } as any);

            rtaManager.onDidTerminateDebugSession();

            expect(updateDeviceAvailabilityStub.called).to.be.false;
        });
    });
});
