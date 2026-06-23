import type * as vscode from 'vscode';
import type { ChannelPublishedEvent } from 'roku-debug';
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
