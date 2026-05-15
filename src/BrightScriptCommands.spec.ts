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
        commands = new BrightScriptCommands({} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any);
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
            localCommands = new BrightScriptCommands({} as any, {} as any, vscode.context, {} as any, {} as any, {} as any, {} as any);
            capturedCommands = {};
            sinon.stub(vscode.commands as any, 'registerCommand').callsFake((name: any, cb: any) => {
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
            localCommands = new BrightScriptCommands({} as any, {} as any, vscode.context, {} as any, {} as any, {} as any, {} as any);
            capturedCommands = {};
            sinon.stub(vscode.commands as any, 'registerCommand').callsFake((name: any, cb: any) => {
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

    describe('restartDevApplication', () => {
        let utilProto: any;
        let httpGetStub: sinon.SinonStub;
        let sleepStub: sinon.SinonStub;
        let spinAsyncStub: sinon.SinonStub;
        let showTimedNotificationStub: sinon.SinonStub;
        let ecpPostStub: sinon.SinonStub;
        let showErrorStub: sinon.SinonStub;
        let showWarningStub: sinon.SinonStub;

        const appsResponseWithDev = { body: '<apps><app id="dev">My App</app></apps>' };
        const activeAppResponseDev = { body: '<active-app><app id="dev">My App</app></active-app>' };

        beforeEach(() => {
            utilProto = Object.getPrototypeOf(util);
            sinon.stub(commands, 'getRemoteHost').callsFake(() => {
                commands.host = '1.2.3.4';
                return Promise.resolve(commands.host);
            });
            spinAsyncStub = sinon.stub(utilProto, 'spinAsync').callsFake((_message: string, callback: () => Promise<any>) => callback());
            httpGetStub = sinon.stub(utilProto, 'httpGet');
            sleepStub = sinon.stub(utilProto, 'sleep').resolves();
            showTimedNotificationStub = sinon.stub(utilProto, 'showTimedNotification').resolves();
            ecpPostStub = sinon.stub(commands as any, 'ecpPost');
            ecpPostStub.resolves({ statusCode: 200, body: '' });
            showErrorStub = sinon.stub(vscode.window, 'showErrorMessage').resolves();
            showWarningStub = sinon.stub(vscode.window, 'showWarningMessage').resolves();
        });

        afterEach(() => {
            (commands.getRemoteHost as any).restore();
            spinAsyncStub.restore();
            httpGetStub.restore();
            sleepStub.restore();
            showTimedNotificationStub.restore();
            ecpPostStub.restore();
            showErrorStub.restore();
            showWarningStub.restore();
        });

        it('terminates dev with exit-app/dev/true and relaunches', async () => {
            httpGetStub.onFirstCall().resolves(appsResponseWithDev);
            httpGetStub.onSecondCall().resolves(activeAppResponseDev);

            await commands.restartDevApplication();

            const exitCalls = ecpPostStub.getCalls().filter(call => call.args[1] === 'exit-app/dev/true');
            assert.equal(exitCalls.length, 1, 'should call exit-app/dev/true exactly once');
            assert.equal(exitCalls[0].args[0], '1.2.3.4');

            const launchCalls = ecpPostStub.getCalls().filter(call => call.args[1] === 'launch/dev');
            assert.equal(launchCalls.length, 1, 'should call launch/dev once');

            assert.isFalse(ecpPostStub.getCalls().some(call => call.args[1] === 'exit-app/dev'), 'should not call the non-forced exit-app/dev');
            assert.isTrue(showTimedNotificationStub.calledOnce);
            assert.isFalse(showErrorStub.called);
            assert.isFalse(showWarningStub.called);
        });

        it('shows an error and skips launch when no dev channel is sideloaded', async () => {
            httpGetStub.onFirstCall().resolves({ body: '<apps><app id="12345">Netflix</app></apps>' });

            await commands.restartDevApplication();

            assert.isFalse(ecpPostStub.called, 'should not send any ecp calls when dev is missing');
            assert.isTrue(showErrorStub.calledOnce);
        });

        it('warns when the dev app is not foregrounded after launch', async () => {
            httpGetStub.onFirstCall().resolves(appsResponseWithDev);
            httpGetStub.onSecondCall().resolves({ body: '<active-app><app id="12345">Netflix</app></active-app>' });

            await commands.restartDevApplication();

            assert.isTrue(showWarningStub.calledOnce);
            assert.isFalse(showTimedNotificationStub.called);
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
