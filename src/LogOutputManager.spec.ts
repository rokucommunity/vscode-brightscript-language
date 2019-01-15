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
    let logOutputManagerMock;
    let logOutputManager: LogOutputManager;
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
        collectionMock.expects('clear');
        logOutputManager = new LogOutputManager(outputChannel, vscode.context);
        logOutputManagerMock = sinon.mock(logOutputManager);
    });

    afterEach(() => {
        outputChannelMock.restore();
        languagesMock.restore();
        collectionMock.restore();
        logOutputManagerMock.restore();
    });

    it('tests onDidStartDebugSession', () => {
        collectionMock.expects('clear').once();
        logOutputManager.onDidStartDebugSession();
        outputChannelMock.verify();
        collectionMock.verify();
        logOutputManagerMock.verify();
    });

    it('tests onDidReceiveDebugSessionCustomEvent - BSLogOutputEvent', () => {
        outputChannelMock.expects('appendLine').once();
        logOutputManager.onDidReceiveDebugSessionCustomEvent({ event: 'BSLogOutputEvent' });
        outputChannelMock.verify();
        collectionMock.verify();
        logOutputManagerMock.verify();
    });

    it('tests onDidReceiveDebugSessionCustomEvent - error - empty', () => {
        collectionMock.expects('clear').once();
        logOutputManager.onDidReceiveDebugSessionCustomEvent({ event: '', body: [] });
        outputChannelMock.verify();
        collectionMock.verify();
        logOutputManagerMock.verify();
    });

    it('tests onDidReceiveDebugSessionCustomEvent - error - undefined', () => {
        collectionMock.expects('clear').once();
        logOutputManager.onDidReceiveDebugSessionCustomEvent({ event: '' });
        outputChannelMock.verify();
        collectionMock.verify();
        logOutputManagerMock.verify();
    });

    it('tests onDidReceiveDebugSessionCustomEvent - errors', () => {
        collectionMock.expects('clear').once();
        logOutputManagerMock.expects('addDiagnosticForError').once();
        let compileErrors = [{ path: 'path1', message: 'message1' }];
        logOutputManager.onDidReceiveDebugSessionCustomEvent({ event: '', body: compileErrors });
        outputChannelMock.verify();
        collectionMock.verify();
        logOutputManagerMock.verify();
    });

    describe('tests clearOutput', () => {
        it('resets all expected vars', () => {
            logOutputManager.appendLine('test1', true);
            logOutputManager.appendLine('test2', true);
            logOutputManager.appendLine('test3', true);
            collectionMock.expects('clear').once();
            outputChannelMock.expects('clear').once();

            logOutputManager.clearOutput();

            outputChannelMock.verify();
            collectionMock.verify();
        });

        it('tests output indexes are cleared', () => {
            logOutputManagerMock.expects('appendLine')
            .withArgs('---------------------- MARK 0 ----------------------').once();
            logOutputManagerMock.expects('appendLine')
            .withArgs('---------------------- MARK 1 ----------------------').once();
            logOutputManagerMock.expects('appendLine')
            .withArgs('---------------------- MARK 2 ----------------------').once();
            logOutputManager.markOutput();
            logOutputManager.markOutput();
            logOutputManager.markOutput();

            logOutputManagerMock.verify();
            collectionMock.verify();

            logOutputManagerMock = sinon.mock(logOutputManager);
            logOutputManager.clearOutput();
            logOutputManagerMock.expects('appendLine')
            .withArgs('---------------------- MARK 0 ----------------------').once();
            logOutputManagerMock.expects('appendLine')
            .withArgs('---------------------- MARK 1 ----------------------').once();

            logOutputManager.markOutput();
            logOutputManager.markOutput();

            logOutputManagerMock.verify();
            collectionMock.verify();

        });
    });

    describe('tests appendLine', () => {
        it('tests mustInclude lines are added', () => {
            outputChannelMock.expects('appendLine')
              .withExactArgs('test1').once();
            logOutputManager.appendLine('test1', true);
            outputChannelMock.verify();
            collectionMock.verify();
        });
    });

    describe('tests markOutput', () => {
        it('tests outputs are added incrementally', () => {
            logOutputManagerMock.expects('appendLine')
              .withArgs('---------------------- MARK 0 ----------------------').once();
            logOutputManagerMock.expects('appendLine')
              .withArgs('---------------------- MARK 1 ----------------------').once();
            logOutputManagerMock.expects('appendLine')
              .withArgs('---------------------- MARK 2 ----------------------').once();
            logOutputManager.markOutput();
            logOutputManager.markOutput();
            logOutputManager.markOutput();

            logOutputManagerMock.verify();
            collectionMock.verify();
        });
    });
});
