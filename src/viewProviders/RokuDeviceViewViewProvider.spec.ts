import { expect } from 'chai';
import * as sinonImport from 'sinon';
import { EventEmitter } from 'eventemitter3';
import type { RceVideoSignalingClient, RceVideoSignalingConfig, RceVideoSignalingClientOptions } from 'roku-deploy';
import { RtaManager } from '../managers/RtaManager';
import { vscode } from '../mockVscode.spec';
import { RokuDeviceViewViewProvider } from './RokuDeviceViewViewProvider';
import type { RceStreamRequestConfig } from '../managers/RceManager';
import { RceDeviceNotRunningError } from '../managers/RceManager';
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
    let getDevice: sinonImport.SinonStub;
    let getDeviceByDeviceConfig: sinonImport.SinonStub;
    let resolveStreamRequest: sinonImport.SinonStub;
    let rceFinder: EventEmitter;

    function createProvider(): TestRokuDeviceViewViewProvider {
        const rtaManager = new RtaManager(vscode.context);
        getToken = sinon.stub().resolves('management-api-token');
        getDevice = sinon.stub().returns(undefined);
        getDeviceByDeviceConfig = sinon.stub().returns(undefined);
        resolveStreamRequest = sinon.stub().resolves(createStreamRequest());
        rceFinder = new EventEmitter();
        provider = new TestRokuDeviceViewViewProvider(vscode.context, {
            rtaManager: rtaManager,
            rceManager: { getToken: getToken, resolveStreamRequest: resolveStreamRequest },
            rceFinder: rceFinder,
            deviceManager: {
                getDevice: getDevice,
                getDeviceByDeviceConfig: getDeviceByDeviceConfig,
                getDeviceDisplayName: (device: any) => device.deviceInfo?.['user-device-name'] ?? device.key
            }
        } as any);
        postOrQueueMessage = sinon.stub(provider as any, 'postOrQueueMessage');
        return provider;
    }

    /**
     * Shrink the session's reconnect backoff so reconnect tests settle within a short real wait
     */
    function shrinkReconnectDelays(delays: number[]) {
        provider['rceStreamSession']['reconnectDelaysMs'] = delays;
    }

    function sleep(ms: number): Promise<void> {
        return new Promise((resolve) => {
            setTimeout(resolve, ms);
        });
    }

    function findEventMessages(event: ViewProviderEvent) {
        return postOrQueueMessage.getCalls().map((call) => call.args[0]).filter((message) => message.event === event);
    }

    async function startFirstSession(streamRequest = createStreamRequest()): Promise<FakeSignalingClient> {
        await provider['startRceStreamSession'](streamRequest);
        return provider.createdClients[provider.createdClients.length - 1];
    }

    /**
     * Simulate the webview reporting in as ready, in the same order the base class does it: the
     * viewReady flag is set first, then onViewReady fires (the queued-message flush that follows in
     * the base class is not re-created here)
     */
    function markViewReady() {
        provider['viewReady'] = true;
        provider['onViewReady']();
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
            const executeCommand = sinon.stub(vscode.commands, 'executeCommand').resolves() as sinonImport.SinonStub;

            createProvider();
            provider['view'] = { show: sinon.stub() } as any;

            registeredCommands.get(VscodeCommand.rokuDeviceViewShowRceStream)(createStreamRequest());

            const executeCommandArgs = executeCommand.getCall(0).args;
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

        it('posts a descriptive onRceStreamError carrying the device id/name when connect() rejects and the retries run out', async () => {
            createProvider();
            //a failed initial connection now retries in the background; no delays means no retries,
            //so the exhaustion error posts before start() resolves
            shrinkReconnectDelays([]);
            provider.nextConnectError = new Error('Timed out negotiating the Janus stream');

            await provider['startRceStreamSession'](createStreamRequest());

            const errorMessages = findEventMessages(ViewProviderEvent.onRceStreamError);
            expect(errorMessages).to.have.length(1);
            expect(errorMessages[0].context.message).to.contain('my-device');
            expect(errorMessages[0].context.message).to.contain('Timed out negotiating the Janus stream');
            expect(errorMessages[0].context.deviceId).to.equal(5);
            expect(errorMessages[0].context.deviceName).to.equal('my-device');
        });

        it('retries a failed initial connection and recovers (a just-started device gateway can refuse at first)', async () => {
            createProvider();
            shrinkReconnectDelays([0]);
            provider.nextConnectError = new Error('Failed to connect to the Janus WebSocket: Unexpected server response: 503');

            await provider['startRceStreamSession'](createStreamRequest());
            provider.nextConnectError = undefined;
            await sleep(10);

            expect(findEventMessages(ViewProviderEvent.onRceStreamError)).to.have.length(0);
            expect(provider.createdClients).to.have.length(2);
            expect(findEventMessages(ViewProviderEvent.onRceStreamOffer)).to.have.length(1);
            const connectingMessages = findEventMessages(ViewProviderEvent.onRceStreamConnecting);
            expect(connectingMessages[connectingMessages.length - 1].context.reconnectAttempt).to.equal(1);
        });

        it('posts onRceStreamError carrying the device id/name when the client emits an error before the offer was posted', async () => {
            createProvider();
            provider.deferNextConnect = true;
            const startPromise = provider['startRceStreamSession'](createStreamRequest());
            await flushMicrotasks();
            const client = provider.createdClients[0];

            client.emit('error', new Error('Janus WebSocket error'));

            const errorMessages = findEventMessages(ViewProviderEvent.onRceStreamError);
            expect(errorMessages).to.have.length(1);
            expect(errorMessages[0].context.message).to.contain('Janus WebSocket error');
            expect(errorMessages[0].context.deviceId).to.equal(5);
            expect(errorMessages[0].context.deviceName).to.equal('my-device');

            provider.pendingConnectResolvers[0]({ offer: defaultFakeOffer, iceServers: [] });
            await startPromise;
        });

        it('posts onRceStreamClosed when the client closes before the offer was posted', async () => {
            createProvider();
            provider.deferNextConnect = true;
            const startPromise = provider['startRceStreamSession'](createStreamRequest());
            await flushMicrotasks();
            const client = provider.createdClients[0];

            client.emit('close');

            expect(findEventMessages(ViewProviderEvent.onRceStreamClosed)).to.have.length(1);

            provider.pendingConnectResolvers[0]({ offer: defaultFakeOffer, iceServers: [] });
            await startPromise;
        });

        it('stops the previous session before starting a new one', async () => {
            createProvider();
            const firstClient = await startFirstSession(createStreamRequest());
            const secondClient = await startFirstSession(createStreamRequest({ deviceId: 9, deviceName: 'other-device' }));

            expect(firstClient.stop.calledOnce).to.be.true;
            expect(secondClient.stop.called).to.be.false;
        });
    });

    describe('automatic reconnect', () => {
        it('renegotiates a fresh session when the client closes after the offer was posted', async () => {
            createProvider();
            const client = await startFirstSession();
            shrinkReconnectDelays([0]);

            client.emit('close');
            await sleep(10);

            //the drop was reported as a reconnect status, not as closed
            expect(findEventMessages(ViewProviderEvent.onRceStreamClosed)).to.have.length(0);
            const connectingMessages = findEventMessages(ViewProviderEvent.onRceStreamConnecting);
            const reconnectMessage = connectingMessages[connectingMessages.length - 1];
            expect(reconnectMessage.context.reconnectAttempt).to.equal(1);
            expect(reconnectMessage.context.reconnectAttemptLimit).to.equal(1);
            //the stream details were re-resolved and a second client negotiated a fresh offer
            expect(resolveStreamRequest.calledOnceWith(5)).to.be.true;
            expect(provider.createdClients).to.have.length(2);
            expect(findEventMessages(ViewProviderEvent.onRceStreamOffer)).to.have.length(2);
            expect(client.stop.called).to.be.true;
        });

        it('renegotiates when the client errors after the offer was posted, without posting an error banner', async () => {
            createProvider();
            const client = await startFirstSession();
            shrinkReconnectDelays([0]);

            client.emit('error', new Error('Janus hung up on stream 7'));
            await sleep(10);

            expect(findEventMessages(ViewProviderEvent.onRceStreamError)).to.have.length(0);
            expect(resolveStreamRequest.calledOnceWith(5)).to.be.true;
            expect(provider.createdClients).to.have.length(2);
            expect(client.stop.called).to.be.true;
        });

        it('renegotiates when the webview reports its peer connection failed', async () => {
            createProvider();
            const client = await startFirstSession();
            shrinkReconnectDelays([0]);

            const message = { command: ViewProviderCommand.reportRceStreamFailure, context: { message: 'ICE connection failed' } };
            await provider['messageCommandCallbacks'][ViewProviderCommand.reportRceStreamFailure](message);
            await sleep(10);

            expect(client.stop.called).to.be.true;
            expect(resolveStreamRequest.calledOnceWith(5)).to.be.true;
            expect(provider.createdClients).to.have.length(2);
        });

        it('gives up with the error banner after consecutive quick drops (a blocked media path)', async () => {
            createProvider();
            const client = await startFirstSession();
            shrinkReconnectDelays([0]);
            provider['rceStreamSession']['quickDropCycleLimit'] = 2;

            //cycle 1: the stream drops right after connecting; the reconnect negotiates a new one
            client.emit('close');
            await sleep(10);
            expect(provider.createdClients).to.have.length(2);

            //cycle 2: the fresh stream drops right away too - the limit is hit
            provider.createdClients[1].emit('close');
            await sleep(10);

            //no third negotiation; the error banner (with its Retry action) reports the pattern
            expect(provider.createdClients).to.have.length(2);
            const errorMessages = findEventMessages(ViewProviderEvent.onRceStreamError);
            expect(errorMessages).to.have.length(1);
            expect(errorMessages[0].context.message).to.contain('dropped right after connecting');
            expect(provider['rceStreamSession'].isActive).to.be.false;
        });

        it('a stream that held for a while resets the quick-drop count', async () => {
            createProvider();
            const client = await startFirstSession();
            shrinkReconnectDelays([0]);
            //a single quick drop would give up immediately...
            provider['rceStreamSession']['quickDropCycleLimit'] = 1;
            //...but a zero threshold classifies every stream as long-lived, so each drop resets
            provider['rceStreamSession']['quickDropThresholdMs'] = 0;

            client.emit('close');
            await sleep(10);
            provider.createdClients[1].emit('close');
            await sleep(10);

            expect(provider.createdClients).to.have.length(3);
            expect(findEventMessages(ViewProviderEvent.onRceStreamError)).to.have.length(0);
        });

        it('posts onRceStreamDeviceStopped instead of retrying when the device is not running anymore', async () => {
            createProvider();
            const client = await startFirstSession();
            shrinkReconnectDelays([0, 0]);
            resolveStreamRequest.rejects(new RceDeviceNotRunningError(`Device 'my-device' must be running and expose a video stream to watch it`));

            client.emit('close');
            await sleep(10);

            const stoppedMessages = findEventMessages(ViewProviderEvent.onRceStreamDeviceStopped);
            expect(stoppedMessages).to.have.length(1);
            expect(stoppedMessages[0].context.deviceId).to.equal(5);
            expect(stoppedMessages[0].context.deviceName).to.equal('my-device');
            expect(stoppedMessages[0].context.message).to.contain('must be running');
            //the not-running report ends the loop on the first attempt, with no error banner
            expect(resolveStreamRequest.calledOnce).to.be.true;
            expect(findEventMessages(ViewProviderEvent.onRceStreamError)).to.have.length(0);
            expect(provider['rceStreamSession'].isActive).to.be.false;
        });

        it('posts the error banner after exhausting the reconnect attempts', async () => {
            createProvider();
            const client = await startFirstSession();
            shrinkReconnectDelays([0, 0]);
            resolveStreamRequest.rejects(new Error('gateway unreachable'));

            client.emit('close');
            await sleep(30);

            expect(resolveStreamRequest.calledTwice).to.be.true;
            const errorMessages = findEventMessages(ViewProviderEvent.onRceStreamError);
            expect(errorMessages).to.have.length(1);
            expect(errorMessages[0].context.message).to.contain('could not reconnect');
            expect(errorMessages[0].context.message).to.contain('gateway unreachable');
            expect(provider['rceStreamSession'].isActive).to.be.false;
        });

        it('waits for a pending device instead of consuming attempts, then reconnects once it is running', async () => {
            createProvider();
            const client = await startFirstSession();
            shrinkReconnectDelays([0]);
            provider['rceStreamSession']['pendingPollDelayMs'] = 0;
            resolveStreamRequest.onFirstCall().rejects(new RceDeviceNotRunningError(`Device 'my-device' is not running`, 'pending'));
            resolveStreamRequest.onSecondCall().rejects(new RceDeviceNotRunningError(`Device 'my-device' is not running`, 'pending'));

            client.emit('close');
            await sleep(30);

            const waitingMessages = findEventMessages(ViewProviderEvent.onRceStreamConnecting).filter((message) => message.context.waitingForDevice);
            expect(waitingMessages).to.have.length(2);
            //the pending polls were not treated as a stopped device or as failed attempts
            expect(findEventMessages(ViewProviderEvent.onRceStreamDeviceStopped)).to.have.length(0);
            expect(findEventMessages(ViewProviderEvent.onRceStreamError)).to.have.length(0);
            expect(provider.createdClients).to.have.length(2);
            expect(findEventMessages(ViewProviderEvent.onRceStreamOffer)).to.have.length(2);
        });

        it('gives up on a device that stays pending past the poll limit with a timeout error', async () => {
            createProvider();
            const client = await startFirstSession();
            shrinkReconnectDelays([0]);
            provider['rceStreamSession']['pendingPollDelayMs'] = 0;
            provider['rceStreamSession']['pendingPollLimit'] = 2;
            resolveStreamRequest.rejects(new RceDeviceNotRunningError(`Device 'my-device' is not running`, 'pending'));

            client.emit('close');
            await sleep(30);

            const errorMessages = findEventMessages(ViewProviderEvent.onRceStreamError);
            expect(errorMessages).to.have.length(1);
            expect(errorMessages[0].context.message).to.contain('Timed out waiting for device');
            expect(findEventMessages(ViewProviderEvent.onRceStreamDeviceStopped)).to.have.length(0);
            expect(provider['rceStreamSession'].isActive).to.be.false;
        });

        it('stop() cancels an in-flight reconnect loop', async () => {
            createProvider();
            const client = await startFirstSession();
            shrinkReconnectDelays([60000]);

            client.emit('close');
            //the loop is now parked on its backoff wait; stopping cuts it short
            provider['rceStreamSession'].stop();
            await sleep(10);

            expect(resolveStreamRequest.called).to.be.false;
            expect(provider['rceStreamSession'].isActive).to.be.false;
            expect(findEventMessages(ViewProviderEvent.onRceStreamError)).to.have.length(0);
        });
    });

    describe('device status from the finder poll', () => {
        it('shows the device-stopped state when the streamed device leaves running, ignoring other devices', async () => {
            createProvider();
            const client = await startFirstSession();

            //another device stopping does not touch this stream
            rceFinder.emit('devices', [{ id: 99, status: 'shutdown' }]);
            expect(client.stop.called).to.be.false;

            rceFinder.emit('devices', [{ id: 5, status: 'shutdown' }]);

            expect(client.stop.called).to.be.true;
            const stoppedMessages = findEventMessages(ViewProviderEvent.onRceStreamDeviceStopped);
            expect(stoppedMessages).to.have.length(1);
            expect(stoppedMessages[0].context.message).to.contain('was stopped');
            expect(provider['rceStreamSession'].isActive).to.be.false;
        });

        it('moves to waiting when the streamed device is pending (restarting), then reconnects', async () => {
            createProvider();
            const client = await startFirstSession();
            shrinkReconnectDelays([0]);
            provider['rceStreamSession']['pendingPollDelayMs'] = 0;

            rceFinder.emit('devices', [{ id: 5, status: 'pending' }]);
            await sleep(10);

            expect(client.stop.called).to.be.true;
            const waitingMessages = findEventMessages(ViewProviderEvent.onRceStreamConnecting).filter((message) => message.context.waitingForDevice);
            expect(waitingMessages.length).to.be.greaterThanOrEqual(1);
            //the resolution (running again by the time it was polled) reconnected the stream
            expect(provider.createdClients).to.have.length(2);
            expect(findEventMessages(ViewProviderEvent.onRceStreamOffer)).to.have.length(2);
            expect(findEventMessages(ViewProviderEvent.onRceStreamDeviceStopped)).to.have.length(0);
        });

        it('a running status report leaves the stream alone', async () => {
            createProvider();
            const client = await startFirstSession();

            rceFinder.emit('devices', [{ id: 5, status: 'running' }]);

            expect(client.stop.called).to.be.false;
            expect(provider.createdClients).to.have.length(1);
        });

        it('resumes the stream by itself when the stopped device starts again', async () => {
            createProvider();
            await startFirstSession();
            shrinkReconnectDelays([0]);
            provider['rceStreamSession']['pendingPollDelayMs'] = 0;

            rceFinder.emit('devices', [{ id: 5, status: 'shutdown' }]);
            expect(findEventMessages(ViewProviderEvent.onRceStreamDeviceStopped)).to.have.length(1);
            //further stopped reports change nothing
            rceFinder.emit('devices', [{ id: 5, status: 'shutdown' }]);
            expect(findEventMessages(ViewProviderEvent.onRceStreamDeviceStopped)).to.have.length(1);

            rceFinder.emit('devices', [{ id: 5, status: 'running' }]);
            await sleep(10);

            expect(provider.createdClients).to.have.length(2);
            expect(findEventMessages(ViewProviderEvent.onRceStreamOffer)).to.have.length(2);
            const waitingMessages = findEventMessages(ViewProviderEvent.onRceStreamConnecting).filter((message) => message.context.waitingForDevice);
            expect(waitingMessages.length).to.be.greaterThanOrEqual(1);
        });

        it('does not resume after the user stopped the stream themselves', async () => {
            createProvider();
            await startFirstSession();
            const message = { command: ViewProviderCommand.stopRceStream, context: {} };
            await provider['messageCommandCallbacks'][ViewProviderCommand.stopRceStream](message);

            rceFinder.emit('devices', [{ id: 5, status: 'running' }]);
            await sleep(10);

            expect(provider.createdClients).to.have.length(1);
        });

        it('re-posts the device-stopped state to a reloaded webview', async () => {
            createProvider();
            markViewReady();
            await startFirstSession();

            rceFinder.emit('devices', [{ id: 5, status: 'shutdown' }]);
            expect(findEventMessages(ViewProviderEvent.onRceStreamDeviceStopped)).to.have.length(1);

            //the webview was recreated (view closed/reopened); its copy of the stopped state is gone
            markViewReady();

            expect(findEventMessages(ViewProviderEvent.onRceStreamDeviceStopped)).to.have.length(2);
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
            const executeCommand = sinon.stub(vscode.commands, 'executeCommand').resolves() as sinonImport.SinonStub;

            const message = { command: ViewProviderCommand.watchRceDevice, context: { deviceId: 5 } };
            await provider['messageCommandCallbacks'][ViewProviderCommand.watchRceDevice](message);

            expect(client.stop.calledOnce).to.be.true;
            //the session stop also fires a setContext call (the editor pop-out button's visibility),
            //so find the watch command rather than assuming call order
            const executeCommandArgs = executeCommand.getCalls().find((call) => call.args[0] !== 'setContext').args;
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

        it('shows the device-stopped state when the retry resolution finds the device stopped', async () => {
            createProvider();
            await startFirstSession();
            sinon.stub(vscode.commands, 'executeCommand').rejects(new RceDeviceNotRunningError(`Device 'my-device' is not running`, 'shutdown'));

            const message = { command: ViewProviderCommand.watchRceDevice, context: { deviceId: 5 } };
            await provider['messageCommandCallbacks'][ViewProviderCommand.watchRceDevice](message);

            const stoppedMessages = findEventMessages(ViewProviderEvent.onRceStreamDeviceStopped);
            expect(stoppedMessages).to.have.length(1);
            expect(stoppedMessages[0].context.message).to.contain('is not running');
            expect(findEventMessages(ViewProviderEvent.onRceStreamError)).to.have.length(0);
        });

        it('enters the waiting-for-device state when the retry resolution finds the device pending', async () => {
            createProvider();
            await startFirstSession();
            sinon.stub(vscode.commands, 'executeCommand').rejects(new RceDeviceNotRunningError(`Device 'my-device' is not running`, 'pending'));

            const message = { command: ViewProviderCommand.watchRceDevice, context: { deviceId: 5 } };
            await provider['messageCommandCallbacks'][ViewProviderCommand.watchRceDevice](message);
            await sleep(10);

            const waitingMessages = findEventMessages(ViewProviderEvent.onRceStreamConnecting).filter((candidate) => candidate.context.waitingForDevice);
            expect(waitingMessages.length).to.be.greaterThanOrEqual(1);
            expect(findEventMessages(ViewProviderEvent.onRceStreamError)).to.have.length(0);
            //the waiting loop's own status poll (which resolves running here) reconnected the stream
            expect(findEventMessages(ViewProviderEvent.onRceStreamOffer)).to.have.length(2);
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

            markViewReady();

            expect(client.stop.called).to.be.false;
            expect(provider['rceStreamSession']['activeStream'].offerDelivered).to.be.true;
            //the offer itself was already posted (BaseWebviewViewProvider queues it and flushes the
            //queue right after onViewReady returns; that queuing/flushing is base-class behavior not
            //re-tested here)
            expect(findEventMessages(ViewProviderEvent.onRceStreamOffer)).to.have.length(1);
        });

        it('reload: stops a session whose offer already reached a previous, now-gone webview instance', async () => {
            createProvider();
            //the webview is already ready (a normal Watch click while the panel is already open), so
            //the offer is delivered directly rather than queued
            markViewReady();
            const client = await startFirstSession();
            expect(provider['rceStreamSession']['activeStream'].offerDelivered).to.be.true;

            //the panel was closed and reopened (or otherwise recreated); the new webview's viewReady
            //arrives, but the old webview's peer connection this session's offer went to is gone
            markViewReady();

            expect(client.stop.calledOnce).to.be.true;
        });

        it('still negotiating: survives a viewReady that fires before its offer is ready, then delivers the offer directly once it is', async () => {
            createProvider();
            provider.deferNextConnect = true;
            const startPromise = provider['startRceStreamSession'](createStreamRequest());
            await flushMicrotasks();
            const client = provider.createdClients[0];

            markViewReady();

            expect(client.stop.called).to.be.false;
            expect(findEventMessages(ViewProviderEvent.onRceStreamOffer)).to.have.length(0);

            provider.pendingConnectResolvers[0]({ offer: defaultFakeOffer, iceServers: [] });
            await startPromise;

            expect(client.stop.called).to.be.false;
            expect(provider['rceStreamSession']['activeStream'].offerDelivered).to.be.true;
            expect(findEventMessages(ViewProviderEvent.onRceStreamOffer)).to.have.length(1);
        });
    });

    describe('follows the last sideloaded device', () => {
        function publishChannel(device: any) {
            provider.onChannelPublishedEvent({ body: { launchConfiguration: { device: device } } } as any);
        }

        it('starts the stream when a channel is published to a cloud device', async () => {
            createProvider();
            markViewReady();
            getDeviceByDeviceConfig.returns({ key: 's:ESN1', rce: { id: '83', status: 'running' }, deviceInfo: { 'user-device-name': 'Chris' } });

            publishChannel({ esn: 'ESN1' });
            await flushMicrotasks();

            expect(getDeviceByDeviceConfig.calledWith({ esn: 'ESN1' })).to.be.true;
            expect(resolveStreamRequest.calledWith(83)).to.be.true;
            expect(provider.createdClients).to.have.length(1);
        });

        it('falls back to an id-addressed config when the device manager does not know the device', async () => {
            createProvider();
            markViewReady();

            publishChannel({ id: '84' });
            await flushMicrotasks();

            expect(resolveStreamRequest.calledWith(84)).to.be.true;
        });

        it('stops the stream and forgets the device when a channel is published to a LAN device', async () => {
            createProvider();
            markViewReady();
            getDeviceByDeviceConfig.returns({ key: 's:ESN1', rce: { id: '83', status: 'running' }, deviceInfo: {} });
            publishChannel({ esn: 'ESN1' });
            await flushMicrotasks();
            const client = provider.createdClients[0];

            publishChannel({ host: '192.168.1.100' });
            await flushMicrotasks();

            expect(client.stop.called).to.be.true;
            //a later view reopen does not reconnect to the forgotten cloud device
            resolveStreamRequest.resetHistory();
            markViewReady();
            await flushMicrotasks();
            expect(resolveStreamRequest.called).to.be.false;
        });

        it('reconnects to the last sideloaded cloud device when the view reopens', async () => {
            createProvider();
            markViewReady();
            getDeviceByDeviceConfig.returns({ key: 's:ESN1', rce: { id: '83', status: 'running' }, deviceInfo: {} });
            publishChannel({ esn: 'ESN1' });
            await flushMicrotasks();
            expect(provider.createdClients).to.have.length(1);

            //the view was closed and reopened: the new webview's viewReady stops the delivered-offer
            //session and the provider reconnects to the remembered sideloaded device
            markViewReady();
            await flushMicrotasks();

            expect(provider.createdClients[0].stop.called).to.be.true;
            expect(provider.createdClients).to.have.length(2);
        });

        it('does not auto-connect when nothing was sideloaded, leaving the screenshot flow alone', async () => {
            createProvider();

            markViewReady();
            await flushMicrotasks();

            expect(resolveStreamRequest.called).to.be.false;
        });

        it('setting a device as the active device does not move this view', async () => {
            createProvider();
            markViewReady();
            await vscode.context.workspaceState.update('activeDeviceKey', 's:ESN1');
            getDevice.returns({ key: 's:ESN1', rce: { id: '83', status: 'running' }, deviceInfo: {} });

            markViewReady();
            await flushMicrotasks();

            expect(resolveStreamRequest.called).to.be.false;
        });

        it('does not auto-connect while a stream session is already underway', async () => {
            createProvider();
            provider['lastSideloadedRceDevice'] = { id: 83, name: 'Chris' };

            //a session whose offer is still negotiating when the webview reports ready
            provider.deferNextConnect = true;
            const startPromise = provider['startRceStreamSession'](createStreamRequest());
            await flushMicrotasks();

            markViewReady();
            await flushMicrotasks();

            expect(resolveStreamRequest.called).to.be.false;

            provider.pendingConnectResolvers[0]({ offer: defaultFakeOffer, iceServers: [] });
            await startPromise;
        });

        it('surfaces stream resolution failures through the stream error banner', async () => {
            createProvider();
            markViewReady();
            getDeviceByDeviceConfig.returns({ key: 's:ESN1', rce: { id: '83', status: 'shutdown' }, deviceInfo: { 'user-device-name': 'Chris' } });
            resolveStreamRequest.rejects(new Error('device must be running'));

            publishChannel({ esn: 'ESN1' });
            await flushMicrotasks();

            const errorMessages = findEventMessages(ViewProviderEvent.onRceStreamError);
            expect(errorMessages).to.have.length(1);
            expect(errorMessages[0].context.message).to.contain('Chris');
            expect(errorMessages[0].context.message).to.contain('device must be running');
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
