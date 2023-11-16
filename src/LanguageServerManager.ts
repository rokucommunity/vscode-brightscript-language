import type {
    LanguageClientOptions,
    ServerOptions,
    ExecuteCommandParams
} from 'vscode-languageclient/node';
import {
    LanguageClient,
    TransportKind
} from 'vscode-languageclient/node';
import * as vscode from 'vscode';
import * as path from 'path';
import type { Disposable } from 'vscode';
import {
    window,
    workspace
} from 'vscode';
import { BusyStatus, NotificationName, Logger } from 'brighterscript';
import { CustomCommands, Deferred } from 'brighterscript';
import type { CodeWithSourceMap } from 'source-map';
import BrightScriptDefinitionProvider from './BrightScriptDefinitionProvider';
import { BrightScriptWorkspaceSymbolProvider, SymbolInformationRepository } from './SymbolInformationRepository';
import { BrightScriptDocumentSymbolProvider } from './BrightScriptDocumentSymbolProvider';
import { BrightScriptReferenceProvider } from './BrightScriptReferenceProvider';
import BrightScriptSignatureHelpProvider from './BrightScriptSignatureHelpProvider';
import type { DefinitionRepository } from './DefinitionRepository';
import { util } from './util';
import { LanguageServerInfoCommand, languageServerInfoCommand } from './commands/LanguageServerInfoCommand';
import * as fsExtra from 'fs-extra';

export const LANGUAGE_SERVER_NAME = 'BrighterScript Language Server';

export class LanguageServerManager {
    constructor() {
        this.deferred = new Deferred();
        this.embeddedBscInfo = {
            path: require.resolve('brighterscript').replace(/[\\\/]dist[\\\/]index.js/i, ''),
            // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
            version: require('brighterscript/package.json').version
        };
        //default to the embedded bsc version
        this.selectedBscInfo = this.embeddedBscInfo;
    }

    public embeddedBscInfo: BscInfo;
    public selectedBscInfo: BscInfo;

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
        vscode.workspace.onDidChangeConfiguration(async (configuration) => {
            await this.syncVersionAndTryRun();
        });
        await this.syncVersionAndTryRun();
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
    private languageServerStatusBar: vscode.StatusBarItem;

    private clientDispose: Disposable;

    private async enableLanguageServer() {
        try {

            //if we already have a language server, nothing more needs to be done
            if (this.client) {
                return await this.ready();
            }
            this.refreshDeferred();

            //create the statusbar
            this.languageServerStatusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right);
            this.languageServerStatusBar.command = LanguageServerInfoCommand.commandName;

            //enable the statusbar loading anmation. the language server will disable once it finishes loading
            this.updateStatusbar(false);

            this.languageServerStatusBar.show();

            //disable the simple providers (the language server will handle all of these)
            this.disableSimpleProviders();

            // The server is implemented in node
            let serverModule = this.context.asAbsolutePath(
                path.join('dist', 'LanguageServerRunner.js')
            );

            //give the runner the specific version of bsc to run
            const args = [
                this.selectedBscInfo.path,
                (this.context.extensionMode === vscode.ExtensionMode.Development).toString()
            ];
            // If the extension is launched in debug mode then the debug server options are used
            // Otherwise the run options are used
            let serverOptions: ServerOptions = {
                run: {
                    module: serverModule,
                    transport: TransportKind.ipc,
                    args: args
                },
                debug: {
                    module: serverModule,
                    transport: TransportKind.ipc,
                    args: args,
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
                LANGUAGE_SERVER_NAME,
                serverOptions,
                clientOptions
            );
            // Start the client. This will also launch the server
            this.clientDispose = this.client.start();
            await this.client.onReady();

            this.client.onNotification('critical-failure', (message) => {
                void window.showErrorMessage(message);
            });
            this.registerBusyStatusHandler();
            this.deferred.resolve(true);
        } catch (e) {
            console.error(e);
            void this.client?.stop?.();
            delete this.client;

            this.refreshDeferred();

            this.deferred.reject(e);
        }
        return this.ready();
    }

    private registerBusyStatusHandler() {
        let timeoutHandle: NodeJS.Timeout;

        const logger = new Logger();
        this.client.onNotification(NotificationName.busyStatus, (event: any) => {
            this.setBusyStatus(event.status);

            //if the busy status takes too long, write a lsp log entry with details of what's still pending
            if (event.status === BusyStatus.busy) {
                timeoutHandle = setTimeout(() => {
                    const delay = Date.now() - event.timestamp;
                    this.client.outputChannel.appendLine(`${logger.getTimestamp()} language server has been 'busy' for ${delay}ms. most recent busyStatus event: ${JSON.stringify(event, undefined, 4)}`);
                }, 60_000);

                //clear any existing timeout
            } else if (timeoutHandle) {
                clearTimeout(timeoutHandle);
            }
        });

    }

