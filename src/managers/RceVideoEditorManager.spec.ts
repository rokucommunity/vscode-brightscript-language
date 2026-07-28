import { expect } from 'chai';
import * as sinonImport from 'sinon';
import { EventEmitter } from 'eventemitter3';
import type * as vscodeType from 'vscode';
import type { RceVideoSignalingClient, RceVideoSignalingConfig, RceVideoSignalingClientOptions } from 'roku-deploy';
import { vscode } from '../mockVscode.spec';
import { RceVideoEditorManager } from './RceVideoEditorManager';
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
        manager = new TestRceVideoEditorManager(vscode.context as any, {
            resolveStreamRequest: resolveStreamRequest,
            getToken: getToken
        } as any);
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
});
