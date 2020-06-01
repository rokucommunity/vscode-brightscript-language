/* tslint:disable:no-unused-expression */
/* tslint:disable:no-var-requires */
import { expect } from 'chai';
import { createSandbox } from 'sinon';
let Module = require('module');
import * as  extension from './extension';
import { vscode, vscodeLanguageClient } from './mockVscode.spec';
import { brightScriptCommands } from './BrightScriptCommands';
import { languageServerManager } from './LanguageServerManager';

const sinon = createSandbox();

//override the "require" call to mock certain items
const { require: oldRequire } = Module.prototype;
Module.prototype.require = function hijacked(file) {
    if (file === 'vscode') {
        return vscode;
    } else if (file === 'vscode-languageclient') {
        return vscodeLanguageClient;
    } else {
        return oldRequire.apply(this, arguments);
    }
};

describe('extension', () => {
    let context: any;
    beforeEach(() => {
        sinon.stub(languageServerManager, 'init').returns(Promise.resolve());

        context = {
            subscriptions: [],
            asAbsolutePath: () => { },
            globalState: {
                get: () => {

                },
                update: () => {

                }
            }
        };
    });

    afterEach(() => {
        sinon.restore();
    });

    it('registers configuration provider', async () => {
        let spy = sinon.spy(vscode.debug, 'registerDebugConfigurationProvider');
        expect(spy.calledOnce).to.be.false;
        await extension.activate(context);
        expect(spy.calledOnce).to.be.true;
    });

    it('registers formatter', async () => {
        let spy = sinon.spy(vscode.languages, 'registerDocumentRangeFormattingEditProvider');
        expect(spy.getCalls().length).to.equal(0);
        await extension.activate(context);
        expect(spy.getCalls().length).to.be.greaterThan(1);
    });

    it('registers definition provider', async () => {
        let spy = sinon.spy(vscode.languages, 'registerDefinitionProvider');
        expect(spy.calledOnce).to.be.false;
        await extension.activate(context);
        expect(spy.callCount).to.be.greaterThan(0);
    });

    it('registers document symbol provider', async () => {
        let spy = sinon.spy(vscode.languages, 'registerDocumentSymbolProvider');
        expect(spy.calledOnce).to.be.false;
        await extension.activate(context);
        expect(spy.calledOnce).to.be.true;
    });

    it('registers workspace symbol provider', async () => {
        let spy = sinon.spy(vscode.languages, 'registerWorkspaceSymbolProvider');
        expect(spy.calledOnce).to.be.false;
        await extension.activate(context);
        expect(spy.calledOnce).to.be.true;
    });

    it('registers all commands', async () => {
        let stub = sinon.stub(brightScriptCommands, 'registerCommands').callsFake(() => { });
        await extension.activate(context);
        expect(stub.callCount).to.equal(1);
    });

    it('registers signatureHelpProvider', async () => {
        let spy = sinon.spy(vscode.languages, 'registerSignatureHelpProvider');
        expect(spy.calledOnce).to.be.false;
        await extension.activate(context);
        expect(spy.calledOnce).to.be.true;
    });

    it('registers referenceProvider', async () => {
        let spy = sinon.spy(vscode.languages, 'registerReferenceProvider');
        expect(spy.calledOnce).to.be.false;
        await extension.activate(context);
        expect(spy.calledOnce).to.be.true;
    });

    it('registers onDidStartDebugSession', async () => {
        let spy = sinon.spy(vscode.debug, 'onDidStartDebugSession');
        expect(spy.calledOnce).to.be.false;
        await extension.activate(context);
        expect(spy.calledOnce).to.be.true;
    });

    it('registers onDidReceiveDebugSessionCustomEvent', async () => {
        let spy = sinon.spy(vscode.debug, 'onDidReceiveDebugSessionCustomEvent');
        expect(spy.calledOnce).to.be.false;
        await extension.activate(context);
        expect(spy.getCalls().length).to.be.greaterThan(0);
    });
});
