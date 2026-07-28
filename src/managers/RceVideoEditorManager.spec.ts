import { expect } from 'chai';
import * as sinonImport from 'sinon';
import { EventEmitter } from 'eventemitter3';
import type * as vscodeType from 'vscode';
import type { RceVideoSignalingClient, RceVideoSignalingConfig, RceVideoSignalingClientOptions } from 'roku-deploy';
import { vscode } from '../mockVscode.spec';
import { RceVideoEditorManager } from './RceVideoEditorManager';
import { RceDeviceNotRunningError } from './RceManager';
import { ViewProviderCommand } from '../viewProviders/ViewProviderCommand';
import { ViewProviderEvent } from '../viewProviders/ViewProviderEvent';

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

class FakeSignalingClient extends EventEmitter {
    public connect = sinon.stub().resolves({ offer: defaultFakeOffer, iceServers: [] });
    public sendAnswer = sinon.stub().resolves();
    public sendCandidate = sinon.stub();
    public sendCandidatesComplete = sinon.stub();
    public stop = sinon.stub();
}

/**
 * A stand-in for vscode.WebviewPanel: captures posted messages and the message handler, and fires
 * its dispose listeners the way the real panel does
 */
class FakeWebviewPanel {
    public title = '';
    public iconPath: unknown;
    public postedMessages: any[] = [];
    public revealed = 0;
    public disposed = false;
    private messageHandler: (message) => void;
    private disposeListeners: Array<() => void> = [];

    public webview = {
        html: '',
        asWebviewUri: (uri) => uri,
        postMessage: (message) => {
            this.postedMessages.push(message);
            return Promise.resolve(true);
        },
        onDidReceiveMessage: (handler) => {
            this.messageHandler = handler;
            return { dispose: () => { } };
        }
    };

    public reveal() {
        this.revealed++;
    }

    public dispose() {
        if (this.disposed) {
            return;
        }
        this.disposed = true;
        this.disposeListeners.forEach((listener) => listener());
    }

    public onDidDispose(listener: () => void) {
        this.disposeListeners.push(listener);
        return { dispose: () => { } };
    }

    /** Simulate the webview sending a message to the extension host */
    public async receiveMessage(message): Promise<void> {
        await Promise.resolve(this.messageHandler(message));
    }
}

class TestRceVideoEditorManager extends RceVideoEditorManager {
    public createdPanels: FakeWebviewPanel[] = [];
    public createdClients: FakeSignalingClient[] = [];
    public lastSignalingConfig: RceVideoSignalingConfig | undefined;

    protected override createWebviewPanel(title: string): vscodeType.WebviewPanel {
        const fakePanel = new FakeWebviewPanel();
        fakePanel.title = title;
        this.createdPanels.push(fakePanel);
        return fakePanel as unknown as vscodeType.WebviewPanel;
    }

    protected override createSignalingClient(config: RceVideoSignalingConfig, options?: RceVideoSignalingClientOptions): RceVideoSignalingClient {
        this.lastSignalingConfig = config;
        const client = new FakeSignalingClient();
        this.createdClients.push(client);
        return client as unknown as RceVideoSignalingClient;
    }
}

