import { expect } from 'chai';
import * as sinonImport from 'sinon';
import { EventEmitter } from 'eventemitter3';
import type { RceVideoSignalingClient, RceVideoSignalingConfig, RceVideoSignalingClientOptions } from 'roku-deploy';
import { RtaManager } from '../managers/RtaManager';
import { vscode } from '../mockVscode.spec';
import { RokuDeviceViewViewProvider } from './RokuDeviceViewViewProvider';
import type { RceStreamRequestConfig } from './RokuDeviceViewViewProvider';
import { ViewProviderCommand } from './ViewProviderCommand';
import { ViewProviderEvent } from './ViewProviderEvent';
import { VscodeCommand } from '../commands/VscodeCommand';

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

const defaultFakeOffer = { type: 'offer', sdp: 'v=0\r\no=- offer-sdp\r\n' };

/**
 * Fake standing in for roku-deploy's RceVideoSignalingClient: a real EventEmitter (so `.on`/`.emit`
 * behave exactly like the genuine client) with stubbed connect/sendAnswer/sendCandidate/
 * sendCandidatesComplete/stop so tests can control and observe negotiation without a real socket.
 */
class FakeSignalingClient extends EventEmitter {
    public connect: sinonImport.SinonStub;
    public sendAnswer: sinonImport.SinonStub;
    public sendCandidate: sinonImport.SinonStub;
    public sendCandidatesComplete: sinonImport.SinonStub;
    public stop: sinonImport.SinonStub;

    constructor() {
        super();
        this.connect = sinon.stub().resolves({ offer: defaultFakeOffer, iceServers: [] });
        this.sendAnswer = sinon.stub().resolves();
        this.sendCandidate = sinon.stub();
        this.sendCandidatesComplete = sinon.stub();
        this.stop = sinon.stub();
    }
}

/**
 * RokuDeviceViewViewProvider with signaling client construction stubbed out, the same pattern as
 * RceManagementViewProvider's TestRceManagementViewProvider overriding createRceDevice, so tests can
 * control the signaling responses without opening a real WebSocket. Each created client's connect()
 * is preconfigured (rather than reconfigured after the fact) since createSignalingClient runs partway
 * through the async startRceStreamSession flow, after the token lookup has already been awaited.
 */
class TestRokuDeviceViewViewProvider extends RokuDeviceViewViewProvider {
    public createdClients: FakeSignalingClient[] = [];
    public lastSignalingConfig: RceVideoSignalingConfig | undefined;
    public nextConnectError: Error | undefined;
    public nextConnectResult: { offer: any; iceServers: any[] } = { offer: defaultFakeOffer, iceServers: [] };
    //when true, the next created client's connect() does not resolve/reject on its own - the test
    //resolves it later (via the resolver pushed to pendingConnectResolvers) to control exactly when a
    //session's offer posts, for testing behavior while still negotiating
    public deferNextConnect = false;
    public pendingConnectResolvers: Array<(result: { offer: any; iceServers: any[] }) => void> = [];

    protected override createSignalingClient(config: RceVideoSignalingConfig, options?: RceVideoSignalingClientOptions): RceVideoSignalingClient {
        this.lastSignalingConfig = config;
        const client = new FakeSignalingClient();
        if (this.deferNextConnect) {
            this.deferNextConnect = false;
            client.connect = sinon.stub().returns(new Promise((resolve) => {
                this.pendingConnectResolvers.push(resolve);
            }));
        } else if (this.nextConnectError) {
            client.connect.rejects(this.nextConnectError);
        } else {
            client.connect.resolves(this.nextConnectResult);
        }
        this.createdClients.push(client);
        return client as unknown as RceVideoSignalingClient;
    }
}

function createStreamRequest(overrides: Partial<RceStreamRequestConfig> = {}): RceStreamRequestConfig {
    return {
        deviceId: 5,
        deviceName: 'my-device',
        websocketUrl: 'wss://device.rce.roku.com/instance/abc/janus',
        streamId: 7,
        pin: '1234',
        janusToken: 'janus-secret',
        iceServers: [{ urls: ['stun:stun.example.com'] }],
        ...overrides
    };
}

