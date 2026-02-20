import * as vscode from 'vscode';
import * as prettyBytes from 'pretty-bytes';
import { extensions } from 'vscode';
import * as path from 'path';
import * as fsExtra from 'fs-extra';
import { util } from './util';
import { ActiveDeviceManager } from './ActiveDeviceManager';
import { BrightScriptCommands } from './BrightScriptCommands';
import BrightScriptXmlDefinitionProvider from './BrightScriptXmlDefinitionProvider';
import type { BrightScriptLaunchConfiguration } from './DebugConfigurationProvider';
import { BrightScriptDebugConfigurationProvider } from './DebugConfigurationProvider';
import { DeclarationProvider } from './DeclarationProvider';
import { DefinitionRepository } from './DefinitionRepository';
import { Formatter } from './formatter';
import { LogDocumentLinkProvider } from './LogDocumentLinkProvider';
import { LogOutputManager } from './LogOutputManager';
import { RendezvousViewProvider } from './viewProviders/RendezvousViewProvider';
import { OnlineDevicesViewProvider } from './viewProviders/OnlineDevicesViewProvider';
import { sceneGraphDebugCommands } from './SceneGraphDebugCommands';
import { GlobalStateManager } from './GlobalStateManager';
import { languageServerManager } from './LanguageServerManager';
import { TelemetryManager } from './managers/TelemetryManager';
import { RemoteControlManager } from './managers/RemoteControlManager';
import { WhatsNewManager } from './managers/WhatsNewManager';
import type { CustomRequestEvent } from 'roku-debug';
import { isChannelPublishedEvent, isChanperfEvent, isDiagnosticsEvent, isDebugServerLogOutputEvent, isLaunchStartEvent, isRendezvousEvent, isCustomRequestEvent, isExecuteTaskCustomRequest, ClientToServerCustomEventName, isShowPopupMessageCustomRequest } from 'roku-debug';
import { RtaManager } from './managers/RtaManager';
import { WebviewViewProviderManager } from './managers/WebviewViewProviderManager';
import { ViewProviderId } from './viewProviders/ViewProviderId';
import { DiagnosticManager } from './managers/DiagnosticManager';
import { EXTENSION_ID } from './constants';
import { UserInputManager } from './managers/UserInputManager';
import { LocalPackageManager } from './managers/LocalPackageManager';
import { standardizePath as s } from 'brighterscript';

export class Extension {
    public outputChannel: vscode.OutputChannel;
    public sceneGraphDebugChannel: vscode.OutputChannel;
    /**
     * Output channel where all the extension logs should be written (includes roku-debug, vscode-brightscript-language, etc...)
     */
    public extensionOutputChannel: vscode.OutputChannel;
    public globalStateManager: GlobalStateManager;
    public whatsNewManager: WhatsNewManager;
    private chanperfStatusBar: vscode.StatusBarItem;
    private telemetryManager: TelemetryManager;
    private remoteControlManager: RemoteControlManager;
    private brightScriptCommands: BrightScriptCommands;
    private rtaManager: RtaManager;
    private webviewViewProviderManager: WebviewViewProviderManager;
    private diagnosticManager = new DiagnosticManager();
    private logOutputManager: LogOutputManager;

    public async activate(context: vscode.ExtensionContext) {
        const currentExtensionVersion = extensions.getExtension(EXTENSION_ID)?.packageJSON.version as string;

        this.globalStateManager = new GlobalStateManager(context);
        this.whatsNewManager = new WhatsNewManager(this.globalStateManager, currentExtensionVersion);
        this.chanperfStatusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right);

        //initialize the analytics manager
        context.subscriptions.push(
            this.telemetryManager = new TelemetryManager({
                extensionId: EXTENSION_ID,
                extensionVersion: currentExtensionVersion
            })
        );

        let localPackageManager = new LocalPackageManager(
            s`${context.globalStorageUri.fsPath}/packages`,
            context
        );

