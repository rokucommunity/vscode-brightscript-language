import * as vscode from 'vscode';
import * as path from 'path';
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
            const imagePath = path.relative(this.webviewBasePath, filePath);

            const name = path.basename(filePath);
            const extension = path.extname(filePath);
            const destinationFileName = path.basename(filePath, extension) + '_' + Date.now() + extension;

            const message = this.createEventMessage(ViewProviderEvent.onRokuAppOverlayAdded, {
                id: uuid(),
                name: name,
                sourcePath: filePath,
                destinationFileName: destinationFileName,
                imagePath: imagePath
            });

            this.postOrQueueMessage(message);
        }));
    }
}
