import { expect } from 'chai';
import * as sinonImport from 'sinon';
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
    describe('handleViewMessage', () => {
        const provider = new RokuRegistryViewProvider(vscode.context);

        it('Shows the save prompt for exportRegistry command', async () => {
            const spy = sinon.spy(vscode.window, 'showSaveDialog');
            await (provider as any).handleViewMessage({
                command: 'exportRegistry',
                content: '{}'
            });
            expect(spy.calledOnce).to.be.true;
        });

        it('Shows the open dialog for importRegistry command', async () => {
            const spy = sinon.spy(vscode.window, 'showOpenDialog');
            await (provider as any).handleViewMessage({
                command: 'importRegistry',
                context: {}
            });
            expect(spy.calledOnce).to.be.true;
        });
    });
});
