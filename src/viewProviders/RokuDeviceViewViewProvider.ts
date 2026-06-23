import * as vscode from 'vscode';
import type { ChannelPublishedEvent } from 'roku-debug';
import { rokuDeploy } from 'roku-deploy';
import { VscodeCommand } from '../commands/VscodeCommand';
import { BaseRdbViewProvider } from './BaseRdbViewProvider';
import { ViewProviderId } from './ViewProviderId';
import { ViewProviderCommand } from './ViewProviderCommand';

export class RokuDeviceViewViewProvider extends BaseRdbViewProvider {
    public readonly id = ViewProviderId.rokuDeviceView;

    private temporarilyDisableScreenshotCapture = false;
    private resumeScreenshotCapture?: () => void;

    constructor(context: vscode.ExtensionContext, dependencies) {
        super(context, dependencies);

        this.registerCommandWithWebViewNotifier(VscodeCommand.rokuDeviceViewEnableNodeInspector);
        this.registerCommandWithWebViewNotifier(VscodeCommand.rokuDeviceViewDisableNodeInspector);
        this.registerCommandWithWebViewNotifier(VscodeCommand.rokuDeviceViewRefreshScreenshot);
        this.registerCommandWithWebViewNotifier(VscodeCommand.rokuDeviceViewPauseScreenshotCapture);
        this.registerCommandWithWebViewNotifier(VscodeCommand.rokuDeviceViewResumeScreenshotCapture);
        this.registerCommandWithWebViewNotifier(VscodeCommand.rokuDeviceViewCopyScreenshot, () => {
            // In order for copy to be successful the webview has to have focus
            this.view.show(false);
        });

        this.addMessageCommandCallback(ViewProviderCommand.getScreenshot, async (message) => {
            try {
                if (this.temporarilyDisableScreenshotCapture) {
                    // Sometimes we need to temporarily stop screenshot capture as it can prevent successful package deployment to the device
                    // Originally was just returning true here but now we just pause until we resume capturing
                    await new Promise<void>((resolve) => {
                        this.resumeScreenshotCapture = resolve;
                    });
                }
                const result = await this.dependencies.rtaManager.device.getScreenshot();
                this.postOrQueueMessage(this.createResponseMessage(message, {
                    success: true,
                    arrayBuffer: result.buffer.buffer
                }));
            } catch (e) {
                this.postOrQueueMessage(this.createResponseMessage(message, {
                    success: false
                }));
            }
            return true;
        });

        this.addMessageCommandCallback(ViewProviderCommand.restartDevice, async (message) => {
            try {
                const confirm = await vscode.window.showWarningMessage(
                    'Are you sure you want to restart this device? This will close all running channels.',
                    { modal: true },
                    'Restart'
                );

                if (confirm !== 'Restart') {
                    this.postOrQueueMessage(this.createResponseMessage(message, {
                        success: false,
                        cancelled: true
                    }));
                    return true;
                }

                const device = this.dependencies.rtaManager.device;
                const deviceConfig = this.dependencies.rtaManager.deviceConfig;

                if (!device || !deviceConfig) {
                    throw new Error('No device connected');
                }

                await rokuDeploy.rebootDevice({
                    host: deviceConfig.host,
                    password: deviceConfig.password,
                    timeout: 10000
                });

                this.postOrQueueMessage(this.createResponseMessage(message, {
                    success: true
                }));

                void vscode.window.showInformationMessage('Device restart initiated successfully');
            } catch (e) {
                this.postOrQueueMessage(this.createResponseMessage(message, {
                    success: false,
                    error: e.message
                }));
                void vscode.window.showErrorMessage(`Failed to restart device: ${e.message}`);
            }
            return true;
        });

        this.addMessageCommandCallback(ViewProviderCommand.checkForUpdates, async (message) => {
            try {
                const confirm = await vscode.window.showInformationMessage(
                    'Check for software updates on this device? The device will check for and install any available updates.',
                    { modal: true },
                    'Check for Updates'
                );

                if (confirm !== 'Check for Updates') {
                    this.postOrQueueMessage(this.createResponseMessage(message, {
                        success: false,
                        cancelled: true
                    }));
                    return true;
                }

                const device = this.dependencies.rtaManager.device;
                const deviceConfig = this.dependencies.rtaManager.deviceConfig;

                if (!device || !deviceConfig) {
                    throw new Error('No device connected');
                }

                await rokuDeploy.checkForUpdate({
                    host: deviceConfig.host,
                    password: deviceConfig.password,
                    timeout: 10000
                });

                this.postOrQueueMessage(this.createResponseMessage(message, {
                    success: true
                }));

                void vscode.window.showInformationMessage('Software update check initiated successfully');
            } catch (e) {
                this.postOrQueueMessage(this.createResponseMessage(message, {
                    success: false,
                    error: e.message
                }));
                void vscode.window.showErrorMessage(`Failed to check for updates: ${e.message}`);
            }
            return true;
        });
    }

    public onDidStartDebugSession(e: vscode.DebugSession) {
        this.temporarilyDisableScreenshotCapture = true;
    }

    public onDidTerminateDebugSession(e: vscode.DebugSession) {
        // In case we failed to start debugging we want to allow screenshots again
        this.temporarilyDisableScreenshotCapture = false;
        this.resumeScreenshotCapture?.();
        delete this.resumeScreenshotCapture;
    }

    public onChannelPublishedEvent(e: ChannelPublishedEvent) {
        this.temporarilyDisableScreenshotCapture = false;
        this.resumeScreenshotCapture?.();
        delete this.resumeScreenshotCapture;
    }
}