    private setBusyStatus(status: BusyStatus) {
        if (status === BusyStatus.busy) {
            this.updateStatusbar(true);
        } else {
            this.updateStatusbar(false);
        }
    }

    /**
     * Enable/disable the loading spinner on the statusbar item
     */
    private updateStatusbar(isLoading: boolean) {
        const icon = isLoading ? '$(sync~spin)' : '$(flame)';
        this.languageServerStatusBar.text = `${icon} bsc-${this.selectedBscInfo.version}`;
        this.languageServerStatusBar.tooltip = `BrightScript Language Server: running`;
    }

    /**
     * Stop and then start the language server.
     * This is a noop if the language server is currently disabled
     */
    public async restart() {
        await this.disableLanguageServer();
        await util.delay(1);
        await this.syncVersionAndTryRun();
    }

    private async disableLanguageServer() {
        if (this.client) {
            await this.client.stop();
            this.languageServerStatusBar.dispose();
            this.languageServerStatusBar = undefined;
            this.clientDispose?.dispose();
            this.client = undefined;
            //delay slightly to let things catch up
            await util.delay(100);
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
                vscode.languages.registerWorkspaceSymbolProvider(new BrightScriptWorkspaceSymbolProvider(symbolInformationRepository)),
                vscode.languages.registerReferenceProvider(selector, new BrightScriptReferenceProvider()),
                vscode.languages.registerSignatureHelpProvider(selector, new BrightScriptSignatureHelpProvider(this.definitionRepository), '(', ',')
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
        let settings = vscode.workspace.getConfiguration('brightscript');
        let value = settings.enableLanguageServer === false ? false : true;
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

    /**
     * Check user settings for which language server version to use,
     * and if different, re-launch the specific version of the language server'
     */
    public async syncVersionAndTryRun() {
        const bsdkPath = await this.getBsdkPath();

        //if the path to bsc is different, spin down the old server and start a new one
        if (bsdkPath !== this.selectedBscInfo.path) {
            await this.disableLanguageServer();
        }

        //try to load the package version.
        try {
            this.selectedBscInfo = {
                path: bsdkPath,
                // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
                version: require(`${bsdkPath}/package.json`).version
            };
        } catch (e) {
            console.error(e);
            //fall back to the embedded version, and show a popup
            await vscode.window.showErrorMessage(`Can't find language sever at "${bsdkPath}". Using embedded version v${this.embeddedBscInfo.version} instead.`);
            this.selectedBscInfo = this.embeddedBscInfo;
        }

        if (this.isLanguageServerEnabledInSettings()) {
            await this.enableLanguageServer();
        } else {
            await this.disableLanguageServer();
        }
    }

    /**
     * Get the full path to the brighterscript module where the LanguageServer should be run
     */
    private async getBsdkPath() {
        //if there's a bsdk entry in the workspace settings, assume the path is relative to the workspace
        if (this.workspaceConfigIncludesBsdkKey()) {
            let bsdk = vscode.workspace.getConfiguration('brightscript', vscode.workspace.workspaceFile).get<string>('bsdk');
            return bsdk === 'embedded'
                ? this.embeddedBscInfo.path
                : path.resolve(path.dirname(vscode.workspace.workspaceFile.fsPath), bsdk);
        }

        const folderResults = new Set<string>();
        //look for a bsdk entry in each of the workspace folders
        for (const folder of vscode.workspace.workspaceFolders) {
            const bsdk = vscode.workspace.getConfiguration('brightscript', folder).get<string>('bsdk');
            if (bsdk) {
                folderResults.add(
                    bsdk === 'embedded'
                        ? this.embeddedBscInfo.path
                        : path.resolve(folder.uri.fsPath, bsdk)
                );
            }
        }
        const values = [...folderResults.values()];
        //there's no bsdk configuration in folder settings.
        if (values.length === 0) {
            return this.embeddedBscInfo.path;

            //we have exactly one result. use it
        } else if (values.length === 1) {
            return values[0];
        } else {
            //there were multiple versions. make the user pick which to use
            return languageServerInfoCommand.selectBrighterScriptVersion();
        }
    }

    private workspaceConfigIncludesBsdkKey() {
        return vscode.workspace.workspaceFile &&
            fsExtra.pathExistsSync(vscode.workspace.workspaceFile.fsPath) &&
            /"brightscript.bsdk"/.exec(
                fsExtra.readFileSync(vscode.workspace.workspaceFile.fsPath
                ).toString()
            );
    }
}

export const languageServerManager = new LanguageServerManager();

interface BscInfo {
    /**
     * The full path to the brighterscript module
     */
    path: string;
    /**
     * The version of the brighterscript module
     */
    version: string;
}
