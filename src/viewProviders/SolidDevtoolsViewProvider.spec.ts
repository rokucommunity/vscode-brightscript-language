import { expect } from 'chai';
import * as sinonImport from 'sinon';
import { vscode } from '../mockVscode.spec';
import { SolidDevtoolsViewProvider } from './SolidDevtoolsViewProvider';
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
let view;
let callback;
let postedMessages: any[];
let provider: SolidDevtoolsViewProvider;
beforeEach(() => {
    sinon = sinonImport.createSandbox();
    postedMessages = [];
    view = {
        webview: {
            onDidReceiveMessage: (cb) => {
                callback = cb;
            },
            postMessage: (message) => {
                postedMessages.push(message);
                return Promise.resolve(true);
            }
        },
        show: () => { }
    };

    provider = new SolidDevtoolsViewProvider(vscode.context, {}) as any;
});
afterEach(() => {
    provider.dispose();
    sinon.restore();
});

/** Wire the view, mark it ready (so responses post instead of queue), and send one request. */
async function sendRequest(request: Record<string, unknown>) {
    await provider['resolveWebviewView'](view, {} as any, {} as any);
    await callback({ command: ViewProviderCommand.viewReady, context: {} });
    await callback({
        command: ViewProviderCommand.sendSolidDevtoolsRequest,
        id: 'request-1',
        context: request
    });
    return postedMessages.find(x => x.id === 'request-1')?.response;
}

describe('SolidDevtoolsViewProvider', () => {
    it('responds no-session when there is no evaluable debug session', async () => {
        // other specs can leave an activeDebugSession on the shared vscode mock, so
        // pin the transport to the no-session case instead of relying on global state
        sinon.stub(provider['transport'], 'getVersion').resolves(undefined);
        const response = await sendRequest({ method: 'version' });
        expect(response).to.eql({ ok: false, reason: 'no-session' });
    });

    it('maps a roots request through the transport', async () => {
        const data = { connected: true, nodes: [{ id: '1:0', type: 'ANCHOR', name: 'App', childCount: 1 }] };
        sinon.stub(provider['transport'], 'getRoots').resolves(data);
        const response = await sendRequest({ method: 'roots' });
        expect(response).to.eql({ ok: true, data: data });
    });

    it('passes the node id through on children requests', async () => {
        const stub = sinon.stub(provider['transport'], 'getChildren').resolves({ parent: '1:5', nodes: [] });
        const response = await sendRequest({ method: 'children', id: '1:5' });
        expect(stub.calledOnceWith('1:5')).to.be.true;
        expect(response.ok).to.be.true;
    });

    it('reports no-bridge when the fetch fails and the bridge is absent', async () => {
        sinon.stub(provider['transport'], 'inspect').resolves(undefined);
        sinon.stub(provider['transport'], 'hasBridge').resolves(false);
        const response = await sendRequest({ method: 'inspect', id: '1:5' });
        expect(response).to.eql({ ok: false, reason: 'no-bridge' });
    });

    it('surfaces the bridge lastError when the bridge is present but the fetch failed', async () => {
        sinon.stub(provider['transport'], 'inspect').resolves(undefined);
        sinon.stub(provider['transport'], 'hasBridge').resolves(true);
        sinon.stub(provider['transport'], 'getBridgeError').resolves('walk exploded');
        const response = await sendRequest({ method: 'inspect', id: '1:5' });
        expect(response).to.eql({ ok: false, reason: 'error', message: 'walk exploded' });
    });

    it('turns a transport exception into an error result instead of dropping the request', async () => {
        sinon.stub(provider['transport'], 'getRoots').rejects(new Error('boom'));
        const response = await sendRequest({ method: 'roots' });
        expect(response).to.eql({ ok: false, reason: 'error', message: 'boom' });
    });
});
