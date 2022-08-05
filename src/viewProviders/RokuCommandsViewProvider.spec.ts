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

describe('RokuCommandsViewProvider', () => {
    describe('getHtmlForWebview', () => {
        const provider = new RokuCommandsViewProvider(vscode.context) as any;

        it('includes the contents of additionalScriptContents', () => {
            const html = provider.getHtmlForWebview();
            expect(html).to.contain(provider.additionalScriptContents());
        });
    });

    describe('resolveWebviewView', () => {
        it('sets up observer to handle messages from the ui', () => {
            const provider = new RokuCommandsViewProvider(vscode.context) as any;
            provider.resolveWebviewView(view, {}, {});

            expect(typeof callback).to.equal('function');
            const spy = sinon.spy(provider, 'handleViewMessage');
            callback({
                command: 'importRegistry',
                context: {}
            });
            expect(spy.calledOnce).to.be.true;
        });
    });
});