        this.telemetryManager.sendStartupEvent();
        let activeDeviceManager = new ActiveDeviceManager();
        let userInputManager = new UserInputManager(
            activeDeviceManager
        );

        this.remoteControlManager = new RemoteControlManager(this.telemetryManager);
        this.brightScriptCommands = new BrightScriptCommands(
            this.remoteControlManager,
            this.whatsNewManager,
            context,
            activeDeviceManager,
            userInputManager,
            localPackageManager
        );

        this.rtaManager = new RtaManager(context);
        this.webviewViewProviderManager = new WebviewViewProviderManager(context, this.rtaManager, this.brightScriptCommands);
        this.rtaManager.setWebviewViewProviderManager(this.webviewViewProviderManager);

        //update the tracked version of the extension
        this.globalStateManager.lastRunExtensionVersion = currentExtensionVersion;


        const declarationProvider = new DeclarationProvider();
        context.subscriptions.push(declarationProvider);

        //create channels
        this.outputChannel = vscode.window.createOutputChannel('BrightScript Log');
        this.sceneGraphDebugChannel = vscode.window.createOutputChannel('SceneGraph Debug Commands');
        this.extensionOutputChannel = util.createOutputChannel('BrightScript Extension', this.writeExtensionLog.bind(this));
        this.extensionOutputChannel.appendLine('Extension startup');

        let docLinkProvider = new LogDocumentLinkProvider();

        this.logOutputManager = new LogOutputManager(this.outputChannel, context, docLinkProvider, declarationProvider);

        const definitionRepo = new DefinitionRepository(declarationProvider);

        //initialize the LanguageServerManager
        void languageServerManager.init(context, definitionRepo, localPackageManager);

        //register a tree data provider for this extension's "RENDEZVOUS" view in the debug area
        let rendezvousViewProvider = new RendezvousViewProvider(context);
        vscode.window.registerTreeDataProvider(ViewProviderId.rendezvousView, rendezvousViewProvider);

        //register a tree data provider for this extension's "Online Devices" view
        let onlineDevicesViewProvider = new OnlineDevicesViewProvider(activeDeviceManager);
        vscode.window.registerTreeDataProvider(ViewProviderId.onlineDevicesView, onlineDevicesViewProvider);

        context.subscriptions.push(vscode.commands.registerCommand('extension.brightscript.rendezvous.clearHistory', async () => {
            try {
                await vscode.debug.activeDebugSession.customRequest('rendezvous.clearHistory');
            } catch { }

            //also clear the local rendezvous list
            rendezvousViewProvider.clear();
        }));

        context.subscriptions.push(vscode.commands.registerCommand('extension.brightscript.languageServer.restart', async () => {
            await languageServerManager.restart();
        }));

        //register the code formatter
        context.subscriptions.push(
            vscode.languages.registerDocumentRangeFormattingEditProvider({
                language: 'brightscript',
                scheme: 'file'
            }, new Formatter()),
            vscode.languages.registerDocumentRangeFormattingEditProvider({
                language: 'brighterscript',
                scheme: 'file'
            }, new Formatter())
        );

        //register the debug configuration provider
        let configProvider = new BrightScriptDebugConfigurationProvider(context, activeDeviceManager, this.telemetryManager, this.extensionOutputChannel, userInputManager, this.brightScriptCommands);
        context.subscriptions.push(
            vscode.debug.registerDebugConfigurationProvider('brightscript', configProvider)
        );

        //register a link provider for this extension's "BrightScript Log" output
        context.subscriptions.push(
            vscode.languages.registerDocumentLinkProvider({ language: 'Log' }, docLinkProvider)
        );

        vscode.window.registerUriHandler({
            handleUri: async (uri: vscode.Uri) => {
                if (uri.path.startsWith('/openFile/')) {
                    let docUri = vscode.Uri.file(uri.path.substr(10));
                    let doc = await vscode.workspace.openTextDocument(docUri);
                    await vscode.window.showTextDocument(doc, { preview: false });
                    let editor = vscode.window.activeTextEditor;
                    let lineNumber = Number(uri.fragment) ? Number(uri.fragment) - 1 : 0;
                    editor.selection = new vscode.Selection(lineNumber, 0, lineNumber, 0);
                    await vscode.commands.executeCommand('revealLine', {
                        lineNumber: lineNumber,
                        at: 'center'
                    });
                }
            }
        });

