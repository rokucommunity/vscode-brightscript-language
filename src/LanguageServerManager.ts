import {
    LanguageClient,
    LanguageClientOptions,
    ServerOptions,
    TransportKind
} from 'vscode-languageclient';
import * as vscode from 'vscode';
import * as path from 'path';
import {
    window,
    workspace,
} from 'vscode';

export class LanaguageServerManager {
    constructor(private context: vscode.ExtensionContext) {

    }

    private client: LanguageClient;
    private buildStatusStatusBar: vscode.StatusBarItem;

    public async enableLanguageServer() {
        //if we already have a language server, nothing more needs to be done
        if (this.client) {
            return;
        }
        // The server is implemented in node
        let serverModule = this.context.asAbsolutePath(
            path.join('out', 'LanguageServerRunner.js')
        );

        // If the extension is launched in debug mode then the debug server options are used
        // Otherwise the run options are used
        let serverOptions: ServerOptions = {
            run: {
                module: serverModule,
                transport: TransportKind.ipc
            },
            debug: {
                module: serverModule,
                transport: TransportKind.ipc,
                // --inspect=6009: runs the server in Node's Inspector mode so VS Code can attach to the server for debugging
                options: { execArgv: ['--nolazy', '--inspect=6009'] }
            }
        };

        // Options to control the language client
        let clientOptions: LanguageClientOptions = {
            // Register the server for various types of documents
            documentSelector: [
                { scheme: 'file', language: 'brightscript' },
                { scheme: 'file', language: 'brighterscript' },
                { scheme: 'file', language: 'xml' }
            ],
            synchronize: {
                // Notify the server about file changes to every filetype it cares about
                fileEvents: workspace.createFileSystemWatcher('**/*')
            }
        };

        // Create the language client and start the client.
        this.client = new LanguageClient(
            'brighterScriptLanguageServer',
            'BrighterScript Language Server',
            serverOptions,
            clientOptions
        );
        // Start the client. This will also launch the server
        this.client.start();
        await this.client.onReady();

        this.client.onNotification('critical-failure', (message) => {
            window.showErrorMessage(message);
        });

        this.buildStatusStatusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
        this.buildStatusStatusBar.text = '$(flame)';
        this.buildStatusStatusBar.tooltip = 'BrightScript Language server is running';
        this.buildStatusStatusBar.color = '#673293';
        this.buildStatusStatusBar.show();
        //update the statusbar with build statuses
        this.client.onNotification('build-status', (message) => {
            if (message === 'building') {
                this.buildStatusStatusBar.text = '$(flame)...';
                this.buildStatusStatusBar.tooltip = 'BrightScript Language server is running';
                this.buildStatusStatusBar.color = '#673293';

            } else if (message === 'success') {
                this.buildStatusStatusBar.text = '$(flame)';
                this.buildStatusStatusBar.tooltip = 'BrightScript Language server is running';
                this.buildStatusStatusBar.color = '#673293';

            } else if (message === 'critical-error') {
                this.buildStatusStatusBar.text = '$(flame)';
                this.buildStatusStatusBar.tooltip = 'BrightScript Language server encountered a critical runtime error';
                this.buildStatusStatusBar.color = '#FF0000';
            }
        });
    }

    public disableLanguageServer() {
        if (this.client) {
            this.client.stop();
            this.buildStatusStatusBar.dispose();
            this.buildStatusStatusBar = undefined;
            this.client = undefined;
        }
    }
}
