import * as vscode from 'vscode';
import * as path from 'path';
import * as rokuDeploy from 'roku-deploy';
import type { BrightScriptCommands } from '../BrightScriptCommands';

export const FILE_SCHEME = 'bs-captureScreenshot';

export class CaptureScreenshotCommand {

    public register(context: vscode.ExtensionContext, BrightScriptCommandsInstance: BrightScriptCommands) {
        context.subscriptions.push(vscode.commands.registerCommand('extension.brightscript.captureScreenshot', async (hostParam?: string) => {
            let host: string;
            let password: string;

            //if a hostParam was not provided, then go the normal flow for getting info
            if (!hostParam) {
                host = await BrightScriptCommandsInstance.getRemoteHost();
                password = await BrightScriptCommandsInstance.getRemotePassword();

                //the host was provided, probably by clicking the "capture screenshot" link in the tree view. Do we have a password stored as well? If not, prompt for one
            } else {
                host = hostParam;
                let remoteHost = await context.workspaceState.get('remoteHost');
                if (host === remoteHost) {
                    password = context.workspaceState.get('remotePassword');
                } else {
                    password = await vscode.window.showInputBox({
                        placeHolder: `Please enter the developer password for host '${host}'`,
                        value: ''
                    });
                }
            }

            await vscode.window.withProgress({
                title: `Capturing screenshot from '${host}'`,
                location: vscode.ProgressLocation.Notification
            }, async () => {
                try {
                    let screenshotDir = vscode.workspace.getConfiguration('brightscript').get<string>('screenshotDir');
                    if (screenshotDir) {
                        let workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
                        if (vscode.workspace.workspaceFolders?.length > 1) {
                            const workspaceFolder = await vscode.window.showWorkspaceFolderPick();
                            if (workspaceFolder) {
                                workspacePath = workspaceFolder.uri.fsPath;
                            }
                        }

                        screenshotDir = screenshotDir.replace('${workspaceFolder}', workspacePath);
                        screenshotDir = path.resolve(workspacePath ?? process.cwd(), screenshotDir);
                    }


                    let screenshotPath = await rokuDeploy.takeScreenshot({
                        host: host,
                        password: password,
                        ...(screenshotDir && { outDir: screenshotDir })
                    });
                    if (screenshotPath) {
                        void vscode.window.showInformationMessage(`Screenshot saved at: ` + screenshotPath);
                        void vscode.commands.executeCommand('vscode.open', vscode.Uri.file(screenshotPath));
                    }
                } catch (e) {
                    void vscode.window.showErrorMessage('Could not capture screenshot');
                }
            });
        }));
    }
}

export const captureScreenshotCommand = new CaptureScreenshotCommand();
