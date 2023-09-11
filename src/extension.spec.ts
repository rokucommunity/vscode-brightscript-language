import { expect } from 'chai';
import { createSandbox } from 'sinon';
let Module = require('module');
import * as extension from './extension';
import { vscode, vscodeLanguageClient } from './mockVscode.spec';
import { BrightScriptCommands } from './BrightScriptCommands';
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
    let originalWebviews;
    const extensionInstance = extension.extension;

    beforeEach(() => {
        sinon.stub(languageServerManager, 'init').returns(Promise.resolve());

        originalWebviews = extensionInstance['webviews'];
        extensionInstance['webviews'] = [];
    });

    afterEach(() => {
        extensionInstance['webviews'] = originalWebviews;
        sinon.restore();
    });

    it('registers configuration provider', async () => {
        let spy = sinon.spy(vscode.debug, 'registerDebugConfigurationProvider');
        expect(spy.calledOnce).to.be.false;
        await extension.activate(vscode.context);
        expect(spy.calledOnce).to.be.true;
    });

    it('registers formatter', async () => {
        let spy = sinon.spy(vscode.languages, 'registerDocumentRangeFormattingEditProvider');
        expect(spy.getCalls().length).to.equal(0);
        await extension.activate(vscode.context);
        expect(spy.getCalls().length).to.be.greaterThan(1);
    });

    it('registers definition provider', async () => {
        let spy = sinon.spy(vscode.languages, 'registerDefinitionProvider');
        expect(spy.calledOnce).to.be.false;
        await extension.activate(vscode.context);
        expect(spy.callCount).to.be.greaterThan(0);
    });

    it('registers all commands', async () => {
        let stub = sinon.stub(BrightScriptCommands.prototype, 'registerCommands').callsFake(() => { });
        await extension.activate(vscode.context);
        expect(stub.callCount).to.equal(1);
    });

    it('registers onDidStartDebugSession', async () => {
        let spy = sinon.spy(vscode.debug, 'onDidStartDebugSession');
        expect(spy.calledOnce).to.be.false;
        await extension.activate(vscode.context);
        expect(spy.calledOnce).to.be.true;
    });

    it('registers onDidTerminateDebugSession', async () => {
        let spy = sinon.spy(vscode.debug, 'onDidTerminateDebugSession');
        expect(spy.calledOnce).to.be.false;
        await extension.activate(vscode.context);
        expect(spy.calledOnce).to.be.true;
    });

    it('registers onDidReceiveDebugSessionCustomEvent', async () => {
        let spy = sinon.spy(vscode.debug, 'onDidReceiveDebugSessionCustomEvent');
        expect(spy.calledOnce).to.be.false;
        await extension.activate(vscode.context);
        expect(spy.getCalls().length).to.be.greaterThan(0);
    });
});
