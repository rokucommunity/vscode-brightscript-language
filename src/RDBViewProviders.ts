import * as vscode from 'vscode';
import * as path from 'path';
import { OnDeviceComponent } from 'roku-test-automation';
import * as chokidar from 'chokidar';

import { util } from './util';

export abstract class RDBBaseViewProvider implements vscode.WebviewViewProvider, vscode.Disposable {
    protected view?: vscode.WebviewView;
    protected odc?: OnDeviceComponent;
    protected rdbBasePath: string;
    protected abstract viewName: string;
    private rdbWatcher: chokidar.FSWatcher;

    constructor(context: vscode.ExtensionContext, private rdbOutputChannel: vscode.OutputChannel) {
        this.rdbBasePath = context.extensionPath + "/dist/ui/rdb";
        context.subscriptions.push(this);
    }

    dispose() {
        this.rdbWatcher.close();
    }

    public setOnDeviceComponent(odc: OnDeviceComponent) {
        this.odc = odc;
        this.onOnDeviceComponentReady();
    }

    protected onOnDeviceComponentReady() {}

    protected getHtmlForWebview() {
        if (util.isExtensionHostRunning()) {
            // If we're developing we want to add a watcher to allow hot reload :)
            // Index.js always gets updated so don't have to worry about observing the css file
            this.rdbWatcher = chokidar.watch(`${this.rdbBasePath}/index.js`);
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
                    <script>viewName = '${this.viewName}'</script>
                    <script defer src="${scriptUri}"></script>
                </head>
                <body></body>
            </html>`;
    }

    public resolveWebviewView(
        view: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        view.show(true);

        this.view = view;
        const webView = view.webview;
        webView.options = {
            // Allow scripts in the webview
            enableScripts: true,

            localResourceRoots: [
                vscode.Uri.file(path.join(this.rdbBasePath, ''))
            ]
        };
        webView.html = this.getHtmlForWebview();
    }
}

export class RDBRegistryViewProvider extends RDBBaseViewProvider {
    protected viewName = 'RegistryView';
    protected async onOnDeviceComponentReady() {
        await this.populateRegistry();
        this.handleWebViewCommands();
    }

    private handleWebViewCommands() {
        const view = this.view;
        view.webview.onDidReceiveMessage(
            message => {
                switch (message.command) {
                    case 'updateRegistry':
                    let updatedEntry = {};
                    updatedEntry[message.sectionKey] = this.sanitizeInput(message.updatedValue);
                    this.odc.writeRegistry({
                            values: updatedEntry
                    }, {
                        timeout: 20000
                    });
                    return;
                    case 'showSaveDialog':
                        vscode.window.showSaveDialog({saveLabel: "Save"}).then(uri => {
                            vscode.workspace.fs.writeFile(uri, Buffer.from(JSON.stringify(message.content), 'utf8'));
                        });
                    return;
                    case 'showChooseFileDialog':
                        const options: vscode.OpenDialogOptions = {
                            canSelectMany: false,
                            openLabel: 'Select',
                            canSelectFiles: true,
                            canSelectFolders: false
                        };
                        vscode.window.showOpenDialog(options).then(this.importContentsToRegistry.bind(this));
                    return;
                }
            }
        );
    }

    private async populateRegistry() {
        const {values} = await this.odc.readRegistry({}, {
            timeout: 20000
        });
        // TODO temporary. Will move to front end side most likely
        setInterval(() => {
            this.view?.webview.postMessage({ type: 'readRegistry', values: values });
        }, 5000);
    }

    async importContentsToRegistry(uri) {
        if (uri && uri[0]) {
            const input = await vscode.workspace.fs.readFile(uri[0]);
            const data = Buffer.from(input).toString('utf8');
            this.view?.webview.postMessage({ type: 'readRegistry', values: JSON.parse(data) });
        }
    }

    sanitizeInput(values): object {
        let input = values;
        Object.keys(values).map((key) => {
            if (typeof values[key] == 'object') {
                input[key] = JSON.stringify(values[key]);
            }
        });

        return input;
    }
}

export class RDBCommandsViewProvider extends RDBBaseViewProvider {
    protected viewName = 'CommandsView';
}
