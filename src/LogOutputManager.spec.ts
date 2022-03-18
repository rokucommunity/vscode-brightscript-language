/* tslint:disable:no-unused-expression */
/* tslint:disable:no-var-requires */
/* tslint:disable:no-string-literal */
import { assert, expect } from 'chai';
import Sinon, { createSandbox } from 'sinon';
const sinon = createSandbox();
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

import { DeclarationProvider } from './DeclarationProvider';
import { LogDocumentLinkProvider } from './LogDocumentLinkProvider';
import { LogLine, LogOutputManager } from './LogOutputManager';

describe('LogOutputManager ', () => {
    let logOutputManagerMock: Sinon.SinonMock;
    let logOutputManager: LogOutputManager;
    let languagesMock: Sinon.SinonMock;
    let outputChannelMock: Sinon.SinonMock;
    let logDocumentLinkProviderMock: Sinon.SinonMock;
    let collectionMock: Sinon.SinonMock;
    let declarationProviderMock: Sinon.SinonMock;

    beforeEach(() => {
        sinon.restore();
        const outputChannel = new vscode.OutputChannel();
        const debugCollection = new vscode.DebugCollection();
        const logDocumentLinkProvider = new LogDocumentLinkProvider();
        const declarationProvider = new DeclarationProvider();
        outputChannelMock = sinon.mock(outputChannel);
        logDocumentLinkProviderMock = sinon.mock(logDocumentLinkProvider);
        collectionMock = sinon.mock(debugCollection);
        declarationProviderMock = sinon.mock(declarationProvider);
        languagesMock = sinon.mock(vscode.languages);
        languagesMock.expects('createDiagnosticCollection').returns(debugCollection);
        collectionMock.expects('clear');
        logOutputManager = new LogOutputManager(outputChannel, vscode.context, logDocumentLinkProvider, declarationProvider);
        logOutputManagerMock = sinon.mock(logOutputManager);
    });

    afterEach(() => {
        sinon.restore();
    });

    it('tests onDidStartDebugSession clear flag', () => {
        collectionMock.expects('clear').once();
        logOutputManager.isClearingConsoleOnChannelStart = true;
        logOutputManager.onDidStartDebugSession();
        outputChannelMock.verify();
        collectionMock.verify();
        logOutputManagerMock.verify();
    });

    it('tests onDidStartDebugSession no clear flag', () => {
        collectionMock.expects('clear').never();
        logOutputManager.isClearingConsoleOnChannelStart = false;
        logOutputManager.onDidStartDebugSession();
        outputChannelMock.verify();
        collectionMock.verify();
        logOutputManagerMock.verify();
    });

    it('tests onDidReceiveDebugSessionCustomEvent - BSLaunchStartEvent - clear flag', () => {
        collectionMock.expects('clear').once();
        logOutputManager.isClearingOutputOnLaunch = true;
        logOutputManager.onDidReceiveDebugSessionCustomEvent({ event: 'BSLaunchStartEvent' });
        outputChannelMock.verify();
        collectionMock.verify();
        logOutputManagerMock.verify();
    });

    it('tests onDidReceiveDebugSessionCustomEvent - BSLaunchStartEvent - no clear flag', () => {
        collectionMock.expects('clear').never();
        logOutputManager.isClearingOutputOnLaunch = false;
        logOutputManager.onDidReceiveDebugSessionCustomEvent({ event: 'BSLaunchStartEvent' });
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
        logOutputManager.onDidReceiveDebugSessionCustomEvent({ event: '', body: [] });
        outputChannelMock.verify();
        collectionMock.verify();
        logOutputManagerMock.verify();
    });

    it('tests onDidReceiveDebugSessionCustomEvent - error - undefined', () => {
        logOutputManager.onDidReceiveDebugSessionCustomEvent({ event: '' });
        outputChannelMock.verify();
        collectionMock.verify();
        logOutputManagerMock.verify();
    });

    it('tests onDidReceiveDebugSessionCustomEvent - errors', () => {
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

    describe('getFilename', () => {
        it('works', () => {
            expect(logOutputManager.getFilename('pkg:/file.xml')).to.eql('file');
            expect(logOutputManager.getFilename('pkg:/path/file.xml')).to.eql('file');
            expect(logOutputManager.getFilename('pkg:/path/path2/file.xml')).to.eql('file');
            expect(logOutputManager.getFilename('pkg:/file.brs')).to.eql('file');
            expect(logOutputManager.getFilename('pkg:/path/file.brs')).to.eql('file');
            expect(logOutputManager.getFilename('pkg:/path/path2/file.brs')).to.eql('file');
            expect(logOutputManager.getFilename('path/file.brs')).to.eql('file');
            expect(logOutputManager.getFilename('path/path2/file.brs')).to.eql('file');
            expect(logOutputManager.getFilename('file.brs')).to.eql('file');
            expect(logOutputManager.getFilename('pkg:/file.other')).to.eql('file.other');
        });
    });

    describe('tests getCustomLogText', () => {
        it('tests Full', () => {
            logOutputManager.hyperlinkFormat = 'Full';
            let logText = logOutputManager.getCustomLogText('pkg:/path/file.brs', 'file',
                '.brs', 20, 2, false);
            assert.equal(logText, 'pkg:/path/file.brs(20)');
        });

        it('tests Short', () => {
            logOutputManager.hyperlinkFormat = 'Short';
            let logText = logOutputManager.getCustomLogText('pkg:/path/file.brs', 'file',
                '.brs', 20, 2, false);
            assert.equal(logText, '#2');
        });

        it('tests Hidden', () => {
            logOutputManager.hyperlinkFormat = 'Hidden';
            let logText = logOutputManager.getCustomLogText('pkg:/path/file.brs', 'file',
                '.brs', 20, 2, false);
            assert.equal(logText, ' ');
        });

        it('Filename', () => {
            test({ configSetting: 'Filename', text: 'pkg:/file.brs(20)' });
            test({ configSetting: 'Filename', text: 'pkg:/path/file.brs(20)' });
            test({ configSetting: 'Filename', text: 'pkg:/path/path2/file.brs(20)' });

            function test(param) {
                logOutputManager.hyperlinkFormat = param.configSetting;
                declarationProviderMock.expects('getFunctionBeforeLine').returns({ name: 'methodName' });
                logDocumentLinkProviderMock.expects('convertPkgPathToFsPath').returns({ name: 'filesystem/file.brs' });
                assert.equal(
                    logOutputManager.getCustomLogText(param.text, 'file', '.brs', 20, 2, false),
                    'file.brs(20)'
                );
            }
        });

        it('tests Filename with addline to log', () => {
            test({ configSetting: 'Filename', text: 'pkg:/file.brs(20)' });
            test({ configSetting: 'Filename', text: 'pkg:/path/file.brs(20)' });
            test({ configSetting: 'Filename', text: 'pkg:/path/path2/file.brs(20)' });

            function test(param) {
                logOutputManager.hyperlinkFormat = param.configSetting;
                declarationProviderMock.expects('getFunctionBeforeLine').returns({ name: 'methodName' });
                logDocumentLinkProviderMock.expects('convertPkgPathToFsPath').returns({ name: 'filesystem/file.brs' });
                logDocumentLinkProviderMock.expects('addCustomPkgLink');
                const logLine = new LogLine(param.text + ' sometext', true);

                const stub = sinon.stub(logOutputManager['outputChannel'], 'appendLine');

                logOutputManager.addLogLineToOutput(logLine);

                expect(stub.getCall(0).args[0]).to.eql('file.brs(20) sometext');
                stub.restore();
            }
        });

        it('FilenameAndFunction', () => {
            test(null, 'pkg:/file.brs(20)');
            test(null, 'pkg:/path/file.brs(20)');
            test(null, 'pkg:/path/path2/file.brs(20)');
            test('', 'pkg:/file.brs(20)');
            test('', 'pkg:/path/file.brs(20)');
            test('', 'pkg:/path/path2/file.brs(20)');
            test('FilenameAndFunction', 'pkg:/file.brs(20)');
            test('FilenameAndFunction', 'pkg:/path/file.brs(20)');
            test('FilenameAndFunction', 'pkg:/path/path2/file.brs(20)');

            function test(hyperlinkFormat: string, text) {
                logOutputManager.hyperlinkFormat = hyperlinkFormat;
                declarationProviderMock.expects('getFunctionBeforeLine').returns({ name: 'methodName' });
                logDocumentLinkProviderMock.expects('convertPkgPathToFsPath').returns({ name: 'filesystem/file.brs' });
                expect(
                    logOutputManager.getCustomLogText(text, 'file', '.brs', 20, 2, false)
                ).to.eql('file.methodName(20)');
            }
        });

        it('tests FilenameAndFunction with addline to log', () => {
            test(null, 'pkg:/file.brs(20)', 'file.methodName(20)');
            test(null, 'pkg:/path/file.brs(20)', 'file.methodName(20)');
            test(null, 'pkg:/path/path2/file.brs(20)', 'file.methodName(20)');
            test('', 'pkg:/file.brs(20)', 'file.methodName(20)');
            test('', 'pkg:/path/file.brs(20)', 'file.methodName(20)');
            test('', 'pkg:/path/path2/file.brs(20)', 'file.methodName(20)');
            test('FilenameAndFunction', 'pkg:/file.brs(20)', 'file.methodName(20)');
            test('FilenameAndFunction', 'pkg:/path/file.brs(20)', 'file.methodName(20)');
            test('FilenameAndFunction', 'pkg:/path/path2/file.brs(20)', 'file.methodName(20)');
            function test(hyperlinkFormat: string, text: string, expected: string) {
                logOutputManager.hyperlinkFormat = hyperlinkFormat;
                declarationProviderMock.expects('getFunctionBeforeLine').returns({ name: 'methodName' });
                declarationProviderMock.expects('getFunctionBeforeLine').returns({ name: 'methodName' });
                logDocumentLinkProviderMock.expects('convertPkgPathToFsPath').returns({ name: 'filesystem/file.brs' });
                logDocumentLinkProviderMock.expects('convertPkgPathToFsPath').returns({ name: 'filesystem/file.brs' });
                logDocumentLinkProviderMock.expects('addCustomPkgLink');
                const logLine = new LogLine(text + ' sometext', true);
                logOutputManager.addLogLineToOutput(logLine);
                expect(
                    logOutputManager.getCustomLogText(text, 'file', '.brs', 20, 2, false)
                ).to.eql(expected);
            }
        });
    });

    describe('tests getCustomLogText file prefix', () => {
        it('tests Full', () => {
            logOutputManager.hyperlinkFormat = 'Full';
            let logText = logOutputManager.getCustomLogText('file:///path/file.brs', 'file',
                '.brs', 20, 2, true);
            assert.equal(logText, 'file:///path/file.brs(20)');
        });

        it('tests Short', () => {
            logOutputManager.hyperlinkFormat = 'Short';
            let logText = logOutputManager.getCustomLogText('file:///path/file.brs', 'file',
                '.brs', 20, 2, true);
            assert.equal(logText, '#2');
        });

        it('tests Hidden', () => {
            logOutputManager.hyperlinkFormat = 'Hidden';
            let logText = logOutputManager.getCustomLogText('file:///path/file.brs', 'file',
                '.brs', 20, 2, true);
            assert.equal(logText, ' ');
        });

        it('tests Filename', () => {
            function test(hyperlinkFormat: string, text: string) {
                logOutputManager.hyperlinkFormat = hyperlinkFormat;
                declarationProviderMock.expects('getFunctionBeforeLine').returns({ name: 'methodName' });
                logDocumentLinkProviderMock.expects('convertPkgPathToFsPath').returns({ name: 'filesystem/file.brs' });
                expect(
                    logOutputManager.getCustomLogText(text, 'file', '.brs', 20, 2, true)
                ).to.eql('file.brs(20)');
            }

            test('Filename', 'file:///file.brs(20)');
            test('Filename', 'file:///path/file.brs(20)');
            test('Filename', 'file:///path/path2/file.brs(20)');
        });

        it('tests Filename with addline to log', () => {
            test({ configSetting: 'Filename', text: 'file:///file.brs(20)' });
            test({ configSetting: 'Filename', text: 'file:///path/file.brs(20)' });
            test({ configSetting: 'Filename', text: 'file:///path/path2/file.brs(20)' });
            function test(param) {
                logOutputManager.hyperlinkFormat = param.configSetting;
                declarationProviderMock.expects('getFunctionBeforeLine').returns({ name: 'methodName' });
                logDocumentLinkProviderMock.expects('convertPkgPathToFsPath').returns({ name: 'filesystem/file.brs' });
                logDocumentLinkProviderMock.expects('addCustomFileLink');
                const logLine = new LogLine(param.text + ' sometext', true);
                const stub = sinon.stub(logOutputManager['outputChannel'], 'appendLine');

                logOutputManager.addLogLineToOutput(logLine);

                expect(stub.getCall(0).args[0]).to.eql('file.brs(20) sometext');
                stub.restore();
            }
        });
        it('FilenameAndFunction', () => {
            test({ configSetting: null, text: 'file:///file.brs(20)' });
            test({ configSetting: null, text: 'file:///path/file.brs(20)' });
            test({ configSetting: null, text: 'file:///path/path2/file.brs(20)' });
            test({ configSetting: '', text: 'file:///file.brs(20)' });
            test({ configSetting: '', text: 'file:///path/file.brs(20)' });
            test({ configSetting: '', text: 'file:///path/path2/file.brs(20)' });
            test({ configSetting: 'FilenameAndFunction', text: 'file:///file.brs(20)' });
            test({ configSetting: 'FilenameAndFunction', text: 'file:///path/file.brs(20)' });
            test({ configSetting: 'FilenameAndFunction', text: 'file:///path/path2/file.brs(20)' });

            function test(param) {
                logOutputManager.hyperlinkFormat = param.configSetting;
                declarationProviderMock.expects('getFunctionBeforeLine').returns({ name: 'methodName' });
                logDocumentLinkProviderMock.expects('convertPkgPathToFsPath').returns({ name: 'filesystem/file.brs' });
                expect(
                    logOutputManager.getCustomLogText(param.text, 'file', '.brs', 20, 2, true)
                ).to.eql('file.methodName(20)');
            }
        });

        it('FilenameAndFunction with addline to log', () => {
            test({ configSetting: null, text: 'pkg:/file.brs(20)' });
            test({ configSetting: null, text: 'pkg:/path/file.brs(20)' });
            test({ configSetting: null, text: 'pkg:/path/path2/file.brs(20)' });
            test({ configSetting: '', text: 'pkg:/file.brs(20)' });
            test({ configSetting: '', text: 'pkg:/path/file.brs(20)' });
            test({ configSetting: '', text: 'pkg:/path/path2/file.brs(20)' });
            test({ configSetting: 'FilenameAndFunction', text: 'pkg:/file.brs(20)' });
            test({ configSetting: 'FilenameAndFunction', text: 'pkg:/path/file.brs(20)' });
            test({ configSetting: 'FilenameAndFunction', text: 'pkg:/path/path2/file.brs(20)' });
            function test(param) {
                logOutputManager.hyperlinkFormat = param.configSetting;
                declarationProviderMock.expects('getFunctionBeforeLine').returns({ name: 'methodName' });
                declarationProviderMock.expects('getFunctionBeforeLine').returns({ name: 'methodName' });
                logDocumentLinkProviderMock.expects('convertPkgPathToFsPath').returns({ name: 'filesystem/file.brs' });
                logDocumentLinkProviderMock.expects('convertPkgPathToFsPath').returns({ name: 'filesystem/file.brs' });
                logDocumentLinkProviderMock.expects('addCustomPkgLink');
                const logLine = new LogLine(param.text + ' sometext', true);
                logOutputManager.addLogLineToOutput(logLine);
                expect(
                    logOutputManager.getCustomLogText(param.text, 'file', '.brs', 20, 2, true)
                ).to.eql('file.methodName(20)');
            }
        });
    });

    describe('matchesFilter', () => {
        it('mustInclude items', () => {
            test({ text: 'test1', levelFilter: null, includeFilter: null, excludeFilter: null, expected: true });
            test({ text: 'test1', levelFilter: 'INFO', includeFilter: null, excludeFilter: null, expected: true });
            test({ text: 'test1', levelFilter: null, includeFilter: 'INCLUDE', excludeFilter: null, expected: true });
            test({ text: 'test1', levelFilter: null, includeFilter: null, excludeFilter: 'EXCLUDE', expected: true });
            test({ text: 'test1', levelFilter: 'INFO', includeFilter: 'INCLUDE', excludeFilter: null, expected: true });
            test({ text: 'test1', levelFilter: 'INFO', includeFilter: null, excludeFilter: 'EXCLUDE', expected: true });
            test({ text: 'test1', levelFilter: null, includeFilter: 'INCLUDE', excludeFilter: 'EXCLUDE', expected: true });
            test({ text: 'test1', levelFilter: 'INFO', includeFilter: 'INCLUDE', excludeFilter: 'EXCLUDE', expected: true });

            function test(params) {
                const logLine = new LogLine(params.text, true);
                logOutputManager.setIncludeFilter(params.includeFilter);
                logOutputManager.setExcludeFilter(params.excludeFilter);
                logOutputManager.setLevelFilter(params.levelFilter);
                assert.equal(logOutputManager['shouldLineBeShown'](logLine), params.expected);
            }
        });

        it('non-mustInclude items true scenarios', () => {
            test({ text: 'INFO test1 INCLUDE', levelFilter: null, includeFilter: null, excludeFilter: null, expected: true });
            test({ text: 'INFO test1 INCLUDE', levelFilter: 'INFO', includeFilter: null, excludeFilter: null, expected: true });
            test({ text: 'INFO test1 INCLUDE', levelFilter: null, includeFilter: 'INCLUDE', excludeFilter: null, expected: true });
            test({ text: 'INFO test1 INCLUDE', levelFilter: null, includeFilter: null, excludeFilter: 'EXCLUDE', expected: true });
            test({ text: 'INFO test1 INCLUDE', levelFilter: 'INFO', includeFilter: 'INCLUDE', excludeFilter: null, expected: true });
            test({ text: 'INFO test1 INCLUDE', levelFilter: 'INFO', includeFilter: null, excludeFilter: 'EXCLUDE', expected: true });
            test({ text: 'INFO test1 INCLUDE', levelFilter: null, includeFilter: 'INCLUDE', excludeFilter: 'EXCLUDE', expected: true });
            test({ text: 'INFO test1 INCLUDE', levelFilter: 'INFO', includeFilter: 'INCLUDE', excludeFilter: 'EXCLUDE', expected: true });

            function test(params) {
                const logLine = new LogLine(params.text, false);
                logOutputManager.setIncludeFilter(params.includeFilter);
                logOutputManager.setExcludeFilter(params.excludeFilter);
                logOutputManager.setLevelFilter(params.levelFilter);
                assert.equal(logOutputManager['shouldLineBeShown'](logLine), params.expected);
            }
        });

        it('non-must include items false scenarios', () => {
            test({ text: 'INFO test1 INCLUDE', levelFilter: 'DEBUG', includeFilter: null, excludeFilter: null, expected: false });
            test({ text: 'INFO test1 NOTTHERE', levelFilter: null, includeFilter: 'INCLUDE', excludeFilter: null, expected: false });
            test({ text: 'INFO test1 INCLUDE EXCLUDE', levelFilter: null, includeFilter: null, excludeFilter: 'EXCLUDE', expected: false });
            test({ text: 'INFO test1 NOTTHERE', levelFilter: 'INFO', includeFilter: 'INCLUDE', excludeFilter: null, expected: false });
            test({ text: 'INFO test1 INCLUDE', levelFilter: 'DEBUG', includeFilter: 'INCLUDE', excludeFilter: null, expected: false });
            test({ text: 'INFO test1 NOTTHERE', levelFilter: 'DEBUG', includeFilter: 'INCLUDE', excludeFilter: null, expected: false });
            test({ text: 'INFO test1 INCLUDE EXCLUDE', levelFilter: 'INFO', includeFilter: null, excludeFilter: 'EXCLUDE', expected: false });
            test({ text: 'INFO test1 INCLUDE', levelFilter: 'DEBUG', includeFilter: null, excludeFilter: 'EXCLUDE', expected: false });
            test({ text: 'INFO test1 INCLUDE EXCLUDE', levelFilter: null, includeFilter: 'INCLUDE', excludeFilter: 'EXCLUDE', expected: false });
            test({ text: 'INFO test1 NOTHERE', levelFilter: null, includeFilter: 'INCLUDE', excludeFilter: 'EXCLUDE', expected: false });
            test({ text: 'INFO test1 NOTHERE EXCLUDE', levelFilter: null, includeFilter: 'INCLUDE', excludeFilter: 'EXCLUDE', expected: false });
            test({ text: 'INFO test1 NOTTHERE', levelFilter: 'INFO', includeFilter: 'INCLUDE', excludeFilter: 'EXCLUDE', expected: false });
            test({ text: 'INFO test1 NOTTHERE', levelFilter: 'INFO', includeFilter: 'INCLUDE', excludeFilter: 'EXCLUDE', expected: false });
            test({ text: 'INFO test1 NOTHERE', levelFilter: 'INFO', includeFilter: 'INCLUDE', excludeFilter: 'EXCLUDE', expected: false });
            test({ text: 'INFO test1 NOTHERE EXCLUDE', levelFilter: 'DEBUG', includeFilter: 'INCLUDE', excludeFilter: 'EXCLUDE', expected: false });
            test({ text: 'INFO test1 INCLUDE', levelFilter: 'DEBUG', includeFilter: 'INCLUDE', excludeFilter: 'EXCLUDE', expected: false });
            test({ text: 'INFO test1 NOTHERE', levelFilter: 'DEBUG', includeFilter: 'INCLUDE', excludeFilter: 'EXCLUDE', expected: false });
            test({ text: 'INFO test1 NOTHERE EXCLUDE', levelFilter: 'DEBUG', includeFilter: 'INCLUDE', excludeFilter: 'EXCLUDE', expected: false });

            function test(params) {
                const logLine = new LogLine(params.text, false);
                logOutputManager.setIncludeFilter(params.includeFilter);
                logOutputManager.setExcludeFilter(params.excludeFilter);
                logOutputManager.setLevelFilter(params.levelFilter);
                assert.equal(logOutputManager['shouldLineBeShown'](logLine), params.expected);
            }
        });
    });
});
