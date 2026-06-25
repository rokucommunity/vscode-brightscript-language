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
import { rokuDeploy } from 'roku-deploy';

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

    describe('restartDevice / checkForUpdates', () => {
        let sandbox: sinon.SinonSandbox;
        let localCommands: BrightScriptCommands;
        let deviceManager: any;
        let credentialStore: any;
        let userInputManager: any;
        let rebootStub: sinon.SinonStub;
        let checkForUpdateStub: sinon.SinonStub;
        let showWarningStub: sinon.SinonStub;
        let showInfoStub: sinon.SinonStub;
        let showErrorStub: sinon.SinonStub;
        let showTimedNotificationStub: sinon.SinonStub;
        let promptForPasswordStub: sinon.SinonStub;

        const device = { ip: '1.2.3.4', serialNumber: 'SN123', deviceInfo: {} };

        beforeEach(() => {
            sandbox = sinon.createSandbox();
            deviceManager = {
                validateAndAddDevice: sandbox.stub().resolves(device),
                getDevice: sandbox.stub().returns(device),
                getDeviceDisplayName: sandbox.stub().returns('Roku Express – 1.2.3.4'),
                validateDevicePassword: sandbox.stub().resolves('ok'),
                getDefaultPassword: sandbox.stub().returns(undefined)
            };
            credentialStore = {
                getPassword: sandbox.stub().resolves(undefined),
                setPassword: sandbox.stub().resolves()
            };
            userInputManager = {
                promptForHost: sandbox.stub().resolves('1.2.3.4')
            };
            //ctor: remoteControlManager, whatsNewManager, context, deviceManager, userInputManager, localPackageManager, credentialStore
            localCommands = new BrightScriptCommands({} as any, {} as any, vscode.context, deviceManager, userInputManager, {} as any, credentialStore);
            //prompt is only reached when no stored candidate works; default to a cancel
            promptForPasswordStub = sandbox.stub(localCommands as any, 'promptForDevicePassword');
            promptForPasswordStub.resolves(undefined);

            rebootStub = sandbox.stub(rokuDeploy, 'rebootDevice').resolves({} as any);
            checkForUpdateStub = sandbox.stub(rokuDeploy, 'checkForUpdate').resolves({} as any);
            showWarningStub = sandbox.stub(vscode.window, 'showWarningMessage') as sinon.SinonStub;
            showWarningStub.resolves('Restart');
            showInfoStub = sandbox.stub(vscode.window, 'showInformationMessage') as sinon.SinonStub;
            showInfoStub.resolves('Check for Updates');
            showErrorStub = sandbox.stub(vscode.window, 'showErrorMessage').resolves();
            //the real helper runs a multi-second timer loop; stub it out
            showTimedNotificationStub = sandbox.stub(Object.getPrototypeOf(util), 'showTimedNotification').resolves();
            vscode.context.workspaceState['_data'] = {};
        });

        afterEach(() => {
            sandbox.restore();
        });

        it('resolves and passes a validated stored password to rokuDeploy.rebootDevice', async () => {
            credentialStore.getPassword.resolves('storedpw');

            await localCommands.restartDevice('1.2.3.4');

            assert.isTrue(deviceManager.validateDevicePassword.calledWith('1.2.3.4', 'storedpw'));
            assert.isTrue(rebootStub.calledOnce);
            assert.equal(rebootStub.firstCall.args[0].host, '1.2.3.4');
            assert.equal(rebootStub.firstCall.args[0].password, 'storedpw');
            assert.isTrue(showTimedNotificationStub.calledOnce, 'shows a timed success notification');
            assert.isFalse(showErrorStub.called);
        });

        it('falls back to the default password when nothing is stored', async () => {
            credentialStore.getPassword.resolves(undefined);
            deviceManager.getDefaultPassword.returns('rokudev');

            await localCommands.restartDevice('1.2.3.4');

            assert.isTrue(rebootStub.calledOnce);
            assert.equal(rebootStub.firstCall.args[0].password, 'rokudev');
            assert.isFalse(promptForPasswordStub.called, 'should not prompt when a candidate works');
        });

        it('prompts and re-validates when no stored candidate is accepted', async () => {
            //no stored / default candidates
            promptForPasswordStub.onFirstCall().resolves('wrong');
            promptForPasswordStub.onSecondCall().resolves('right');
            deviceManager.validateDevicePassword.withArgs('1.2.3.4', 'wrong').resolves('bad-password');
            deviceManager.validateDevicePassword.withArgs('1.2.3.4', 'right').resolves('ok');

            await localCommands.restartDevice('1.2.3.4');

            assert.isTrue(promptForPasswordStub.calledTwice);
            assert.isTrue(rebootStub.calledOnce);
            assert.equal(rebootStub.firstCall.args[0].password, 'right');
        });

        it('aborts without prompting or rebooting when the confirmation is dismissed', async () => {
            credentialStore.getPassword.resolves('storedpw');
            showWarningStub.resolves(undefined);

            await localCommands.restartDevice('1.2.3.4');

            assert.isFalse(deviceManager.validateDevicePassword.called, 'password should not be resolved when cancelled');
            assert.isFalse(rebootStub.called);
        });

        it('cancels when the password prompt is dismissed', async () => {
            //no candidates → prompt path; promptForPasswordStub defaults to undefined (cancel)
            await localCommands.restartDevice('1.2.3.4');

            assert.isTrue(promptForPasswordStub.calledOnce);
            assert.isFalse(rebootStub.called);
        });

        it('shows an error and does not reboot when the device is unreachable', async () => {
            credentialStore.getPassword.resolves('storedpw');
            deviceManager.validateDevicePassword.resolves('unreachable');

            await localCommands.restartDevice('1.2.3.4');

            assert.isFalse(rebootStub.called);
            assert.isTrue(showErrorStub.calledOnce);
        });

        it('always prompts for the device with the picker when no host is provided', async () => {
            credentialStore.getPassword.resolves('storedpw');

            await localCommands.restartDevice();

            assert.isTrue(userInputManager.promptForHost.calledOnce);
            assert.isTrue(rebootStub.calledOnce);
            assert.equal(rebootStub.firstCall.args[0].host, '1.2.3.4');
        });

        it('cancels when the device picker is dismissed', async () => {
            userInputManager.promptForHost.rejects(new Error('No host was selected'));

            await localCommands.restartDevice();

            assert.isFalse(rebootStub.called);
            assert.isFalse(deviceManager.validateAndAddDevice.called);
        });

        it('persists an accepted password to the credential store only when an entry already exists', async () => {
            credentialStore.getPassword.resolves('storedpw');

            await localCommands.restartDevice('1.2.3.4');

            assert.isTrue(credentialStore.setPassword.calledWith('SN123', 'storedpw'));
            assert.equal(vscode.context.workspaceState['_data'].remotePassword, 'storedpw');
        });

        it('does not seed the credential store for a never-stored password', async () => {
            credentialStore.getPassword.resolves(undefined);
            deviceManager.getDefaultPassword.returns('rokudev');

            await localCommands.restartDevice('1.2.3.4');

            assert.isFalse(credentialStore.setPassword.called);
            assert.equal(vscode.context.workspaceState['_data'].remotePassword, 'rokudev');
        });

        it('checkForUpdates resolves the password and calls rokuDeploy.checkForUpdate', async () => {
            credentialStore.getPassword.resolves('storedpw');

            await localCommands.checkForUpdates('1.2.3.4');

            assert.isTrue(checkForUpdateStub.calledOnce);
            assert.equal(checkForUpdateStub.firstCall.args[0].host, '1.2.3.4');
            assert.equal(checkForUpdateStub.firstCall.args[0].password, 'storedpw');
            assert.isTrue(showTimedNotificationStub.calledOnce, 'shows a timed success notification');
        });

        it('checkForUpdates aborts when the confirmation is dismissed', async () => {
            showInfoStub.resolves(undefined);

            await localCommands.checkForUpdates('1.2.3.4');

            assert.isFalse(checkForUpdateStub.called);
        });

        it('surfaces a rokuDeploy failure as an error message', async () => {
            credentialStore.getPassword.resolves('storedpw');
            rebootStub.rejects(new Error('boom'));

            await localCommands.restartDevice('1.2.3.4');

            assert.isTrue(showErrorStub.calledOnce);
            assert.include(showErrorStub.firstCall.args[0], 'boom');
        });

        describe('command registration', () => {
            let capturedCommands: Record<string, (...args: any[]) => any>;
            let restartStub: sinon.SinonStub;
            let updatesStub: sinon.SinonStub;

            beforeEach(() => {
                capturedCommands = {};
                sandbox.stub(vscode.commands as any, 'registerCommand').callsFake((name: any, cb: any) => {
                    capturedCommands[name] = cb;
                });
                restartStub = sandbox.stub(localCommands, 'restartDevice').resolves();
                updatesStub = sandbox.stub(localCommands, 'checkForUpdates').resolves();
                localCommands.registerDevicesViewCommands({ toggleFilter: () => { }, resetFilters: () => { } } as any);
            });

            it('maps the tree element key to the device ip', async () => {
                deviceManager.getDevice.withArgs('SN123').returns({ ip: '1.2.3.4' });

                await capturedCommands['extension.brightscript.devicesView.restartDevice']({ key: 'SN123' });
                await capturedCommands['extension.brightscript.devicesView.checkAndInstallUpdates']({ key: 'SN123' });

                assert.isTrue(restartStub.calledOnce);
                assert.equal(restartStub.firstCall.args[0], '1.2.3.4');
                assert.isTrue(updatesStub.calledOnce);
                assert.equal(updatesStub.firstCall.args[0], '1.2.3.4');
            });

            it('passes undefined (picker fallback) when invoked with no element', async () => {
                await capturedCommands['extension.brightscript.devicesView.restartDevice']();

                assert.isTrue(restartStub.calledOnce);
                assert.equal(restartStub.firstCall.args[0], undefined);
            });
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
