import * as vscode from 'vscode';
import * as path from 'path';
import { v4 as uuid } from 'uuid';
import { VscodeCommand } from '../commands/VscodeCommand';
import { BaseRdbViewProvider } from './BaseRdbViewProvider';
import { ViewProviderId } from './ViewProviderId';
import { ViewProviderEvent } from './ViewProviderEvent';

export class RokuAppOverlaysViewViewProvider extends BaseRdbViewProvider {
    public readonly id = ViewProviderId.rokuAppOverlaysView;

    constructor(context: vscode.ExtensionContext, dependencies) {
        super(context, dependencies);

        const subscriptions = context.subscriptions;

        this.registerCommandWithWebViewNotifier(context, VscodeCommand.rokuAppOverlaysViewRemoveAllOverlays);

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
            const [file] = await vscode.window.showOpenDialog(options);
            const name = path.basename(file.path);
            const extension = path.extname(file.path);
            const destinationFileName = path.basename(file.path, extension) + '_' + Date.now() + extension;

            const message = this.createEventMessage(ViewProviderEvent.onRokuAppOverlayAdded, {
                id: uuid(),
                name: name,
                sourcePath: file.path,
                destinationFileName: destinationFileName
            });

            this.postOrQueueMessage(message);
        }));
    }
}