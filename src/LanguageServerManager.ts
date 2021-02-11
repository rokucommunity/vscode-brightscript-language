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
    Disposable,
    window,
    workspace,
} from 'vscode';
import { CustomCommands, Deferred, ProjectInfo, CustomNotifications } from 'brighterscript';
import { CodeWithSourceMap } from 'source-map';
import BrightScriptDefinitionProvider from './BrightScriptDefinitionProvider';
import { BrightScriptWorkspaceSymbolProvider, SymbolInformationRepository } from './SymbolInformationRepository';
import { BrightScriptDocumentSymbolProvider } from './BrightScriptDocumentSymbolProvider';
import { BrightScriptReferenceProvider } from './BrightScriptReferenceProvider';
import BrightScriptSignatureHelpProvider from './BrightScriptSignatureHelpProvider';
import { DefinitionRepository } from './DefinitionRepository';
import util from './util';

export class LanguageServerManager {
    constructor() {
        this.deferred = new Deferred();
    }

    private context: vscode.ExtensionContext;
    private definitionRepository: DefinitionRepository;
    private get declarationProvider() {
        return this.definitionRepository.provider;
    }

    public async init(
        context: vscode.ExtensionContext,
        definitionRepository: DefinitionRepository

    ) {
        this.context = context;
        this.definitionRepository = definitionRepository;

        //dynamically enable or disable the language server based on user settings
        vscode.workspace.onDidChangeConfiguration((configuration) => {
            if (this.isLanguageServerEnabledInSettings()) {
                this.enableLanguageServer();
            } else {
                this.disableLanguageServer();
            }
        });

        if (this.isLanguageServerEnabledInSettings()) {
            return this.enableLanguageServer();
        } else {
            this.disableLanguageServer();
        }
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

    private refreshDeferred() {
        let newDeferred = new Deferred<any>();
        //chain any pending promises to this new deferred
        if (!this.deferred.isCompleted) {
            this.deferred.resolve(newDeferred.promise);
        }
        this.deferred = newDeferred;
    }

    private client: LanguageClient;
    private buildStatusStatusBar: vscode.StatusBarItem;

    private async enableLanguageServer() {
        try {

            //if we already have a language server, nothing more needs to be done
            if (this.client) {
                return this.ready();
            }
            this.refreshDeferred();

            //disable the simple providers (the language server will handle all of these)
            this.disableSimpleProviders();

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

            //anytime there's a critical failure, show that to the user as a popup
            this.client.onNotification(CustomNotifications.criticalFailure, (message) => {
                window.showErrorMessage(message);
            });

            //anytime the project changes (new project created, files deleted, files added), notify listeners.
            this.client.onNotification(CustomNotifications.projectsChanged, (message) => {
                for (let listener of this._onProjectsChangedHandlers) {
                    try {
                        listener(message);
                    } catch (e) {
                        console.error(e);
                    }
                }
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

            this.client.onNotification('project-change', (message) => {

            });
            this.deferred.resolve(true);
        } catch (e) {
            console.error(e);
            this.client?.stop?.();
            delete this.client;

            this.refreshDeferred();

            this.deferred.reject(e);
        }
    }

    /**
     * Stop and then start the language server.
     * This is a noop if the language server is currently disabled
     */
    public async restart() {
        this.disableLanguageServer();
        await util.delay(1);
        await this.enableLanguageServer();
    }

    public async reloadProject(workspacePath: string) {
        await this.client.sendRequest('workspace/executeCommand', {
            command: CustomCommands.reloadProject,
            arguments: [workspacePath]
        } as ExecuteCommandParams);
    }

    private disableLanguageServer() {
        if (this.client) {
            this.client.stop();
            this.buildStatusStatusBar.dispose();
            this.buildStatusStatusBar = undefined;
            this.client = undefined;
            this.deferred = new Deferred();
        }
        //enable the simple providers (since there is no language server)
        this.enableSimpleProviders();
    }

    private simpleSubscriptions = [] as Disposable[];

    /**
     * Enable the simple providers (which means the language server is disabled).
     * These were the original providers created by George. Most of this functionality has been moved into the language server
     * However, if the language server is disabled, we want to at least fall back to these.
     */
    private enableSimpleProviders() {
        if (this.simpleSubscriptions.length === 0) {
            //register the definition provider
            const definitionProvider = new BrightScriptDefinitionProvider(this.definitionRepository);
            const symbolInformationRepository = new SymbolInformationRepository(this.declarationProvider);
            const selector = { scheme: 'file', pattern: '**/*.{brs,bs}' };

            this.simpleSubscriptions.push(
                vscode.languages.registerDefinitionProvider(selector, definitionProvider),
                vscode.languages.registerDocumentSymbolProvider(selector, new BrightScriptDocumentSymbolProvider(this.declarationProvider)),
                vscode.languages.registerWorkspaceSymbolProvider(new BrightScriptWorkspaceSymbolProvider(this.declarationProvider, symbolInformationRepository)),
                vscode.languages.registerReferenceProvider(selector, new BrightScriptReferenceProvider()),
                vscode.languages.registerSignatureHelpProvider(selector, new BrightScriptSignatureHelpProvider(this.definitionRepository), '(', ','),
            );

            this.context.subscriptions.push(...this.simpleSubscriptions);
        }
    }

    /**
     * Disable the simple subscriptions (which means we'll depend on the language server)
     */
    private disableSimpleProviders() {
        if (this.simpleSubscriptions.length > 0) {
            for (const sub of this.simpleSubscriptions) {
                const idx = this.context.subscriptions.indexOf(sub);
                if (idx > -1) {
                    this.context.subscriptions.splice(idx, 1);
                    sub.dispose();
                }
            }
            this.simpleSubscriptions = [];
        }
    }

    public isLanguageServerEnabledInSettings() {
        var settings = vscode.workspace.getConfiguration('brightscript');
        var value = settings.enableLanguageServer === false ? false : true;
        return value;
    }

    public async getTranspiledFileContents(pathAbsolute: string) {
        //wait for the language server to be ready
        await this.ready();
        let result = await this.client.sendRequest('workspace/executeCommand', {
            command: CustomCommands.transpileFile,
            arguments: [pathAbsolute]
        } as ExecuteCommandParams);
        return result as CodeWithSourceMap;
    }

    public async getProjectsInfo() {
        await this.ready();
        const result = await this.client.sendRequest('workspace/executeCommand', {
            command: CustomCommands.getProjectsInfo,
            arguments: []
        } as ExecuteCommandParams);
        return result as ProjectInfo[];
    }

    public onProjectsChanged(callback) {
        this._onProjectsChangedHandlers.push(callback);
        //immediately fire an event
        process.nextTick(() => {
            callback();
        });
        //return a function that will dispose of this handler
        return () => {
            this._onProjectsChangedHandlers.splice(this._onProjectsChangedHandlers.indexOf(callback), 1);
        };
    }
    private _onProjectsChangedHandlers = [];
}

export const languageServerManager = new LanguageServerManager();
