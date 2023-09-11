import * as vscode from 'vscode';
import { VscodeCommand } from '../commands/VscodeCommand';
import { BaseRdbViewProvider } from './BaseRdbViewProvider';
import { ViewProviderEvent } from './ViewProviderEvent';
import { ViewProviderId } from './ViewProviderId';

export class RokuRegistryViewProvider extends BaseRdbViewProvider {
    public readonly id = ViewProviderId.rokuRegistryView;

    constructor(context: vscode.ExtensionContext, dependencies) {
        super(context, dependencies);

        const subscriptions = context.subscriptions;

        subscriptions.push(vscode.commands.registerCommand(VscodeCommand.rokuRegistryExportRegistry, async () => {
            await vscode.window.showSaveDialog({ saveLabel: 'Save' }).then(async (uri) => {
                const result = await this.dependencies.rtaManager.onDeviceComponent?.readRegistry();
                await vscode.workspace.fs.writeFile(uri, Buffer.from(JSON.stringify(result?.values), 'utf8'));
            });
        }));

        subscriptions.push(vscode.commands.registerCommand(VscodeCommand.rokuRegistryImportRegistry, async () => {
            const options: vscode.OpenDialogOptions = {
                canSelectMany: false,
                openLabel: 'Select',
                canSelectFiles: true,
                canSelectFolders: false
            };
            await vscode.window.showOpenDialog(options).then(this.importContentsToRegistry.bind(this));
        }));

        subscriptions.push(vscode.commands.registerCommand(VscodeCommand.rokuRegistryClearRegistry, async () => {
            await this.dependencies.rtaManager.onDeviceComponent.deleteEntireRegistry();
            this.sendRegistryUpdated();
        }));

        subscriptions.push(vscode.commands.registerCommand(VscodeCommand.rokuRegistryRefreshRegistry, () => {
            this.sendRegistryUpdated();
        }));
    }

    protected async importContentsToRegistry(uri) {
        if (uri?.[0]) {
            const input = await vscode.workspace.fs.readFile(uri[0]);

            const data = JSON.parse(Buffer.from(input).toString('utf8'));
            await this.dependencies.rtaManager.onDeviceComponent?.writeRegistry({
                values: data
            });
            this.sendRegistryUpdated();
        }
    }

    protected sendRegistryUpdated() {
        this.postOrQueueMessage(this.createEventMessage(ViewProviderEvent.onRegistryUpdated));
    }
}
