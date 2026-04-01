import { expect } from 'chai';
import { createSandbox } from 'sinon';
let Module = require('module');
import { Extension } from './extension';
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

});
