import { expect } from 'chai';
import * as sinonImport from 'sinon';
import { vscode } from '../mockVscode.spec';
import { RokuDeviceViewViewProvider } from './RokuDeviceViewViewProvider';
import { ViewProviderCommand } from './ViewProviderCommand';
import { rokuDeploy } from 'roku-deploy';

let Module = require('module');
const { require: oldRequire } = Module.prototype;
Module.prototype.require = function hijacked(file) {
    if (file === 'vscode') {
        return vscode;
    } else {
        return oldRequire.apply(this, arguments);
    }
};

let sinon: sinonImport.SinonSandbox;
let view;
let callback;
let provider: RokuDeviceViewViewProvider;
let dependencies: any;

beforeEach(() => {
    sinon = sinonImport.createSandbox();
    view = {
        webview: {
            onDidReceiveMessage: (cb) => {
                callback = cb;
            },
            postMessage: (message) => { }
        },
        show: () => { }
    };

    dependencies = {
        rtaManager: {
            device: {
                getScreenshot: sinon.stub().resolves({ buffer: { buffer: new ArrayBuffer(0) } })
            },
            deviceConfig: {
                host: '192.168.1.100',
                password: 'test123'
            },
            onDeviceComponent: {}
        }
    };

    provider = new RokuDeviceViewViewProvider(vscode.context, dependencies) as any;
});

afterEach(() => {
    provider.dispose();
    sinon.restore();
});

describe('RokuDeviceViewViewProvider', () => {
    describe('restartDevice command', () => {
        it('shows confirmation dialog before restarting', async () => {
            const showWarningStub = (sinon.stub(vscode.window, 'showWarningMessage') as any).resolves(undefined);
            const rebootStub = sinon.stub(rokuDeploy, 'rebootDevice').resolves({} as any);

            await provider['resolveWebviewView'](view, {} as any, {} as any);

            const message = {
                command: ViewProviderCommand.restartDevice,
                context: {},
                messageId: '123'
            };

            await callback(message);

            expect(showWarningStub.calledOnce).to.be.true;
            expect(showWarningStub.firstCall.args[0]).to.include('restart this device');
            expect(rebootStub.called).to.be.false; // Should not call reboot when cancelled
        });

        it('calls rokuDeploy.rebootDevice when confirmed', async () => {
            (sinon.stub(vscode.window, 'showWarningMessage') as any).resolves('Restart');
            const rebootStub = sinon.stub(rokuDeploy, 'rebootDevice').resolves({} as any);
            (sinon.stub(vscode.window, 'showInformationMessage') as any).resolves();

            await provider['resolveWebviewView'](view, {} as any, {} as any);

            const message = {
                command: ViewProviderCommand.restartDevice,
                context: {},
                messageId: '123'
            };

            await callback(message);

            expect(rebootStub.calledOnce).to.be.true;
            expect(rebootStub.firstCall.args[0]).to.deep.include({
                host: '192.168.1.100',
                password: 'test123'
            });
        });

        it('shows error message when restart fails', async () => {
            (sinon.stub(vscode.window, 'showWarningMessage') as any).resolves('Restart');
            sinon.stub(rokuDeploy, 'rebootDevice').rejects(new Error('Connection failed'));
            const showErrorStub = (sinon.stub(vscode.window, 'showErrorMessage') as any).resolves();

            await provider['resolveWebviewView'](view, {} as any, {} as any);

            const message = {
                command: ViewProviderCommand.restartDevice,
                context: {},
                messageId: '123'
            };

            await callback(message);

            expect(showErrorStub.calledOnce).to.be.true;
            expect(showErrorStub.firstCall.args[0]).to.include('Failed to restart device');
            expect(showErrorStub.firstCall.args[0]).to.include('Connection failed');
        });

        it('handles missing device configuration', async () => {
            (sinon.stub(vscode.window, 'showWarningMessage') as any).resolves('Restart');
            const showErrorStub = (sinon.stub(vscode.window, 'showErrorMessage') as any).resolves();

            // Remove device config
            dependencies.rtaManager.deviceConfig = null;

            await provider['resolveWebviewView'](view, {} as any, {} as any);

            const message = {
                command: ViewProviderCommand.restartDevice,
                context: {},
                messageId: '123'
            };

            await callback(message);

            expect(showErrorStub.calledOnce).to.be.true;
            expect(showErrorStub.firstCall.args[0]).to.include('No device connected');
        });
    });

    describe('checkForUpdates command', () => {
        it('shows confirmation dialog before checking updates', async () => {
            const showInfoStub = (sinon.stub(vscode.window, 'showInformationMessage') as any).resolves(undefined);
            const checkUpdateStub = sinon.stub(rokuDeploy, 'checkForUpdate').resolves({} as any);

            await provider['resolveWebviewView'](view, {} as any, {} as any);

            const message = {
                command: ViewProviderCommand.checkForUpdates,
                context: {},
                messageId: '123'
            };

            await callback(message);

            expect(showInfoStub.calledOnce).to.be.true; // Only once for confirmation dialog
            expect(showInfoStub.firstCall.args[0]).to.include('Check for software updates');
            expect(checkUpdateStub.called).to.be.false; // Should not call when cancelled
        });

        it('calls rokuDeploy.checkForUpdate when confirmed', async () => {
            const showInfoStub = sinon.stub(vscode.window, 'showInformationMessage') as any;
            showInfoStub.onFirstCall().resolves('Check for Updates');
            showInfoStub.onSecondCall().resolves(undefined);
            const checkUpdateStub = sinon.stub(rokuDeploy, 'checkForUpdate').resolves({} as any);

            await provider['resolveWebviewView'](view, {} as any, {} as any);

            const message = {
                command: ViewProviderCommand.checkForUpdates,
                context: {},
                messageId: '123'
            };

            await callback(message);

            expect(checkUpdateStub.calledOnce).to.be.true;
            expect(checkUpdateStub.firstCall.args[0]).to.deep.include({
                host: '192.168.1.100',
                password: 'test123'
            });
            expect(showInfoStub.calledTwice).to.be.true;
            expect(showInfoStub.secondCall.args[0]).to.include('update check initiated');
        });

        it('shows error message when check fails', async () => {
            (sinon.stub(vscode.window, 'showInformationMessage') as any).resolves('Check for Updates');
            sinon.stub(rokuDeploy, 'checkForUpdate').rejects(new Error('Network error'));
            const showErrorStub = (sinon.stub(vscode.window, 'showErrorMessage') as any).resolves();

            await provider['resolveWebviewView'](view, {} as any, {} as any);

            const message = {
                command: ViewProviderCommand.checkForUpdates,
                context: {},
                messageId: '123'
            };

            await callback(message);

            expect(showErrorStub.calledOnce).to.be.true;
            expect(showErrorStub.firstCall.args[0]).to.include('Failed to check for updates');
            expect(showErrorStub.firstCall.args[0]).to.include('Network error');
        });

        it('handles missing device configuration', async () => {
            (sinon.stub(vscode.window, 'showInformationMessage') as any).resolves('Check for Updates');
            const showErrorStub = (sinon.stub(vscode.window, 'showErrorMessage') as any).resolves();

            // Remove device
            dependencies.rtaManager.device = null;

            await provider['resolveWebviewView'](view, {} as any, {} as any);

            const message = {
                command: ViewProviderCommand.checkForUpdates,
                context: {},
                messageId: '123'
            };

            await callback(message);

            expect(showErrorStub.calledOnce).to.be.true;
            expect(showErrorStub.firstCall.args[0]).to.include('No device connected');
        });
    });
});
