import type * as vscode from 'vscode';
import { BaseRdbViewProvider } from './BaseRdbViewProvider';

export class RokuDeviceViewViewProvider extends BaseRdbViewProvider {
    public readonly id = 'rokuDeviceView';

    constructor(context: vscode.ExtensionContext) {
        super(context);

        this.registerCommandWithWebViewNotifier(context, 'extension.brightscript.rokuDeviceView.inspectNodes');
        this.registerCommandWithWebViewNotifier(context, 'extension.brightscript.rokuDeviceView.refreshScreenshot');
        this.registerCommandWithWebViewNotifier(context, 'extension.brightscript.rokuDeviceView.pauseScreenshotCapture');
        this.registerCommandWithWebViewNotifier(context, 'extension.brightscript.rokuDeviceView.resumeScreenshotCapture');
    }
}
