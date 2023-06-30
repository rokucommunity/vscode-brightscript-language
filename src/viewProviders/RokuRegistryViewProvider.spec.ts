import { expect } from 'chai';
import * as sinonImport from 'sinon';
import { RtaManager } from '../managers/RtaManager';
import { vscode } from '../mockVscode.spec';
import { RokuRegistryViewProvider } from './RokuRegistryViewProvider';

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
beforeEach(() => {
    sinon = sinonImport.createSandbox();
    view = {
        webview: {
            onDidReceiveMessage: (cb) => {
                callback = cb;
            },
            postMessage: (message) => { }
        },
        show: () => { }
    };
});
afterEach(() => {
    sinon.restore();
});

describe('RokuRegistryViewProvider', () => {
    const provider = new RokuRegistryViewProvider(vscode.context);
    const rtaManager = new RtaManager();
    provider.setRtaManager(rtaManager);

    describe('sendRegistryUpdated', () => {
        it('Triggers postOrQueueMessage to send message to web view that the registry was updated', async () => {
            const spy = sinon.stub(provider as any, 'postOrQueueMessage');
            await provider['sendRegistryUpdated']();
            expect(spy.calledOnce).to.be.true;
        });
    });

    describe('importContentsToRegistry', () => {
        it('Does nothing if no uri was passed in', async () => {
            const spy = sinon.stub(provider as any, 'sendRegistryUpdated');
            await provider['importContentsToRegistry']([]);
            expect(spy.callCount).to.equal(0);
        });

        it('Triggers sendRegistryUpdated if valid uri is called', async () => {
            const spy = sinon.stub(vscode.workspace.fs, 'readFile').returns(Buffer.from('{}'));
            sinon.stub(provider as any, 'sendRegistryUpdated');
            await provider['importContentsToRegistry'](['test.json']);
            expect(spy.calledOnce).to.be.true;
        });
    });
});
