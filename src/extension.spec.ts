/* tslint:disable:no-unused-expression */
/* tslint:disable:no-var-requires */
import * as assert from 'assert';
import { expect } from 'chai';
import * as path from 'path';
import * as sinon from 'sinon';
let Module = require('module');

import { vscode } from './mockVscode.spec';

let registerCommands = sinon.spy();
//override the "require" call to mock certain items
const { require: oldRequire } = Module.prototype;
Module.prototype.require = function hijacked(file) {
    if (file === 'vscode') {
        return vscode;
    } else if (file === './commands') {
        return { registerCommands: registerCommands };
    } else {
        return oldRequire.apply(this, arguments);
    }
};

afterEach(() => {
    (registerCommands as any).resetHistory();
});

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
        expect(spy.calledOnce).to.be.true;
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
        let spy = registerCommands;
        expect(spy.calledOnce).to.be.false;
        extension.activate(<any>{ subscriptions: [] });
        expect(spy.calledOnce).to.be.true;
    });
});
