import { expect } from 'chai';
import * as sinonImport from 'sinon';
import type { RceManagementClient } from 'roku-deploy';
import { vscode } from '../mockVscode.spec';
import { RceManager } from '../managers/RceManager';
import { RceManagementViewProvider } from './RceManagementViewProvider';
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

function createFakeManagementClient() {
    return {
        listDevices: sinon.stub(),
        createDevice: sinon.stub(),
        startDevice: sinon.stub(),
        stopDevice: sinon.stub(),
        listFirmwareVersions: sinon.stub()
    };
}

/**
 * RceManager with the client construction stubbed out so tests can control the management api responses
 */
class TestRceManager extends RceManager {
    public fakeManagementClient = createFakeManagementClient();

    protected override createClient(token: string): RceManagementClient {
        return this.fakeManagementClient as unknown as RceManagementClient;
    }
}

describe('RceManagementViewProvider', () => {
    let rceManager: TestRceManager;
    let provider: RceManagementViewProvider;
    let postOrQueueMessage: sinonImport.SinonStub;

    function createProvider() {
        provider = new RceManagementViewProvider(vscode.context, { rceManager: rceManager } as any);
        postOrQueueMessage = sinon.stub(provider as any, 'postOrQueueMessage');
        return provider;
    }

    function findResponseMessage(command: ViewProviderCommand) {
        return postOrQueueMessage.getCalls().find((call) => call.args[0].command === command)?.args[0];
    }

    afterEach(() => {
        provider?.dispose();
    });

    describe('getRceState', () => {
        it('includes account names in the state but never leaks tokens', async () => {
            rceManager = new TestRceManager(vscode.context as any);
            await rceManager.addAccount('work', 'token-work');
            await rceManager.addAccount('personal', 'token-personal');
            rceManager.fakeManagementClient.listDevices.resolves([]);

            createProvider();

            const message = { command: ViewProviderCommand.getRceState, context: {} };
            await provider['messageCommandCallbacks'][ViewProviderCommand.getRceState](message);

            const responseMessage = findResponseMessage(ViewProviderCommand.getRceState);
            expect(responseMessage.response.accounts).to.eql(['work', 'personal']);
            expect(responseMessage.response.activeAccountName).to.equal('personal');
            expect(JSON.stringify(responseMessage)).not.to.contain('token-work');
            expect(JSON.stringify(responseMessage)).not.to.contain('token-personal');
        });

        it('leaves devices undefined when no account is configured', async () => {
            rceManager = new TestRceManager(vscode.context as any);

            createProvider();

            const message = { command: ViewProviderCommand.getRceState, context: {} };
            await provider['messageCommandCallbacks'][ViewProviderCommand.getRceState](message);

            const responseMessage = findResponseMessage(ViewProviderCommand.getRceState);
            expect(responseMessage.response.hasToken).to.be.false;
            expect(responseMessage.response.devices).to.be.undefined;
            expect(rceManager.fakeManagementClient.listDevices.called).to.be.false;
        });
    });

    describe('startRceDevice', () => {
        it('responds with an error and does not start the device when it has no snapshot', async () => {
            rceManager = new TestRceManager(vscode.context as any);
            await rceManager.addAccount('work', 'token-work');
            /* eslint-disable camelcase -- the RCE management api uses snake_case fields */
            rceManager.fakeManagementClient.listDevices.resolves([
                { id: 5, name: 'my-device', device_type: 'tv', last_snapshot_id: null }
            ]);
            /* eslint-enable camelcase */

            createProvider();

            const message = { command: ViewProviderCommand.startRceDevice, context: { deviceId: 5 } };
            await provider['messageCommandCallbacks'][ViewProviderCommand.startRceDevice](message);

            const responseMessage = findResponseMessage(ViewProviderCommand.startRceDevice);
            expect(responseMessage.error.message).to.contain('snapshot');
            expect(rceManager.fakeManagementClient.startDevice.called).to.be.false;
        });
    });

    describe('runRceAccountCommand', () => {
        it('executes the matching rce vscode command', async () => {
            rceManager = new TestRceManager(vscode.context as any);
            rceManager.fakeManagementClient.listDevices.resolves([]);

            createProvider();
            const executeCommand = sinon.stub(vscode.commands, 'executeCommand').resolves();

            const message = { command: ViewProviderCommand.runRceAccountCommand, context: { command: 'switchAccount' } };
            await provider['messageCommandCallbacks'][ViewProviderCommand.runRceAccountCommand](message);

            expect(executeCommand.calledOnce).to.be.true;
            const executeCommandArgs = executeCommand.getCall(0).args as any[];
            expect(executeCommandArgs[0]).to.equal('extension.brightscript.rce.switchAccount');
        });

        it('rejects a command that is not on the allowlist and never calls executeCommand', async () => {
            rceManager = new TestRceManager(vscode.context as any);
            rceManager.fakeManagementClient.listDevices.resolves([]);

            createProvider();
            const executeCommand = sinon.stub(vscode.commands, 'executeCommand').resolves();

            let receivedMessage;
            sinon.stub(provider as any, 'postMessage').callsFake((message) => {
                receivedMessage = message;
                return Promise.resolve();
            });

            let onDidReceiveMessageCallback;
            const view = {
                webview: {
                    onDidReceiveMessage: (callback) => {
                        onDidReceiveMessageCallback = callback;
                    },
                    postMessage: () => Promise.resolve()
                }
            };
            await provider['resolveWebviewView'](view as any, {} as any, {} as any);

            await onDidReceiveMessageCallback({
                command: ViewProviderCommand.runRceAccountCommand,
                context: { command: 'deleteEverything' }
            });

            expect(executeCommand.called).to.be.false;
            expect(receivedMessage.error.message).to.contain('deleteEverything');
        });
    });

    describe('dispose', () => {
        it('unsubscribes from token-changed notifications', async () => {
            rceManager = new TestRceManager(vscode.context as any);
            rceManager.fakeManagementClient.listDevices.resolves([]);

            createProvider();
            provider.dispose();

            await rceManager.addAccount('work', 'token-work');

            expect(postOrQueueMessage.called).to.be.false;
        });
    });
});
