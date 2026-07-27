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
});
