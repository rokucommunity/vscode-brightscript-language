import * as vscode from 'vscode';
import * as path from 'path';
import * as rokuDeploy from 'roku-deploy';
import type { BrightScriptCommands } from '../BrightScriptCommands';
import { util } from '../util';

export const FILE_SCHEME = 'bs-captureScreenshot';

export class CaptureScreenshotCommand {
    private context: vscode.ExtensionContext;
    private brightScriptCommands: BrightScriptCommands;

    public register(context: vscode.ExtensionContext, brightScriptCommands: BrightScriptCommands) {
        this.context = context;
        this.brightScriptCommands = brightScriptCommands;
        context.subscriptions.push(vscode.commands.registerCommand('extension.brightscript.captureScreenshot', this.captureScreenshot.bind(this)));
    }

    private async getHostAndPassword(hostParam?: string): Promise<{ host: string; password: string }> {
        let host: string;
        let password: string;

        //if a hostParam was not provided, then go the normal flow for getting info
        if (!hostParam) {
            host = await this.brightScriptCommands.getRemoteHost();
            password = await this.brightScriptCommands.getRemotePassword();

            //the host was provided, probably by clicking the "capture screenshot" link in the tree view. Do we have a password stored as well? If not, prompt for one
        } else {
            host = hostParam;
            let remoteHost = await this.context.workspaceState.get('remoteHost');
            if (host === remoteHost) {
                password = this.context.workspaceState.get('remotePassword');
            } else {
                password = await vscode.window.showInputBox({
                    placeHolder: `Please enter the developer password for host '${host}'`,
                    value: ''
                });
            }
        }

        return { host: host, password: password };
    }

    private async getScreenshotDir() {
        let screenshotDir = util.getConfiguration('brightscript').get<string>('screenshotDir');
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
        return screenshotDir;
    }

    private async captureScreenshot(hostParam?: string) {
        const { host, password } = await this.getHostAndPassword(hostParam);

        let start = Date.now();
        const MIN_PROGRESS_TIME = 850; // Minimum time (in ms) that vscode will ensure the withProgress notification is shown.
        let ensureSleepMin = async () => {
            let elapsed = Date.now() - start;
            if (elapsed < MIN_PROGRESS_TIME) {
                await util.sleep(MIN_PROGRESS_TIME - elapsed);
            }
        };
        try {
            const screenshotPath = await vscode.window.withProgress({
                title: `Capturing screenshot from '${host}'`,
                location: vscode.ProgressLocation.Notification
            }, async (options) => {
                const screenshotDir = await this.getScreenshotDir();

                let screenshotPath = await rokuDeploy.takeScreenshot({
                    host: host,
                    password: password,
                    ...(screenshotDir && { outDir: screenshotDir })
                });

                return screenshotPath;
            });

            if (screenshotPath) {
                await ensureSleepMin();
                await Promise.all([
                    vscode.commands.executeCommand('vscode.open', vscode.Uri.file(screenshotPath)),
                    vscode.window.showInformationMessage(`Screenshot saved at: ` + screenshotPath)
                ]);
            }
        } catch (e) {
            await ensureSleepMin();
            void vscode.window.showErrorMessage('Could not capture screenshot');
        }
    }
}

export const captureScreenshotCommand = new CaptureScreenshotCommand();
