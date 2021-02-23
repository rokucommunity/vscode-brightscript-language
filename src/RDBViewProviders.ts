import * as vscode from 'vscode';
import * as path from 'path';
import { OnDeviceComponent } from 'roku-test-automation';

export class RDBRegistryViewProvider implements vscode.WebviewViewProvider {
    private view?: vscode.WebviewView;
    private odc?: OnDeviceComponent;
    private rdbBasePath: string;

    constructor(context: vscode.ExtensionContext, private rdbOutputChannel: vscode.OutputChannel) {
        this.rdbBasePath = context.extensionPath + "/dist/ui/rdb"
    }
    
    public setOnDeviceComponent(odc: OnDeviceComponent) {
        this.odc = odc;
        this.populateRegistry();
        this.handleWebViewCommands();
    }

    private async populateRegistry() {
        const {values} = await this.odc.readRegistry({}, {
            timeout: 20000
        });
        this.view?.webview.postMessage({ type: 'readRegistry', values: values });
    }

    private handleWebViewCommands() {
        this.view?.webview.onDidReceiveMessage(
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

    public resolveWebviewView(
        view: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        console.log('resolveWebviewView');
        
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
        webView.onDidReceiveMessage(data => {
            switch (data.type) {
                case 'colorSelected':
                    
                case 'command':
                    
            }
        });
    }
    
    private getHtmlForWebview() {
        const scriptPathOnDisk = vscode.Uri.file(path.join(this.rdbBasePath, '', "index.js"));
        const scriptUri = scriptPathOnDisk.with({ scheme: 'vscode-resource' });
        const stylePathOnDisk = vscode.Uri.file(path.join(this.rdbBasePath, '', "bundle.css"));
        const styleUri = stylePathOnDisk.with({ scheme: 'vscode-resource' });
        return `<!DOCTYPE html>
            <html lang="en">
                <head>
                    <meta charset='utf-8'>
                    <link rel="stylesheet" type="text/css" href="${styleUri}">
                    <base href="${vscode.Uri.file(path.join(this.rdbBasePath, '')).with({ scheme: 'vscode-resource' })}/">
                    <script defer src="${scriptUri}"></script>
                </head>
                <body></body>
            </html>`;
    }
}

export class RDBCommandsViewProvider extends RDBRegistryViewProvider {

}
