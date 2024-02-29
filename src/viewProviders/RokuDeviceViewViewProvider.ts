import type * as vscode from 'vscode';
import type { ChannelPublishedEvent } from 'roku-debug';
import { VscodeCommand } from '../commands/VscodeCommand';
import { BaseRdbViewProvider } from './BaseRdbViewProvider';
import { ViewProviderId } from './ViewProviderId';
import { ViewProviderCommand } from './ViewProviderCommand';

export class RokuDeviceViewViewProvider extends BaseRdbViewProvider {
    public readonly id = ViewProviderId.rokuDeviceView;

    private temporarilyDisableScreenshotCapture = false;

    constructor(context: vscode.ExtensionContext, dependencies) {
        super(context, dependencies);

        this.registerCommandWithWebViewNotifier(context, VscodeCommand.rokuDeviceViewEnableNodeInspector);
        this.registerCommandWithWebViewNotifier(context, VscodeCommand.rokuDeviceViewDisableNodeInspector);
        this.registerCommandWithWebViewNotifier(context, VscodeCommand.rokuDeviceViewRefreshScreenshot);
        this.registerCommandWithWebViewNotifier(context, VscodeCommand.rokuDeviceViewPauseScreenshotCapture);
        this.registerCommandWithWebViewNotifier(context, VscodeCommand.rokuDeviceViewResumeScreenshotCapture);
        this.registerCommandWithWebViewNotifier(context, VscodeCommand.rokuDeviceViewCopyScreenshot, () => {
            // In order for copy to be successful the webview has to have focus
            this.view.show(false);
        });


        this.addMessageCommandCallback(ViewProviderCommand.getScreenshot, async (message) => {
            try {
                if (this.temporarilyDisableScreenshotCapture) {
                    // Sometimes we need to temporarily stop screenshot capture as it can prevent successful package deployment to the device
                    return;
                }
                const result = await this.dependencies.rtaManager.device.getScreenshot();
                this.postOrQueueMessage({
                    ...message,
                    response: {
                        success: true,
                        arrayBuffer: result.buffer.buffer
                    }
                });
            } catch (e) {
                this.postOrQueueMessage({
                    ...message,
                    response: {
                        success: false
                    }
                });
            }
            return true;
        });
    }

    public onDidStartDebugSession(e: vscode.DebugSession) {
        this.temporarilyDisableScreenshotCapture = true;
    }

    public onChannelPublishedEvent(e: ChannelPublishedEvent) {
        this.temporarilyDisableScreenshotCapture = false;
    }
}
