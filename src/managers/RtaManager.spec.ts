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
            const device = odcSetConfigStub.firstCall.args[0].RokuDevice.devices[0];
            expect(device).to.deep.equal({ host: '1.2.3.4', password: 'aaaa' });
            expect(rtaManager.device).to.exist;
            expect(rtaManager.isRceDebugSession).to.be.false;
        });

        it('resolves a running cloud emulator device (instanceUrl) through the remote-control device key, fetching a token from RceManager', async () => {
            getDeviceStub.withArgs('rce:83').returns({
                key: 'rce:83',
                serialNumber: 'ESN123',
                rce: { id: 83, status: 'running', instanceUrl: 'https://rce.example.com' },
                device: { instanceUrl: 'https://rce.example.com', rceToken: 'stale-token' }
            });
            await vscode.context.workspaceState.update('remoteControlDeviceKey', 'rce:83');

            await rtaManager.setupRtaWithConfig({ password: 'aaaa' } as any);

            expect(odcSetConfigStub.calledOnce).to.be.true;
            const device = odcSetConfigStub.firstCall.args[0].RokuDevice.devices[0];
            expect(device).to.deep.equal({
                instanceUrl: 'https://rce.example.com',
                rceToken: 'management-api-token',
                password: 'aaaa'
            });
            expect(rtaManager.isRceDebugSession).to.be.true;
        });

        it('resolves a non-running cloud emulator device (id) through the remote-control device key, fetching a token from RceManager', async () => {
            getDeviceStub.withArgs('rce:83').returns({
                key: 'rce:83',
                serialNumber: 'ESN123',
                rce: { id: 83, status: 'shutdown' },
                device: { id: 83, rceToken: 'stale-token' }
            });
            await vscode.context.workspaceState.update('remoteControlDeviceKey', 'rce:83');

            await rtaManager.setupRtaWithConfig({ password: 'aaaa' } as any);

            expect(odcSetConfigStub.calledOnce).to.be.true;
            const device = odcSetConfigStub.firstCall.args[0].RokuDevice.devices[0];
            expect(device).to.deep.equal({
                id: 83,
                rceToken: 'management-api-token',
                password: 'aaaa'
            });
            expect(rtaManager.isRceDebugSession).to.be.true;
        });

        it('warns but still configures RTA when the resolved cloud emulator device has no token', async () => {
            const warnStub = sinon.stub(console, 'warn');
            getDeviceStub.withArgs('rce:83').returns({
                key: 'rce:83',
                serialNumber: 'ESN123',
                rce: { id: 83, status: 'running' },
                device: { id: 83 }
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
            getDeviceStub.withArgs('rce:83').returns({ key: 'rce:83', serialNumber: 'ESN123', rce: { id: 83, status: 'running' }, device: { id: 83 } });
            await vscode.context.workspaceState.update('remoteControlDeviceKey', 'rce:83');

            await rtaManager.setupRtaWithConfig({ password: 'aaaa' } as any);

            expect(rtaManager.isRceDebugSession).to.be.true;
            expect(updateDeviceAvailabilityStub.called).to.be.true;
        });

        it('clears the RCE debug session flag when RTA is subsequently set up against a LAN device', async () => {
            getDeviceStub.withArgs('rce:83').returns({ key: 'rce:83', serialNumber: 'ESN123', rce: { id: 83, status: 'running' }, device: { id: 83 } });
            await vscode.context.workspaceState.update('remoteControlDeviceKey', 'rce:83');
            await rtaManager.setupRtaWithConfig({ password: 'aaaa' } as any);

            getDeviceStub.withArgs('s:abc123').returns({ key: 's:abc123', ip: '1.2.3.4' });
            await vscode.context.workspaceState.update('remoteControlDeviceKey', 's:abc123');
            await rtaManager.setupRtaWithConfig({ password: 'aaaa' } as any);

            expect(rtaManager.isRceDebugSession).to.be.false;
        });

        it('shuts down an existing ODC connection before re-pointing RTA at a different device', async () => {
            getDeviceStub.withArgs('s:abc123').returns({ key: 's:abc123', ip: '1.2.3.4' });
            await vscode.context.workspaceState.update('remoteControlDeviceKey', 's:abc123');
            await rtaManager.setupRtaWithConfig({ password: 'aaaa', injectRdbOnDeviceComponent: true } as any);
            const shutdownStub = sinon.stub(rtaManager.onDeviceComponent, 'shutdown').resolves();

            getDeviceStub.withArgs('s:def456').returns({ key: 's:def456', ip: '5.6.7.8' });
            await vscode.context.workspaceState.update('remoteControlDeviceKey', 's:def456');
            await rtaManager.setupRtaWithConfig({ password: 'aaaa', injectRdbOnDeviceComponent: true } as any);

            expect(shutdownStub.called).to.be.true;
        });
    });

    describe('setupRtaWithDeviceTarget', () => {
        it('sets up RTA against a LAN target, ignoring the remote-control device key', async () => {
            getDeviceStub.withArgs('rce:83').returns({ key: 'rce:83', serialNumber: 'ESN123', rce: { id: 83, status: 'running' }, device: { id: 83 } });
            void vscode.context.workspaceState.update('remoteControlDeviceKey', 'rce:83');

            await rtaManager.setupRtaWithDeviceTarget({ host: '1.2.3.4' } as any, 'aaaa');

            expect(odcSetConfigStub.calledOnce).to.be.true;
            const device = odcSetConfigStub.firstCall.args[0].RokuDevice.devices[0];
            expect(device.host).to.equal('1.2.3.4');
            expect(device.password).to.equal('aaaa');
            expect(getDeviceStub.called).to.be.false;
            expect(rtaManager.isRceDebugSession).to.be.false;
        });

        it('sets up RTA against a Roku Cloud Emulator target, carrying its id and rceToken and marking the session as RCE', async () => {
            await rtaManager.setupRtaWithDeviceTarget({ id: 83, rceToken: 'device-token' } as any, 'aaaa');

            expect(odcSetConfigStub.calledOnce).to.be.true;
            const device = odcSetConfigStub.firstCall.args[0].RokuDevice.devices[0];
            expect(device.id).to.equal(83);
            expect(device.rceToken).to.equal('device-token');
            expect(device.password).to.equal('aaaa');
            expect(rtaManager.isRceDebugSession).to.be.true;
            expect(getTokenStub.called).to.be.false;
        });

        it('falls back to RceManager for a token when the RCE target has none', async () => {
            await rtaManager.setupRtaWithDeviceTarget({ esn: 'ESN123' } as any, 'aaaa');

            expect(getTokenStub.calledOnce).to.be.true;
            const device = odcSetConfigStub.firstCall.args[0].RokuDevice.devices[0];
            expect(device.rceToken).to.equal('management-api-token');
        });

        it('throws when the RCE target has no token and RceManager cannot provide one either', async () => {
            getTokenStub.resolves(undefined);

            let threw: Error;
            try {
                await rtaManager.setupRtaWithDeviceTarget({ esn: 'ESN123' } as any, 'aaaa');
            } catch (e) {
                threw = e as Error;
            }

            expect(threw?.message).to.contain('No Roku Cloud Emulator token available');
            expect(odcSetConfigStub.called).to.be.false;
        });

        it('throws when the device target has neither a host nor an RCE identity', async () => {
            let threw: Error;
            try {
                await rtaManager.setupRtaWithDeviceTarget({} as any, 'aaaa');
            } catch (e) {
                threw = e as Error;
            }

            expect(threw?.message).to.contain('neither a host nor a Roku Cloud Emulator identity');
            expect(odcSetConfigStub.called).to.be.false;
        });
    });

    describe('onDidTerminateDebugSession', () => {
        it('shuts down the ODC connection for an RCE session and flips isRceDebugSession, but leaves the device alone', async () => {
            getDeviceStub.withArgs('rce:83').returns({ key: 'rce:83', serialNumber: 'ESN123', rce: { id: 83, status: 'running' }, device: { id: 83 } });
            await vscode.context.workspaceState.update('remoteControlDeviceKey', 'rce:83');
            await rtaManager.setupRtaWithConfig({ password: 'aaaa', injectRdbOnDeviceComponent: true } as any);
            const shutdownStub = sinon.stub(rtaManager.onDeviceComponent, 'shutdown').resolves();
            const updateDeviceAvailabilityStub = sinon.stub();
            rtaManager.setWebviewViewProviderManager({ getWebviewViewProviders: () => [{ updateDeviceAvailability: updateDeviceAvailabilityStub }] } as any);
            const device = rtaManager.device;

            rtaManager.onDidTerminateDebugSession();

            expect(shutdownStub.called).to.be.true;
            expect(rtaManager.onDeviceComponent).to.be.undefined;
            expect(rtaManager.getStoredAppUI()).to.be.undefined;
            expect(rtaManager.isRceDebugSession).to.be.false;
            expect(updateDeviceAvailabilityStub.called).to.be.true;
            expect(rtaManager.device).to.equal(device);
        });

        it('shuts down the ODC connection for a LAN session too, leaving the device alone', async () => {
            getDeviceStub.withArgs('s:abc123').returns({ key: 's:abc123', ip: '1.2.3.4' });
            await vscode.context.workspaceState.update('remoteControlDeviceKey', 's:abc123');
            await rtaManager.setupRtaWithConfig({ password: 'aaaa', injectRdbOnDeviceComponent: true } as any);
            const shutdownStub = sinon.stub(rtaManager.onDeviceComponent, 'shutdown').resolves();
            const updateDeviceAvailabilityStub = sinon.stub();
            rtaManager.setWebviewViewProviderManager({ getWebviewViewProviders: () => [{ updateDeviceAvailability: updateDeviceAvailabilityStub }] } as any);
            const device = rtaManager.device;

            rtaManager.onDidTerminateDebugSession();

            expect(shutdownStub.called).to.be.true;
            expect(rtaManager.onDeviceComponent).to.be.undefined;
            expect(rtaManager.isRceDebugSession).to.be.false;
            expect(updateDeviceAvailabilityStub.called).to.be.true;
            expect(rtaManager.device).to.equal(device);
        });

        it('still clears state and notifies the webviews when there was no ODC connection to shut down', async () => {
            getDeviceStub.withArgs('s:abc123').returns({ key: 's:abc123', ip: '1.2.3.4' });
            await vscode.context.workspaceState.update('remoteControlDeviceKey', 's:abc123');
            await rtaManager.setupRtaWithConfig({ password: 'aaaa' } as any);
            const updateDeviceAvailabilityStub = sinon.stub();
            rtaManager.setWebviewViewProviderManager({ getWebviewViewProviders: () => [{ updateDeviceAvailability: updateDeviceAvailabilityStub }] } as any);

            rtaManager.onDidTerminateDebugSession();

            expect(rtaManager.onDeviceComponent).to.be.undefined;
            expect(updateDeviceAvailabilityStub.called).to.be.true;
        });
    });

    describe('disconnectFromDevice', () => {
        it('is a full reset: clears the device, the ODC connection, the RCE flag and the last app UI response, then notifies the webviews', async () => {
            getDeviceStub.withArgs('rce:83').returns({ key: 'rce:83', serialNumber: 'ESN123', rce: { id: 83, status: 'running' }, device: { id: 83 } });
            await vscode.context.workspaceState.update('remoteControlDeviceKey', 'rce:83');
            await rtaManager.setupRtaWithConfig({ password: 'aaaa', injectRdbOnDeviceComponent: true } as any);
            const shutdownStub = sinon.stub(rtaManager.onDeviceComponent, 'shutdown').resolves();
            (rtaManager as any).lastAppUIResponse = { children: [] };
            const updateDeviceAvailabilityStub = sinon.stub();
            const onDeviceDisconnectedStub = sinon.stub();
            rtaManager.setWebviewViewProviderManager({ getWebviewViewProviders: () => [{ updateDeviceAvailability: updateDeviceAvailabilityStub, onDeviceDisconnected: onDeviceDisconnectedStub }] } as any);

            rtaManager.disconnectFromDevice();

            expect(shutdownStub.called).to.be.true;
            expect(rtaManager.onDeviceComponent).to.be.undefined;
            expect(rtaManager.device).to.be.undefined;
            expect(rtaManager.getStoredAppUI()).to.be.undefined;
            expect(rtaManager.isRceDebugSession).to.be.false;
            expect(updateDeviceAvailabilityStub.called).to.be.true;
            expect(onDeviceDisconnectedStub.called).to.be.true;
        });

        it('still clears state and notifies the webviews when there was no ODC connection to shut down', async () => {
            getDeviceStub.withArgs('s:abc123').returns({ key: 's:abc123', ip: '1.2.3.4' });
            await vscode.context.workspaceState.update('remoteControlDeviceKey', 's:abc123');
            await rtaManager.setupRtaWithConfig({ password: 'aaaa' } as any);
            const updateDeviceAvailabilityStub = sinon.stub();
            rtaManager.setWebviewViewProviderManager({ getWebviewViewProviders: () => [{ updateDeviceAvailability: updateDeviceAvailabilityStub }] } as any);

            rtaManager.disconnectFromDevice();

            expect(rtaManager.onDeviceComponent).to.be.undefined;
            expect(rtaManager.device).to.be.undefined;
            expect(updateDeviceAvailabilityStub.called).to.be.true;
        });
    });
});
