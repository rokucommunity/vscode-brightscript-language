import type { LanguageClientOptions, ServerOptions, ExecuteCommandParams, StateChangeEvent } from 'vscode-languageclient/node';
import { LanguageClient, State, TransportKind } from 'vscode-languageclient/node';
import * as vscode from 'vscode';
import * as path from 'path';
import type { Disposable } from 'vscode';
import { window, workspace } from 'vscode';
import { BusyStatus, NotificationName, standardizePath as s } from 'brighterscript';
import { Logger } from '@rokucommunity/logger';
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
import { EventEmitter } from 'eventemitter3';
import * as dayjs from 'dayjs';
import type { LocalPackageManager, ParsedVersionInfo } from './managers/LocalPackageManager';

/**
 * Tracks the running/stopped state of the language server. When the lsp crashes, vscode will restart it. After the 5th crash, they'll leave it permanently crashed.
 * There seems to be no time limit on adding up to the 5, so even after a few days, vscode may still terminate the language server.
 * This class track when the language server is stopped and then not started back up again after a period of time.
 * For example, 20 seconds after after the final failure, this event fires so that we can show a "wanna restart it" popup.
 */
class LspRunTracker {

    public constructor(
        public debounceDelay: number
    ) {
    }

    public setState(state: State) {
        //if language server is running, clear any timers
        if (state === State.Starting || state === State.Running) {
            clearTimeout(this.timeoutHandle);
        } else {
            this.timeoutHandle = setTimeout(() => {
                clearTimeout(this.timeoutHandle);
                this.emitter.emit('stopped');
            }, this.debounceDelay);
        }
    }
    private timeoutHandle: NodeJS.Timeout;

    private emitter = new EventEmitter();
    public on(event: 'stopped', listener: () => any) {
        this.emitter.on(event, listener);
        return () => {
            this.emitter.off(event, listener);
        };
    }
}

export const LANGUAGE_SERVER_NAME = 'BrighterScript Language Server';

export class LanguageServerManager {
    constructor() {
        this.deferred = new Deferred();
        const brighterscriptDir = require.resolve('brighterscript').replace(/[\\\/]dist[\\\/]index.js/i, '');
        const version = fsExtra.readJsonSync(`${brighterscriptDir}/package.json`).version;
        this.embeddedBscInfo = {
            packageDir: brighterscriptDir,
            versionInfo: version,
            version: version
        };
        //default to the embedded bsc version
        this.selectedBscInfo = this.embeddedBscInfo;
    }

    /**
     * Information about the embedded brighterscript version
     */
    public embeddedBscInfo: BscInfo;
    /**
     * Information about the currently selected brighterscript version (the one that's running right now)
     */
    public selectedBscInfo: BscInfo;

    private context: vscode.ExtensionContext;
    private definitionRepository: DefinitionRepository;
    private get declarationProvider() {
        return this.definitionRepository.provider;
    }

    private localPackageManager: LocalPackageManager;

    /**
     * The delay after init before we delete any outdated bsc versions
     */
    private outdatedBscVersionDeleteDelay = 5 * 60 * 1000;

