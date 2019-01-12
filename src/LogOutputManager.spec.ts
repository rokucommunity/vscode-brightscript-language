/* tslint:disable:no-unused-expression */
/* tslint:disable:no-var-requires */
import * as sinon from 'sinon';
let Module = require('module');

import { vscode } from './mockVscode.spec';

//override the "require" call to mock certain items
const { require: oldRequire } = Module.prototype;

Module.prototype.require = function hijacked(file) {
    if (file === 'vscode') {
        return vscode;
    } else {
        return oldRequire.apply(this, arguments);
    }
};

import { LogOutputManager } from './LogOutputManager';

describe('LogOutputManager ', () => {
    let handlerMock;
    let handler: LogOutputManager;
    let languagesMock;
    let outputChannelMock;
    let collectionMock;

    beforeEach(() => {
        const outputChannel = new vscode.OutputChannel();
        const debugCollection = new vscode.DebugCollection();
        outputChannelMock = sinon.mock(outputChannel);
        collectionMock = sinon.mock(debugCollection);
        languagesMock = sinon.mock(vscode.languages);
        languagesMock.expects('createDiagnosticCollection').returns(debugCollection);

        handler = new LogOutputManager(outputChannel, context);
        handlerMock = sinon.mock(handler);
    });

    afterEach(() => {
        outputChannelMock.restore();
        languagesMock.restore();
        collectionMock.restore();
        handlerMock.restore();
    });

    it('tests onDidStartDebugSession', () => {
        collectionMock.expects('clear').once();
        handler.onDidStartDebugSession();
        outputChannelMock.verify();
        collectionMock.verify();
        handlerMock.verify();
    });

    it('tests onDidReceiveDebugSessionCustomEvent - BSLogOutputEvent', () => {
        outputChannelMock.expects('appendLine').once();
        handler.onDidReceiveDebugSessionCustomEvent({ event: 'BSLogOutputEvent' });
        outputChannelMock.verify();
        collectionMock.verify();
        handlerMock.verify();
    });

    it('tests onDidReceiveDebugSessionCustomEvent - error - empty', () => {
        collectionMock.expects('clear').once();
        handler.onDidReceiveDebugSessionCustomEvent({ event: '', body: [] });
        outputChannelMock.verify();
        collectionMock.verify();
        handlerMock.verify();
    });

    it('tests onDidReceiveDebugSessionCustomEvent - error - undefined', () => {
        collectionMock.expects('clear').once();
        handler.onDidReceiveDebugSessionCustomEvent({ event: '' });
        outputChannelMock.verify();
        collectionMock.verify();
        handlerMock.verify();
    });

    it('tests onDidReceiveDebugSessionCustomEvent - errors', () => {
        collectionMock.expects('clear').once();
        handlerMock.expects('addDiagnosticForError').once();
        let compileErrors = [{ path: 'path1', message: 'message1' }];
        handler.onDidReceiveDebugSessionCustomEvent({ event: '', body: compileErrors });
        outputChannelMock.verify();
        collectionMock.verify();
        handlerMock.verify();
    });
});
