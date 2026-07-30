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
import { DeviceTargetManager } from './managers/DeviceTargetManager';
import { util } from './util';
import { rokuDeploy } from 'roku-deploy';
import { vscodeContextManager } from './managers/VscodeContextManager';

describe('BrightScriptFileUtils ', () => {
    let commands: BrightScriptCommands;
    let commandsMock;
    let languagesMock;

    beforeEach(() => {
        commands = new BrightScriptCommands({} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any);
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
            localCommands = new BrightScriptCommands({} as any, {} as any, vscode.context, {} as any, {} as any, {} as any, {} as any, {} as any);
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
            localCommands = new BrightScriptCommands({} as any, {} as any, vscode.context, {} as any, {} as any, {} as any, {} as any, {} as any);
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
            localCommands = new BrightScriptCommands({} as any, {} as any, vscode.context, deviceManager, userInputManager, {} as any, {} as any, new DeviceTargetManager(vscode.context, deviceManager, userInputManager));
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

        it('sets activeDeviceKey and remoteControlDeviceKey for a LAN device selected by key', async () => {
            deviceManager.getDevice.withArgs('s:abc123').returns({ ip: '1.2.3.4', key: 's:abc123' });

            await capturedCommands['extension.brightscript.setActiveDevice']({ key: 's:abc123' });

            //the user's explicit pick moves both identities: the active device AND the
            //remote-control target it implies
            assert.equal(vscode.context.workspaceState.get('activeDeviceKey'), 's:abc123');
            assert.equal(vscode.context.workspaceState.get('remoteControlDeviceKey'), 's:abc123');
        });

        it('sets activeDeviceKey and remoteControlDeviceKey for a cloud device selected by key', async () => {
            deviceManager.getDevice.withArgs('rce:83').returns({ ip: undefined, key: 'rce:83', rce: { id: '83', status: 'running' } });

            await capturedCommands['extension.brightscript.setActiveDevice']({ key: 'rce:83' });

            assert.equal(vscode.context.workspaceState.get('activeDeviceKey'), 'rce:83');
            assert.equal(vscode.context.workspaceState.get('remoteControlDeviceKey'), 'rce:83');
        });

        it('resolves a cloud device picked from the fallback picker', async () => {
            const cloudDeviceOption = { id: '83', rceToken: 'secret' };
            userInputManager.promptForHost.resolves({ host: undefined, deviceInfo: undefined, device: cloudDeviceOption, rce: { status: 'running' } });
            deviceManager.getDeviceByDeviceConfig.withArgs(cloudDeviceOption).returns({ ip: undefined, key: 'rce:83', rce: { id: '83', status: 'running' } });

            await capturedCommands['extension.brightscript.setActiveDevice']();

            assert.equal(vscode.context.workspaceState.get('activeDeviceKey'), 'rce:83');
            assert.equal(vscode.context.workspaceState.get('remoteControlDeviceKey'), 'rce:83');
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

        it('clearActiveDevice clears activeDeviceKey and remoteControlDeviceKey', async () => {
            await vscode.context.workspaceState.update('activeDeviceKey', 's:abc123');
            await vscode.context.workspaceState.update('remoteControlDeviceKey', 's:abc123');

            await capturedCommands['extension.brightscript.clearActiveDevice']();

            assert.equal(vscode.context.workspaceState.get('activeDeviceKey'), '');
            assert.equal(vscode.context.workspaceState.get('remoteControlDeviceKey'), '');
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
                getDevice: sandbox.stub(),
                getDeviceByDeviceConfig: sandbox.stub()
            };
            localCommands = new BrightScriptCommands({} as any, {} as any, vscode.context, deviceManager, {} as any, {} as any, {} as any, {} as any);
            keyPressStub = sandbox.stub(rokuDeploy, 'keyPress').resolves({} as any);
        });

        afterEach(() => {
            sandbox.restore();
        });

        it('sends the resolved remote-control device and key to rokuDeploy.keyPress', async () => {
            const lanDevice = { host: '10.0.0.5' };
            await vscode.context.workspaceState.update('remoteControlDeviceKey', 's:abc123');
            deviceManager.getDevice.withArgs('s:abc123').returns({ device: lanDevice });

            await localCommands.sendRemoteCommand('Select');

            assert.isTrue(keyPressStub.calledOnce);
            assert.deepEqual(keyPressStub.firstCall.args[0], { device: lanDevice, key: 'Select' });
        });

        it('prefixes literal characters with Lit_ before sending', async () => {
            const lanDevice = { host: '10.0.0.5' };
            await vscode.context.workspaceState.update('remoteControlDeviceKey', 's:abc123');
            deviceManager.getDevice.withArgs('s:abc123').returns({ device: lanDevice });

            await localCommands.sendRemoteCommand('a', undefined, true);

            assert.isTrue(keyPressStub.calledOnce);
            assert.equal(keyPressStub.firstCall.args[0].key, 'Lit_a');
        });

        it('resolves a tree element target through the device manager, cloud devices included', async () => {
            const cloudDevice = { instanceUrl: 'https://rce.example.com/instance', rceToken: 'super-secret-token' };
            deviceManager.getDevice.withArgs('rce:83').returns({ device: cloudDevice });

            await localCommands.sendRemoteCommand('InputHDMI1', { key: 'rce:83' });

            assert.deepEqual(keyPressStub.firstCall.args[0], { device: cloudDevice, key: 'InputHDMI1' });
        });

        it('falls back to the remote-control device when a tree element key is unknown', async () => {
            const lanDevice = { host: '10.0.0.5' };
            await vscode.context.workspaceState.update('remoteControlDeviceKey', 's:abc123');
            deviceManager.getDevice.withArgs('s:abc123').returns({ device: lanDevice });
            deviceManager.getDevice.withArgs('stale-key').returns(undefined);

            await localCommands.sendRemoteCommand('Select', { key: 'stale-key' });

            assert.deepEqual(keyPressStub.firstCall.args[0], { device: lanDevice, key: 'Select' });
        });

        it('forwards a cloud emulator device config to rokuDeploy.keyPress', async () => {
            const cloudDevice = { instanceUrl: 'https://rce.example.com/instance', rceToken: 'super-secret-token' };
            await vscode.context.workspaceState.update('remoteControlDeviceKey', 'rce:83');
            deviceManager.getDevice.withArgs('rce:83').returns({ device: cloudDevice });

            await localCommands.sendRemoteCommand('Home');

            assert.deepEqual(keyPressStub.firstCall.args[0], { device: cloudDevice, key: 'Home' });
        });

        it('sends the explicit host as a LAN device config, ignoring the remote-control device', async () => {
            deviceManager.getDevice.withArgs('s:abc123').returns({ device: { host: '10.0.0.5' } });
            await vscode.context.workspaceState.update('remoteControlDeviceKey', 's:abc123');

            await localCommands.sendRemoteCommand('Select', '192.168.1.50');

            assert.deepEqual(keyPressStub.firstCall.args[0], { device: { host: '192.168.1.50' }, key: 'Select' });
        });

        it('the picker fallback flows a cloud pick through and remembers it as the remote-control device', async () => {
            //no remembered remote-control device
            await vscode.context.workspaceState.update('remoteControlDeviceKey', '');
            await vscode.context.workspaceState.update('activeDeviceKey', '');
            const cloudDevice = { id: '83', rceToken: 'super-secret-token' };
            deviceManager.getDeviceByDeviceConfig.withArgs(cloudDevice).returns({ key: 'rce:83', device: cloudDevice, rce: { id: '83', status: 'running' } });
            const userInputManager = {
                promptForHost: sandbox.stub().resolves({ host: undefined, deviceInfo: undefined, device: cloudDevice, rce: { status: 'running' } })
            };
            const promptCommands = new BrightScriptCommands({} as any, {} as any, vscode.context, deviceManager, userInputManager as any, {} as any, {} as any, {} as any);

            await promptCommands.sendRemoteCommand('Home');

            assert.isTrue(userInputManager.promptForHost.calledOnce);
            assert.deepEqual(keyPressStub.firstCall.args[0], { device: cloudDevice, key: 'Home' });
            //the pick becomes the remote-control device, so the next command skips the picker...
            assert.equal(vscode.context.workspaceState.get('remoteControlDeviceKey'), 'rce:83');
            //...but never the user's explicit active device
            assert.equal(vscode.context.workspaceState.get('activeDeviceKey'), '');
        });

        it('a ${promptForHost} placeholder in the host setting never reaches the device as a literal host', async () => {
            //the exact setup that produced "getaddrinfo ENOTFOUND ${promptForHost}": no remembered
            //device and the remoteControl host setting holds the placeholder
            await vscode.context.workspaceState.update('remoteControlDeviceKey', '');
            (vscode.workspace as any)._configuration = (vscode.workspace as any)._configuration ?? {};
            // eslint-disable-next-line no-template-curly-in-string
            (vscode.workspace as any)._configuration['brightscript.remoteControl.host'] = '${promptForHost}';
            try {
                const cloudDevice = { id: '83', rceToken: 'super-secret-token' };
                deviceManager.getDeviceByDeviceConfig.withArgs(cloudDevice).returns({ key: 'rce:83', device: cloudDevice, rce: { id: '83', status: 'running' } });
                const userInputManager = {
                    promptForHost: sandbox.stub().resolves({ host: undefined, deviceInfo: undefined, device: cloudDevice, rce: { status: 'running' } })
                };
                const promptCommands = new BrightScriptCommands({} as any, {} as any, vscode.context, deviceManager, userInputManager as any, {} as any, {} as any, {} as any);

                await promptCommands.sendRemoteCommand('Down');

                //the placeholder was treated as "no host": the picker ran and the cloud pick won
                assert.isTrue(userInputManager.promptForHost.calledOnce);
                assert.deepEqual(keyPressStub.firstCall.args[0], { device: cloudDevice, key: 'Down' });
            } finally {
                delete (vscode.workspace as any)._configuration['brightscript.remoteControl.host'];
            }
        });

        it('the picker fallback remembers a LAN pick as the remote-control device', async () => {
            await vscode.context.workspaceState.update('remoteControlDeviceKey', '');
            const userInputManager = {
                promptForHost: sandbox.stub().resolves({ host: '10.0.0.9', deviceInfo: {}, device: { host: '10.0.0.9' } })
            };
            const promptCommands = new BrightScriptCommands({} as any, {} as any, vscode.context, deviceManager, userInputManager as any, {} as any, {} as any, {} as any);

            await promptCommands.sendRemoteCommand('Select');

            assert.deepEqual(keyPressStub.firstCall.args[0], { device: { host: '10.0.0.9' }, key: 'Select' });
            assert.equal(vscode.context.workspaceState.get('remoteControlDeviceKey'), 'i:10.0.0.9');
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
            localCommands = new BrightScriptCommands({} as any, {} as any, vscode.context, deviceManager, userInputManager, {} as any, {} as any, new DeviceTargetManager(vscode.context, deviceManager, userInputManager));

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
            assert.deepEqual(args.device, { host: '1.2.3.4' });
            assert.equal(args.serialNumber, 'SN123');
            assert.deepEqual(args.extraCandidates, ['global-pw']);
        });

        it('restarts a cloud emulator device through its device config without probing a host', async () => {
            const cloudDeviceConfig = { instanceUrl: 'https://rce.example.com/instance', rceToken: 'super-secret-token' };
            const cloudDevice = { key: 'rce:83', serialNumber: 'ESN83', device: cloudDeviceConfig, rce: { id: '83', status: 'running' }, deviceInfo: {} };
            deviceManager.getDevice.withArgs('rce:83').returns(cloudDevice);
            deviceManager.getDeviceDisplayName.returns('Chris (cloud emulator)');

            await localCommands.restartDevice({ key: 'rce:83' });

            assert.isFalse(deviceManager.validateAndAddDevice.called);
            assert.deepEqual(userInputManager.resolveDevicePassword.firstCall.args[0].device, cloudDeviceConfig);
            assert.equal(userInputManager.resolveDevicePassword.firstCall.args[0].serialNumber, 'ESN83');
            assert.deepEqual(rebootStub.firstCall.args[0].device, cloudDeviceConfig);
        });

        it('checks for updates on a cloud emulator device through its device config', async () => {
            const cloudDeviceConfig = { instanceUrl: 'https://rce.example.com/instance', rceToken: 'super-secret-token' };
            const cloudDevice = { key: 'rce:83', serialNumber: 'ESN83', device: cloudDeviceConfig, rce: { id: '83', status: 'running' }, deviceInfo: {} };
            deviceManager.getDevice.withArgs('rce:83').returns(cloudDevice);

            await localCommands.checkForUpdates({ key: 'rce:83' });

            assert.isFalse(deviceManager.validateAndAddDevice.called);
            assert.deepEqual(checkForUpdateStub.firstCall.args[0].device, cloudDeviceConfig);
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

            it('passes the tree element through for the shared reference resolution', async () => {
                const element = { key: 'SN123' };

                await capturedCommands['extension.brightscript.devicesView.restartDevice'](element);
                await capturedCommands['extension.brightscript.devicesView.checkAndInstallUpdates'](element);

                assert.isTrue(restartStub.calledOnce);
                assert.equal(restartStub.firstCall.args[0], element);
                assert.isTrue(updatesStub.calledOnce);
                assert.equal(updatesStub.firstCall.args[0], element);
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
            localCommands = new BrightScriptCommands({} as any, {} as any, vscode.context, deviceManager, {} as any, {} as any, {} as any, new DeviceTargetManager(vscode.context, deviceManager, {} as any));
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

        it('returns undefined when no active device is set', async () => {
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
