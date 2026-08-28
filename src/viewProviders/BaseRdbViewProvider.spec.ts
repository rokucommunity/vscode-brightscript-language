import { expect } from 'chai';
import * as sinonImport from 'sinon';
import { RtaManager } from '../managers/RtaManager';
import { vscode } from '../mockVscode.spec';
import { BaseRdbViewProvider } from './BaseRdbViewProvider';
import { ViewProviderId } from './ViewProviderId';
import { ViewProviderCommand } from './ViewProviderCommand';

let Module = require('module');
const { require: oldRequire } = Module.prototype;

Module.prototype.require = function hijacked(file) {
    if (file === 'vscode') {
        return vscode;
    } else {
        return oldRequire.apply(this, arguments);
    }
};

let sinon: sinonImport.SinonSandbox;
beforeEach(() => {
    sinon = sinonImport.createSandbox();
});
afterEach(() => {
    sinon.restore();
});

class TestBaseRdbViewProvider extends BaseRdbViewProvider {
    public readonly id = ViewProviderId.rokuDeviceView;
    public onDeviceConnectedCalls: any[] = [];

    protected onDeviceConnected(target: any) {
        this.onDeviceConnectedCalls.push(target);
    }
}

describe('BaseRdbViewProvider', () => {
    let provider: TestBaseRdbViewProvider;
    let postOrQueueMessage: sinonImport.SinonStub;
    let rtaManager: RtaManager;
    let resolveTargetDevice: sinonImport.SinonStub;
    let resolveValidatedPassword: sinonImport.SinonStub;
    let setupRtaWithDeviceTarget: sinonImport.SinonStub;

    const target = { device: { host: '1.2.3.4' }, serialNumber: 'ESN123', label: 'my-device' };

    function createProvider(): TestBaseRdbViewProvider {
        rtaManager = new RtaManager(vscode.context, {} as any, {} as any);
        setupRtaWithDeviceTarget = sinon.stub(rtaManager, 'setupRtaWithDeviceTarget').resolves();
        resolveTargetDevice = sinon.stub().resolves(target);
        resolveValidatedPassword = sinon.stub().resolves('aaaa');
        provider = new TestBaseRdbViewProvider(vscode.context, {
            rtaManager: rtaManager,
            deviceTargetManager: {
                resolveTargetDevice: resolveTargetDevice,
                resolveValidatedPassword: resolveValidatedPassword
            }
        } as any);
        postOrQueueMessage = sinon.stub(provider as any, 'postOrQueueMessage');
        return provider;
    }

    async function sendConnectToDevice() {
        const message = { command: ViewProviderCommand.connectToDevice, context: {} };
        await provider['messageCommandCallbacks'][ViewProviderCommand.connectToDevice](message);
        return postOrQueueMessage.getCalls().map((call) => call.args[0]).find((posted) => posted.command === ViewProviderCommand.connectToDevice);
    }

    afterEach(() => {
        provider?.dispose();
    });

    describe('connectToDevice command', () => {
        beforeEach(() => {
            createProvider();
        });

        it('responds with cancelled when the device picker is dismissed', async () => {
            resolveTargetDevice.resolves(undefined);

            const response = await sendConnectToDevice();

            expect(response.response).to.eql({ status: 'cancelled' });
            expect(resolveValidatedPassword.called).to.be.false;
            expect(setupRtaWithDeviceTarget.called).to.be.false;
        });

        it('responds with cancelled when the password prompt is dismissed or the device is unreachable', async () => {
            resolveValidatedPassword.resolves(undefined);

            const response = await sendConnectToDevice();

            expect(response.response).to.eql({ status: 'cancelled' });
            expect(setupRtaWithDeviceTarget.called).to.be.false;
        });

        it('sets up RTA with the resolved target and password, and responds with success', async () => {
            const response = await sendConnectToDevice();

            expect(setupRtaWithDeviceTarget.calledOnceWith(target.device, 'aaaa', { injectRdbOnDeviceComponent: true })).to.be.true;
            expect(response.response).to.eql({ status: 'success' });
        });

        it('responds with an error carrying the message when setup throws, and still resolves the request', async () => {
            setupRtaWithDeviceTarget.rejects(new Error('No Roku Cloud Emulator token available'));

            const response = await sendConnectToDevice();

            expect(response.response).to.eql({ status: 'error', message: 'No Roku Cloud Emulator token available' });
        });

        it('invokes the onDeviceConnected hook with the resolved target after a successful connect', async () => {
            await sendConnectToDevice();

            expect(provider.onDeviceConnectedCalls).to.eql([target.device]);
        });

        it('does not invoke the onDeviceConnected hook when the device picker is dismissed', async () => {
            resolveTargetDevice.resolves(undefined);

            await sendConnectToDevice();

            expect(provider.onDeviceConnectedCalls).to.eql([]);
        });

        it('does not invoke the onDeviceConnected hook when the password prompt is dismissed', async () => {
            resolveValidatedPassword.resolves(undefined);

            await sendConnectToDevice();

            expect(provider.onDeviceConnectedCalls).to.eql([]);
        });

        it('does not invoke the onDeviceConnected hook when setup throws', async () => {
            setupRtaWithDeviceTarget.rejects(new Error('No Roku Cloud Emulator token available'));

            await sendConnectToDevice();

            expect(provider.onDeviceConnectedCalls).to.eql([]);
        });
    });
});
