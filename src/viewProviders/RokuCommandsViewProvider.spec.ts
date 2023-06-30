import { expect } from 'chai';
import * as sinonImport from 'sinon';
import { vscode } from '../mockVscode.spec';
import { RokuCommandsViewProvider } from './RokuCommandsViewProvider';

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
let provider: RokuCommandsViewProvider;
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

    provider = new RokuCommandsViewProvider(vscode.context) as any;
});
afterEach(() => {
    provider.dispose();
    sinon.restore();
});

describe('RokuCommandsViewProvider', () => {
    describe('getHtmlForWebview', () => {
        it('includes the contents of additionalScriptContents', async () => {
            const html = await provider['getHtmlForWebview']();
            for (const line of provider['additionalScriptContents']()) {
                expect(html).to.contain(line);
            }
        });
    });

    describe('resolveWebviewView', () => {
        it('sets up observer to handle messages from the ui', async () => {
            await provider['resolveWebviewView'](view, {} as any, {} as any);

            expect(typeof callback).to.equal('function');
            const spy = sinon.spy(provider as any, 'handleViewMessage');
            callback({
                command: 'importRegistry',
                context: {}
            });
            expect(spy.calledOnce).to.be.true;
        });
    });
});
