/* tslint:disable:no-unused-expression */
/* tslint:disable:no-var-requires */
import { expect } from 'chai';
import * as sinon from 'sinon';
let Module = require('module');
import { assert } from 'chai';

import { vscode } from './mockVscode.spec';

let commandsMock;

//override the "require" call to mock certain items
const { require: oldRequire } = Module.prototype;
Module.prototype.require = function hijacked(file) {
    if (file === 'vscode') {
        return vscode;
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

    it('registers configuration provider', () => {
        let spy = sinon.spy(vscode.debug, 'registerDebugConfigurationProvider');
        expect(spy.calledOnce).to.be.false;
        extension.activate(<any>{ subscriptions: [] });
        expect(spy.calledOnce).to.be.true;
    });

    it('registers formatter', () => {
        let spy = sinon.spy(vscode.languages, 'registerDocumentRangeFormattingEditProvider');
        expect(spy.calledOnce).to.be.false;
        extension.activate(<any>{ subscriptions: [] });
        expect(spy.getCalls().length).to.be.greaterThan(1);
    });

    it('registers definition provider', () => {
        let spy = sinon.spy(vscode.languages, 'registerDefinitionProvider');
        expect(spy.calledOnce).to.be.false;
        extension.activate(<any>{ subscriptions: [] });
        expect(spy.callCount).to.be.greaterThan(0);
    });

    it('registers document symbol provider', () => {
        let spy = sinon.spy(vscode.languages, 'registerDocumentSymbolProvider');
        expect(spy.calledOnce).to.be.false;
        extension.activate(<any>{ subscriptions: [] });
        expect(spy.calledOnce).to.be.true;
    });

    it('registers workspace symbol provider', () => {
        let spy = sinon.spy(vscode.languages, 'registerWorkspaceSymbolProvider');
        expect(spy.calledOnce).to.be.false;
        extension.activate(<any>{ subscriptions: [] });
        expect(spy.calledOnce).to.be.true;
    });

    it('registers all commands', () => {
        commandsMock.expects('registerCommands');
        extension.activate(<any>{ subscriptions: [] });
        commandsMock.verify();
    });

    it('registers signatureHelpProvider', () => {
        let spy = sinon.spy(vscode.languages, 'registerSignatureHelpProvider');
        expect(spy.calledOnce).to.be.false;
        extension.activate(<any>{ subscriptions: [] });
        expect(spy.calledOnce).to.be.true;
    });

    it('registers referenceProvider', () => {
        let spy = sinon.spy(vscode.languages, 'registerReferenceProvider');
        expect(spy.calledOnce).to.be.false;
        extension.activate(<any>{ subscriptions: [] });
        expect(spy.calledOnce).to.be.true;
    });

    it('registers onDidStartDebugSession', () => {
        let spy = sinon.spy(vscode.debug, 'onDidStartDebugSession');
        expect(spy.calledOnce).to.be.false;
        extension.activate(<any>{ subscriptions: [] });
        expect(spy.calledOnce).to.be.true;
    });

    it('registers onDidReceiveDebugSessionCustomEvent', () => {
        let spy = sinon.spy(vscode.debug, 'onDidReceiveDebugSessionCustomEvent');
        expect(spy.calledOnce).to.be.false;
        extension.activate(<any>{ subscriptions: [] });
        expect(spy.getCalls().length).to.be.greaterThan(0);
    });
});
