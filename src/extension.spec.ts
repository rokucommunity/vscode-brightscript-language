import { expect } from 'chai';
import { createSandbox } from 'sinon';
let Module = require('module');
import * as extension from './extension';
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
    let originalWebviews;
    const extensionInstance = extension.extension;

    beforeEach(() => {
        sinon.stub(languageServerManager, 'init').returns(Promise.resolve());

        originalWebviews = extensionInstance['webviews'];
        extensionInstance['webviews'] = [];
    });

    afterEach(() => {
        extensionInstance['webviews'] = originalWebviews;
        sinon.restore();
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
        expect(spy.calledOnce).to.be.true;
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

        await extensionInstance['processCustomRequestEvent'](event, session as any);
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

        await extensionInstance['processCustomRequestEvent'](event, session as any);
        const args = vscodeinfostub.getCall(0).args;
        expect(args.at(0)).to.be.equal('Test message');
        expect(args.at(1)).to.be.deep.equal({ modal: false });
        expect(args.at(2)).to.be.equal(actions[0]);
        expect(args.at(3)).to.be.equal(actions[1]);
        expect(selectedAction).to.be.equal(actions[0]);

        expect(vscodeinfostub.calledOnce).to.be.true;
    });

});
