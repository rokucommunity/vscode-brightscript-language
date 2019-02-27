/* tslint:disable:no-unused-expression */
/* tslint:disable:no-var-requires */
import { assert } from 'chai';
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

import { LogDocumentLinkProvider } from './LogDocumentLinkProvider';
import { LogLine, LogOutputManager } from './LogOutputManager';
const itParam = require('mocha-param');

describe('LogOutputManager ', () => {
    let logOutputManagerMock;
    let logOutputManager: LogOutputManager;
    let languagesMock;
    let outputChannelMock;
    let logDocumentLinkProviderMock;
    let collectionMock;

    beforeEach(() => {
        const outputChannel = new vscode.OutputChannel();
        const debugCollection = new vscode.DebugCollection();
        const logDocumentLinkProvider = new LogDocumentLinkProvider();
        outputChannelMock = sinon.mock(outputChannel);
        logDocumentLinkProviderMock = sinon.mock(logDocumentLinkProvider);
        collectionMock = sinon.mock(debugCollection);
        languagesMock = sinon.mock(vscode.languages);
        languagesMock.expects('createDiagnosticCollection').returns(debugCollection);
        collectionMock.expects('clear');
        logOutputManager = new LogOutputManager(outputChannel, vscode.context, logDocumentLinkProvider);
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
        logOutputManager.onDidReceiveDebugSessionCustomEvent({ event: 'BSLogOutputEvent', body: 'test1' });
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

        it('splits multiple lines', () => {
            outputChannelMock.expects('appendLine')
              .withExactArgs('test1').once();
            outputChannelMock.expects('appendLine')
              .withExactArgs('test2').once();

            logOutputManager.appendLine('test1\ntest2', true);

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

    describe('tests setLevelFilter', () => {
        it('tests reFilterOutput is called', () => {
            logOutputManagerMock.expects('reFilterOutput').once();
            logOutputManager.setLevelFilter('test1');
            logOutputManagerMock.verify();
        });
    });

    describe('tests setExcludeFilter', () => {
        it('tests reFilterOutput is called', () => {
            logOutputManagerMock.expects('reFilterOutput').once();
            logOutputManager.setExcludeFilter('test1');
            logOutputManagerMock.verify();
        });
    });

    describe('tests setIncludeFilter', () => {
        it('tests reFilterOutput is called', () => {
            logOutputManagerMock.expects('reFilterOutput').once();
            logOutputManager.setIncludeFilter('test1');
            logOutputManagerMock.verify();
        });
    });

    describe('tests matchesFilter', () => {
        describe('mustInclude items', () => {
            let mustIncludeParams = [
                { text: 'test1', levelFilter: null, includeFilter: null, excludeFilter: null, expected: true },
                { text: 'test1', levelFilter: 'INFO', includeFilter: null, excludeFilter: null, expected: true },
                { text: 'test1', levelFilter: null, includeFilter: 'INCLUDE', excludeFilter: null, expected: true },
                { text: 'test1', levelFilter: null, includeFilter: null, excludeFilter: 'EXCLUDE', expected: true },
                { text: 'test1', levelFilter: 'INFO', includeFilter: 'INCLUDE', excludeFilter: null, expected: true },
                { text: 'test1', levelFilter: 'INFO', includeFilter: null, excludeFilter: 'EXCLUDE', expected: true },
                { text: 'test1', levelFilter: null, includeFilter: 'INCLUDE', excludeFilter: 'EXCLUDE', expected: true },
                { text: 'test1', levelFilter: 'INFO', includeFilter: 'INCLUDE', excludeFilter: 'EXCLUDE', expected: true },
            ];
            itParam('lf ${value.levelFilter} if {$value.levelFilter} ' +
              'ef ${value.excludeFilter}', mustIncludeParams, (params) => {
                  const logLine = new LogLine(params.text, true);
                  logOutputManager.setIncludeFilter(params.includeFilter);
                  logOutputManager.setExcludeFilter(params.excludeFilter);
                  logOutputManager.setLevelFilter(params.levelFilter);
                  assert.equal(logOutputManager.matchesFilter(logLine), params.expected);
              });
        });
        describe('non-mustinclude items true scenarios', () => {
            let mustIncludeParams = [
            { text: 'INFO test1 INCLUDE', levelFilter: null, includeFilter: null, excludeFilter: null, expected: true },
            { text: 'INFO test1 INCLUDE', levelFilter: 'INFO', includeFilter: null, excludeFilter: null, expected: true },
            { text: 'INFO test1 INCLUDE', levelFilter: null, includeFilter: 'INCLUDE', excludeFilter: null, expected: true },
            { text: 'INFO test1 INCLUDE', levelFilter: null, includeFilter: null, excludeFilter: 'EXCLUDE', expected: true },
            { text: 'INFO test1 INCLUDE', levelFilter: 'INFO', includeFilter: 'INCLUDE', excludeFilter: null, expected: true },
            { text: 'INFO test1 INCLUDE', levelFilter: 'INFO', includeFilter: null, excludeFilter: 'EXCLUDE', expected: true },
            { text: 'INFO test1 INCLUDE', levelFilter: null, includeFilter: 'INCLUDE', excludeFilter: 'EXCLUDE', expected: true },
            { text: 'INFO test1 INCLUDE', levelFilter: 'INFO', includeFilter: 'INCLUDE', excludeFilter: 'EXCLUDE', expected: true },
            ];
            itParam('lf ${value.levelFilter} if {$value.levelFilter} ' +
            'ef ${value.excludeFilter}', mustIncludeParams, (params) => {
                const logLine = new LogLine(params.text, false);
                logOutputManager.setIncludeFilter(params.includeFilter);
                logOutputManager.setExcludeFilter(params.excludeFilter);
                logOutputManager.setLevelFilter(params.levelFilter);
                assert.equal(logOutputManager.matchesFilter(logLine), params.expected);
            });
        });
        describe('non-must include items false scenarios', () => {
            let mustIncludeParams = [
          { text: 'INFO test1 INCLUDE', levelFilter: 'DEBUG', includeFilter: null, excludeFilter: null, expected: false },
          { text: 'INFO test1 NOTTHERE', levelFilter: null, includeFilter: 'INCLUDE', excludeFilter: null, expected: false },
          { text: 'INFO test1 INCLUDE EXCLUDE', levelFilter: null, includeFilter: null, excludeFilter: 'EXCLUDE', expected: false },
          { text: 'INFO test1 NOTTHERE', levelFilter: 'INFO', includeFilter: 'INCLUDE', excludeFilter: null, expected: false },
          { text: 'INFO test1 INCLUDE', levelFilter: 'DEBUG', includeFilter: 'INCLUDE', excludeFilter: null, expected: false },
          { text: 'INFO test1 NOTTHERE', levelFilter: 'DEBUG', includeFilter: 'INCLUDE', excludeFilter: null, expected: false },
          { text: 'INFO test1 INCLUDE EXCLUDE', levelFilter: 'INFO', includeFilter: null, excludeFilter: 'EXCLUDE', expected: false },
          { text: 'INFO test1 INCLUDE', levelFilter: 'DEBUG', includeFilter: null, excludeFilter: 'EXCLUDE', expected: false },
          { text: 'INFO test1 INCLUDE EXCLUDE', levelFilter: null, includeFilter: 'INCLUDE', excludeFilter: 'EXCLUDE', expected: false },
          { text: 'INFO test1 NOTHERE', levelFilter: null, includeFilter: 'INCLUDE', excludeFilter: 'EXCLUDE', expected: false },
          { text: 'INFO test1 NOTHERE EXCLUDE', levelFilter: null, includeFilter: 'INCLUDE', excludeFilter: 'EXCLUDE', expected: false },
          { text: 'INFO test1 NOTTHERE', levelFilter: 'INFO', includeFilter: 'INCLUDE', excludeFilter: 'EXCLUDE', expected: false },
          { text: 'INFO test1 NOTTHERE', levelFilter: 'INFO', includeFilter: 'INCLUDE', excludeFilter: 'EXCLUDE', expected: false },
          { text: 'INFO test1 NOTHERE', levelFilter: 'INFO', includeFilter: 'INCLUDE', excludeFilter: 'EXCLUDE', expected: false },
          { text: 'INFO test1 NOTHERE EXCLUDE', levelFilter: 'DEBUG', includeFilter: 'INCLUDE', excludeFilter: 'EXCLUDE', expected: false },
          { text: 'INFO test1 INCLUDE', levelFilter: 'DEBUG', includeFilter: 'INCLUDE', excludeFilter: 'EXCLUDE', expected: false },
          { text: 'INFO test1 NOTHERE', levelFilter: 'DEBUG', includeFilter: 'INCLUDE', excludeFilter: 'EXCLUDE', expected: false },
          { text: 'INFO test1 NOTHERE EXCLUDE', levelFilter: 'DEBUG', includeFilter: 'INCLUDE', excludeFilter: 'EXCLUDE', expected: false },
            ];
            itParam('lf ${value.levelFilter} if {$value.levelFilter} ' +
          'ef ${value.excludeFilter}', mustIncludeParams, (params) => {
              const logLine = new LogLine(params.text, false);
              logOutputManager.setIncludeFilter(params.includeFilter);
              logOutputManager.setExcludeFilter(params.excludeFilter);
              logOutputManager.setLevelFilter(params.levelFilter);
              assert.equal(logOutputManager.matchesFilter(logLine), params.expected);
          });
        });
    });

});
