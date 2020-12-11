import * as vscode from 'vscode';
import { OnDeviceComponent } from 'roku-test-automation';

export class RDBRegistryViewProvider implements vscode.WebviewViewProvider {
    private view?: vscode.WebviewView;
    private odc?: OnDeviceComponent;

    constructor(context: vscode.ExtensionContext, private rdbOutputChannel: vscode.OutputChannel) {}
    
    public setOnDeviceComponent(odc: OnDeviceComponent) {
        this.odc = odc;
        this.populateRegistry();
    }

    private async populateRegistry() {
        const {values} = await this.odc.readRegistry();
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

		webView.html = this.getHtmlForWebview();

		webView.onDidReceiveMessage(data => {
			switch (data.type) {
				case 'colorSelected':
					
				case 'command':
					
			}
        });
    }
    
    private getHtmlForWebview() {    
        return `<button class="add-color-button">Add Color</button>`;
    }
}

export class RDBCommandsViewProvider extends RDBRegistryViewProvider {

}