        //give the launch config to the link provider any time we launch the app
        vscode.debug.onDidReceiveDebugSessionCustomEvent((e) => {
            return this.debugSessionCustomEventHandler(e, context, docLinkProvider, this.logOutputManager, rendezvousViewProvider);
        });

        //register all commands for this extension
        this.brightScriptCommands.registerCommands();
        sceneGraphDebugCommands.registerCommands(context, this.sceneGraphDebugChannel);

        vscode.debug.onDidStartDebugSession(this.onDidStartDebugSession.bind(this));
        vscode.debug.onDidTerminateDebugSession(this.onDidTerminateDebugSession.bind(this));

        let brightscriptConfig = vscode.workspace.getConfiguration('brightscript');
        if (brightscriptConfig?.outputPanelStartupBehavior) {
            if (brightscriptConfig.outputPanelStartupBehavior === 'show') {
                //show the output panel on extension startup without taking focus (only if configured to do so...defaults to 'nothing')
                this.outputChannel.show(true);
            } else if (brightscriptConfig.outputPanelStartupBehavior === 'focus') {
                //focus the output panel on extension startup (only if configured to do so...defaults to 'nothing')
                this.outputChannel.show();
            }
        } else if (brightscriptConfig?.focusOutputPanelOnStartup === true) {
            // deprecated legacy config value
            //focus the output panel on extension startup (only if configured to do so...defaults to false)
            this.outputChannel.show();
        }

        //xml support
        const xmlSelector = { scheme: 'file', pattern: '**/*.{xml}' };
        context.subscriptions.push(vscode.languages.registerDefinitionProvider(xmlSelector, new BrightScriptXmlDefinitionProvider(definitionRepo)));

