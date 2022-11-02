import * as vscode from 'vscode';
import { BaseRdbViewProvider } from './BaseRdbViewProvider';

export class RokuRegistryViewProvider extends BaseRdbViewProvider {
    public readonly id = 'rokuRegistryView';

    protected async handleViewMessage(message) {
        const messageHandled = await super.handleViewMessage(message);
        if (messageHandled) {
            return messageHandled;
        }
        switch (message.command) {
            case 'exportRegistry':
                await vscode.window.showSaveDialog({ saveLabel: 'Save' }).then(async (uri) => {
                    await vscode.workspace.fs.writeFile(uri, Buffer.from(JSON.stringify(message.content), 'utf8'));
                });
                return true;
            case 'importRegistry':
                const options: vscode.OpenDialogOptions = {
                    canSelectMany: false,
                    openLabel: 'Select',
                    canSelectFiles: true,
                    canSelectFolders: false
                };
                await vscode.window.showOpenDialog(options).then(this.importContentsToRegistry.bind(this));
        }
    }

    protected async importContentsToRegistry(uri) {
        if (uri?.[0]) {
            const input = await vscode.workspace.fs.readFile(uri[0]);
            const data = Buffer.from(input).toString('utf8');
            this.postOrQueueMessage({ type: 'readRegistry', values: JSON.parse(data) });
        }
    }
}
