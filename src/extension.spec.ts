import { expect } from 'chai';
import { createSandbox } from 'sinon';
import * as fsExtra from 'fs-extra';
import * as os from 'os';
import * as path from 'path';
let Module = require('module');
import { Extension } from './extension';
import { vscode, vscodeLanguageClient } from './mockVscode.spec';
import { BrightScriptCommands } from './BrightScriptCommands';
import { languageServerManager } from './LanguageServerManager';
import { debugSessionManager } from './managers/DebugSessionManager';

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
    let extension: Extension;
    beforeEach(() => {
        sinon.stub(languageServerManager, 'init').returns(Promise.resolve());
        extension = new Extension();
    });

    afterEach(() => {
        sinon.restore();
        extension.dispose();
    });

    it('registers configuration provider', async () => {
        let spy = sinon.spy(vscode.debug, 'registerDebugConfigurationProvider');
        expect(spy.called).to.be.false;
        await extension.activate(vscode.context);
        expect(spy.calledTwice).to.be.true;
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
        expect(spy.callCount).greaterThan(0);
    });

    it('registers onDidTerminateDebugSession', async () => {
        let spy = sinon.spy(vscode.debug, 'onDidTerminateDebugSession');
        expect(spy.calledOnce).to.be.false;
        await extension.activate(vscode.context);
        expect(spy.getCalls().length).to.be.greaterThan(0);
    });

    it('registers onDidReceiveDebugSessionCustomEvent', async () => {
        let spy = sinon.spy(vscode.debug, 'onDidReceiveDebugSessionCustomEvent');
        expect(spy.calledOnce).to.be.false;
        await extension.activate(vscode.context);
        expect(spy.getCalls().length).to.be.greaterThan(0);
    });

    it('show message even when no actions are provided', async () => {
        const event = {
            seq: 1,
            type: 'event',
            event: 'CustomRequestEvent',
            body: {
                name: 'showPopupMessage',
                message: 'Test message',
                severity: 'info',
                modal: false,
                actions: []
            }
        };
        let selectedAction;
        const session = {
            customRequest: sinon.stub().callsFake((_, response) => {
                selectedAction = response?.selectedAction;
                return Promise.resolve(response);
            })
        };

        const vscodeinfostub = sinon.stub(vscode.window, 'showInformationMessage').callsFake(() => { });

        await extension['processCustomRequestEvent'](event, session as any);
        const args = vscodeinfostub.getCall(0).args;
        expect(args.at(0)).to.be.equal('Test message');
        expect(args.at(1)).to.be.deep.equal({ modal: false });
        expect(selectedAction).to.be.undefined;

        expect(vscodeinfostub.calledOnce).to.be.true;
    });

    it('show message and handle action response', async () => {
        const actions = ['OK', 'Cancel'];
        const event = {
            seq: 1,
            type: 'event',
            event: 'CustomRequestEvent',
            body: {
                name: 'showPopupMessage',
                message: 'Test message',
                severity: 'info',
                modal: false,
                actions: actions
            }
        };
        let selectedAction;
        const session = {
            customRequest: sinon.stub().callsFake((_, response) => {
                selectedAction = response.selectedAction;
                return Promise.resolve(response);
            })
        };

        const vscodeinfostub = sinon.stub(vscode.window, 'showInformationMessage').callsFake(() => {
            return actions[0];
        });

        await extension['processCustomRequestEvent'](event, session as any);
        const args = vscodeinfostub.getCall(0).args;
        expect(args.at(0)).to.be.equal('Test message');
        expect(args.at(1)).to.be.deep.equal({ modal: false });
        expect(args.at(2)).to.be.equal(actions[0]);
        expect(args.at(3)).to.be.equal(actions[1]);
        expect(selectedAction).to.be.equal(actions[0]);

        expect(vscodeinfostub.calledOnce).to.be.true;
    });

    describe('process crash events', () => {
        function makeCrashEvent(type: 'uncaughtException' | 'unhandledRejection', message: string, stack?: string, additionalInfo?: Record<string, unknown>) {
            return {
                event: 'ProcessCrashEvent',
                session: { id: 'test-session' } as any,
                body: { type: type, message: message, stack: stack, additionalInfo: additionalInfo }
            };
        }

        beforeEach(async () => {
            await extension.activate(vscode.context);
        });

        it('shows error message with uncaughtException label', async () => {
            const stub = sinon.stub(vscode.window, 'showErrorMessage').resolves(undefined as any);
            sinon.stub(vscode.debug, 'stopDebugging').resolves();

            await extension['debugSessionCustomEventHandler'](
                makeCrashEvent('uncaughtException', 'something went wrong') as any,
                vscode.context, null as any, null as any, null as any
            );

            expect(stub.calledOnce).to.be.true;
            const callArgs0 = stub.getCall(0).args as any[];
            expect(callArgs0[0]).to.include('Uncaught exception');
            expect(callArgs0[0]).to.include('something went wrong');
        });

        it('shows error message with unhandledRejection label', async () => {
            const stub = sinon.stub(vscode.window, 'showErrorMessage').resolves(undefined as any);
            sinon.stub(vscode.debug, 'stopDebugging').resolves();

            await extension['debugSessionCustomEventHandler'](
                makeCrashEvent('unhandledRejection', 'promise rejected') as any,
                vscode.context, null as any, null as any, null as any
            );

            expect(stub.calledOnce).to.be.true;
            const callArgs1 = stub.getCall(0).args as any[];
            expect(callArgs1[0]).to.include('Unhandled rejection');
            expect(callArgs1[0]).to.include('promise rejected');
        });

        it('opens issue reporter as bug report when user clicks Report Issue', async () => {
            sinon.stub(vscode.window, 'showErrorMessage').resolves('Report Issue' as any);
            sinon.stub(vscode.debug, 'stopDebugging').resolves();
            const executeStub = sinon.stub(vscode.commands, 'executeCommand').resolves();

            await extension['debugSessionCustomEventHandler'](
                makeCrashEvent('uncaughtException', 'boom', 'Error: boom\n  at foo.ts:1') as any,
                vscode.context, null as any, null as any, null as any
            );

            expect(executeStub.calledOnce).to.be.true;
            const callArgs = executeStub.getCall(0).args as any[];
            expect(callArgs[0]).to.equal('workbench.action.openIssueReporter');
            expect(callArgs[1].issueType).to.equal(0);
            expect(callArgs[1].issueTitle).to.include('uncaughtException');
            expect(callArgs[1].issueTitle).to.include('boom');
            expect(callArgs[1].issueBody).to.include('Error: boom');
        });

        it('includes additionalInfo fields as a table in the issue body', async () => {
            sinon.stub(vscode.window, 'showErrorMessage').resolves('Report Issue' as any);
            sinon.stub(vscode.debug, 'stopDebugging').resolves();
            const executeStub = sinon.stub(vscode.commands, 'executeCommand').resolves();

            await extension['debugSessionCustomEventHandler'](
                makeCrashEvent('uncaughtException', 'boom', undefined, {
                    clientName: 'VS Code',
                    rokuDebugVersion: '1.2.3',
                    developerMode: true
                }) as any,
                vscode.context, null as any, null as any, null as any
            );

            const issueBody: string = (executeStub.getCall(0).args as any[])[1].issueBody;
            expect(issueBody).to.include('|Client Name|VS Code|');
            expect(issueBody).to.include('|Roku Debug Version|1.2.3|');
            expect(issueBody).to.include('|Developer Mode|true|');
        });

        it('does not open issue reporter when user dismisses the dialog', async () => {
            sinon.stub(vscode.window, 'showErrorMessage').resolves(undefined as any);
            sinon.stub(vscode.debug, 'stopDebugging').resolves();
            const executeStub = sinon.stub(vscode.commands, 'executeCommand').resolves();

            await extension['debugSessionCustomEventHandler'](
                makeCrashEvent('uncaughtException', 'boom') as any,
                vscode.context, null as any, null as any, null as any
            );

            expect(executeStub.called).to.be.false;
        });
    });

    describe('attachJsDebugger (JS debug proxy staging race)', () => {
        //`localRoot` is always staging-derived (cb677a2) - `resolveJsDebugTarget` only GUESSES the
        //stagingDir from launch.json, and roku-debug reports the AUTHORITATIVE one later via the
        //`processStagingDir` reverse request. Separately, a previous app instance may still be
        //listening on the device when this session starts, so `attachJsDebugger` must not attempt
        //the first attach until roku-debug's ChannelPublished event confirms the device is running
        //THIS session's (newly sideloaded) app - staging-known alone only supplies the authoritative
        //stagingDir for localRoot, it does not clear the attach to attempt (unless the user has
        //disabled ChannelPublished entirely - see the `emitChannelPublishedEvent` test below).
        let tempDir: string;
        let rootDir: string;
        let guessedStagingDir: string;
        let actualStagingDir: string;
        let parentSession: any;

        //minimal fake - the real LogOutputManager isn't wired up in these tests, and passing null
        //(as this file used to) throws inside the handler's tail call on every event
        const fakeLogOutputManager: any = { onDidReceiveDebugSessionCustomEvent: async () => { } };

        function jsDebugTarget(stagingDir: string, kind: 'main' | 'componentLibrary' = 'main') {
            return { tsPath: parentSession.configuration.tsPath, rootDir: rootDir, stagingDir: stagingDir, kind: kind };
        }

        function processStagingDirEvent(stagingDir: string) {
            return {
                event: 'CustomRequestEvent',
                body: {
                    name: 'processStagingDir',
                    requestId: 1,
                    projects: [{ type: 'main', stagingDir: stagingDir }]
                }
            };
        }

        function channelPublishedEvent(session: any) {
            return {
                event: 'ChannelPublishedEvent',
                session: session,
                body: {
                    launchConfiguration: session.configuration
                }
            };
        }

        //drives the real handler path rather than poking the entry directly; the real handler also
        //forwards to webviewViewProviderManager -> RtaManager, which would otherwise attempt real
        //network I/O against the fabricated host, so that call is stubbed away first
        function fireChannelPublished(session: any) {
            sinon.stub(extension['webviewViewProviderManager'], 'onChannelPublishedEvent');
            return extension['debugSessionCustomEventHandler'](channelPublishedEvent(session) as any, vscode.context, {} as any, fakeLogOutputManager, {} as any);
        }

        function sleep(ms: number) {
            return new Promise<void>(resolve => {
                setTimeout(resolve, ms);
            });
        }

        beforeEach(() => {
            tempDir = path.join(os.tmpdir(), `extension-spec-jsdebug-${Date.now()}-${Math.random().toString(36).slice(2)}`);
            rootDir = path.join(tempDir, 'root');
            guessedStagingDir = path.join(tempDir, 'staging-guess');
            actualStagingDir = path.join(tempDir, 'staging-actual');
            //the retry loop bails when rootDir doesn't exist, so that much always has to be real
            fsExtra.outputFileSync(path.join(rootDir, 'source', 'compiled', 'index.js'), '//pristine (pre-injection) bundle');

            (vscode.workspace as any).workspaceFolders = [{ uri: { fsPath: rootDir } }];

            parentSession = {
                id: 'brs-session-1',
                type: 'brightscript',
                name: 'Launch',
                configuration: {
                    type: 'brightscript',
                    tsPath: 'pkg:/source/compiled/index.js',
                    rootDir: rootDir,
                    stagingDir: guessedStagingDir,
                    host: '192.168.1.5'
                },
                customRequest: () => Promise.resolve()
            };
            //`attachJsDebugger`'s retry loop (and its staging-ready wait) is gated on
            //`debugSessionManager.isLive(parentSession)`; poke the manager's live-session set
            //directly rather than routing through vscode.debug's (unwired-in-tests) start event,
            //so this test touches no shared event-emitter state.
            (debugSessionManager as any).liveSessions.set(parentSession.id, parentSession);
        });

        afterEach(() => {
            (debugSessionManager as any).liveSessions.delete(parentSession.id);
            fsExtra.removeSync(tempDir);
        });

        it('waits for channel-published before attaching (even once staging is known), and uses the authoritative stagingDir', async () => {
            await extension.activate(vscode.context);

            const startDebuggingStub = sinon.stub(vscode.debug, 'startDebugging').resolves(true);

            const attachPromise: Promise<boolean> = extension['attachJsDebugger'](parentSession, jsDebugTarget(guessedStagingDir));

            //give the wait loop a few poll cycles to run - it must not attach yet
            await sleep(120);
            expect(startDebuggingStub.called).to.be.false;

            //simulate roku-debug's `processStagingDir` reverse request arriving, reporting a
            //DIFFERENT stagingDir than what `resolveJsDebugTarget` guessed - staging alone must
            //NOT unblock the attach attempt
            await extension['processCustomRequestEvent'](processStagingDirEvent(actualStagingDir) as any, parentSession);
            await sleep(120);
            expect(startDebuggingStub.called).to.be.false;

            //now simulate the authoritative "device is running THIS session's app" signal
            await fireChannelPublished(parentSession);

            expect(await attachPromise).to.be.true;
            expect(startDebuggingStub.calledOnce).to.be.true;
            const debugConfig = (startDebuggingStub.getCall(0).args as any[])[1];
            const expectedLocalRoot = path.join(actualStagingDir, 'source', 'compiled');
            expect(debugConfig.localRoot).to.equal(expectedLocalRoot);
            expect(debugConfig.outFiles).to.deep.equal([`${expectedLocalRoot.replace(/\\/g, '/')}/*.js`]);
        });

        it('attaches immediately when channel-published already arrived before attachJsDebugger started waiting', async () => {
            await extension.activate(vscode.context);
            const startDebuggingStub = sinon.stub(vscode.debug, 'startDebugging').resolves(true);

            //the pre-created entry (channelPublished already true) must gate the wait open right away
            await fireChannelPublished(parentSession);

            const attached = await extension['attachJsDebugger'](parentSession, jsDebugTarget(guessedStagingDir));

            expect(attached).to.be.true;
            expect(startDebuggingStub.calledOnce).to.be.true;
        });

        it('attaches with the best-known (guessed) stagingDir once the grace period elapses with no channel-published signal', async () => {
            await extension.activate(vscode.context);
            //shrink the grace period so the test doesn't actually wait 30s
            extension['jsAttachStagingGraceMs'] = 100;

            const startDebuggingStub = sinon.stub(vscode.debug, 'startDebugging').resolves(true);

            const attached = await extension['attachJsDebugger'](parentSession, jsDebugTarget(guessedStagingDir));

            expect(attached).to.be.true;
            expect(startDebuggingStub.calledOnce).to.be.true;
            const debugConfig = (startDebuggingStub.getCall(0).args as any[])[1];
            const expectedLocalRoot = path.join(guessedStagingDir, 'source', 'compiled');
            expect(debugConfig.localRoot).to.equal(expectedLocalRoot);
        });

        it('picks up a late authoritative stagingDir on the NEXT attempt after the grace timeout, and logs the switch', async () => {
            await extension.activate(vscode.context);
            extension['jsAttachStagingGraceMs'] = 100;
            const appendLineSpy = sinon.spy(extension.extensionOutputChannel, 'appendLine');

            const startDebuggingStub = sinon.stub(vscode.debug, 'startDebugging').callsFake(async () => {
                if (startDebuggingStub.callCount === 1) {
                    //the authoritative stagingDir arrives only now - AFTER the grace timeout already
                    //gave up waiting and the first (failed) attempt went out with the guess
                    await extension['processCustomRequestEvent'](processStagingDirEvent(actualStagingDir) as any, parentSession);
                    return false;
                }
                return true;
            });

            const attached = await extension['attachJsDebugger'](parentSession, jsDebugTarget(guessedStagingDir));

            expect(attached).to.be.true;
            expect(startDebuggingStub.callCount).to.equal(2);
            const firstConfig = (startDebuggingStub.getCall(0).args as any[])[1];
            const secondConfig = (startDebuggingStub.getCall(1).args as any[])[1];
            expect(firstConfig.localRoot).to.equal(path.join(guessedStagingDir, 'source', 'compiled'));
            expect(secondConfig.localRoot).to.equal(path.join(actualStagingDir, 'source', 'compiled'));
            expect(appendLineSpy.getCalls().some(call => String(call.args[0]).includes('differed from actual'))).to.be.true;
        });

        it('does not attempt to attach if the parent session dies while waiting for channel-published', async () => {
            await extension.activate(vscode.context);

            const startDebuggingStub = sinon.stub(vscode.debug, 'startDebugging').resolves(true);
            const stopSpy = sinon.spy(extension['jsDebugProxyManager'], 'stop');

            const attachPromise: Promise<boolean> = extension['attachJsDebugger'](parentSession, jsDebugTarget(guessedStagingDir));

            //give the wait loop a poll cycle, then kill the parent session before channel-published arrives
            await sleep(60);
            (debugSessionManager as any).liveSessions.delete(parentSession.id);

            expect(await attachPromise).to.be.false;
            expect(startDebuggingStub.called).to.be.false;
            expect(stopSpy.calledWith(parentSession.id)).to.be.true;
        });

        it('removes the staging entry when the BRS session terminates', async () => {
            await extension.activate(vscode.context);

            await extension['processCustomRequestEvent'](processStagingDirEvent(actualStagingDir) as any, parentSession);
            expect(extension['stagingReadyByParentSessionId'].has(parentSession.id)).to.be.true;

            extension['onDidTerminateDebugSession'](parentSession);

            expect(extension['stagingReadyByParentSessionId'].has(parentSession.id)).to.be.false;
        });

        it('attaches once staging is known, without waiting for channel-published, when emitChannelPublishedEvent is disabled', async () => {
            //documented user escape hatch (package.json brightscript.debug.emitChannelPublishedEvent) -
            //roku-debug never emits the event, so gate on staging-known instead
            parentSession.configuration.emitChannelPublishedEvent = false;
            await extension.activate(vscode.context);

            const startDebuggingStub = sinon.stub(vscode.debug, 'startDebugging').resolves(true);

            const attachPromise: Promise<boolean> = extension['attachJsDebugger'](parentSession, jsDebugTarget(guessedStagingDir));

            //give the wait loop a couple poll cycles - staging isn't known yet, so no attach
            await sleep(80);
            expect(startDebuggingStub.called).to.be.false;

            await extension['processCustomRequestEvent'](processStagingDirEvent(actualStagingDir) as any, parentSession);

            expect(await attachPromise).to.be.true;
            const debugConfig = (startDebuggingStub.getCall(0).args as any[])[1];
            expect(debugConfig.localRoot).to.equal(path.join(actualStagingDir, 'source', 'compiled'));
        });
    });

});
