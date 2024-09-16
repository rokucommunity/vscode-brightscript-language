import type {
    LanguageClientOptions,
    ServerOptions,
    ExecuteCommandParams,
    StateChangeEvent
} from 'vscode-languageclient/node';
import {
    LanguageClient,
    State,
    TransportKind
} from 'vscode-languageclient/node';
import * as vscode from 'vscode';
import * as path from 'path';
import type { Disposable } from 'vscode';
import {
    window,
    workspace
} from 'vscode';
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
import * as semver from 'semver';
import * as md5 from 'md5';
import * as dayjs from 'dayjs';

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

    /**
     * The delay after init before we delete any outdated bsc versions
     */
    private outdatedBscVersionDeleteDelay = 5 * 60 * 1000;

    public async init(
        context: vscode.ExtensionContext,
        definitionRepository: DefinitionRepository
    ) {
        this.context = context;
        this.definitionRepository = definitionRepository;

        //anytime the window changes focus, save the current brighterscript version
        vscode.window.onDidChangeWindowState(async (e) => {
            await this.updateBscVersionUsageDate(this.selectedBscInfo.path);
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
                version: fsExtra.readJsonSync(`${bsdkPath}/package.json`).version
            };
        } catch (e) {
            console.error(e);
            //fall back to the embedded version, and show a popup
            await vscode.window.showErrorMessage(`Can't find language server at "${bsdkPath}". Did you forget to run \`npm install\`? Using embedded version v${this.embeddedBscInfo.version} instead.`);
            this.selectedBscInfo = this.embeddedBscInfo;
        }

        if (this.isLanguageServerEnabledInSettings()) {
            await this.enableLanguageServer();
        } else {
            await this.disableLanguageServer();
        }
    }

    /**
     * Get the full path to the brighterscript module where the LanguageServer should be run.
     * If `brightscript.bsdk` is a version number or a URL, install that version in global storage and return that path.
     * if it's a relative path, resolve it to the workspace folder and return that path.
     */
    private async getBsdkPath() {
        //if there's a bsdk entry in the workspace settings, assume the path is relative to the workspace
        if (this.workspaceConfigIncludesBsdkKey()) {
            let bsdk = vscode.workspace.getConfiguration('brightscript', vscode.workspace.workspaceFile).get<string>('bsdk');
            if (bsdk === 'embedded') {
                return this.embeddedBscInfo.path;
            }
            let bscPath = await this.ensureBscVersionInstalled(bsdk);
            return path.resolve(path.dirname(vscode.workspace.workspaceFile.fsPath), bscPath);
        }

        const folderResults = new Set<string>();
        //look for a bsdk entry in each of the workspace folders
        for (const folder of vscode.workspace.workspaceFolders) {
            const bsdk = vscode.workspace.getConfiguration('brightscript', folder).get<string>('bsdk');
            if (bsdk) {
                if (bsdk === 'embedded') {
                    folderResults.add(this.embeddedBscInfo.path);
                } else {
                    let bscPath = await this.ensureBscVersionInstalled(bsdk);
                    folderResults.add(
                        path.resolve(folder.uri.fsPath, bscPath)
                    );
                }
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

    public get packagesDir() {
        return s`${this.context.globalStorageUri.fsPath}/packages`;
    }

    /**
     * Extract some info about the bsc version string
     * @param version can be a semantic version, a URL, or a folder path
     * @returns
     */
    private parseBscVersion(version: string) {
        //if this is a URL
        if (/^(http|https):\/\//.test(version)) {
            //hash the URL to create a unique folder name. There is next to zero possibility these will clash, so the hash should be fine.
            return {
                folderName: `brighterscript-${md5(version.trim())}`,
                packageJsonEntry: version.trim()
            };

            //this is a valid semantic version
        } else if (semver.valid(version)) {
            return {
                folderName: `brighterscript-${version}`,
                packageJsonEntry: version
            };
            //assume this is a folder path, return undefined
        } else {
            return undefined;
        }
    }

    /**
     * Ensure that the specified bsc version is installed in the global storage directory.
     * @param version
     * @param retryCount the number of times we should retry before giving up
     * @returns full path to the root of where the brighterscript module is installed
     */
    private ensureBscVersionInstalled(bsdkEntry: string, retryCount = 1, showProgress = true): Promise<string> {
        let timeout = util.sleep(3 * 60 * 1000);
        this.ensureBscVersionInstalledPromise = Promise.race([
            //only block for a few minutes, then let the next one try
            timeout,
            this.ensureBscVersionInstalledPromise
        ]).then(() => {
            return this._ensureBscVersionInstalled(bsdkEntry, retryCount, showProgress);
        }).catch((error) => {
            console.error(error);
        }).finally(() => {
            timeout.cancel();
        });
        return this.ensureBscVersionInstalledPromise;
    }
    private ensureBscVersionInstalledPromise = Promise.resolve<any>(undefined);

    private async _ensureBscVersionInstalled(bsdkEntry: string, retryCount = 1, showProgress = true): Promise<string> {
        const { folderName, packageJsonEntry } = this.parseBscVersion(bsdkEntry) ?? {};

        //assume this is a folder path, return as-is
        if (!folderName || !packageJsonEntry) {
            return bsdkEntry;
        }

        let bscPath: string;

        const action = async () => {

            console.log('Ensuring bsc version is installed', packageJsonEntry);
            const bscNpmDir = s`${this.packagesDir}/${folderName}`;
            if (await fsExtra.pathExists(bscNpmDir) === false) {
                //write a simple package.json file referencing the version of brighterscript we want
                await fsExtra.outputJson(`${bscNpmDir}/package.json`, {
                    name: 'vscode-brighterscript-host',
                    private: true,
                    version: '1.0.0',
                    dependencies: {
                        'brighterscript': packageJsonEntry
                    }
                });
                await util.exec('npm install', {
                    cwd: bscNpmDir
                });
            }
            bscPath = s`${bscNpmDir}/node_modules/brighterscript`;

            //if the module is invalid, try again
            if (await fsExtra.pathExists(`${bscPath}/dist/index.js`) === false && retryCount > 0) {
                console.log(`Failed to load brighterscript module at ${bscNpmDir}. Deleting directory and trying again`);
                //remove the dir and try again
                await fsExtra.remove(bscNpmDir);
                return this._ensureBscVersionInstalled(bsdkEntry, retryCount - 1, false);
            }
        };

        //show a progress spinner if configured to do so
        if (showProgress) {
            await vscode.window.withProgress({
                title: 'Installing brighterscript language server ' + packageJsonEntry,
                location: vscode.ProgressLocation.Notification,
                cancellable: false
            }, action);
        } else {
            await action();
        }

        return bscPath;
    }

    /**
     * Clear all packages stored in the npm cache for this extension
     */
    public async clearNpmPackageCache() {
        await fsExtra.emptyDir(this.packagesDir);
    }

    /**
     * Update the last-used date of a specific instance of brighterscript so we can prevent it from being cleaned up too soon
     * @param bscPath
     */
    private async updateBscVersionUsageDate(bscPath: string, date = new Date()) {
        const usage = this.context.globalState.get('bsc-usage', {});
        usage[s`${bscPath}`] = date.getTime();
        await this.context.globalState.update('bsc-usage', usage);
    }

    /**
     * The number of days to retain a cached npm package before deleting it.
     */
    private get npmCacheRetentionDays() {
        return vscode.workspace.getConfiguration('brightscript')?.get?.('npmCacheRetentionDays', 45) ?? 45;
    }

    /**
     * Delete any brighterscript versions that haven't been used in a while
     */
    public async deleteOutdatedBscVersions() {
        //build a date that represents the cutoff date (i.e. 45 days ago)
        const cutoffDate = dayjs().subtract(this.npmCacheRetentionDays, 'days');

        //get a list of bsc locations that have been recently used
        const bscLocationsToKeep = Object.entries(
            this.context.globalState.get<Record<string, number>>('bsc-usage', {})

            //keep versions that have been used recently
        ).filter(([, lastUsedTime]) => {
            //if this version was used within the past 45 days, keep it
            return dayjs(lastUsedTime).diff(cutoffDate) > 0;
        }).map(x => x[0]);

        //get a list of folders in our internal packages directory
        const dirs = (await fsExtra.readdir(this.packagesDir));

        //delete any dir not in the keep list
        for (const dir of dirs) {
            const fullDir = s`${this.packagesDir}/${dir}/node_modules/brighterscript`;
            if (bscLocationsToKeep.includes(fullDir) === false) {
                try {
                    await fsExtra.remove(s`${this.packagesDir}/${dir}`);
                } catch { }
            }
        }
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
