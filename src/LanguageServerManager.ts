import {
    LanguageClient,
    LanguageClientOptions,
    ServerOptions,
    TransportKind,
    ExecuteCommandOptions,
    ExecuteCommandParams
} from 'vscode-languageclient';
import * as vscode from 'vscode';
import * as path from 'path';
import {
    window,
    workspace,
} from 'vscode';
import { CustomCommands } from 'brighterscript';
import { CodeWithSourceMap } from 'source-map';
import { Deferred } from 'brighterscript';

export class LanaguageServerManager {
    constructor() {
        this.deferred = new Deferred();
    }

    private context: vscode.ExtensionContext;

    public async init(context: vscode.ExtensionContext) {
        this.context = context;
        if (this.isLanguageServerEnabledInSettings()) {
            return this.enableLanguageServer();
        }
        //dynamically enable or disable the language server based on user settings
        vscode.workspace.onDidChangeConfiguration((configuration) => {
            if (this.isLanguageServerEnabledInSettings()) {
                this.enableLanguageServer();
            } else {
                this.disableLanguageServer();
            }
        });
    }

    private deferred: Deferred<any>;

    /**
     * Returns a promise that resolves once the language server is ready to be interacted with
     */
    private async ready() {
        if (this.isLanguageServerEnabledInSettings() === false) {
            throw new Error('Language server is disabled in user settings');
        } else {
            return this.deferred.promise;
        }
    }

    private client: LanguageClient;
    private buildStatusStatusBar: vscode.StatusBarItem;

    private async enableLanguageServer() {
        try {
            //if we already have a language server, nothing more needs to be done
            if (this.client) {
                return this.ready();
            }

            let newDeferred = new Deferred<any>();
            //chain any pending promises to this new deferred
            this.deferred.resolve(newDeferred.promise);
            this.deferred = newDeferred;

            // The server is implemented in node
            let serverModule = this.context.asAbsolutePath(
                path.join('dist', 'LanguageServerRunner.js')
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
            this.deferred.resolve(true);
        } catch (e) {
            this.client?.stop();
            delete this.client;
            this.deferred.reject(e);
        }
    }

    private disableLanguageServer() {
        if (this.client) {
            this.client.stop();
            this.buildStatusStatusBar.dispose();
            this.buildStatusStatusBar = undefined;
            this.client = undefined;
        }
    }

    private isLanguageServerEnabledInSettings() {
        var settings = vscode.workspace.getConfiguration('brightscript');
        var value = settings.enableLanguageServer === false ? false : true;
        return value;
    }

    public async getTranspiledFileContents(pathAbsolute: string) {
        //wait for the language server to be ready
        await this.ready();
        let result = await this.client.sendRequest('workspace/executeCommand', {
            command: CustomCommands.TranspileFile,
            arguments: [pathAbsolute]
        } as ExecuteCommandParams);
        return result as CodeWithSourceMap;
    }
}

export const languageServerManager = new LanaguageServerManager();