describe('RokuDeviceViewViewProvider', () => {
    let provider: TestRokuDeviceViewViewProvider;
    let postOrQueueMessage: sinonImport.SinonStub;
    let getToken: sinonImport.SinonStub;

    function createProvider(): TestRokuDeviceViewViewProvider {
        const rtaManager = new RtaManager(vscode.context);
        getToken = sinon.stub().resolves('management-api-token');
        provider = new TestRokuDeviceViewViewProvider(vscode.context, {
            rtaManager: rtaManager,
            rceManager: { getToken: getToken }
        } as any);
        postOrQueueMessage = sinon.stub(provider as any, 'postOrQueueMessage');
        return provider;
    }

    function findEventMessages(event: ViewProviderEvent) {
        return postOrQueueMessage.getCalls().map((call) => call.args[0]).filter((message) => message.event === event);
    }

    async function startFirstSession(streamRequest = createStreamRequest()): Promise<FakeSignalingClient> {
        await provider['startRceStreamSession'](streamRequest);
        return provider.createdClients[provider.createdClients.length - 1];
    }

    /**
     * Lets the token lookup's microtask (awaited before createSignalingClient runs) settle, so a
     * just-called, not-yet-awaited startRceStreamSession has reached the point of having created its
     * client
     */
    function flushMicrotasks(): Promise<void> {
        return new Promise((resolve) => {
            setImmediate(resolve);
        });
    }

    afterEach(() => {
        provider?.dispose();
    });

    describe('rokuDeviceViewShowRceStream command', () => {
        it('focuses the view and shows it before starting the stream session', () => {
            const registeredCommands = new Map<string, (...args: any[]) => any>();
            (sinon.stub(vscode.commands, 'registerCommand') as sinon.SinonStub).callsFake((commandId: string, callback: any) => {
                registeredCommands.set(commandId, callback);
                return { dispose: () => { } };
            });
            const executeCommand = sinon.stub(vscode.commands, 'executeCommand').resolves();

            createProvider();
            provider['view'] = { show: sinon.stub() } as any;

            registeredCommands.get(VscodeCommand.rokuDeviceViewShowRceStream)(createStreamRequest());

            const executeCommandArgs = executeCommand.getCall(0).args as any[];
            expect(executeCommandArgs[0]).to.equal('rokuDeviceView.focus');
            expect((provider['view'] as any).show.calledWith(false)).to.be.true;
        });
    });

    describe('startRceStreamSession', () => {
        it('posts onRceStreamConnecting with the device id and name before any async work, ahead of the eventual offer', async () => {
            createProvider();
            const streamRequest = createStreamRequest();

            const startPromise = provider['startRceStreamSession'](streamRequest);

            //posted synchronously: before the (asynchronous) token fetch has even had a chance to run,
            //let alone resolve - this is what makes a pre-offer failure (no token, connect() rejecting,
            //a negotiation timeout) visible, since the webview only has somewhere to show an error once
            //it has entered stream mode, which onRceStreamConnecting is what triggers
            let connectingMessages = findEventMessages(ViewProviderEvent.onRceStreamConnecting);
            expect(connectingMessages).to.have.length(1);
            expect(connectingMessages[0].context).to.eql({ deviceId: 5, deviceName: 'my-device' });

            await startPromise;

            //still only ever posted once, strictly before the offer
            connectingMessages = findEventMessages(ViewProviderEvent.onRceStreamConnecting);
            expect(connectingMessages).to.have.length(1);
            const allEvents = postOrQueueMessage.getCalls().map((call) => call.args[0].event);
            expect(allEvents.indexOf(ViewProviderEvent.onRceStreamConnecting)).to.equal(0);
            expect(allEvents.indexOf(ViewProviderEvent.onRceStreamOffer)).to.be.greaterThan(allEvents.indexOf(ViewProviderEvent.onRceStreamConnecting));
        });

        it('posts onRceStreamConnecting even when the eventual result is the no-account-token error', async () => {
            createProvider();
            getToken.resolves(undefined);

            await provider['startRceStreamSession'](createStreamRequest());

            expect(findEventMessages(ViewProviderEvent.onRceStreamConnecting)).to.have.length(1);
            const allEvents = postOrQueueMessage.getCalls().map((call) => call.args[0].event);
            expect(allEvents.indexOf(ViewProviderEvent.onRceStreamConnecting)).to.equal(0);
            expect(allEvents.indexOf(ViewProviderEvent.onRceStreamError)).to.be.greaterThan(allEvents.indexOf(ViewProviderEvent.onRceStreamConnecting));
        });

        it('posts onRceStreamOffer with the offer and ice servers, and never includes the api token', async () => {
            createProvider();
            const streamRequest = createStreamRequest();
            provider.nextConnectResult = { offer: defaultFakeOffer, iceServers: streamRequest.iceServers };

            await startFirstSession(streamRequest);

            const offerMessages = findEventMessages(ViewProviderEvent.onRceStreamOffer);
            expect(offerMessages).to.have.length(1);
            expect(offerMessages[0].context).to.eql({
                deviceId: 5,
                deviceName: 'my-device',
                offer: defaultFakeOffer,
                iceServers: streamRequest.iceServers
            });
            expect(JSON.stringify(offerMessages[0])).not.to.contain('management-api-token');
        });

        it('fetches the api token from rceManager and passes it to the signaling client, but does not include it in any posted message', async () => {
            createProvider();
            const streamRequest = createStreamRequest();

            await startFirstSession(streamRequest);

            expect(getToken.calledOnce).to.be.true;
            expect(provider.lastSignalingConfig.apiToken).to.equal('management-api-token');
            expect(provider.lastSignalingConfig.websocketUrl).to.equal(streamRequest.websocketUrl);
            expect(provider.lastSignalingConfig.streamId).to.equal(streamRequest.streamId);
            expect(provider.lastSignalingConfig.pin).to.equal(streamRequest.pin);
            expect(provider.lastSignalingConfig.janusToken).to.equal(streamRequest.janusToken);

            for (const call of postOrQueueMessage.getCalls()) {
                expect(JSON.stringify(call.args[0])).not.to.contain('management-api-token');
            }
        });

        it('posts a descriptive onRceStreamError carrying the device id/name and never creates a signaling client when no account token is configured', async () => {
            createProvider();
            getToken.resolves(undefined);

            await provider['startRceStreamSession'](createStreamRequest());

            expect(provider.createdClients).to.have.length(0);
            const errorMessages = findEventMessages(ViewProviderEvent.onRceStreamError);
            expect(errorMessages).to.have.length(1);
            expect(errorMessages[0].context.message).to.contain('my-device');
            expect(errorMessages[0].context.deviceId).to.equal(5);
            expect(errorMessages[0].context.deviceName).to.equal('my-device');
        });

        it('posts a descriptive onRceStreamError carrying the device id/name when connect() rejects', async () => {
            createProvider();
            provider.nextConnectError = new Error('Timed out negotiating the Janus stream');

            await provider['startRceStreamSession'](createStreamRequest());

            const errorMessages = findEventMessages(ViewProviderEvent.onRceStreamError);
            expect(errorMessages).to.have.length(1);
            expect(errorMessages[0].context.message).to.contain('my-device');
            expect(errorMessages[0].context.message).to.contain('Timed out negotiating the Janus stream');
            expect(errorMessages[0].context.deviceId).to.equal(5);
            expect(errorMessages[0].context.deviceName).to.equal('my-device');
        });

        it('posts onRceStreamError carrying the device id/name when the client emits an error event', async () => {
            createProvider();
            const client = await startFirstSession();

            client.emit('error', new Error('Janus WebSocket error'));

            const errorMessages = findEventMessages(ViewProviderEvent.onRceStreamError);
            expect(errorMessages).to.have.length(1);
            expect(errorMessages[0].context.message).to.contain('Janus WebSocket error');
            expect(errorMessages[0].context.deviceId).to.equal(5);
            expect(errorMessages[0].context.deviceName).to.equal('my-device');
        });

        it('posts onRceStreamClosed when the client emits a close event', async () => {
            createProvider();
            const client = await startFirstSession();

            client.emit('close');

            expect(findEventMessages(ViewProviderEvent.onRceStreamClosed)).to.have.length(1);
        });

        it('stops the previous session before starting a new one', async () => {
            createProvider();
            const firstClient = await startFirstSession(createStreamRequest());
            const secondClient = await startFirstSession(createStreamRequest({ deviceId: 9, deviceName: 'other-device' }));

            expect(firstClient.stop.calledOnce).to.be.true;
            expect(secondClient.stop.called).to.be.false;
        });
    });

    describe('sendRceStreamAnswer command', () => {
        it('forwards the jsep to the active client', async () => {
            createProvider();
            const client = await startFirstSession();

            const fakeJsep = { type: 'answer', sdp: 'v=0\r\no=- answer-sdp\r\n' };
            const message = { command: ViewProviderCommand.sendRceStreamAnswer, context: { jsep: fakeJsep } };
            await provider['messageCommandCallbacks'][ViewProviderCommand.sendRceStreamAnswer](message);

            expect(client.sendAnswer.calledWith(fakeJsep)).to.be.true;
        });

        it('posts a descriptive onRceStreamError carrying the device id/name when sendAnswer rejects', async () => {
            createProvider();
            const client = await startFirstSession();
            client.sendAnswer.rejects(new Error('Invalid PIN'));

            const message = { command: ViewProviderCommand.sendRceStreamAnswer, context: { jsep: { type: 'answer', sdp: 'v=0\r\n' } } };
            await provider['messageCommandCallbacks'][ViewProviderCommand.sendRceStreamAnswer](message);

            const errorMessages = findEventMessages(ViewProviderEvent.onRceStreamError);
            expect(errorMessages).to.have.length(1);
            expect(errorMessages[0].context.message).to.contain('Invalid PIN');
            expect(errorMessages[0].context.deviceId).to.equal(5);
            expect(errorMessages[0].context.deviceName).to.equal('my-device');
        });
    });

    describe('sendRceStreamIceCandidate command', () => {
        it('forwards a candidate to the active client', async () => {
            createProvider();
            const client = await startFirstSession();

            const fakeCandidate = { candidate: 'candidate:1 1 UDP 1 1.2.3.4 5000 typ host' };
            const message = { command: ViewProviderCommand.sendRceStreamIceCandidate, context: { candidate: fakeCandidate } };
            await provider['messageCommandCallbacks'][ViewProviderCommand.sendRceStreamIceCandidate](message);

            expect(client.sendCandidate.calledWith(fakeCandidate)).to.be.true;
            expect(client.sendCandidatesComplete.called).to.be.false;
        });

        it('forwards a completed marker to the active client', async () => {
            createProvider();
            const client = await startFirstSession();

            const message = { command: ViewProviderCommand.sendRceStreamIceCandidate, context: { completed: true } };
            await provider['messageCommandCallbacks'][ViewProviderCommand.sendRceStreamIceCandidate](message);

            expect(client.sendCandidatesComplete.calledOnce).to.be.true;
            expect(client.sendCandidate.called).to.be.false;
        });
    });

    describe('watchRceDevice command (retry)', () => {
        it('stops the active session and re-resolves the stream through the rceWatchDeviceById command', async () => {
            createProvider();
            const client = await startFirstSession();
            const executeCommand = sinon.stub(vscode.commands, 'executeCommand').resolves();

            const message = { command: ViewProviderCommand.watchRceDevice, context: { deviceId: 5 } };
            await provider['messageCommandCallbacks'][ViewProviderCommand.watchRceDevice](message);

            expect(client.stop.calledOnce).to.be.true;
            const executeCommandArgs = executeCommand.getCall(0).args as any[];
            expect(executeCommandArgs[0]).to.equal(VscodeCommand.rceWatchDeviceById);
            expect(executeCommandArgs[1]).to.equal(5);
        });

        it('posts a descriptive onRceStreamError carrying the device id/name when rceWatchDeviceById rejects', async () => {
            createProvider();
            await startFirstSession();
            sinon.stub(vscode.commands, 'executeCommand').rejects(new Error('Device 5 was not found'));

            const message = { command: ViewProviderCommand.watchRceDevice, context: { deviceId: 5 } };
            await provider['messageCommandCallbacks'][ViewProviderCommand.watchRceDevice](message);

            const errorMessages = findEventMessages(ViewProviderEvent.onRceStreamError);
            expect(errorMessages).to.have.length(1);
            expect(errorMessages[0].context.message).to.contain('Device 5 was not found');
            expect(errorMessages[0].context.deviceId).to.equal(5);
            expect(errorMessages[0].context.deviceName).to.equal('my-device');
        });
    });

    describe('stopRceStream command', () => {
        it('stops the active client', async () => {
            createProvider();
            const client = await startFirstSession();

            const message = { command: ViewProviderCommand.stopRceStream, context: {} };
            await provider['messageCommandCallbacks'][ViewProviderCommand.stopRceStream](message);

            expect(client.stop.calledOnce).to.be.true;
        });
    });

    describe('onViewReady', () => {
        it('cold open: does not stop a session whose offer was queued before the webview was ready, and marks it delivered', async () => {
            createProvider();
            //no onViewReady yet: the webview did not exist when the session started (for example
            //because startRceStreamSession's own focus command is what creates it)
            const client = await startFirstSession();

            provider['onViewReady']();

            expect(client.stop.called).to.be.false;
            expect(provider['activeRceStream'].offerDelivered).to.be.true;
            //the offer itself was already posted (BaseWebviewViewProvider queues it and flushes the
            //queue right after onViewReady returns; that queuing/flushing is base-class behavior not
            //re-tested here)
            expect(findEventMessages(ViewProviderEvent.onRceStreamOffer)).to.have.length(1);
        });

        it('reload: stops a session whose offer already reached a previous, now-gone webview instance', async () => {
            createProvider();
            //the webview is already ready (a normal Watch click while the panel is already open), so
            //the offer is delivered directly rather than queued
            provider['onViewReady']();
            const client = await startFirstSession();
            expect(provider['activeRceStream'].offerDelivered).to.be.true;

            //the panel was closed and reopened (or otherwise recreated); the new webview's viewReady
            //arrives, but the old webview's peer connection this session's offer went to is gone
            provider['onViewReady']();

            expect(client.stop.calledOnce).to.be.true;
        });

        it('still negotiating: survives a viewReady that fires before its offer is ready, then delivers the offer directly once it is', async () => {
            createProvider();
            provider.deferNextConnect = true;
            const startPromise = provider['startRceStreamSession'](createStreamRequest());
            await flushMicrotasks();
            const client = provider.createdClients[0];

            provider['onViewReady']();

            expect(client.stop.called).to.be.false;
            expect(findEventMessages(ViewProviderEvent.onRceStreamOffer)).to.have.length(0);

            provider.pendingConnectResolvers[0]({ offer: defaultFakeOffer, iceServers: [] });
            await startPromise;

            expect(client.stop.called).to.be.false;
            expect(provider['activeRceStream'].offerDelivered).to.be.true;
            expect(findEventMessages(ViewProviderEvent.onRceStreamOffer)).to.have.length(1);
        });
    });

    describe('dispose', () => {
        it('stops an active stream session', async () => {
            createProvider();
            const client = await startFirstSession();

            provider.dispose();

            expect(client.stop.calledOnce).to.be.true;
        });
    });
});
