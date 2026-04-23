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

import { BrightScriptCommands } from './BrightScriptCommands';
import { util } from './util';

describe('BrightScriptFileUtils ', () => {
    let commands: BrightScriptCommands;
    let commandsMock;
    let languagesMock;

    beforeEach(() => {
        commands = new BrightScriptCommands({} as any, {} as any, {} as any, {} as any, {} as any, {} as any);
        commandsMock = sinon.mock(commands);
        languagesMock = sinon.mock(vscode.languages);
    });

    afterEach(() => {
        languagesMock.restore();
        commandsMock.restore();
    });

    describe('onGoToParentComponent ', () => {
        it('does nothing when no active document', () => {
            vscode.window.activeTextEditor = undefined;

            void commands.onGoToParentComponent();

            languagesMock.verify();
            commandsMock.verify();
        });

        it('does nothing when active file is not xml/brs/bs', () => {
            vscode.window.activeTextEditor = { document: { fileName: 'notValid.json', getText: () => '' } };

            void commands.onGoToParentComponent();

            languagesMock.verify();
            commandsMock.verify();
        });

        it('shows info message when xml file has no extends attribute', async () => {
            vscode.window.activeTextEditor = {
                document: {
                    fileName: 'HomeView.xml',
                    getText: () => '<component name="HomeView"></component>'
                }
            };
            let message: string;
            sinon.stub(vscode.window, 'showInformationMessage').callsFake((msg: string) => {
                message = msg;
            });

            await commands.onGoToParentComponent();

            assert.equal(message, 'No parent component found');
            (vscode.window.showInformationMessage as any).restore();
        });

        it('calls openFile when xml file with extends is open and parent xml found', async () => {
            const mockPosition = { line: 0, character: 30 };
            const parentUri = { fsPath: '/some/path/BaseScreen.xml' };
            vscode.window.activeTextEditor = {
                document: {
                    fileName: 'HomeView.xml',
                    uri: { fsPath: 'HomeView.xml' },
                    getText: () => '<component name="HomeView" extends="BaseScreen"></component>',
                    positionAt: () => mockPosition
                }
            };
            sinon.stub(vscode.commands, 'executeCommand').returns(
                Promise.resolve([{ uri: parentUri }]) as any
            );
            commandsMock.expects('openFile').once().withArgs('/some/path/BaseScreen.xml').returns(Promise.resolve(true));

            await commands.onGoToParentComponent();

            commandsMock.verify();
            (vscode.commands.executeCommand as any).restore();
        });
    });

    describe('setDefaultDevicePassword', () => {
        let localCommands: BrightScriptCommands;
        let capturedCommands: Record<string, (...args: any[]) => any>;
        let updateStub: sinon.SinonStub;
        let showTimedNotificationStub: sinon.SinonStub;

        beforeEach(() => {
            localCommands = new BrightScriptCommands({} as any, {} as any, vscode.context, {} as any, {} as any, {} as any);
            capturedCommands = {};
            sinon.stub(vscode.commands, 'registerCommand').callsFake((name: string, cb: (...args: any[]) => any) => {
                capturedCommands[name] = cb;
            });
            updateStub = sinon.stub().resolves();
            sinon.stub(vscode.workspace, 'getConfiguration').returns({
                get: sinon.stub().returns(''),
                update: updateStub
            } as any);
            showTimedNotificationStub = sinon.stub(Object.getPrototypeOf(util), 'showTimedNotification').resolves();
            localCommands.registerCommands();
        });

        afterEach(() => {
            (vscode.commands.registerCommand as any).restore();
            (vscode.workspace.getConfiguration as any).restore();
            showTimedNotificationStub.restore();
        });

        it('saves the password to Global configuration target only', async () => {
            sinon.stub(vscode.window, 'showInputBox').resolves('mypassword');
            await capturedCommands['extension.brightscript.setDefaultDevicePassword']();
            assert.isTrue(updateStub.calledOnce);
            assert.equal(updateStub.firstCall.args[0], 'defaultDevicePassword');
            assert.equal(updateStub.firstCall.args[1], 'mypassword');
            assert.equal(updateStub.firstCall.args[2], vscode.ConfigurationTarget.Global);
            (vscode.window.showInputBox as any).restore();
        });

        it('does not save when user cancels the input box', async () => {
            sinon.stub(vscode.window, 'showInputBox').resolves(undefined);
            await capturedCommands['extension.brightscript.setDefaultDevicePassword']();
            assert.isTrue(updateStub.notCalled);
            (vscode.window.showInputBox as any).restore();
        });

        it('saves empty string when user clears the password', async () => {
            sinon.stub(vscode.window, 'showInputBox').resolves('');
            await capturedCommands['extension.brightscript.setDefaultDevicePassword']();
            assert.isTrue(updateStub.calledOnce);
            assert.equal(updateStub.firstCall.args[1], '');
            assert.equal(updateStub.firstCall.args[2], vscode.ConfigurationTarget.Global);
            (vscode.window.showInputBox as any).restore();
        });
    });

    describe('clearDefaultDevicePassword', () => {
        let localCommands: BrightScriptCommands;
        let capturedCommands: Record<string, (...args: any[]) => any>;
        let updateStub: sinon.SinonStub;
        let showTimedNotificationStub: sinon.SinonStub;

        beforeEach(() => {
            localCommands = new BrightScriptCommands({} as any, {} as any, vscode.context, {} as any, {} as any, {} as any);
            capturedCommands = {};
            sinon.stub(vscode.commands, 'registerCommand').callsFake((name: string, cb: (...args: any[]) => any) => {
                capturedCommands[name] = cb;
            });
            updateStub = sinon.stub().resolves();
            sinon.stub(vscode.workspace, 'getConfiguration').returns({
                get: sinon.stub().returns(''),
                update: updateStub
            } as any);
            showTimedNotificationStub = sinon.stub(Object.getPrototypeOf(util), 'showTimedNotification').resolves();
            localCommands.registerCommands();
        });

        afterEach(() => {
            (vscode.commands.registerCommand as any).restore();
            (vscode.workspace.getConfiguration as any).restore();
            showTimedNotificationStub.restore();
        });

        it('clears the password in Global configuration target only', async () => {
            await capturedCommands['extension.brightscript.clearDefaultDevicePassword']();
            assert.isTrue(updateStub.calledOnce);
            assert.equal(updateStub.firstCall.args[0], 'defaultDevicePassword');
            assert.equal(updateStub.firstCall.args[1], undefined);
            assert.equal(updateStub.firstCall.args[2], vscode.ConfigurationTarget.Global);
        });

        it('shows a confirmation notification after clearing', async () => {
            await capturedCommands['extension.brightscript.clearDefaultDevicePassword']();
            assert.isTrue(showTimedNotificationStub.calledOnce);
            assert.equal(showTimedNotificationStub.firstCall.args[0], 'Default device password cleared.');
        });
    });

    describe('onToggleXml ', () => {
        it('does nothing when no active document', () => {
            vscode.window.activeTextEditor = undefined;

            void commands.onToggleXml();

            languagesMock.verify();
            commandsMock.verify();
        });

        it('tries to ascertain alternate filename', () => {
            vscode.window.activeTextEditor = { document: { fileName: 'notValid.json' } };
            void commands.onToggleXml();

            languagesMock.verify();
            commandsMock.verify();
        });

        it('calls openFile when the document is valid', () => {
            vscode.window.activeTextEditor = { document: { fileName: 'valid.brs' } };
            commandsMock.expects('openFile').once();

            void commands.onToggleXml();

            languagesMock.verify();
            commandsMock.verify();
        });
    });
});
