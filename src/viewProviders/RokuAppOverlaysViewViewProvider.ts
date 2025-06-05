import * as vscode from 'vscode';
import * as path from 'path';
import { promises as fs } from 'fs';
import { v4 as uuid } from 'uuid';
import { VscodeCommand } from '../commands/VscodeCommand';
import { BaseRdbViewProvider } from './BaseRdbViewProvider';
import { ViewProviderId } from './ViewProviderId';
import { ViewProviderEvent } from './ViewProviderEvent';
import { ViewProviderCommand } from './ViewProviderCommand';

export class RokuAppOverlaysViewViewProvider extends BaseRdbViewProvider {
    public readonly id = ViewProviderId.rokuAppOverlaysView;

    constructor(context: vscode.ExtensionContext, dependencies) {
        super(context, dependencies);

        const subscriptions = context.subscriptions;

        this.registerCommandWithWebViewNotifier(VscodeCommand.rokuAppOverlaysViewRemoveAllOverlays);

        this.addMessageCommandCallback(ViewProviderCommand.openRokuFile, async (message) => {
            const filePath = message.context.filePath;
            await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(filePath));
            await vscode.commands.executeCommand('workbench.action.files.setActiveEditorReadonlyInSession');
            return true;
        });

        this.addMessageCommandCallback(ViewProviderCommand.loadRokuAppOverlaysThumbnails, async (message) => {
            return new Promise((resolve, reject) => {
                const overlays = message.context.overlays;
                const index = message.context.index;
                this.getDataUriFromFile(overlays[index].sourcePath).then((imageData) => {
                    overlays[index].imageData = imageData;
                    const response = this.createEventMessage(ViewProviderEvent.onRokuAppOverlayThumbnailsLoaded, {
                        overlays: overlays
                    });
                    this.postOrQueueMessage(response);
                    resolve(true);
                }).catch((e) => {
                    console.error(`Error loading overlay thumbnails: ${e.message}`);
                    reject(e);
                });
            });
        });

        subscriptions.push(vscode.commands.registerCommand(VscodeCommand.rokuAppOverlaysViewAddNewOverlay, async () => {
            const options: vscode.OpenDialogOptions = {
                canSelectMany: false,
                openLabel: 'Add Overlay',
                canSelectFiles: true,
                canSelectFolders: false,
                filters: {
                    Images: ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif']
                }
            };
            const filePath = (await vscode.window.showOpenDialog(options))[0]?.fsPath;
            const extension = path.extname(filePath);
            const name = path.basename(filePath, extension);
            const destinationFileName = path.basename(filePath, extension) + '_' + Date.now() + extension;

            const message = this.createEventMessage(ViewProviderEvent.onRokuAppOverlayAdded, {
                id: uuid(),
                name: name,
                sourcePath: filePath,
                destinationFileName: destinationFileName
            });

            this.postOrQueueMessage(message);
        }));
    }

    private async getDataUriFromFile(filePath) {
        try {
            const contents = await fs.readFile(filePath, { encoding: 'base64' });
            const base64String = `data:image/png;base64, ${contents}`;
            return base64String;
        } catch (error) {
            console.error(`Error reading or encoding file: ${error.message}`);
            return null;
        }
    }
}