describe('RceVideoEditorManager', () => {
    let manager: TestRceVideoEditorManager;
    let resolveStreamRequest: sinonImport.SinonStub;
    let getToken: sinonImport.SinonStub;
    let rceFinder: EventEmitter;

    function createManager() {
        resolveStreamRequest = sinon.stub().resolves({
            deviceId: 5,
            deviceName: 'my-device',
            websocketUrl: 'wss://device.rce.roku.com/instance/abc/janus',
            streamId: 7,
            pin: '1234',
            janusToken: 'janus-secret',
            iceServers: [{ urls: ['stun:stun.example.com'] }]
        });
        getToken = sinon.stub().resolves('management-api-token');
        rceFinder = new EventEmitter();
        manager = new TestRceVideoEditorManager(vscode.context as any, {
            resolveStreamRequest: resolveStreamRequest,
            getToken: getToken
        } as any, rceFinder as any);
        return manager;
    }

    function findEventMessages(fakePanel: FakeWebviewPanel, event: ViewProviderEvent) {
        return fakePanel.postedMessages.filter((message) => message.event === event);
    }

    it('creates a panel per device, resolves the stream, and posts connecting then the offer', async () => {
        createManager();
        await manager.open(5, 'my-device');

        expect(manager.createdPanels.length).to.equal(1);
        const fakePanel = manager.createdPanels[0];
        expect(fakePanel.title).to.equal('my-device');
        expect(resolveStreamRequest.calledOnceWith(5)).to.be.true;
        expect(manager.lastSignalingConfig.apiToken).to.equal('management-api-token');

        //no viewReady yet, so both are queued; simulate the webview reporting in
        await fakePanel.receiveMessage({ command: ViewProviderCommand.viewReady, context: {} });

        expect(findEventMessages(fakePanel, ViewProviderEvent.onRceStreamConnecting).length).to.equal(1);
        const offerMessages = findEventMessages(fakePanel, ViewProviderEvent.onRceStreamOffer);
        expect(offerMessages.length).to.equal(1);
        expect(offerMessages[0].context.deviceId).to.equal(5);
        expect(offerMessages[0].context.offer).to.eql(defaultFakeOffer);
    });

    it('reveals the existing panel instead of creating a second one for the same device', async () => {
        createManager();
        await manager.open(5, 'my-device');
        await manager.open(5, 'my-device');

        expect(manager.createdPanels.length).to.equal(1);
        expect(manager.createdPanels[0].revealed).to.equal(1);
        expect(resolveStreamRequest.calledOnce).to.be.true;
    });

    it('creates separate panels with separate sessions for different devices', async () => {
        createManager();
        resolveStreamRequest.callsFake((deviceId: number) => Promise.resolve({
            deviceId: deviceId,
            deviceName: `device-${deviceId}`,
            websocketUrl: 'wss://device.rce.roku.com/instance/abc/janus',
            streamId: deviceId,
            iceServers: []
        }));
        await manager.open(5, 'device-5');
        await manager.open(6, 'device-6');

        expect(manager.createdPanels.length).to.equal(2);
        expect(manager.createdClients.length).to.equal(2);
    });

    it('a disposed panel stops its stream and a later open creates a fresh panel', async () => {
        createManager();
        await manager.open(5, 'my-device');
        const firstPanel = manager.createdPanels[0];
        const firstClient = manager.createdClients[0];

        firstPanel.dispose();
        expect(firstClient.stop.called).to.be.true;

        await manager.open(5, 'my-device');
        expect(manager.createdPanels.length).to.equal(2);
    });

    it('relays the webview answer and ice candidates to the signaling client', async () => {
        createManager();
        await manager.open(5, 'my-device');
        const fakePanel = manager.createdPanels[0];
        const client = manager.createdClients[0];

        await fakePanel.receiveMessage({ command: ViewProviderCommand.sendRceStreamAnswer, context: { jsep: { type: 'answer', sdp: 'answer-sdp' } } });
        expect(client.sendAnswer.calledOnceWith({ type: 'answer', sdp: 'answer-sdp' })).to.be.true;

        await fakePanel.receiveMessage({ command: ViewProviderCommand.sendRceStreamIceCandidate, context: { candidate: { candidate: 'ice' } } });
        expect(client.sendCandidate.calledOnceWith({ candidate: 'ice' })).to.be.true;

        await fakePanel.receiveMessage({ command: ViewProviderCommand.sendRceStreamIceCandidate, context: { completed: true } });
        expect(client.sendCandidatesComplete.calledOnce).to.be.true;
    });

    it('closes the tab when the webview sends stopRceStream', async () => {
        createManager();
        await manager.open(5, 'my-device');
        const fakePanel = manager.createdPanels[0];
        const client = manager.createdClients[0];

        await fakePanel.receiveMessage({ command: ViewProviderCommand.stopRceStream, context: {} });

        expect(fakePanel.disposed).to.be.true;
        expect(client.stop.called).to.be.true;
    });

    it('retries through a fresh resolution when the webview sends watchRceDevice', async () => {
        createManager();
        await manager.open(5, 'my-device');
        const fakePanel = manager.createdPanels[0];

        await fakePanel.receiveMessage({ command: ViewProviderCommand.watchRceDevice, context: { deviceId: 5 } });

        expect(resolveStreamRequest.calledTwice).to.be.true;
        expect(manager.createdClients.length).to.equal(2);
        expect(manager.createdClients[0].stop.called).to.be.true;
    });

    it('negotiates a fresh session when a reloaded webview reports ready after the offer was delivered (tab moved to another window)', async () => {
        createManager();
        await manager.open(5, 'my-device');
        const fakePanel = manager.createdPanels[0];
        const firstClient = manager.createdClients[0];

        //first ready: delivers the queued offer to the original webview instance
        await fakePanel.receiveMessage({ command: ViewProviderCommand.viewReady, context: {} });
        expect(manager.createdClients.length).to.equal(1);

        //second ready: the webview was recreated (moved to a floating window); the delivered
        //offer's peer connection is gone, so the stale session stops and a fresh one negotiates
        await fakePanel.receiveMessage({ command: ViewProviderCommand.viewReady, context: {} });

        expect(firstClient.stop.called).to.be.true;
        expect(resolveStreamRequest.calledTwice).to.be.true;
        expect(manager.createdClients.length).to.equal(2);
        const offerMessages = findEventMessages(fakePanel, ViewProviderEvent.onRceStreamOffer);
        expect(offerMessages.length).to.equal(2);
    });

    it('does not double-start the stream when viewReady arrives while the initial watch is still resolving', async () => {
        createManager();
        let resolveStream: (value: unknown) => void;
        resolveStreamRequest.onFirstCall().returns(new Promise((resolve) => {
            resolveStream = resolve;
        }));

        const openPromise = manager.open(5, 'my-device');
        const fakePanel = manager.createdPanels[0];

        //the webview reports ready while open()'s watch is still awaiting the stream resolution
        await fakePanel.receiveMessage({ command: ViewProviderCommand.viewReady, context: {} });
        expect(resolveStreamRequest.calledOnce).to.be.true;

        resolveStream({
            deviceId: 5,
            deviceName: 'my-device',
            websocketUrl: 'wss://device.rce.roku.com/instance/abc/janus',
            streamId: 7,
            iceServers: []
        });
        await openPromise;

        expect(resolveStreamRequest.calledOnce).to.be.true;
        expect(manager.createdClients.length).to.equal(1);
    });

    it('restores a serialized panel by device id: rebuilds the html, renegotiates, and dedupes later opens', async () => {
        createManager();
        const restoredPanel = new FakeWebviewPanel();
        restoredPanel.title = 'my-device';

        await manager.restore(restoredPanel as any, 5);

        //webview content is never persisted across reloads, so restore must have rebuilt it
        //(asserting non-empty rather than its contents keeps this independent of a built bundle)
        expect(restoredPanel.webview.html).to.not.equal('');
        expect(resolveStreamRequest.calledOnceWith(5)).to.be.true;

        await restoredPanel.receiveMessage({ command: ViewProviderCommand.viewReady, context: {} });
        expect(findEventMessages(restoredPanel, ViewProviderEvent.onRceStreamOffer).length).to.equal(1);

        //the restored panel now owns this device, so a later open reveals it instead of duplicating
        await manager.open(5, 'my-device');
        expect(manager.createdPanels.length).to.equal(0);
        expect(restoredPanel.revealed).to.equal(1);
    });

    it('renders a resolution failure in the tab as a stream error instead of throwing', async () => {
        createManager();
        resolveStreamRequest.rejects(new Error('device 5 is asleep'));

        await manager.open(5, 'my-device');
        const fakePanel = manager.createdPanels[0];
        await fakePanel.receiveMessage({ command: ViewProviderCommand.viewReady, context: {} });

        const errorMessages = findEventMessages(fakePanel, ViewProviderEvent.onRceStreamError);
        expect(errorMessages.length).to.equal(1);
        expect(errorMessages[0].context.message).to.contain('device 5 is asleep');
        expect(errorMessages[0].context.deviceName).to.equal('my-device');
    });

    it('renders a not-running resolution failure as the device-stopped state rather than an error', async () => {
        createManager();
        resolveStreamRequest.rejects(new RceDeviceNotRunningError(`Device 'my-device' is not running`, 'shutdown'));

        await manager.open(5, 'my-device');
        const fakePanel = manager.createdPanels[0];
        await fakePanel.receiveMessage({ command: ViewProviderCommand.viewReady, context: {} });

        const stoppedMessages = findEventMessages(fakePanel, ViewProviderEvent.onRceStreamDeviceStopped);
        expect(stoppedMessages.length).to.equal(1);
        expect(stoppedMessages[0].context.message).to.contain('is not running');
        expect(stoppedMessages[0].context.deviceId).to.equal(5);
        expect(stoppedMessages[0].context.deviceName).to.equal('my-device');
        expect(findEventMessages(fakePanel, ViewProviderEvent.onRceStreamError).length).to.equal(0);
    });

    it('waits for a pending device on the initial watch, connecting once it reaches running', async () => {
        createManager();
        resolveStreamRequest.onFirstCall().rejects(new RceDeviceNotRunningError(`Device 'my-device' is not running`, 'pending'));

        await manager.open(5, 'my-device');
        const fakePanel = manager.createdPanels[0];
        await fakePanel.receiveMessage({ command: ViewProviderCommand.viewReady, context: {} });
        await new Promise((resolve) => {
            setTimeout(resolve, 10);
        });

        const waitingMessages = findEventMessages(fakePanel, ViewProviderEvent.onRceStreamConnecting).filter((message) => message.context.waitingForDevice);
        expect(waitingMessages.length).to.be.greaterThanOrEqual(1);
        expect(findEventMessages(fakePanel, ViewProviderEvent.onRceStreamDeviceStopped).length).to.equal(0);
        expect(findEventMessages(fakePanel, ViewProviderEvent.onRceStreamError).length).to.equal(0);
        //the waiting loop's own status poll (running on the second resolution) connected the stream
        expect(findEventMessages(fakePanel, ViewProviderEvent.onRceStreamOffer).length).to.equal(1);
    });

    describe('automatic reconnect', () => {
        function sleep(ms: number): Promise<void> {
            return new Promise((resolve) => {
                setTimeout(resolve, ms);
            });
        }

        /**
         * Shrink the panel session's reconnect backoff so reconnect tests settle within a short
         * real wait
         */
        function shrinkReconnectDelays(deviceId: number, delays: number[]) {
            manager['editorPanelsByDeviceId'].get(deviceId)['session']['reconnectDelaysMs'] = delays;
        }

        it('renegotiates a fresh session when the client closes after the offer was posted', async () => {
            createManager();
            await manager.open(5, 'my-device');
            const fakePanel = manager.createdPanels[0];
            await fakePanel.receiveMessage({ command: ViewProviderCommand.viewReady, context: {} });
            shrinkReconnectDelays(5, [0]);

            manager.createdClients[0].emit('close');
            await sleep(10);

            //the drop was reported as a reconnect status, not as closed
            expect(findEventMessages(fakePanel, ViewProviderEvent.onRceStreamClosed).length).to.equal(0);
            const connectingMessages = findEventMessages(fakePanel, ViewProviderEvent.onRceStreamConnecting);
            const reconnectMessage = connectingMessages[connectingMessages.length - 1];
            expect(reconnectMessage.context.reconnectAttempt).to.equal(1);
            //the stream was re-resolved and a second client negotiated a fresh offer
            expect(resolveStreamRequest.calledTwice).to.be.true;
            expect(manager.createdClients.length).to.equal(2);
            expect(findEventMessages(fakePanel, ViewProviderEvent.onRceStreamOffer).length).to.equal(2);
        });

        it('renegotiates when the webview reports its peer connection failed', async () => {
            createManager();
            await manager.open(5, 'my-device');
            const fakePanel = manager.createdPanels[0];
            await fakePanel.receiveMessage({ command: ViewProviderCommand.viewReady, context: {} });
            shrinkReconnectDelays(5, [0]);

            await fakePanel.receiveMessage({ command: ViewProviderCommand.reportRceStreamFailure, context: { message: 'ICE connection failed' } });
            await sleep(10);

            expect(manager.createdClients[0].stop.called).to.be.true;
            expect(resolveStreamRequest.calledTwice).to.be.true;
            expect(manager.createdClients.length).to.equal(2);
        });

        it('posts onRceStreamDeviceStopped instead of retrying when the device is not running anymore', async () => {
            createManager();
            await manager.open(5, 'my-device');
            const fakePanel = manager.createdPanels[0];
            await fakePanel.receiveMessage({ command: ViewProviderCommand.viewReady, context: {} });
            shrinkReconnectDelays(5, [0, 0]);
            resolveStreamRequest.rejects(new RceDeviceNotRunningError(`Device 'my-device' must be running and expose a video stream to watch it`));

            manager.createdClients[0].emit('close');
            await sleep(10);

            const stoppedMessages = findEventMessages(fakePanel, ViewProviderEvent.onRceStreamDeviceStopped);
            expect(stoppedMessages.length).to.equal(1);
            expect(stoppedMessages[0].context.message).to.contain('must be running');
            //the not-running report ends the loop on the first attempt, with no error banner and
            //without closing the tab (the user can start the device and watch again from it)
            expect(resolveStreamRequest.calledTwice).to.be.true;
            expect(findEventMessages(fakePanel, ViewProviderEvent.onRceStreamError).length).to.equal(0);
            expect(fakePanel.disposed).to.be.false;
        });

        it('posts the error banner after exhausting the reconnect attempts', async () => {
            createManager();
            await manager.open(5, 'my-device');
            const fakePanel = manager.createdPanels[0];
            await fakePanel.receiveMessage({ command: ViewProviderCommand.viewReady, context: {} });
            shrinkReconnectDelays(5, [0, 0]);
            resolveStreamRequest.rejects(new Error('gateway unreachable'));

            manager.createdClients[0].emit('close');
            await sleep(30);

            const errorMessages = findEventMessages(fakePanel, ViewProviderEvent.onRceStreamError);
            expect(errorMessages.length).to.equal(1);
            expect(errorMessages[0].context.message).to.contain('could not reconnect');
            expect(errorMessages[0].context.message).to.contain('gateway unreachable');
            expect(fakePanel.disposed).to.be.false;
        });

        it('shows the device-stopped state when the finder reports the tab device left running, leaving other tabs alone', async () => {
            createManager();
            resolveStreamRequest.callsFake((deviceId: number) => Promise.resolve({
                deviceId: deviceId,
                deviceName: `device-${deviceId}`,
                websocketUrl: 'wss://device.rce.roku.com/instance/abc/janus',
                streamId: deviceId,
                iceServers: []
            }));
            await manager.open(5, 'device-5');
            await manager.open(6, 'device-6');
            const panelForDevice5 = manager.createdPanels[0];
            const panelForDevice6 = manager.createdPanels[1];
            await panelForDevice5.receiveMessage({ command: ViewProviderCommand.viewReady, context: {} });
            await panelForDevice6.receiveMessage({ command: ViewProviderCommand.viewReady, context: {} });

            rceFinder.emit('devices', [{ id: 5, status: 'shutdown' }, { id: 6, status: 'running' }]);

            const stoppedMessages = findEventMessages(panelForDevice5, ViewProviderEvent.onRceStreamDeviceStopped);
            expect(stoppedMessages.length).to.equal(1);
            expect(stoppedMessages[0].context.message).to.contain('was stopped');
            expect(manager.createdClients[0].stop.called).to.be.true;
            //the other tab's stream is untouched, and neither tab was closed
            expect(findEventMessages(panelForDevice6, ViewProviderEvent.onRceStreamDeviceStopped).length).to.equal(0);
            expect(manager.createdClients[1].stop.called).to.be.false;
            expect(panelForDevice5.disposed).to.be.false;
        });

        it('resumes the tab stream by itself when the device starts again', async () => {
            createManager();
            await manager.open(5, 'my-device');
            const fakePanel = manager.createdPanels[0];
            await fakePanel.receiveMessage({ command: ViewProviderCommand.viewReady, context: {} });

            rceFinder.emit('devices', [{ id: 5, status: 'shutdown' }]);
            expect(findEventMessages(fakePanel, ViewProviderEvent.onRceStreamDeviceStopped).length).to.equal(1);

            rceFinder.emit('devices', [{ id: 5, status: 'pending' }]);
            await sleep(10);

            //the waiting phase's own status poll (running by then) reconnected the stream
            expect(manager.createdClients.length).to.equal(2);
            expect(findEventMessages(fakePanel, ViewProviderEvent.onRceStreamOffer).length).to.equal(2);
            expect(fakePanel.disposed).to.be.false;
        });

        it('closing the tab cancels an in-flight reconnect loop', async () => {
            createManager();
            await manager.open(5, 'my-device');
            const fakePanel = manager.createdPanels[0];
            await fakePanel.receiveMessage({ command: ViewProviderCommand.viewReady, context: {} });
            shrinkReconnectDelays(5, [60000]);

            manager.createdClients[0].emit('close');
            //the loop is parked on its backoff wait; disposing the panel stops the session
            fakePanel.dispose();
            await sleep(10);

            expect(resolveStreamRequest.calledOnce).to.be.true;
            expect(manager.createdClients.length).to.equal(1);
        });
    });
});
