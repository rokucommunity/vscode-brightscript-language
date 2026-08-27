import * as vscode from 'vscode';
import * as path from 'path';
import { rokuDeploy } from 'roku-deploy';
import type { DeviceTargetManager } from '../managers/DeviceTargetManager';
import { util } from '../util';

export const FILE_SCHEME = 'bs-captureScreenshot';

export class CaptureScreenshotCommand {
    private deviceTargetManager: DeviceTargetManager;

    public register(context: vscode.ExtensionContext, deviceTargetManager: DeviceTargetManager) {
        this.deviceTargetManager = deviceTargetManager;
        context.subscriptions.push(vscode.commands.registerCommand('extension.brightscript.captureScreenshot', this.captureScreenshot.bind(this)));
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

    private async captureScreenshot(reference?: string | { key?: string }) {
        //explicit reference (a tree element's device key or a host string) wins, otherwise the
        //active device - LAN or Roku Cloud Emulator alike, both addressed by their device config
        const target = await this.deviceTargetManager.resolveActiveTargetDevice(reference);
        if (!target) {
            return;
        }
        const password = await this.deviceTargetManager.resolveValidatedPassword(target.device, target.serialNumber, target.label);
        if (password === undefined) {
            return;
        }

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
                title: `Capturing screenshot from '${target.label}'`,
                location: vscode.ProgressLocation.Notification
            }, async (options) => {
                const screenshotDir = await this.getScreenshotDir();

                let screenshotResult = await rokuDeploy.captureScreenshot({
                    device: target.device,
                    password: password,
                    //save the screenshot to disk (in screenshotDir when configured, otherwise the OS temp directory)
                    out: true,
                    ...(screenshotDir && { screenshotDir: screenshotDir })
                });

                return screenshotResult.filePath;
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
