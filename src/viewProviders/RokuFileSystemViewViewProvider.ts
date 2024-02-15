import * as vscode from 'vscode';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { VscodeCommand } from '../commands/VscodeCommand';
import { BaseRdbViewProvider } from './BaseRdbViewProvider';
import { ViewProviderId } from './ViewProviderId';
import { ViewProviderCommand } from './ViewProviderCommand';

export class RokuFileSystemViewViewProvider extends BaseRdbViewProvider {
    public readonly id = ViewProviderId.rokuFileSystemView;

    constructor(context: vscode.ExtensionContext, dependencies) {
        super(context, dependencies);

        this.registerCommandWithWebViewNotifier(context, VscodeCommand.rokuFileSystemViewRefresh);

        this.addMessageCommandCallback(ViewProviderCommand.openRokuFile, async (message) => {
            const pathContentsInfo = message.context;
            const result = await this.dependencies.rtaManager.onDeviceComponent.readFile({
                path: pathContentsInfo.path
            });

            const filePath = path.join(os.tmpdir(), path.basename(pathContentsInfo.path));

            // Write some content to the new file
            fs.writeFileSync(filePath, result.binaryPayload);
            await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(filePath));
            await vscode.commands.executeCommand('workbench.action.files.setActiveEditorReadonlyInSession');
            return true;
        });
    }
}
