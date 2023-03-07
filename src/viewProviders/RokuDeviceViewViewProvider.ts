import type * as vscode from 'vscode';
import { VscodeCommand } from '../commands/VscodeCommand';
import { BaseRdbViewProvider } from './BaseRdbViewProvider';
import { ViewProviderId } from './ViewProviderId';

export class RokuDeviceViewViewProvider extends BaseRdbViewProvider {
    public readonly id = ViewProviderId.rokuDeviceView;

    constructor(context: vscode.ExtensionContext) {
        super(context);

        this.registerCommandWithWebViewNotifier(context, VscodeCommand.rokuDeviceViewInspectNodes);
        this.registerCommandWithWebViewNotifier(context, VscodeCommand.rokuDeviceViewRefreshScreenshot);
        this.registerCommandWithWebViewNotifier(context, VscodeCommand.rokuDeviceViewPauseScreenshotCapture);
        this.registerCommandWithWebViewNotifier(context, VscodeCommand.rokuDeviceViewResumeScreenshotCapture);
    }
}
