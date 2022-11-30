import * as vscode from 'vscode';
import { BaseRdbViewProvider } from './BaseRdbViewProvider';

export class RokuRegistryViewProvider extends BaseRdbViewProvider {
    public readonly id = 'rokuRegistryView';

    constructor(context: vscode.ExtensionContext) {
        super(context);

        const subscriptions = context.subscriptions;

        subscriptions.push(vscode.commands.registerCommand('extension.brightscript.rokuRegistry.exportRegistry', async () => {
            await vscode.window.showSaveDialog({ saveLabel: 'Save' }).then(async (uri) => {
                const result = await this.onDeviceComponent?.readRegistry();
                await vscode.workspace.fs.writeFile(uri, Buffer.from(JSON.stringify(result?.values), 'utf8'));
            });
        }));

        subscriptions.push(vscode.commands.registerCommand('extension.brightscript.rokuRegistry.importRegistry', async () => {
            const options: vscode.OpenDialogOptions = {
                canSelectMany: false,
                openLabel: 'Select',
                canSelectFiles: true,
                canSelectFolders: false
            };
            await vscode.window.showOpenDialog(options).then(this.importContentsToRegistry.bind(this));
        }));

        subscriptions.push(vscode.commands.registerCommand('extension.brightscript.rokuRegistry.clearRegistry', async () => {
            await this.onDeviceComponent.deleteEntireRegistry();
            await this.sendRegistryUpdated();
        }));

        subscriptions.push(vscode.commands.registerCommand('extension.brightscript.rokuRegistry.refreshRegistry', async () => {
            await this.sendRegistryUpdated();
        }));
    }

    protected async importContentsToRegistry(uri) {
        if (uri?.[0]) {
            const input = await vscode.workspace.fs.readFile(uri[0]);

            const data = JSON.parse(Buffer.from(input).toString('utf8'));
            await this.onDeviceComponent?.writeRegistry({
                values: data
            });
            await this.sendRegistryUpdated();
        }
    }

    protected async sendRegistryUpdated() {
        const result = await this.onDeviceComponent?.readRegistry();
        this.postOrQueueMessage({ name: 'registryUpdated', values: result?.values });
    }
}
