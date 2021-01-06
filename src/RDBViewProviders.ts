import * as vscode from 'vscode';
import * as path from 'path';
import { OnDeviceComponent } from 'roku-test-automation';

export class RDBRegistryViewProvider implements vscode.WebviewViewProvider {
    private view?: vscode.WebviewView;
    private odc?: OnDeviceComponent;
    private extensionPath: string;

    constructor(context: vscode.ExtensionContext, private rdbOutputChannel: vscode.OutputChannel) {
        this.extensionPath = context.extensionPath + "/dist/ui/rdb"
    }
    
    public setOnDeviceComponent(odc: OnDeviceComponent) {
        this.odc = odc;
        this.populateRegistry();
    }

    private async populateRegistry() {
        const {values} = await this.odc.readRegistry({}, {
            timeout: 20000
        });
        console.log('populateRegistry', values);
        this.view?.webview.postMessage({ type: 'readRegistry', values: values });
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
				vscode.Uri.file(path.join(this.extensionPath, ''))
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
		const scriptPathOnDisk = vscode.Uri.file(path.join(this.extensionPath, '', "index.js"));
		const scriptUri = scriptPathOnDisk.with({ scheme: 'vscode-resource' });
		const stylePathOnDisk = vscode.Uri.file(path.join(this.extensionPath, '', "bundle.css"));
		const styleUri = stylePathOnDisk.with({ scheme: 'vscode-resource' });
		// Use a nonce to whitelist which scripts can be run
        const nonce = this.getNonce();
        
		return `<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset='utf-8'>
				<meta name='viewport' content='width=device-width,initial-scale=1'>
				<link rel="stylesheet" type="text/css" href="${styleUri}">
                <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src vscode-resource: https:; script-src 'nonce-${nonce}';style-src vscode-resource: 'unsafe-inline' http: https: data:;">
                <base href="${vscode.Uri.file(path.join(this.extensionPath, '')).with({ scheme: 'vscode-resource' })}/">
				<script defer nonce="${nonce}" src="${scriptUri}"></script>
			</head>

			<body>
				
			</body>
			</html>`;
    }

    getNonce() {
        let text = "";
        const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
        for (let i = 0; i < 32; i++) {
            text += possible.charAt(Math.floor(Math.random() * possible.length));
        }
        return text;
    }
}

export class RDBCommandsViewProvider extends RDBRegistryViewProvider {

}
