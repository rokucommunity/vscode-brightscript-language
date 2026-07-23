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
import { vscodeContextManager } from './managers/VscodeContextManager';

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

    describe('refreshDeviceList / rescanDevices', () => {
        let capturedCommands: Record<string, (...args: any[]) => any>;
        let deviceManager: any;

        beforeEach(() => {
            deviceManager = {
                submitBroadcast: sinon.stub(),
                submitReconcile: sinon.stub(),
                broadcast: sinon.stub(),
                reconcile: sinon.stub()
            };
            const localCommands = new BrightScriptCommands({} as any, {} as any, vscode.context, deviceManager, {} as any, {} as any, {} as any);
            capturedCommands = {};
            sinon.stub(vscode.commands as any, 'registerCommand').callsFake((name: any, cb: any) => {
                capturedCommands[name] = cb;
            });
            localCommands.registerCommands();
        });

        afterEach(() => {
            (vscode.commands.registerCommand as any).restore();
        });

        it('refreshDeviceList submits refresh-clicked orders instead of scanning directly', () => {
            capturedCommands['extension.brightscript.refreshDeviceList']();
            assert.isTrue(deviceManager.submitBroadcast.calledOnceWith('refresh-clicked'));
            assert.isTrue(deviceManager.submitReconcile.calledOnceWith('refresh-clicked'));
            assert.isTrue(deviceManager.broadcast.notCalled);
            assert.isTrue(deviceManager.reconcile.notCalled);
        });

        it('rescanDevices submits refresh-clicked orders instead of scanning directly', () => {
            capturedCommands['extension.brightscript.rescanDevices']();
            assert.isTrue(deviceManager.submitBroadcast.calledOnceWith('refresh-clicked'));
            assert.isTrue(deviceManager.submitReconcile.calledOnceWith('refresh-clicked'));
            assert.isTrue(deviceManager.broadcast.notCalled);
            assert.isTrue(deviceManager.reconcile.notCalled);
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
        let userInputManager: any;
        let rebootStub: sinon.SinonStub;
        let checkForUpdateStub: sinon.SinonStub;
        let showWarningStub: sinon.SinonStub;
        let showInfoStub: sinon.SinonStub;
        let showErrorStub: sinon.SinonStub;

        const device = { ip: '1.2.3.4', serialNumber: 'SN123', deviceInfo: {} };

        beforeEach(() => {
            sandbox = sinon.createSandbox();
            deviceManager = {
                validateAndAddDevice: sandbox.stub().resolves(device),
                getDevice: sandbox.stub().returns(device),
                getDeviceDisplayName: sandbox.stub().returns('Roku Express – 1.2.3.4')
            };
            //password resolution is delegated to UserInputManager (tested in its own spec)
            userInputManager = {
                promptForHost: sandbox.stub().resolves({ host: '1.2.3.4', deviceInfo: undefined }),
                resolveDevicePassword: sandbox.stub().resolves({ status: 'ok', password: 'pw' })
            };
            //ctor: remoteControlManager, whatsNewManager, context, deviceManager, userInputManager, localPackageManager, credentialStore
            localCommands = new BrightScriptCommands({} as any, {} as any, vscode.context, deviceManager, userInputManager, {} as any, {} as any);

            rebootStub = sandbox.stub(rokuDeploy, 'rebootDevice').resolves({} as any);
            checkForUpdateStub = sandbox.stub(rokuDeploy, 'checkForUpdate').resolves({} as any);
            showWarningStub = sandbox.stub(vscode.window, 'showWarningMessage') as sinon.SinonStub;
            showWarningStub.resolves('Restart');
            showInfoStub = sandbox.stub(vscode.window, 'showInformationMessage') as sinon.SinonStub;
            showInfoStub.resolves('Check for Updates');
            showErrorStub = sandbox.stub(vscode.window, 'showErrorMessage').resolves();
            vscode.context.workspaceState['_data'] = {};
        });

        afterEach(() => {
            sandbox.restore();
        });

        it('passes the resolved password to rokuDeploy.rebootDevice', async () => {
            userInputManager.resolveDevicePassword.resolves({ status: 'ok', password: 'pw' });

            await localCommands.restartDevice('1.2.3.4');

            assert.isTrue(rebootStub.calledOnce);
            assert.equal(rebootStub.firstCall.args[0].host, '1.2.3.4');
            assert.equal(rebootStub.firstCall.args[0].password, 'pw');
            assert.isFalse(showErrorStub.called);
        });

        it('resolves the password against the probed device, offering remotePassword as an extra candidate', async () => {
            vscode.context.workspaceState['_data'].remotePassword = 'global-pw';

            await localCommands.restartDevice('1.2.3.4');

            assert.isTrue(deviceManager.validateAndAddDevice.calledWith('1.2.3.4'));
            assert.isTrue(userInputManager.resolveDevicePassword.calledOnce);
            const args = userInputManager.resolveDevicePassword.firstCall.args[0];
            assert.equal(args.host, '1.2.3.4');
            assert.equal(args.serialNumber, 'SN123');
            assert.deepEqual(args.extraCandidates, ['global-pw']);
        });

        it('aborts without resolving a password or rebooting when the confirmation is dismissed', async () => {
            showWarningStub.resolves(undefined);

            await localCommands.restartDevice('1.2.3.4');

            assert.isFalse(userInputManager.resolveDevicePassword.called, 'password should not be resolved when cancelled');
            assert.isFalse(rebootStub.called);
        });

        it('cancels when password resolution is cancelled', async () => {
            userInputManager.resolveDevicePassword.resolves({ status: 'cancelled' });

            await localCommands.restartDevice('1.2.3.4');

            assert.isFalse(rebootStub.called);
        });

        it('shows an error and does not reboot when the device is unreachable', async () => {
            userInputManager.resolveDevicePassword.resolves({ status: 'unreachable' });

            await localCommands.restartDevice('1.2.3.4');

            assert.isFalse(rebootStub.called);
            assert.isTrue(showErrorStub.calledOnce);
        });

        it('always prompts for the device with the picker when no host is provided', async () => {
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
            assert.isFalse(userInputManager.resolveDevicePassword.called);
        });

        it('checkForUpdates passes the resolved password to rokuDeploy.checkForUpdate', async () => {
            userInputManager.resolveDevicePassword.resolves({ status: 'ok', password: 'pw' });

            await localCommands.checkForUpdates('1.2.3.4');

            assert.isTrue(checkForUpdateStub.calledOnce);
            assert.equal(checkForUpdateStub.firstCall.args[0].host, '1.2.3.4');
            assert.equal(checkForUpdateStub.firstCall.args[0].password, 'pw');
        });

        it('checkForUpdates aborts when the confirmation is dismissed', async () => {
            showInfoStub.resolves(undefined);

            await localCommands.checkForUpdates('1.2.3.4');

            assert.isFalse(checkForUpdateStub.called);
        });

        it('surfaces a rokuDeploy failure as an error message', async () => {
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

    describe('getHealthyActiveHost', () => {
        let sandbox: sinon.SinonSandbox;
        let localCommands: BrightScriptCommands;
        let deviceManager: any;

        beforeEach(() => {
            sandbox = sinon.createSandbox();
            deviceManager = {
                healthCheckDevice: sandbox.stub().resolves(true),
                getDevice: sandbox.stub().returns({ ip: '1.2.3.4', deviceInfo: { 'serial-number': 'SN123' } })
            };
            localCommands = new BrightScriptCommands({} as any, {} as any, vscode.context, deviceManager, {} as any, {} as any, {} as any);
            sandbox.stub(vscodeContextManager, 'get').returns('1.2.3.4');
        });

        afterEach(() => {
            sandbox.restore();
        });

        it('returns the host with its device info when the active host is healthy', async () => {
            const result = await localCommands.getHealthyActiveHost();
            assert.deepEqual(result, { host: '1.2.3.4', deviceInfo: { 'serial-number': 'SN123' } });
        });

        it('returns undefined when no active host is set', async () => {
            (vscodeContextManager.get as sinon.SinonStub).returns(undefined);
            const result = await localCommands.getHealthyActiveHost();
            assert.isUndefined(result);
        });

        it('returns undefined when the active host fails the health check', async () => {
            deviceManager.healthCheckDevice.resolves(false);
            const result = await localCommands.getHealthyActiveHost();
            assert.isUndefined(result);
        });

        it('returns undefined when no device info could be read back', async () => {
            deviceManager.getDevice.returns(undefined);
            const result = await localCommands.getHealthyActiveHost();
            assert.isUndefined(result);
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
