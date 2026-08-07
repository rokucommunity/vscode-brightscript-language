import { expect } from 'chai';
import * as sinonImport from 'sinon';
import { RtaManager } from '../managers/RtaManager';
import { vscode } from '../mockVscode.spec';
import { BaseWebviewViewProvider } from './BaseWebviewViewProvider';
import { ViewProviderId } from './ViewProviderId';

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

class TestWebviewViewProvider extends BaseWebviewViewProvider {
    public readonly id = ViewProviderId.rokuDeviceView;
}

describe('BaseWebviewViewProvider', () => {
    let provider: TestWebviewViewProvider;
    let postMessage: sinonImport.SinonStub;

    beforeEach(() => {
        const rtaManager = new RtaManager(vscode.context);
        provider = new TestWebviewViewProvider(vscode.context, {
            rtaManager: rtaManager
        } as any);
        postMessage = sinon.stub(provider as any, 'postMessage');
    });

    afterEach(() => {
        provider.dispose();
    });

    describe('postOrQueueMessage', () => {
        it('queues messages until the view reports ready, then posts them exactly once', () => {
            const first = provider.createEventMessage('first' as any);
            const second = provider.createEventMessage('second' as any);
            provider.postOrQueueMessage(first);
            provider.postOrQueueMessage(second);
            expect(postMessage.called).to.be.false;

            //the same order the base class's viewReady handler runs in
            provider['viewReady'] = true;
            provider['postQueuedMessages']();

            expect(postMessage.getCalls().map(call => call.args[0])).to.deep.equal([first, second]);

            //a later webview instance reporting ready (a closed-and-reopened view) must not replay
            //the already-flushed history
            provider['postQueuedMessages']();
            expect(postMessage.callCount).to.equal(2);
        });

        it('posts directly once the view is ready', () => {
            provider['viewReady'] = true;
            const message = provider.createEventMessage('direct' as any);
            provider.postOrQueueMessage(message);
            expect(postMessage.calledOnceWith(message)).to.be.true;
        });
    });

    describe('webview lifecycle', () => {
        function createFakeView() {
            return {
                webview: {
                    options: undefined,
                    html: '',
                    onDidReceiveMessage: sinon.stub(),
                    postMessage: sinon.stub().resolves(true)
                },
                onDidDispose: sinon.stub()
            } as any;
        }

        it('queues messages again after the webview is destroyed, flushing them to the next instance', async () => {
            const view = createFakeView();
            await provider.resolveWebviewView(view, {} as any, {} as any);
            //the first webview reported ready
            provider['viewReady'] = true;

            //the view was hidden: VS Code destroys the webview and fires onDidDispose
            view.onDidDispose.firstCall.args[0]();

            const message = provider.createEventMessage('posted-while-hidden' as any);
            provider.postOrQueueMessage(message);
            //queued, not posted at the destroyed webview (where it would be silently lost)
            expect(postMessage.called).to.be.false;

            //the view is reshown: a fresh view resolves and its webview reports ready
            const nextView = createFakeView();
            await provider.resolveWebviewView(nextView, {} as any, {} as any);
            provider['viewReady'] = true;
            provider['postQueuedMessages']();
            expect(postMessage.calledOnceWith(message)).to.be.true;
        });

        it('re-resolving resets viewReady, and a late dispose from the old view leaves the new one alone', async () => {
            const view = createFakeView();
            await provider.resolveWebviewView(view, {} as any, {} as any);
            provider['viewReady'] = true;

            //a re-resolution can land before the old view's dispose callback fires
            const nextView = createFakeView();
            await provider.resolveWebviewView(nextView, {} as any, {} as any);

            expect(provider['viewReady']).to.be.false;

            view.onDidDispose.firstCall.args[0]();
            expect(provider['view']).to.equal(nextView);
        });
    });
});