        await this.whatsNewManager.showWelcomeOrWhatsNewIfRequired();
        //await languageServerPromise;
    }

    private onDidStartDebugSession(debugSession: DebugSessionWithLinks) {
        //if this is a brightscript debug session
        if (debugSession.type === 'brightscript') {
            this.logOutputManager.onDidStartDebugSession();
            this.webviewViewProviderManager.onDidStartDebugSession(debugSession);
            const configuration = debugSession.configuration as BrightScriptLaunchConfiguration;

            const tsPath = this.getTsPath(configuration.rootDir);
            if (tsPath) {
                this.attachJsDebugger(debugSession as any, tsPath).catch(e => console.error(e));
            }
            this.diagnosticManager.clear();
        }

        //if this session has linked sessions, set up the reverse link
        if (debugSession.configuration.linkedSessions?.size > 0) {
            for (const linkedSession of debugSession.configuration.linkedSessions) {
                //attach this new session to all its linked session
                linkedSession.configuration.linkedSessions ??= new Set<DebugSessionWithLinks>();
                linkedSession.configuration.linkedSessions.add(debugSession);
            }
        }
    }

    private async onDidTerminateDebugSession(debugSession: DebugSessionWithLinks) {
        //if this is a brightscript debug session
        if (debugSession.type === 'brightscript') {
            this.chanperfStatusBar.hide();
            const config = debugSession.configuration as BrightScriptLaunchConfiguration;
            if (config.remoteControlMode?.deactivateOnSessionEnd) {
                void this.remoteControlManager.setRemoteControlMode(false, 'launch');
            }
            this.webviewViewProviderManager.onDidTerminateDebugSession(debugSession);
        }
        this.diagnosticManager.clear();

        //terminate any linked debug sessions
        for (const linkedSession of debugSession.configuration?.linkedSessions ?? []) {
            try {
                await vscode.debug.stopDebugging(linkedSession);
            } catch (e) {
                console.error(`Error stopping linked debug session with id ${linkedSession.id}`, e);
            }
        }
    }

    private async attachJsDebugger(parentSession: DebugSessionWithLinks, tsPath: string) {
        const launchConfig = parentSession.configuration as BrightScriptLaunchConfiguration;
        tsPath = tsPath.replace(/\s*pkg:/, '');
        // const tsDir = path.dirname(tsPath);
        const rootDir = launchConfig.rootDir;
        const workspaceFolders = vscode.workspace.workspaceFolders || [];
        const remoteRoot = path.normalize(path.dirname(tsPath));
        const localRoot = path.normalize(path.join(rootDir, remoteRoot));
        try {
            const debugConfig: vscode.DebugConfiguration = {
                type: 'node',
                //use the same debug config name as the parent, but suffix with (JS) so we can identify the JS debug session in the UI
                name: `${parentSession.configuration.name} (JS)`,
                request: 'attach',
                cwd: launchConfig.rootDir,
                address: launchConfig.host,
                port: 9999,
                sourceMaps: true,
                //this allows us to resolve sourcemaps from ANYWHERE
                resolveSourceMapLocations: null,
                // If source maps are enabled, these glob patterns specify the generated JavaScript files. If a pattern starts with `!` the files are excluded. If not specified, the generated code is expected in the same directory as its source.
                outFiles: [`${localRoot}/*.js`],
                //Absolute path to the remote directory containing the program. (what path the debugger will send to US, which will be translated to localRoot by the node debugger)
                remoteRoot: remoteRoot,
                // where the currently-running javascript (bundled) files live on this system
                localRoot: localRoot,

                //link sessions for coordinated cleanup. (this is a custom prop we are adding)
                linkedSessions: [parentSession]
            };

            const success = await vscode.debug.startDebugging(workspaceFolders[0], debugConfig);
            return !!success;
        } catch (e) {
            console.error(e);
            return false;
        }
    }

    private getTsPath(rootDir: string) {
        const contents = fsExtra.readFileSync(`${rootDir}/manifest`).toString();
        // https://regex101.com/r/qgLxGh/1
        const tsPath = /ts_path[ \t]*=[ \t]*(.*)?(?=[\r?\n]|$)/ig.exec(contents);
        return tsPath?.[1]?.trim();
    }

    private async debugSessionCustomEventHandler(e: vscode.DebugSessionCustomEvent, context: vscode.ExtensionContext, docLinkProvider: LogDocumentLinkProvider, logOutputManager: LogOutputManager, rendezvousViewProvider: RendezvousViewProvider) {

        if (isLaunchStartEvent(e)) {
            const config = e.body as BrightScriptLaunchConfiguration;
            await docLinkProvider.setLaunchConfig(config);
            logOutputManager.setLaunchConfig(config);
            if (config.remoteControlMode?.activateOnSessionStart) {
                void this.remoteControlManager.setRemoteControlMode(true, 'launch');
            }
        } else if (isChannelPublishedEvent(e)) {
            this.webviewViewProviderManager.onChannelPublishedEvent(e);
            //write debug server log statements to the DebugServer output channel
        } else if (isDebugServerLogOutputEvent(e)) {
            this.extensionOutputChannel.appendLine(e.body.line);

        } else if (isRendezvousEvent(e)) {
            rendezvousViewProvider.onDidReceiveDebugSessionCustomEvent(e);

        } else if (isCustomRequestEvent(e)) {
            await this.processCustomRequestEvent(e, e.session);
        } else if (isChanperfEvent(e)) {
            if (!e.body.error) {
                this.chanperfStatusBar.text = `$(dashboard)cpu: ${e.body.cpu.total}%, mem: ${prettyBytes(e.body.memory.total).replace(/ /g, '')}`;
            } else {
                this.chanperfStatusBar.text = e.body.error.message;
            }

            this.chanperfStatusBar.show();

        } else if (isDiagnosticsEvent(e)) {
            const diagnostics = e.body?.diagnostics ?? [];
            const firstDiagnostic = diagnostics[0];
            if (firstDiagnostic) {
                // open the first file with a compile error
                let uri = vscode.Uri.file(firstDiagnostic.path);
                let doc = await vscode.workspace.openTextDocument(uri);
                await vscode.window.showTextDocument(doc, {
                    preview: false,
                    selection: util.toRange(firstDiagnostic.range)
                });
            }

            let errorsByPath = {};
            for (const diagnostic of e.body.diagnostics) {
                if (diagnostic.path) {
                    if (!errorsByPath[diagnostic.path]) {
                        errorsByPath[diagnostic.path] = [];
                    }
                    errorsByPath[diagnostic.path].push(diagnostic);
                }
            }
            for (const path in errorsByPath) {
                if (errorsByPath.hasOwnProperty(path)) {
                    await this.diagnosticManager.addDiagnosticForError(path, errorsByPath[path]).catch(() => { });
                }
            }
        }

        try {
            await logOutputManager.onDidReceiveDebugSessionCustomEvent(e);
        } catch (err) {
            console.error('Error handling custom event', e, err);
        }
    }

    private async showMessage(e: any) {
        const methods = {
            error: vscode.window.showErrorMessage,
            info: vscode.window.showInformationMessage,
            warn: vscode.window.showWarningMessage
        };
        return {
            selectedAction: await methods[e.body.severity](e.body.message, { modal: e.body.modal }, ...(e?.body?.actions ?? []))
        };
    }

    private async processCustomRequestEvent(event: CustomRequestEvent, session: vscode.DebugSession) {
        try {
            let response: any;
            if (isExecuteTaskCustomRequest(event)) {
                response = await this.executeTask(event.body.task);
            } else if (isShowPopupMessageCustomRequest(event)) {
                response = await this.showMessage(event);
            }
            //send the response back to the server
            await session.customRequest(ClientToServerCustomEventName.customRequestEventResponse, {
                requestId: event.body.requestId,
                ...response ?? {}
            });
        } catch (error) {
            //send the error back to the server
            await session.customRequest(ClientToServerCustomEventName.customRequestEventResponse, {
                requestId: event.body.requestId,
                error: {
                    message: error?.message,
                    stack: error?.stack
                }
            });
        }
    }

    private async executeTask(taskName: string) {
        const tasks = await vscode.tasks.fetchTasks();
        const targetTask = tasks.find(x => x.name === taskName);
        if (!targetTask) {
            throw new Error(`Cannot find task '$taskName}'`);
        }
        let execution: vscode.TaskExecution;
        let taskFinished = new Promise<void>((resolve, reject) => {
            //monitor all ended tasks to see when our task ends
            const disposable = vscode.tasks.onDidEndTask((e) => {
                if (e.execution === execution) {
                    disposable.dispose();
                    resolve();
                }
            });
        });

        execution = await vscode.tasks.executeTask(targetTask);
        console.log(execution);
        await taskFinished;
    }

    /**
     * Writes text to a logfile if enabled
     */
    private writeExtensionLog(text: string) {
        let extensionLogfilePath = vscode.workspace.getConfiguration('brightscript').get<string>('extensionLogfilePath');
        if (extensionLogfilePath) {
            //replace the ${workspaceFolder} variable with the path to the first workspace
            extensionLogfilePath = extensionLogfilePath.replace('${workspaceFolder}', vscode.workspace.workspaceFolders?.[0]?.uri.fsPath);
            fsExtra.ensureDirSync(
                path.dirname(extensionLogfilePath)
            );
            fsExtra.appendFileSync(extensionLogfilePath, text);
        }
    }
}
export const extension = new Extension();
export async function activate(context: vscode.ExtensionContext) {
    await extension.activate(context);
}

/**
 * Debug session that also supports linking other debug sessions together in its configuration (for joint shutdown)
 */
interface DebugSessionWithLinks extends vscode.DebugSession {
    configuration: vscode.DebugConfiguration & {
        linkedSessions?: Set<DebugSessionWithLinks>;
    };
}
