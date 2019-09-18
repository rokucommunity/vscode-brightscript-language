/* tslint:disable:no-unused-expression */
/* tslint:disable:no-var-requires */
import { expect } from 'chai';
import * as sinon from 'sinon';
let Module = require('module');
import { assert } from 'chai';

import { vscode, vscodeLanguageClient } from './mockVscode.spec';

let commandsMock;

//override the "require" call to mock certain items
const { require: oldRequire } = Module.prototype;
Module.prototype.require = function hijacked(file) {
    if (file === 'vscode') {
        return vscode;
    } else if (file === 'vscode-languageclient') {
        return vscodeLanguageClient;
    } else if (file === './BrightScriptCommands') {
        let command = { registerCommands: () => { } };
        commandsMock = sinon.mock(command);
        return { getBrightScriptCommandsInstance: () => command };
    } else {
        return oldRequire.apply(this, arguments);
    }
};

import BrightScriptCommands from './BrightScriptCommands';
import * as  extension from './extension';

describe('extension', () => {
    let context: any;
    beforeEach(() => {
        context = {
            subscriptions: [],
            asAbsolutePath: () => { }
        };
    });

    it('registers configuration provider', async () => {
        let spy = sinon.spy(vscode.debug, 'registerDebugConfigurationProvider');
        expect(spy.calledOnce).to.be.false;
        await extension.activate(context);
        expect(spy.calledOnce).to.be.true;
    });

    it('registers formatter', async () => {
        let spy = sinon.spy(vscode.languages, 'registerDocumentRangeFormattingEditProvider');
        expect(spy.calledOnce).to.be.false;
        extension.activate(<any>{ subscriptions: [] });
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
        commandsMock.expects('registerCommands');
        await extension.activate(context);
        commandsMock.verify();
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
