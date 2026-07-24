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

    describe('setActiveDevice / clearActiveDevice', () => {
        let localCommands: BrightScriptCommands;
        let capturedCommands: Record<string, (...args: any[]) => any>;
        let deviceManager: any;
        let userInputManager: any;
        let showTimedNotificationStub: sinon.SinonStub;
        let vscodeContextSetStub: sinon.SinonStub;

        beforeEach(() => {
            deviceManager = {
                getDevice: sinon.stub(),
                getDeviceByDeviceConfig: sinon.stub(),
                getDeviceDisplayName: sinon.stub().callsFake((device: any) => device?.ip ?? device?.rce?.id ?? 'device')
            };
            userInputManager = {
                promptForHost: sinon.stub()
            };
            localCommands = new BrightScriptCommands({} as any, {} as any, vscode.context, deviceManager, userInputManager, {} as any, {} as any);
            capturedCommands = {};
            sinon.stub(vscode.commands as any, 'registerCommand').callsFake((name: any, cb: any) => {
                capturedCommands[name] = cb;
            });
            showTimedNotificationStub = sinon.stub(Object.getPrototypeOf(util), 'showTimedNotification').resolves();
            vscodeContextSetStub = sinon.stub(vscodeContextManager, 'set').resolves();
            localCommands.registerCommands();
        });

        afterEach(() => {
            (vscode.commands.registerCommand as any).restore();
            showTimedNotificationStub.restore();
            vscodeContextSetStub.restore();
        });

        it('sets remoteHost/activeHost/activeDeviceKey for a LAN device selected by key', async () => {
            deviceManager.getDevice.withArgs('s:abc123').returns({ ip: '1.2.3.4', key: 's:abc123' });

            await capturedCommands['extension.brightscript.setActiveDevice']({ key: 's:abc123' });

            assert.equal(vscode.context.workspaceState.get('remoteHost'), '1.2.3.4');
            assert.equal(vscode.context.workspaceState.get('activeDeviceKey'), 's:abc123');
            assert.isTrue(vscodeContextSetStub.calledWith('activeHost', '1.2.3.4'));
        });

        it('sets activeDeviceKey and clears remoteHost/activeHost for a cloud device selected by key', async () => {
            deviceManager.getDevice.withArgs('rce:83').returns({ ip: undefined, key: 'rce:83', rce: { id: '83', status: 'running' } });

            await capturedCommands['extension.brightscript.setActiveDevice']({ key: 'rce:83' });

            assert.equal(vscode.context.workspaceState.get('remoteHost'), '');
            assert.equal(vscode.context.workspaceState.get('activeDeviceKey'), 'rce:83');
            assert.isTrue(vscodeContextSetStub.calledWith('activeHost', ''));
        });

        it('resolves a cloud device picked from the fallback picker', async () => {
            const cloudDeviceOption = { id: '83', rceToken: 'secret' };
            userInputManager.promptForHost.resolves({ host: undefined, deviceInfo: undefined, device: cloudDeviceOption, rce: { status: 'running' } });
            deviceManager.getDeviceByDeviceConfig.withArgs(cloudDeviceOption).returns({ ip: undefined, key: 'rce:83', rce: { id: '83', status: 'running' } });

            await capturedCommands['extension.brightscript.setActiveDevice']();

            assert.equal(vscode.context.workspaceState.get('activeDeviceKey'), 'rce:83');
            assert.equal(vscode.context.workspaceState.get('remoteHost'), '');
        });

        it('throws when nothing can be resolved', async () => {
            userInputManager.promptForHost.resolves(undefined);

            let threw = false;
            try {
                await capturedCommands['extension.brightscript.setActiveDevice']();
            } catch {
                threw = true;
            }
            assert.isTrue(threw);
        });

        it('clearActiveDevice clears remoteHost, activeHost, and activeDeviceKey', async () => {
            await vscode.context.workspaceState.update('remoteHost', '1.2.3.4');
            await vscode.context.workspaceState.update('activeDeviceKey', 's:abc123');

            await capturedCommands['extension.brightscript.clearActiveDevice']();

            assert.equal(vscode.context.workspaceState.get('remoteHost'), '');
            assert.equal(vscode.context.workspaceState.get('activeDeviceKey'), '');
            assert.isTrue(vscodeContextSetStub.calledWith('activeHost', ''));
        });
    });

    describe('restartDevApplication', () => {
        let utilProto: any;
        let sleepStub: sinon.SinonStub;
        let spinAsyncStub: sinon.SinonStub;
        let showTimedNotificationStub: sinon.SinonStub;
        let resolveActiveDeviceConfigStub: sinon.SinonStub;
        let queryAppsStub: sinon.SinonStub;
        let queryActiveAppStub: sinon.SinonStub;
        let launchAppStub: sinon.SinonStub;
        let exitAppStub: sinon.SinonStub;
        let showErrorStub: sinon.SinonStub;
        let showWarningStub: sinon.SinonStub;

        const lanDevice = { host: '1.2.3.4' };
        const appsWithDev = [{ id: 'dev', title: 'My App' }];
        const activeAppDev = { id: 'dev', title: 'My App' };

        beforeEach(() => {
            utilProto = Object.getPrototypeOf(util);
            resolveActiveDeviceConfigStub = sinon.stub(commands as any, 'resolveActiveDeviceConfig');
            resolveActiveDeviceConfigStub.resolves(lanDevice);
            spinAsyncStub = sinon.stub(utilProto, 'spinAsync').callsFake((_message: string, callback: () => Promise<any>) => callback());
            sleepStub = sinon.stub(utilProto, 'sleep').resolves();
            showTimedNotificationStub = sinon.stub(utilProto, 'showTimedNotification').resolves();
            queryAppsStub = sinon.stub(rokuDeploy, 'queryApps').resolves(appsWithDev as any);
            queryActiveAppStub = sinon.stub(rokuDeploy, 'queryActiveApp').resolves(activeAppDev as any);
            launchAppStub = sinon.stub(rokuDeploy, 'launchApp').resolves();
            exitAppStub = sinon.stub(rokuDeploy, 'exitApp').resolves();
            showErrorStub = sinon.stub(vscode.window, 'showErrorMessage').resolves();
            showWarningStub = sinon.stub(vscode.window, 'showWarningMessage').resolves();
        });

        afterEach(() => {
            resolveActiveDeviceConfigStub.restore();
            spinAsyncStub.restore();
            sleepStub.restore();
            showTimedNotificationStub.restore();
            queryAppsStub.restore();
            queryActiveAppStub.restore();
            launchAppStub.restore();
            exitAppStub.restore();
            showErrorStub.restore();
            showWarningStub.restore();
        });

        it('exits dev with force and relaunches it', async () => {
            await commands.restartDevApplication();

            assert.isTrue(exitAppStub.calledOnce, 'should call exitApp exactly once');
            assert.deepEqual(exitAppStub.firstCall.args[0], { device: lanDevice, appId: 'dev', force: true });

            assert.isTrue(launchAppStub.calledOnce, 'should call launchApp once');
            assert.deepEqual(launchAppStub.firstCall.args[0], { device: lanDevice, appId: 'dev' });

            assert.isTrue(showTimedNotificationStub.calledOnce);
            assert.isFalse(showErrorStub.called);
            assert.isFalse(showWarningStub.called);
        });

        it('shows an error and skips launch when no dev channel is sideloaded', async () => {
            queryAppsStub.resolves([{ id: '12345', title: 'Netflix' }] as any);

            await commands.restartDevApplication();

            assert.isFalse(exitAppStub.called, 'should not exit when dev is missing');
            assert.isFalse(launchAppStub.called, 'should not launch when dev is missing');
            assert.isTrue(showErrorStub.calledOnce);
        });

        it('warns when the dev app is not foregrounded after launch', async () => {
            queryActiveAppStub.resolves({ id: '12345', title: 'Netflix' } as any);

            await commands.restartDevApplication();

            assert.isTrue(showWarningStub.calledOnce);
            assert.isFalse(showTimedNotificationStub.called);
        });

        it('shows an error and does not proceed when launchApp throws', async () => {
            launchAppStub.rejects(new Error('device unreachable'));

            await commands.restartDevApplication();

            assert.isTrue(showErrorStub.calledOnce);
            assert.include(showErrorStub.firstCall.args[0], 'device unreachable');
            assert.isFalse(queryActiveAppStub.called, 'should not verify the active app after a failed launch');
        });

        it('resolves the active device config and forwards a cloud device to rokuDeploy', async () => {
            const cloudDevice = { instanceUrl: 'https://rce.example.com/instance', rceToken: 'super-secret-token' };
            resolveActiveDeviceConfigStub.resolves(cloudDevice);

            await commands.restartDevApplication();

            assert.deepEqual(queryAppsStub.firstCall.args[0], { device: cloudDevice });
            assert.deepEqual(exitAppStub.firstCall.args[0], { device: cloudDevice, appId: 'dev', force: true });
            assert.deepEqual(launchAppStub.firstCall.args[0], { device: cloudDevice, appId: 'dev' });
            assert.deepEqual(queryActiveAppStub.firstCall.args[0], { device: cloudDevice });
        });

        it('does nothing when no device can be resolved', async () => {
            resolveActiveDeviceConfigStub.resolves(undefined);

            await commands.restartDevApplication();

            assert.isFalse(queryAppsStub.called);
            assert.isFalse(showErrorStub.called);
        });
    });

    describe('sendRemoteCommand', () => {
        let sandbox: sinon.SinonSandbox;
        let localCommands: BrightScriptCommands;
        let deviceManager: any;
        let keyPressStub: sinon.SinonStub;

        beforeEach(() => {
            sandbox = sinon.createSandbox();
            deviceManager = {
                getDevice: sandbox.stub()
            };
            localCommands = new BrightScriptCommands({} as any, {} as any, vscode.context, deviceManager, {} as any, {} as any, {} as any);
            keyPressStub = sandbox.stub(rokuDeploy, 'keyPress').resolves({} as any);
        });

        afterEach(() => {
            sandbox.restore();
        });

        it('sends the resolved active device and key to rokuDeploy.keyPress', async () => {
            const lanDevice = { host: '10.0.0.5' };
            await vscode.context.workspaceState.update('activeDeviceKey', 's:abc123');
            deviceManager.getDevice.withArgs('s:abc123').returns({ device: lanDevice });

            await localCommands.sendRemoteCommand('Select');

            assert.isTrue(keyPressStub.calledOnce);
            assert.deepEqual(keyPressStub.firstCall.args[0], { device: lanDevice, key: 'Select' });
        });

        it('prefixes literal characters with Lit_ before sending', async () => {
            const lanDevice = { host: '10.0.0.5' };
            await vscode.context.workspaceState.update('activeDeviceKey', 's:abc123');
            deviceManager.getDevice.withArgs('s:abc123').returns({ device: lanDevice });

            await localCommands.sendRemoteCommand('a', undefined, true);

            assert.isTrue(keyPressStub.calledOnce);
            assert.equal(keyPressStub.firstCall.args[0].key, 'Lit_a');
        });

        it('forwards a cloud emulator device config to rokuDeploy.keyPress', async () => {
            const cloudDevice = { instanceUrl: 'https://rce.example.com/instance', rceToken: 'super-secret-token' };
            await vscode.context.workspaceState.update('activeDeviceKey', 'rce:83');
            deviceManager.getDevice.withArgs('rce:83').returns({ device: cloudDevice });

            await localCommands.sendRemoteCommand('Home');

            assert.deepEqual(keyPressStub.firstCall.args[0], { device: cloudDevice, key: 'Home' });
        });

        it('sends the explicit host as a LAN device config, ignoring the active device', async () => {
            deviceManager.getDevice.withArgs('s:abc123').returns({ device: { host: '10.0.0.5' } });
            await vscode.context.workspaceState.update('activeDeviceKey', 's:abc123');

            await localCommands.sendRemoteCommand('Select', '192.168.1.50');

            assert.deepEqual(keyPressStub.firstCall.args[0], { device: { host: '192.168.1.50' }, key: 'Select' });
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
            assert.equal(rebootStub.firstCall.args[0].device.host, '1.2.3.4');
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
            assert.equal(rebootStub.firstCall.args[0].device.host, '1.2.3.4');
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
            assert.equal(checkForUpdateStub.firstCall.args[0].device.host, '1.2.3.4');
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
                getDevice: sandbox.stub().returns({ ip: '1.2.3.4', key: 'i:1.2.3.4', deviceInfo: { 'serial-number': 'SN123' }, device: { host: '1.2.3.4' } })
            };
            localCommands = new BrightScriptCommands({} as any, {} as any, vscode.context, deviceManager, {} as any, {} as any, {} as any);
            //no legacy activeHost context by default; individual tests opt into it
            sandbox.stub(vscodeContextManager, 'get').returns(undefined);
        });

        afterEach(() => {
            sandbox.restore();
        });

        it('resolves the active device via activeDeviceKey and returns its host/deviceInfo/device when healthy', async () => {
            await vscode.context.workspaceState.update('activeDeviceKey', 'i:1.2.3.4');

            const result = await localCommands.getHealthyActiveHost();

            assert.deepEqual(result, { host: '1.2.3.4', deviceInfo: { 'serial-number': 'SN123' }, device: { host: '1.2.3.4' } });
            assert.isTrue(deviceManager.getDevice.calledWith('i:1.2.3.4'));
        });

        it('falls back to the legacy activeHost ip when no activeDeviceKey is stored', async () => {
            (vscodeContextManager.get as sinon.SinonStub).returns('1.2.3.4');

            const result = await localCommands.getHealthyActiveHost();

            assert.deepEqual(result, { host: '1.2.3.4', deviceInfo: { 'serial-number': 'SN123' }, device: { host: '1.2.3.4' } });
            assert.isTrue(deviceManager.getDevice.calledWith({ ip: '1.2.3.4' }));
        });

        it('returns undefined when neither activeDeviceKey nor the legacy activeHost is set', async () => {
            const result = await localCommands.getHealthyActiveHost();
            assert.isUndefined(result);
        });

        it('returns undefined when the active host fails the health check', async () => {
            await vscode.context.workspaceState.update('activeDeviceKey', 'i:1.2.3.4');
            deviceManager.healthCheckDevice.resolves(false);

            const result = await localCommands.getHealthyActiveHost();
            assert.isUndefined(result);
        });

        it('returns undefined when no device info could be read back', async () => {
            await vscode.context.workspaceState.update('activeDeviceKey', 'i:1.2.3.4');
            deviceManager.getDevice.returns({ ip: '1.2.3.4', key: 'i:1.2.3.4', deviceInfo: undefined });

            const result = await localCommands.getHealthyActiveHost();
            assert.isUndefined(result);
        });

        it('returns the cloud device with a running status and an undefined host', async () => {
            const cloudDevice = {
                ip: undefined,
                key: 'rce:83',
                deviceInfo: { 'default-device-name': 'Cloud Device' },
                device: { id: '83', rceToken: 'secret' },
                rce: { id: '83', status: 'running' }
            };
            deviceManager.getDevice.returns(cloudDevice);
            await vscode.context.workspaceState.update('activeDeviceKey', 'rce:83');

            const result = await localCommands.getHealthyActiveHost();

            assert.deepEqual(result, {
                host: undefined,
                deviceInfo: cloudDevice.deviceInfo,
                device: cloudDevice.device,
                rce: { status: 'running' }
            });
        });

        it('reports a non-running cloud active device as unhealthy', async () => {
            const cloudDevice = {
                ip: undefined,
                key: 'rce:83',
                deviceInfo: { 'default-device-name': 'Cloud Device' },
                device: { id: '83', rceToken: 'secret' },
                rce: { id: '83', status: 'shutdown' }
            };
            deviceManager.getDevice.returns(cloudDevice);
            deviceManager.healthCheckDevice.resolves(false);
            await vscode.context.workspaceState.update('activeDeviceKey', 'rce:83');

            const result = await localCommands.getHealthyActiveHost();
            assert.isUndefined(result);
        });
    });

    describe('getRemoteHost', () => {
        let localCommands: BrightScriptCommands;
        let deviceManager: any;
        let userInputManager: any;

        beforeEach(() => {
            deviceManager = {
                getDevice: sinon.stub()
            };
            userInputManager = {
                promptForHost: sinon.stub().resolves(undefined)
            };
            localCommands = new BrightScriptCommands({} as any, {} as any, vscode.context, deviceManager, userInputManager, {} as any, {} as any);
            sinon.stub(util, 'getConfiguration').returns({ get: () => undefined } as any);
        });

        afterEach(() => {
            sinon.restore();
        });

        it('does not resolve to a stale LAN ip when the active device is a cloud device', async () => {
            await vscode.context.workspaceState.update('remoteHost', '10.0.0.5');
            await vscode.context.workspaceState.update('activeDeviceKey', 'rce:83');
            deviceManager.getDevice.withArgs('rce:83').returns({ ip: undefined, key: 'rce:83', rce: { id: '83', status: 'running' } });

            let threw: Error | undefined;
            try {
                await localCommands.getRemoteHost(false);
            } catch (e) {
                threw = e as Error;
            }

            assert.include(threw?.message, 'host is required');
            //never fell back to the picker either, since showPrompt is false here
            assert.isFalse(userInputManager.promptForHost.called);
        });

        it('uses the stored remoteHost when the active device is a LAN device', async () => {
            await vscode.context.workspaceState.update('remoteHost', '10.0.0.5');
            await vscode.context.workspaceState.update('activeDeviceKey', 's:abc123');
            deviceManager.getDevice.withArgs('s:abc123').returns({ ip: '10.0.0.5', key: 's:abc123' });

            const host = await localCommands.getRemoteHost(false);

            assert.equal(host, '10.0.0.5');
        });

        it('uses the stored remoteHost when no activeDeviceKey is set (legacy/pre-migration state)', async () => {
            await vscode.context.workspaceState.update('remoteHost', '10.0.0.5');

            const host = await localCommands.getRemoteHost(false);

            assert.equal(host, '10.0.0.5');
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
