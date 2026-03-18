import * as vscode from 'vscode';
import * as prettyBytes from 'pretty-bytes';
import { extensions } from 'vscode';
import * as path from 'path';
import * as fsExtra from 'fs-extra';
import { util } from './util';
import { DeviceManager } from './deviceDiscovery/DeviceManager';
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
import { DevicesViewProvider } from './viewProviders/DevicesViewProvider';
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
import { BrightScriptTaskProvider } from './BrightScriptTaskProvider';
import { standardizePath as s } from 'brighterscript';
import { PerfettoEditorProvider } from './editors/PerfettoEditor';

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
    private deviceManager: DeviceManager;

    public async activate(context: vscode.ExtensionContext) {
        //make this entire extension disposable so that all resources will be cleaned up on extension deactivation
        context.subscriptions.push(this);
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
        this.deviceManager = new DeviceManager(context, this.globalStateManager);
        let userInputManager = new UserInputManager(
            this.deviceManager
        );

        this.remoteControlManager = new RemoteControlManager(this.telemetryManager);
        this.brightScriptCommands = new BrightScriptCommands(
            this.remoteControlManager,
            this.whatsNewManager,
            context,
            this.deviceManager,
            userInputManager,
            localPackageManager
        );

        this.rtaManager = new RtaManager(context);
        this.webviewViewProviderManager = new WebviewViewProviderManager(context, this.rtaManager, this.brightScriptCommands);
        this.rtaManager.setWebviewViewProviderManager(this.webviewViewProviderManager);

        PerfettoEditorProvider.register(context);

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

        //register a tree data provider for this extension's "Devices" view
        let devicesViewProvider = new DevicesViewProvider(this.deviceManager);
        const devicesTreeView = vscode.window.createTreeView(ViewProviderId.devicesView, {
            treeDataProvider: devicesViewProvider
        });
        devicesViewProvider.setTreeView(devicesTreeView);

        // Initialize tasks manager
        const tasksManager = new BrightScriptTaskProvider();
        context.subscriptions.push(tasksManager);

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
        let configProvider = new BrightScriptDebugConfigurationProvider(context, this.telemetryManager, this.extensionOutputChannel, userInputManager, this.brightScriptCommands);
        context.subscriptions.push(
            vscode.debug.registerDebugConfigurationProvider('brightscript', configProvider)
        );

        // When attaching to Hermes (which always pauses on debugger connect), automatically
        // continue execution on the first stopped event so the user doesn't have to manually resume.
        // The pwa-node debugger spawns a child session for the actual Hermes connection — we target
        // that child session (identified by its parent having _isBrightscriptJsSession: true).
        context.subscriptions.push(
            vscode.debug.registerDebugAdapterTrackerFactory('pwa-node', {
                createDebugAdapterTracker: function createDebugAdapterTracker(session) {
                    if (!(session.parentSession as DebugSessionWithLinks)?.configuration?._isBrightscriptJsSession && session.parentSession?.configuration?.continueOnAttach !== true) {
                        return undefined;
                    }
                    let hasContinued = false;
                    let threadId: number;
                    let sawStoppedEvent = false;
                    let sawThreadsResponse = false;
                    let timeStart: number;
                    return {
                        onDidSendMessage: function onDidSendMessage(message) {

                            console.log(message.type, message.event, message);
                            if (message.type === 'response' && message.command === 'attach') {
                                // track how long we have been waiting to receive the stopped event after attaching, so we can log that when we do receive it
                                timeStart = Date.now();
                            }

                            if (message.type === 'event' && message.event === 'stopped') {
                                threadId = message.body.threadId;
                                sawStoppedEvent = true;
                            }

                            if (message.type === 'response' && message.command === 'threads') {
                                sawThreadsResponse = true;
                            }

                            if (sawStoppedEvent && sawThreadsResponse && threadId !== undefined && !hasContinued && message.type === 'response' && message.command === 'stackTrace') {
                                console.log('Automatically continuing after attach to Hermes session after ', timeStart ? Date.now() - timeStart : 0, 'ms');
                                hasContinued = true;
                                void session.customRequest('continue', { threadId: threadId });
                            }
                        }
                    };
                }
            })
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

    /**
     * Track active debug sessions for telemetry/UI purposes
     */
    private debugSessions = new Set<DebugSessionWithLinks>();

    private onDidStartDebugSession(debugSession: DebugSessionWithLinks) {
        //add to our active sessions for tracking
        this.debugSessions.add(debugSession);

        //if this is a brightscript debug session
        if (debugSession.type === 'brightscript') {
            this.logOutputManager.onDidStartDebugSession();
            this.webviewViewProviderManager.onDidStartDebugSession(debugSession);
            const configuration = debugSession.configuration as BrightScriptLaunchConfiguration;

            const tsPath = this.getTsPath(configuration.rootDir);
            if (tsPath) {
                this.attachJsDebugger(debugSession, tsPath).catch(e => console.error(e));
            }
            this.diagnosticManager.clear();
        }

        // When our JS session starts, find the BRS session by ID and link them bidirectionally
        // so either terminating causes the other to also terminate.
        if (debugSession.configuration._isBrightscriptJsSession) {
            const brsSession = [...this.debugSessions].find(s => s.id === debugSession.configuration._brightscriptParentSessionId);
            if (brsSession) {
                brsSession.configuration.linkedSessions ??= [];
                brsSession.configuration.linkedSessions.push(debugSession);
                debugSession.configuration.linkedSessions ??= [];
                debugSession.configuration.linkedSessions.push(brsSession);
            }
        }

        // When the pwa-node child session starts (child of our JS session), link it into the
        // cleanup chain so terminating any session tears down the others.
        if ((debugSession.parentSession as DebugSessionWithLinks)?.configuration?._isBrightscriptJsSession) {
            const jsSession = debugSession.parentSession as DebugSessionWithLinks;
            jsSession.configuration.linkedSessions ??= [];
            jsSession.configuration.linkedSessions.push(debugSession);
            debugSession.configuration.linkedSessions ??= [];
            debugSession.configuration.linkedSessions.push(jsSession);
        }
    }

    private async onDidTerminateDebugSession(debugSession: DebugSessionWithLinks) {
        //remove from our tracking first
        this.debugSessions.delete(debugSession);

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

        // vscode doesn't trigger the onDidStartDebugSession event until the debugger is actually attached.
        // So there's a window where the parent debug session stops while this is still trying to attach.
        // To more quickly close the node debugger in that situation, we will run much shorter "attach" windows
        // in a loop until we successfully attach or until the parent session ends.

        while (this.debugSessions.has(parentSession)) {
            //rewrite the debug session name to indicate it's the BRS session (this is just for user clarity in the UI, it has no functional effect)
            parentSession.name = `${parentSession.name.replace(/ \(BRS\)$/, '')} (BRS)`;
            try {
                const debugConfig: vscode.DebugConfiguration = {
                    type: 'node',
                    //use the same debug config name as the parent, but suffix with (JS) so we can identify the JS debug session in the UI
                    name: `${parentSession.configuration.name} (JS)`,
                    request: 'attach',
                    cwd: launchConfig.rootDir,
                    address: launchConfig.host,
                    port: 9999,
                    timeout: 2_000, // Shorter timeout for retry loop
                    sourceMaps: true,
                    //this allows us to resolve sourcemaps from ANYWHERE
                    resolveSourceMapLocations: null,
                    // If source maps are enabled, these glob patterns specify the generated JavaScript files. If a pattern starts with `!` the files are excluded. If not specified, the generated code is expected in the same directory as its source.
                    outFiles: [`${localRoot}/*.js`],
                    //Absolute path to the remote directory containing the program. (what path the debugger will send to US, which will be translated to localRoot by the node debugger)
                    remoteRoot: remoteRoot,
                    // where the currently-running javascript (bundled) files live on this system
                    localRoot: localRoot,

                    // don't pause on the first line when attaching
                    stopOnEntry: false,

                    // don't pause on the first line when attaching (e.g. when process launched with --inspect-brk)
                    continueOnAttach: true,

                    // markers so we can identify this session and link it back to the BRS session
                    _isBrightscriptJsSession: true,
                    _brightscriptParentSessionId: parentSession.id
                };

                const success = await vscode.debug.startDebugging(workspaceFolders[0], debugConfig);
                if (success) {
                    return true;
                }
            } catch (e) {
                console.error(e);
            }
        }
        // Parent session ended while we were trying to attach
        return false;
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

    public dispose() {
        this.outputChannel?.dispose?.();
        this.sceneGraphDebugChannel?.dispose?.();
        this.extensionOutputChannel?.dispose?.();
        this.chanperfStatusBar?.dispose?.();
        this.diagnosticManager?.dispose?.();
        this.deviceManager?.dispose?.();
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
        linkedSessions?: DebugSessionWithLinks[];
        _isBrightscriptJsSession?: boolean;
    };
}
