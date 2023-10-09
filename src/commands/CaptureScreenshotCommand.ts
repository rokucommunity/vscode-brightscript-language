import * as vscode from 'vscode';
import { extension } from '../extension';
import * as rokuDeploy from 'roku-deploy';
import { BrightScriptCommands } from '../BrightScriptCommands';

export const FILE_SCHEME = 'bs-captureScreenshot';

export class CaptureScreenshotCommand {

    public register(context: vscode.ExtensionContext, BrightScriptCommandsInstance: BrightScriptCommands) {

        context.subscriptions.push(vscode.commands.registerCommand('extension.brightscript.captureScreenshot', async() => {
            await BrightScriptCommandsInstance.getRemoteHost();
            await BrightScriptCommandsInstance.getRemotePassword();
            await BrightScriptCommandsInstance.getWorkspacePath();

            let host = BrightScriptCommandsInstance.host;
            let pass = BrightScriptCommandsInstance.password;
            let outDirPath = BrightScriptCommandsInstance.workspacePath + '/temp/screenshots/';
            let filename = 'screenshot-' + new Date(Date.now()).toISOString();
            let status = await rokuDeploy.takeScreenshot({ host: host, password: pass, outDir: outDirPath, outFile: filename });
            if (status) {
                void vscode.window.showInformationMessage(`Screenshot saved at: ` + status);
            }
        }));
    }
}

export const captureScreenshotCommand = new CaptureScreenshotCommand();