    public async init(
        context: vscode.ExtensionContext,
        definitionRepository: DefinitionRepository,
        localPackageManager: LocalPackageManager
    ) {
        this.context = context;

        this.definitionRepository = definitionRepository;

        this.localPackageManager = localPackageManager;

        //anytime the window changes focus, save the current brighterscript version
        vscode.window.onDidChangeWindowState(async (e) => {
            await this.localPackageManager.setUsage('brighterscript', this.selectedBscInfo.versionInfo);
        });

        //in about 5 minutes, clean up any outdated bsc versions (delayed to prevent slower startup times)
        setTimeout(() => {
            void this.deleteOutdatedBscVersions();
        }, this.outdatedBscVersionDeleteDelay);

        //if the lsp is permanently stopped by vscode, ask the user if they want to restart it again.
        this.lspRunTracker.on('stopped', async () => {
            //stop the statusbar spinner
            this.updateStatusbar(false);
            if (this.isLanguageServerEnabledInSettings()) {
                const response = await vscode.window.showErrorMessage('The BrighterScript language server unexpectedly shut down. Do you want to restart it?', {
                    modal: true
                }, { title: 'Yes' }, { title: 'No ', isCloseAffordance: true });
                if (response.title === 'Yes') {
                    await this.restart();
                }
            } else {
                await this.disableLanguageServer();
            }
        });

        //dynamically enable or disable the language server based on user settings
        vscode.workspace.onDidChangeConfiguration(async (configuration) => {
            //if we've changed the bsdk setting, restart the language server
            if (configuration.affectsConfiguration('brightscript.bsdk')) {
                await this.syncVersionAndTryRun();
            }
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
    private statusbarItem: vscode.StatusBarItem;

    private lspRunTracker = new LspRunTracker(20_000);

    private clientDispose: Disposable;

    /**
     * Create a new LanguageClient instance
     * @returns
     */
    private constructLanguageClient() {

        // The server is implemented in node
        let serverModule = this.context.asAbsolutePath(
            path.join('dist', 'LanguageServerRunner.js')
        );

        //give the runner the specific version of bsc to run
        const args = [
            this.selectedBscInfo.packageDir,
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
        return new LanguageClient(
            'brighterScriptLanguageServer',
            LANGUAGE_SERVER_NAME,
            serverOptions,
            clientOptions
        );
    }

    private async enableLanguageServer() {
        try {
            //if we already have a language server, nothing more needs to be done
            if (this.client) {
                return await this.ready();
            }
            this.refreshDeferred();

            //create the statusbar item
            this.statusbarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right);
            this.statusbarItem.command = LanguageServerInfoCommand.commandName;

            //enable the statusbar loading anmation. the language server will disable once it finishes loading
            this.updateStatusbar(false);

            this.statusbarItem.show();

            //disable the simple providers (the language server will handle all of these)
            this.disableSimpleProviders();

            this.client = this.constructLanguageClient();

            this.client.onDidChangeState((event: StateChangeEvent) => {
                console.log(new Date().toLocaleTimeString(), 'onDidChangeState', State[event.newState]);
                this.lspRunTracker.setState(event.newState);
            });

            // Start the client. This will also launch the server
            this.clientDispose = this.client.start();

            await this.client.onReady();

            this.client.onNotification('critical-failure', (message) => {
                void window.showErrorMessage(message);
            });
            this.registerBusyStatusHandler();
            this.deferred.resolve(true);
        } catch (e) {
            //stop the client by any means necessary
            try {
                void this.client?.stop?.();
            } catch { }
            delete this.client;

            this.refreshDeferred();

            this.deferred?.reject(e);
            throw e;
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
                    this.client.outputChannel.appendLine(`${logger.formatTimestamp(new Date())} language server has been 'busy' for ${delay}ms. most recent busyStatus event: ${JSON.stringify(event, undefined, 4)}`);
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
        //do nothing if we don't have a statusbar
        if (!this.statusbarItem) {
            return;
        }
        const icon = isLoading ? '$(sync~spin)' : '$(flame)';
        this.statusbarItem.text = `${icon} bsc-${this.selectedBscInfo.version}`;
        this.statusbarItem.tooltip = `BrightScript Language Server: running`;
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
            this.statusbarItem.dispose();
            this.statusbarItem = undefined;
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
        const versionInfo = await this.getBsdkVersionInfo();

        //if the path to bsc is different, spin down the old server and start a new one
        if (versionInfo !== this.selectedBscInfo.packageDir) {
            await this.disableLanguageServer();
        }

        //ensure the version of the language server is installed and available

        //try to load the package version.
        try {
            this.selectedBscInfo = await this.ensureBscVersionInstalled(versionInfo);
        } catch (e) {
            console.error(e);
            //fall back to the embedded version, and show a popup
            await vscode.window.showErrorMessage(`Can't find language server for "${versionInfo}". Did you forget to run \`npm install\`? Using embedded version v${this.embeddedBscInfo.version} instead.`);
            this.selectedBscInfo = this.embeddedBscInfo;
        }

        if (this.isLanguageServerEnabledInSettings()) {
            await this.enableLanguageServer();
        } else {
            await this.disableLanguageServer();
        }
    }

    public parseVersionInfo(versionInfo: string, cwd = process.cwd()): ParsedVersionInfo {
        if (versionInfo === 'embedded') {
            return {
                type: 'dir',
                value: this.embeddedBscInfo.packageDir
            };
        } else {
            return this.localPackageManager.parseVersionInfo(versionInfo, cwd);
        }
    }

    /**
     * Get the value for `brightscript.bsdk` from the following locations (in order). First one found wins:
     * - use `brightscript.bsdk` value from the current `.code-workspace` file
     * - if there is only 1 workspaceFolder with a `brightscript.bsdk` value, use that.
     * - if there are multiple workspace folders with `brightscript.bsdk` values, prompt the user to pick which one to use
     * - if there are no `brightscript.bsdk` values, use the embedded version
     * @returns an absolute path to a directory for the bsdk, or the non-path value (i.e. a URL or a version number)
     */
    private async getBsdkVersionInfo(): Promise<string> {

        //use bsdk entry in the code-workspace file
        if (this.workspaceConfigIncludesBsdkKey()) {
            let result = this.parseVersionInfo(
                vscode.workspace.getConfiguration('brightscript', vscode.workspace.workspaceFile).get<string>('bsdk')?.trim?.(),
                path.dirname(vscode.workspace.workspaceFile.fsPath)
            );
            if (result) {
                return result.value;
            }
        }

        //collect `brightscript.bsdk` setting value from each workspaceFolder
        const folderResults = vscode.workspace.workspaceFolders.reduce((acc, workspaceFolder) => {
            const versionInfo = vscode.workspace.getConfiguration('brightscript', workspaceFolder).get<string>('bsdk');
            const parsed = this.parseVersionInfo(versionInfo, workspaceFolder.uri.fsPath);
            if (parsed) {
                acc.set(parsed.value, parsed);
            }
            return acc;
        }, new Map<string, ParsedVersionInfo>());

        //no results found, use the embedded version
        if (folderResults.size === 0) {
            return this.embeddedBscInfo.packageDir;

            //we have exactly one result. use it
        } else if (folderResults.size === 1) {
            return [...folderResults.values()][0].value;

            //there were multiple versions. make the user pick which to use
        } else {
            //TODO should we prompt for just these items?
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

    /**
     * Ensure that the specified bsc version is installed in the global storage directory.
     * @param version
     * @param retryCount the number of times we should retry before giving up
     * @returns full path to the root of where the brighterscript module is installed
     */
    @OneAtATime({ timeout: 3 * 60 * 1000 })
    private async ensureBscVersionInstalled(versionInfo: string, retryCount = 1, showProgress = true): Promise<BscInfo> {
        const parsed = this.parseVersionInfo(versionInfo);

        //if this is a directory, use it as-is
        if (parsed.type === 'dir') {
            return {
                packageDir: parsed.value,
                version: fsExtra.readJsonSync(s`${parsed.value}/package.json`, { throws: false })?.version ?? parsed.value,
                versionInfo: versionInfo
            };
        }

        //install this version of brighterscript
        try {
            const packageInfo = await util.runWithProgress({
                title: 'Installing brighterscript language server ' + versionInfo,
                location: vscode.ProgressLocation.Notification,
                cancellable: false,
                //show a progress spinner if configured to do so
                showProgress: showProgress && !this.localPackageManager.isInstalled('brighterscript', versionInfo)
            }, async () => {
                return this.localPackageManager.install('brighterscript', versionInfo);
            });
            return {
                packageDir: packageInfo.packageDir,
                version: packageInfo.version,
                versionInfo: versionInfo
            };

        } catch (e) {
            if (retryCount > 0) {
                console.error('Failed to install brighterscript', versionInfo, e);

                //if the install failed for some reason, uninstall the package and try again
                await this.localPackageManager.uninstall('brighterscript', versionInfo);
                return await this.ensureBscVersionInstalled(versionInfo, retryCount - 1, showProgress);
            } else {
                throw e;
            }
        }
    }

    /**
     * Delete any brighterscript versions that haven't been used in a while
     */
    private async deleteOutdatedBscVersions() {
        const npmCacheRetentionDays = vscode.workspace.getConfiguration('brightscript')?.get?.('npmCacheRetentionDays', 45) ?? 45;

        //build the cutoff date (i.e. 45 days ago)
        const cutoffDate = dayjs().subtract(npmCacheRetentionDays, 'days');
        await this.localPackageManager.deletePackagesNotUsedSince(cutoffDate.toDate());
    }
}

export const languageServerManager = new LanguageServerManager();

interface BscInfo {
    /**
     * The full path to the brighterscript module (i.e. the folder where its `package.json` is located
     */
    packageDir: string;
    /**
     * The versionInfo of the brighterscript module. Typically this is a semantic version, but it could be a URL or a folder path.
     * Anything that can go inside a `package.json` file is acceptable as well
     */
    versionInfo: string;
    /**
     * The version of the brighterscript module from its package.json. This is displayed in the statusbar
     */
    version: string;
}


/**
 * Force method calls to run one-at-a-time, waiting for the completion of the previous call before running the next.
 */
function OneAtATime(options: { timeout?: number }) {
    return function OneAtATime(target: any, propertyKey: string, descriptor: PropertyDescriptor) {
        let originalMethod = descriptor.value;

        //wrap the original method
        descriptor.value = function value(...args: any[]) {
            //ensure the promise structure exists for this call
            target.__oneAtATime ??= {};
            target.__oneAtATime[propertyKey] ??= Promise.resolve();

            const timer = util.sleep(options.timeout > 0 ? options.timeout : Number.MAX_SAFE_INTEGER);

            return Promise.race([
                //race for the last task to resolve
                target.__oneAtATime[propertyKey].finally(() => {
                    timer?.cancel?.();
                }),
                //race for the timeout to expire (we give up waiting for the previous task to complete)
                timer.then(() => {
                    //our timer fired before we had a chance to cancel it. Report the error and move on
                    console.error(`timer expired waiting for the previous ${propertyKey} to complete. Running the next instance`, target);
                })
                //now we can move on to the actual task
            ]).then(() => {
                return originalMethod.apply(this, args);
            });
        };
    };
}
