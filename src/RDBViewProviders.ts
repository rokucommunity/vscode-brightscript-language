import * as vscode from 'vscode';
import * as path from 'path';
import * as rta from 'roku-test-automation';
import * as chokidar from 'chokidar';
import * as fs from 'fs';

import { util } from './util';

export abstract class RDBBaseViewProvider implements vscode.WebviewViewProvider, vscode.Disposable {
    constructor(context: vscode.ExtensionContext) {
        this.rdbBasePath = path.join(context.extensionPath, 'dist', 'ui', 'rdb');
        context.subscriptions.push(this);
    }

    protected abstract viewName: string;

    protected view?: vscode.WebviewView;
    protected onDeviceComponent?: rta.OnDeviceComponent;
    protected rdbBasePath: string;
    private rdbWatcher: chokidar.FSWatcher;
    private viewReady = false;
    private queuedMessages = [];

    private odcCommands: Array<keyof rta.OnDeviceComponent> = [
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

    public dispose() {
        void this.rdbWatcher?.close();
    }

    // @param odc - The OnDeviceComponent class instance. If undefined existing instance will be removed. Used to notify webview of change in ODC status
    public setOnDeviceComponent(onDeviceComponent?: rta.OnDeviceComponent) {
        this.onDeviceComponent = onDeviceComponent;

        this.postMessage({
            name: 'onDeviceComponentStatus',
            available: onDeviceComponent ? true : false
        });
    }

    protected postMessage(message) {
        this.view?.webview.postMessage(message).then(null, (reason) => {
            console.log('postMessage failed: ', reason);
        });
    }

    private postQueuedMessages() {
        for (const queuedMessage of this.queuedMessages) {
            this.postMessage(queuedMessage);
        }
    }

    protected postOrQueueMessage(message) {
        if (this.viewReady) {
            this.postMessage(message);
        } else {
            this.queuedMessages.push(message);
        }
    }

    private setupViewMessageObserver(webview: vscode.Webview) {
        webview.onDidReceiveMessage(async (message) => {
            try {
                const context = message.context;
                const command = message.command;

                if (command === 'viewReady') {
                    this.viewReady = true;
                    // Always post back the ODC status so we make sure the client doesn't miss it if it got refreshed
                    this.setOnDeviceComponent(this.onDeviceComponent);
                    this.postQueuedMessages();
                } else if (this.odcCommands.includes(command)) {
                    const response = await this.onDeviceComponent[command](context.args, context.options);
                    this.postMessage({
                        ...message,
                        response: response
                    });
                } else {
                    this.handleViewMessage(message);
                }
            } catch (e) {
                this.postMessage({
                    ...message,
                    error: e.message
                });
            }
        });
    }

    protected handleViewMessage(message) { }

    /** Adds ability to add additional script contents to the main webview html */
    protected additionalScriptContents() {
        return '';
    }

    protected getHtmlForWebview() {
        if (util.isExtensionHostRunning()) {
            // If we're developing we want to add a watcher to allow hot reload :)
            // Index.js always gets updated so don't have to worry about observing the css file
            this.rdbWatcher = chokidar.watch(path.join(this.rdbBasePath, 'index.js'));
            this.rdbWatcher.on('change', () => {
                // We have to change this to get it to update so we store it first and set it back after
                const html = this.view.webview.html;
                this.view.webview.html = '';
                this.view.webview.html = html;
            });
        }
        const scriptUri = vscode.Uri.file(path.join(this.rdbBasePath, 'index.js')).with({ scheme: 'vscode-resource' });
        const styleUri = vscode.Uri.file(path.join(this.rdbBasePath, 'bundle.css')).with({ scheme: 'vscode-resource' });

        return `<!DOCTYPE html>
            <html lang="en">
                <head>
                    <meta charset='utf-8'>
                    <link rel="stylesheet" type="text/css" href="${styleUri}">
                    <base href="${vscode.Uri.file(this.rdbBasePath).with({ scheme: 'vscode-resource' })}/">
                    <script>
                        viewName = '${this.viewName}';
                        const odcCommands = ['${this.odcCommands.join(`','`)}'];
                        ${this.additionalScriptContents()}
                    </script>
                    <script defer src="${scriptUri}"></script>
                </head>
                <body style="padding: 0"></body>
            </html>`;
    }

    public resolveWebviewView(
        view: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ) {
        this.view = view;
        const webview = view.webview;
        this.setupViewMessageObserver(webview);

        webview.options = {
            // Allow scripts in the webview
            enableScripts: true,

            localResourceRoots: [
                vscode.Uri.file(this.rdbBasePath)
            ]
        };
        webview.html = this.getHtmlForWebview();
    }
}

export class RDBRegistryViewProvider extends RDBBaseViewProvider {
    protected viewName = 'RegistryView';

    protected async handleViewMessage(message) {
        switch (message.command) {
            case 'exportRegistry':
                await vscode.window.showSaveDialog({ saveLabel: 'Save' }).then(async (uri) => {
                    await vscode.workspace.fs.writeFile(uri, Buffer.from(JSON.stringify(message.content), 'utf8'));
                });
                return;
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
            this.postMessage({ type: 'readRegistry', values: JSON.parse(data) });
        }
    }
}

export class RDBCommandsViewProvider extends RDBBaseViewProvider {
    protected viewName = 'CommandsView';

    protected additionalScriptContents() {
        const requestArgsPath = path.join(rta.utils.getServerFilesPath(), 'requestArgs.schema.json');
        return `const requestArgsSchema = ${fs.readFileSync(requestArgsPath, 'utf8')}`;
    }
}

export class SceneGraphInspectorViewProvider extends RDBBaseViewProvider {
    protected viewName = 'SceneGraphInspectorPanel';
}
