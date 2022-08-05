import * as vscode from 'vscode';
import * as path from 'path';
import * as rta from 'roku-test-automation';
import * as fs from 'fs';

import { BaseWebviewViewProvider } from './BaseWebviewViewProvider';

export abstract class RDBBaseViewProvider extends BaseWebviewViewProvider {
    protected onDeviceComponent?: rta.OnDeviceComponent;

    protected odcCommands: Array<keyof rta.OnDeviceComponent> = [
        'callFunc',
        'deleteEntireRegistry',
        'deleteRegistrySections',
        'getFocusedNode',
        'getValueAtKeyPath',
        'getValuesAtKeyPaths',
        'getNodesInfoAtKeyPaths',
        'hasFocus',
        'isInFocusChain',
        'observeField',
        'readRegistry',
        'setValueAtKeyPath',
        'writeRegistry',
        'storeNodeReferences',
        'deleteNodeReferences'
    ];

    // @param odc - The OnDeviceComponent class instance. If undefined existing instance will be removed. Used to notify webview of change in ODC status
    public setOnDeviceComponent(onDeviceComponent?: rta.OnDeviceComponent) {
        this.onDeviceComponent = onDeviceComponent;

        this.postOrQueueMessage({
            name: 'onDeviceComponentStatus',
            available: onDeviceComponent ? true : false
        });
    }

    protected onViewReady() {
        // Always post back the ODC status so we make sure the client doesn't miss it if it got refreshed
        this.setOnDeviceComponent(this.onDeviceComponent);
    }

    protected async handleViewMessage(message) {
        const { command, context } = message;
        if (this.odcCommands.includes(command)) {
            const response = await this.onDeviceComponent[command](context.args, context.options);
            this.postMessage({
                ...message,
                response: response
            });
            return true;
        }

        return false;
    }
}

export class RDBRegistryPanelProvider extends RDBBaseViewProvider {
    protected viewName = 'RegistryPanel';

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

export class RDBCommandsPanelProvider extends RDBBaseViewProvider {
    protected viewName = 'CommandsPanel';

    protected additionalScriptContents() {
        const requestArgsPath = path.join(rta.utils.getServerFilesPath(), 'requestArgs.schema.json');

        return `const requestArgsSchema = ${fs.readFileSync(requestArgsPath, 'utf8')};
                const odcCommands = ['${this.odcCommands.join(`','`)}'];`;
    }
}

export class SceneGraphInspectorViewProvider extends RDBBaseViewProvider {
    protected viewName = 'SceneGraphInspectorPanel';
}
