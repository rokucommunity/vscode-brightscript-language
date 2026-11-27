import { expect } from 'chai';
import * as fsExtra from 'fs-extra';
import * as path from 'path';
import { createSandbox } from 'sinon';
const sinon = createSandbox();
let Module = require('module');

import { vscode } from '../mockVscode.spec';

const { require: oldRequire } = Module.prototype;

Module.prototype.require = function hijacked(file) {
    if (file === 'vscode') {
        return vscode;
    } else {
        return oldRequire.apply(this, arguments);
    }
};

import { LaunchStartEvent, LogOutputEvent } from 'roku-debug';
import { DeclarationProvider } from '../DeclarationProvider';
import { BrightScriptLogOutput } from './BrightScriptLogOutput';

const tempDir = path.join(process.cwd(), '.tmp', 'BrightScriptLogOutput');

describe('BrightScriptLogOutput', () => {
    let logOutput: BrightScriptLogOutput;
    let declarationProvider: DeclarationProvider;
    /**
     * The contents of the fake output channel, one entry per line
     */
    let channelLines: string[];
    let outputChannel: any;
    let srcPathsByPkgPath: Record<string, string>;

    function setSetting(name: string, value: any) {
        vscode.workspace._configuration[`brightscript.output.${name}`] = value;
    }

    function create() {
        logOutput = new BrightScriptLogOutput(outputChannel, vscode.context as any, declarationProvider);
        sinon.stub(logOutput['pkgPathResolver'], 'setLaunchConfig').resolves();
        sinon.stub(logOutput['pkgPathResolver'], 'resolve').callsFake((pkgPath: string) => srcPathsByPkgPath[pkgPath]);
    }

    function log(text: string) {
        return logOutput.onDidReceiveDebugSessionCustomEvent(new LogOutputEvent(text));
    }

    function document(uriPath = 'extension-output-RokuCommunity.brightscript-#1-BrightScript Log') {
        return {
            uri: { scheme: 'output', path: uriPath },
            lineCount: channelLines.length,
            lineAt: (line: number) => ({ text: channelLines[line] })
        } as any;
    }

    function links() {
        return logOutput.provideDocumentLinks(document()).map((link: any) => ({
            line: link.range.start.line,
            start: link.range.start.character,
            end: link.range.end.character,
            target: link.uri
        }));
    }

    beforeEach(() => {
        sinon.restore();
        fsExtra.emptyDirSync(tempDir);
        vscode.workspace._configuration = {};
        channelLines = [];
        srcPathsByPkgPath = {};
        outputChannel = {
            appendLine: (text: string) => {
                channelLines.push(text);
            },
            replace: (text: string) => {
                channelLines = text.split('\n');
                channelLines.pop();
            },
            clear: () => {
                channelLines = [];
            },
            show: () => { }
        };
        sinon.stub(vscode.Uri, 'file').callsFake((fsPath: string) => {
            return { fsPath: fsPath, fragment: '', with: (change: any) => ({ fsPath: fsPath, ...change }) } as any;
        });
        declarationProvider = new DeclarationProvider();
        create();
    });

    afterEach(() => {
        logOutput.dispose();
        sinon.restore();
        vscode.workspace._configuration = {};
        fsExtra.removeSync(tempDir);
    });

    describe('appendLine', () => {
        it('writes each line once', async () => {
            await log('one\r\ntwo\nthree\n');
            expect(channelLines).to.eql(['one', 'two', 'three']);
        });

        it('keeps empty lines', async () => {
            await log('one\n\ntwo');
            expect(channelLines).to.eql(['one', '', 'two']);
        });

        it('strips ansi color codes', async () => {
            await log('\u001b[31mred\u001b[0m text');
            expect(channelLines).to.eql(['red text']);
        });

        it('describes error codes', async () => {
            await log('crash &hF4 here');
            expect(channelLines).to.eql(['crash &hF4 (ERR_RO2: member function not found in object or interface)  here']);
        });

    });

    describe('debugger noise', () => {
        beforeEach(() => {
            setSetting('includeStackTraces', false);
            logOutput.dispose();
            create();
        });

        it('collapses the micro debugger output into one line', async () => {
            await log([
                'before',
                'BrightScript Micro Debugger.',
                'Current Function:',
                'Brightscript Debugger> ',
                'after'
            ].join('\n'));
            expect(channelLines).to.eql(['before', 'Pausing for a breakpoint...', 'after']);
        });

        it('detects consecutive micro debugger blocks', async () => {
            for (let i = 0; i < 2; i++) {
                await log('BrightScript Micro Debugger.');
                await log('Brightscript Debugger> ');
            }
            expect(channelLines).to.eql(['Pausing for a breakpoint...', 'Pausing for a breakpoint...']);
        });

        it('reports bogus breakpoints on their own lines', async () => {
            await logOutput.setLaunchConfig({ enableDebuggerAutoRecovery: true } as any);
            await log('BrightScript Micro Debugger.\nBreak in main\nBrightscript Debugger> ');
            expect(channelLines).to.eql(['Pausing for a breakpoint...', '', '**Was a bogus breakpoint** Skipping!', '']);
        });

        it('keeps the debugger output when includeStackTraces is enabled', async () => {
            setSetting('includeStackTraces', true);
            logOutput.dispose();
            create();
            await log('BrightScript Micro Debugger.\nCurrent Function:');
            expect(channelLines).to.eql(['BrightScript Micro Debugger.', 'Current Function:']);
        });
    });

    describe('filter commands', () => {
        it('point the user to the Output panel filter', async () => {
            const showStub = sinon.stub(outputChannel, 'show');
            const messageStub = sinon.stub(vscode.window, 'showInformationMessage').returns(Promise.resolve(undefined) as any);
            await logOutput['showFilterHelp']();
            expect(showStub.calledOnce).to.be.true;
            expect(messageStub.getCall(0).args[0]).to.include('filter box');
        });
    });

    describe('markOutput', () => {
        it('numbers the marks', () => {
            logOutput.markOutput();
            logOutput.markOutput();
            expect(channelLines).to.eql([
                '---------------------- MARK 0 ----------------------',
                '---------------------- MARK 1 ----------------------'
            ]);
        });
    });

    describe('links', () => {
        let mainPath: string;

        beforeEach(() => {
            mainPath = path.join(tempDir, 'source', 'main.brs');
            fsExtra.outputFileSync(mainPath, '');
            srcPathsByPkgPath['pkg:/source/main.brs'] = mainPath;
            sinon.stub(declarationProvider, 'getFunctionBeforeLine').returns({ name: 'doWork' } as any);
        });

        function useFormat(format: string) {
            setSetting('hyperlinkFormat', format);
            logOutput.dispose();
            create();
        }

        it('shows the file and function name by default', async () => {
            await log('pkg:/source/main.brs(12:4) hello');
            expect(channelLines).to.eql(['main.doWork(12) hello']);
            expect(links()).to.eql([{ line: 0, start: 0, end: 'main.doWork(12)'.length, target: { fsPath: mainPath, fragment: 'L12' } }]);
        });

        it('falls back to the full path when there is no function', async () => {
            (declarationProvider.getFunctionBeforeLine as any).returns(null);
            await log('pkg:/source/main.brs(12:4) hello');
            expect(channelLines).to.eql(['pkg:/source/main.brs(12) hello']);
        });

        it('supports the Full format', async () => {
            useFormat('Full');
            await log('pkg:/source/main.brs(12:4) hello');
            expect(channelLines).to.eql(['pkg:/source/main.brs(12) hello']);
        });

        it('supports the Filename format', async () => {
            useFormat('Filename');
            await log('pkg:/source/main.brs(12:4) hello');
            expect(channelLines).to.eql(['main.brs(12) hello']);
        });

        it('supports the Short format', async () => {
            useFormat('Short');
            await log('first\npkg:/source/main.brs(12:4) hello');
            expect(channelLines).to.eql(['first', '#1 hello']);
            expect(links()).to.eql([{ line: 1, start: 0, end: 2, target: { fsPath: mainPath, fragment: 'L12' } }]);
        });

        it('supports the Hidden format', async () => {
            useFormat('Hidden');
            await log('pkg:/source/main.brs(12:4) hello');
            expect(channelLines).to.eql(['  hello']);
            expect(links()).to.have.length(1);
        });

        it('links file:// references directly', async () => {
            useFormat('Full');
            await log('file:///project/source/lib.bs:7 hello');
            expect(channelLines).to.eql(['/project/source/lib.bs(7) hello']);
            expect(links()[0].target).to.eql({ fsPath: '/project/source/lib.bs', fragment: 'L7' });
        });

        it('does not link pkg paths outside the project', async () => {
            await log('pkg:/source/unknown.brs(3) hello');
            expect(channelLines).to.eql(['pkg:/source/unknown.brs(3) hello']);
            expect(links()).to.eql([]);
        });

        it('does not read missing files to find the function name', async () => {
            srcPathsByPkgPath['pkg:/source/missing.brs'] = path.join(tempDir, 'source', 'missing.brs');
            await log('pkg:/source/missing.brs(3) hello\npkg:/source/missing.brs(4) hello');
            expect((declarationProvider.getFunctionBeforeLine as any).called).to.be.false;
        });

        it('only provides links for the BrightScript Log channel', async () => {
            await log('pkg:/source/main.brs(12) hello');
            expect(logOutput.provideDocumentLinks(document('extension-output-vscode.git-#1-Git'))).to.eql([]);
        });

        it('skips links for lines the document does not have yet', async () => {
            await log('pkg:/source/main.brs(12) hello');
            channelLines = [];
            expect(links()).to.eql([]);
        });

        it('skips links whose line text does not match', async () => {
            await log('pkg:/source/main.brs(12) hello');
            channelLines[0] = 'something else';
            expect(links()).to.eql([]);
        });

        it('drops the links when the output is cleared', async () => {
            await log('pkg:/source/main.brs(12) hello');
            logOutput.clearOutput();
            await log('pkg:/source/main.brs(13) hello');
            expect(links().map(x => x.target.fragment)).to.eql(['L13']);
        });
    });

    describe('debug session events', () => {
        it('clears the output when a launch starts', async () => {
            await log('old');
            await logOutput.onDidReceiveDebugSessionCustomEvent(new LaunchStartEvent({} as any));
            expect(channelLines).to.eql([]);
        });

        it('keeps the output on launch when clearOnLaunch is disabled', async () => {
            setSetting('clearOnLaunch', false);
            logOutput.dispose();
            create();
            await log('old');
            await logOutput.onDidReceiveDebugSessionCustomEvent(new LaunchStartEvent({} as any));
            expect(channelLines).to.eql(['old']);
        });

        it('clears the output when the debug session starts', async () => {
            await log('old');
            logOutput.onDidStartDebugSession();
            expect(channelLines).to.eql([]);
        });

        it('ignores other events', async () => {
            await logOutput.onDidReceiveDebugSessionCustomEvent({ event: 'RendezvousEvent', body: {} });
            expect(channelLines).to.eql([]);
        });
    });

    describe('logfile', () => {
        it('writes every line to the logfile', async () => {
            const logfilePath = path.join(tempDir, 'log.txt');
            await logOutput.setLaunchConfig({ logfilePath: logfilePath } as any);
            await log('one\ntwo');

            const stream = logOutput['logfile'].stream;
            logOutput.dispose();
            await new Promise<void>(resolve => {
                stream.on('finish', resolve);
            });
            expect(fsExtra.readFileSync(logfilePath, 'utf8')).to.equal('one\ntwo\n');
        });
    });
});
