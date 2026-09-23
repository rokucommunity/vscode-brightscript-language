import * as vscode from 'vscode';
import * as prettyBytes from 'pretty-bytes';
import { extensions } from 'vscode';
import { isRceDeviceConfig } from 'roku-deploy';
import type { DeviceConfig } from 'roku-deploy';
import * as path from 'path';
import * as fsExtra from 'fs-extra';
import { util } from './util';
import { DeviceManager } from './deviceDiscovery/DeviceManager';
import { RokuDevConfigProvider } from './deviceDiscovery/RokuDevConfigProvider';
import { RsgSdkPasswordCandidateProvider } from './deviceDiscovery/RsgSdkPasswordCandidateProvider';
import { ExperimentalFeaturesManager } from './managers/ExperimentalFeaturesManager';
import { RceFinder } from './deviceDiscovery/RceFinder';
import { RceManager } from './managers/RceManager';
import { JsDebugProxyManager, JS_DEBUG_PORT } from './managers/JsDebugProxy/JsDebugProxyManager';
import { JsDebugPathTrace } from './managers/JsDebugProxy/JsDebugPathTrace';
import { RceVideoEditorManager } from './managers/RceVideoEditorManager';
import { BrightScriptCommands } from './BrightScriptCommands';
import { debugRokuProjectCommand } from './commands/DebugRokuProjectCommand';
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
import { DeviceTargetManager } from './managers/DeviceTargetManager';
import { WhatsNewManager } from './managers/WhatsNewManager';
import type { CustomRequestEvent, ProcessCrashEventData } from 'roku-debug';
import { isChannelPublishedEvent, isChanperfEvent, isDiagnosticsEvent, isDebugServerLogOutputEvent, isLaunchStartEvent, isRendezvousEvent, isCustomRequestEvent, isExecuteTaskCustomRequest, ClientToServerCustomEventName, isShowPopupMessageCustomRequest, isProcessCrashEvent, isProcessStagingDirCustomRequest } from 'roku-debug';
import { RtaManager } from './managers/RtaManager';
import { debugSessionManager } from './managers/DebugSessionManager';
import { WebviewViewProviderManager } from './managers/WebviewViewProviderManager';
import { ViewProviderId } from './viewProviders/ViewProviderId';
import { DiagnosticManager } from './managers/DiagnosticManager';
import { EXTENSION_ID } from './constants';
import { UserInputManager } from './managers/UserInputManager';
import { LocalPackageManager } from './managers/LocalPackageManager';
import { CredentialStore } from './managers/CredentialStore';
import { BrightScriptTaskProvider } from './BrightScriptTaskProvider';
import { standardizePath as s } from 'brighterscript';
import { PerfettoEditorProvider } from './editors/PerfettoEditor';
import { RokuProjectManager } from './managers/RokuProject/RokuProjectManager';
import { RokuProjectsViewProvider } from './viewProviders/RokuProjectsViewProvider';
import { injectDevtoolsBridge } from './solidDevtools/bridgeInjection';

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
    private extensionContext: vscode.ExtensionContext;
    private jsDebugProxyManager: JsDebugProxyManager;
    private jsDebugPathTrace: JsDebugPathTrace;
    //authoritative stagingDir per BRS session, keyed by parent session id - see attachJsDebugger's staging-ready wait
    private stagingReadyByParentSessionId = new Map<string, StagingReadyEntry>();
    //how long attachJsDebugger waits for the authoritative stagingDir before attaching with the guess; not readonly, tests shrink it
    private jsAttachStagingGraceMs = 30_000;
    //shown at most once per activation - a missing bridge bundle means the extension's own build is broken
    private hasShownMissingDevtoolsBridgeError = false;

    public async activate(context: vscode.ExtensionContext) {
        //make this entire extension disposable so that all resources will be cleaned up on extension deactivation
        context.subscriptions.push(this);
        this.extensionContext = context;
        const currentExtensionVersion = extensions.getExtension(EXTENSION_ID)?.packageJSON.version as string;

        //one-time migration: `remoteHost` workspace state is superseded by `remoteControlDeviceKey`, which
        //tracks the remote-control target for LAN and Cloud Emulator devices alike (distinct from
        //`activeDeviceKey`, which only the user's Set as Active Device writes). Carry a remembered
        //LAN host forward as a synthesized ip key, then drop the old state entirely
        const legacyRemoteHost = context.workspaceState.get<string>('remoteHost');
        if (legacyRemoteHost !== undefined) {
            // eslint-disable-next-line no-template-curly-in-string
            if (legacyRemoteHost && legacyRemoteHost !== '${promptForHost}' && !context.workspaceState.get('remoteControlDeviceKey')) {
                await context.workspaceState.update('remoteControlDeviceKey', `i:${legacyRemoteHost}`);
            }
            await context.workspaceState.update('remoteHost', undefined);
        }

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
        this.extensionOutputChannel = util.createOutputChannel('BrightScript Extension', this.writeExtensionLog.bind(this));
        this.extensionOutputChannel.appendLine('Extension startup');
        //constructed for its side effects: it publishes the `brightscript.experimental.*` context
        //keys and keeps them following the settings. No feature consumes it today
        void new ExperimentalFeaturesManager(context);

        const rceManager = new RceManager(context);
        rceManager.register(context);
        this.jsDebugProxyManager = new JsDebugProxyManager(rceManager, (message) => this.extensionOutputChannel.appendLine(message));
        context.subscriptions.push(this.jsDebugProxyManager);
        this.jsDebugPathTrace = new JsDebugPathTrace((message) => this.extensionOutputChannel.appendLine(message));
        this.jsDebugPathTrace.register(context);
        const rceFinder = new RceFinder(rceManager, (message) => this.extensionOutputChannel.appendLine(message));
        context.subscriptions.push(new RceVideoEditorManager(context, rceManager, rceFinder));
        this.deviceManager = new DeviceManager(context, this.globalStateManager, this.extensionOutputChannel, rceFinder);
        const rokuDevConfigProvider = new RokuDevConfigProvider();
        context.subscriptions.push(rokuDevConfigProvider);
        const rsgSdkPasswordCandidateProvider = new RsgSdkPasswordCandidateProvider(this.deviceManager, rokuDevConfigProvider);
        context.subscriptions.push(rsgSdkPasswordCandidateProvider);
        //register the env-derived devices first so config-file devices override them for the same host
        this.deviceManager.addConfiguredDeviceProvider(rsgSdkPasswordCandidateProvider);
        this.deviceManager.addConfiguredDeviceProvider(rokuDevConfigProvider);
        const credentialStore = new CredentialStore(context);
        let userInputManager = new UserInputManager(
            this.deviceManager,
            credentialStore
        );
        userInputManager.addPasswordCandidateProvider(rsgSdkPasswordCandidateProvider);

        this.remoteControlManager = new RemoteControlManager(this.telemetryManager);
        const deviceTargetManager = new DeviceTargetManager(context, this.deviceManager, userInputManager);
        this.brightScriptCommands = new BrightScriptCommands(
            this.remoteControlManager,
            this.whatsNewManager,
            context,
            this.deviceManager,
            userInputManager,
            localPackageManager,
            credentialStore,
            deviceTargetManager
        );

        this.rtaManager = new RtaManager(context, rceManager, this.deviceManager);
        this.webviewViewProviderManager = new WebviewViewProviderManager(context, this.rtaManager, rceManager, rceFinder, this.deviceManager, this.brightScriptCommands, deviceTargetManager);
        this.rtaManager.setWebviewViewProviderManager(this.webviewViewProviderManager);

        PerfettoEditorProvider.register(context);

        //update the tracked version of the extension
        this.globalStateManager.lastRunExtensionVersion = currentExtensionVersion;


        const declarationProvider = new DeclarationProvider();
        context.subscriptions.push(declarationProvider);

        //create channels
        this.outputChannel = vscode.window.createOutputChannel('BrightScript Log');
        this.sceneGraphDebugChannel = vscode.window.createOutputChannel('SceneGraph Debug Commands');

        let docLinkProvider = new LogDocumentLinkProvider();

        this.logOutputManager = new LogOutputManager(this.outputChannel, context, docLinkProvider, declarationProvider);

        const definitionRepo = new DefinitionRepository(declarationProvider);

        //initialize the LanguageServerManager
        void languageServerManager.init(context, definitionRepo, localPackageManager);

        //register a tree data provider for this extension's "RENDEZVOUS" view in the debug area
        let rendezvousViewProvider = new RendezvousViewProvider(context);
        vscode.window.registerTreeDataProvider(ViewProviderId.rendezvousView, rendezvousViewProvider);

        //register a tree data provider for this extension's "Devices" view
        let devicesViewProvider = new DevicesViewProvider(this.deviceManager, credentialStore, context);
        const devicesTreeView = vscode.window.createTreeView(ViewProviderId.devicesView, {
            treeDataProvider: devicesViewProvider
        });
        devicesViewProvider.setTreeView(devicesTreeView);

        this.brightScriptCommands.registerDevicesViewCommands(devicesViewProvider);

        // Initialize tasks manager
        const tasksManager = new BrightScriptTaskProvider();
        context.subscriptions.push(tasksManager);

        const rokuProjectsViewProvider = new RokuProjectsViewProvider();
        vscode.window.createTreeView(ViewProviderId.rokuProjectsView, {
            treeDataProvider: rokuProjectsViewProvider,
            showCollapseAll: false
        });

        const rokuProjectProvider = new RokuProjectManager(tasksManager, rokuProjectsViewProvider);
        rokuProjectProvider.register(context);
        debugRokuProjectCommand.register(context, rokuProjectProvider);

        context.subscriptions.push(vscode.commands.registerCommand('extension.brightscript.rendezvous.clearHistory', async () => {
            try {
                //target the BrightScript session explicitly — in a dual BRS/JS session the JS
                //session may be active, and only roku-debug answers this custom request.
                await debugSessionManager.getActiveBrightScriptSession()?.customRequest('rendezvous.clearHistory');
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
        let configProvider = new BrightScriptDebugConfigurationProvider(context, this.telemetryManager, this.extensionOutputChannel, userInputManager, this.brightScriptCommands, this.deviceManager, credentialStore, rceManager, rokuProjectProvider);
        context.subscriptions.push(
            // Initial: resolveDebugConfiguration — handles launch.json configs and F5 with no launch.json
            vscode.debug.registerDebugConfigurationProvider('brightscript', configProvider, vscode.DebugConfigurationProviderTriggerKind.Initial),
            // Dynamic: provideDebugConfigurations — surfaces discovered Roku projects in the debug picker
            vscode.debug.registerDebugConfigurationProvider('brightscript', configProvider, vscode.DebugConfigurationProviderTriggerKind.Dynamic)
        );

        // When attaching to Hermes (which always pauses on debugger connect), automatically
        // continue execution on the first stopped event so the user doesn't have to manually resume.
        // The pwa-node debugger spawns a child session for the actual Hermes connection — we target
        // that child session (identified by its parent having _isBrightscriptJsSession: true).
        const debugTsEvents = false;
        const logTsEvents = (cb: () => any[]) => {
            if (debugTsEvents) {
                console.log(...cb());
            }
        }; // set to true to enable debug logging for this feature
        context.subscriptions.push(
            vscode.debug.registerDebugAdapterTrackerFactory('pwa-node', {
                createDebugAdapterTracker: function createDebugAdapterTracker(session) {
                    if (!session.parentSession.configuration?._isBrightscriptJsSession || session.parentSession?.configuration?.continueOnAttach !== true) {
                        return undefined;
                    }

                    let threadId: number | undefined;
                    let hasValidStackForCurrentStop = false;
                    return {
                        onDidSendMessage: function onDidSendMessage(message) {
                            logTsEvents(() => [message.type, message.type === 'response' ? message.command : message.event, JSON.stringify(message)]);

                            if (message.type === 'event' && message.event === 'stopped') {
                                // Save the last threadId so we can continue it after attach. Hermes doesn't include the threadId in the stackTrace response.
                                // Only update if the event body actually has a threadId — some Hermes attach pauses omit it.
                                if (message.body.threadId !== undefined) {
                                    threadId = message.body.threadId;
                                }
                                hasValidStackForCurrentStop = false;
                                logTsEvents(() => [`stopped event: threadId=${threadId} (from event body: ${message.body.threadId})`]);
                            }

                            // Fallback: if the stopped event had no threadId, grab it from the threads response (which always precedes the stackTrace request)
                            if (threadId === undefined && message.type === 'response' && message.command === 'threads' && message.body.threads?.length > 0) {
                                threadId = message.body.threads[0].id;
                                logTsEvents(() => [`set threadId from threads response fallback: ${threadId}`]);
                            }

                            // Automatically continue after attach if Hermes session is paused with no stack frames. These seem to be auto pauses that happen on attach.
                            // VS Code may make multiple stackTrace requests per stop; once a valid (non-empty) stack is seen, don't auto-continue on a subsequent empty one.
                            if (threadId !== undefined && message.type === 'response' && message.command === 'stackTrace') {
                                const frames = message.body.stackFrames;
                                logTsEvents(() => [`stackTrace: ${frames.length} frames`, ...frames.map((f: any) => `${f.source?.path ?? f.source?.name ?? '(no source)'}:${f.line}`)]);
                                if (frames.some((f: any) => f.source?.path)) {
                                    // At least one frame has a real source file — this is a valid user-code stop
                                    hasValidStackForCurrentStop = true;
                                } else if (!hasValidStackForCurrentStop) {
                                    logTsEvents(() => ['Automatically continuing pause after attach with Hermes session...']);
                                    void session.customRequest('continue', { threadId: threadId });
                                }
                            }
                        }
                    };
                }
            })
        );

        //register a descriptor factory so we can inject process-level env vars into the debug adapter before it starts.
        //this is required for features like DAP protocol logging, which must be configured before the first DAP message arrives.
        //note: an inline or server-based adapter (no executable) skips env injection entirely; we always spawn an executable today.
        context.subscriptions.push(
            vscode.debug.registerDebugAdapterDescriptorFactory('brightscript', {
                createDebugAdapterDescriptor: async (session: vscode.DebugSession, executable: vscode.DebugAdapterExecutable | undefined): Promise<vscode.DebugAdapterDescriptor | undefined> => {
                    if (!executable) {
                        return executable;
                    }
                    const env: Record<string, string> = {};

                    // Only inject the DAP protocol log path if the user explicitly configured it.
                    const dapLogFilePath = (session.configuration as any).debugAdapterProtocolLogFilePath as string | undefined;
                    if (dapLogFilePath) {
                        env.ROKU_DAP_LOG_FILE = dapLogFilePath;
                    }

                    //hand the Cloud Emulator account token to the adapter as an env var - its only transport;
                    //the config resolver strips rceToken from the resolved config, which travels through DAP
                    //traffic/logs and is readable by other extensions. roku-debug hydrates the device option's
                    //rceToken from ROKU_RCE_TOKEN whenever the launch config did not carry one
                    const device = session.configuration.device as DeviceConfig | undefined;
                    if (typeof device === 'object' && isRceDeviceConfig(device)) {
                        const accountToken = await rceManager.getToken();
                        if (accountToken) {
                            env.ROKU_RCE_TOKEN = accountToken;
                        }
                    }

                    return new vscode.DebugAdapterExecutable(executable.command, executable.args, { ...executable.options, env: env });
                }
            })
        );

        //register a link provider for this extension's "BrightScript Log" output
        context.subscriptions.push(
            vscode.languages.registerDocumentLinkProvider({ language: 'Log', scheme: 'output' }, docLinkProvider)
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
        sceneGraphDebugCommands.registerCommands(context, this.sceneGraphDebugChannel, deviceTargetManager);

        // The DebugSessionManager is the single source of truth for live sessions, BRS<->JS
        // grouping, and joint teardown. React to ITS lifecycle events rather than vscode's
        // directly, so everything sees the same tracked/grouped state.
        debugSessionManager.register(context);
        context.subscriptions.push(
            debugSessionManager.onDidStartSession(this.onDidStartDebugSession.bind(this)),
            debugSessionManager.onDidTerminateSession(this.onDidTerminateDebugSession.bind(this))
        );

        let brightscriptConfig = util.getConfiguration('brightscript');
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

    private onDidStartDebugSession(debugSession: vscode.DebugSession) {
        //session tracking + BRS<->JS linking is owned by debugSessionManager; react only to
        //the brightscript session here for our domain-specific startup work.
        if (debugSession.type === 'brightscript') {
            this.logOutputManager.onDidStartDebugSession();
            this.webviewViewProviderManager.onDidStartDebugSession(debugSession);
            const configuration = debugSession.configuration as BrightScriptLaunchConfiguration;

            this.resolveJsDebugTarget(configuration).then(target => {
                if (target) {
                    return this.attachJsDebugger(debugSession, target);
                }
            }).catch(e => console.error(e));
            this.diagnosticManager.clear();
        }
    }

    private onDidTerminateDebugSession(debugSession: vscode.DebugSession) {
        //session tracking + joint teardown of linked sessions is owned by debugSessionManager.
        if (debugSession.type === 'brightscript') {
            this.chanperfStatusBar.hide();
            const config = debugSession.configuration as BrightScriptLaunchConfiguration;
            if (config.remoteControlMode?.deactivateOnSessionEnd) {
                void this.remoteControlManager.setRemoteControlMode(false, 'launch');
            }
            this.jsDebugProxyManager.stop(debugSession.id);
            this.stagingReadyByParentSessionId.delete(debugSession.id);
            this.webviewViewProviderManager.onDidTerminateDebugSession(debugSession);
        }
        this.diagnosticManager.clear();
    }

    /**
     * Find the compiled JS bundle this session should attach the node debugger to (if any).
     * A top-level `tsPath` in launch.json wins, then the app manifest's `ts_path`, then the
     * first component library with a `tsPath` configured in launch.json.
     */
    private async resolveJsDebugTarget(configuration: BrightScriptLaunchConfiguration): Promise<JsDebugTarget | undefined> {
        const appTsPath = configuration.tsPath ?? util.getTsPath(configuration.rootDir);
        if (appTsPath) {
            const workspaceFolders = vscode.workspace.workspaceFolders || [];
            //use the stagingDir if provided, otherwise default to what we think it will probably be (hasn't changed in years...)
            const stagingDir = configuration.stagingDir ?? configuration.stagingFolderPath ?? `${workspaceFolders[0].uri.fsPath}/out/.roku-deploy-staging`;
            return { tsPath: appTsPath, rootDir: configuration.rootDir, stagingDir: stagingDir, kind: 'main' };
        }

        for (const library of configuration.componentLibraries ?? []) {
            if (!library.tsPath) {
                continue;
            }
            //roku-debug stages each component library in its own folder at `${outDir}/component-libraries/<outFile minus extension>`,
            //where outFile may contain `${var}` placeholders resolved from the library's manifest. Recreate that path here.
            const manifestValues = await util.convertManifestToObject(path.join(library.rootDir, 'manifest')) ?? {};
            const outFileName = library.outFile.replace(/\$\{([\w\d_]+)\}/g, (wholeMatch, name) => (manifestValues[name] ?? wholeMatch).trim());
            const stagingDir = s`${configuration.outDir}/component-libraries/${path.basename(outFileName, path.extname(outFileName))}`;
            //`processStagingDir` only reports the MAIN project's authoritative stagingDir - a complib
            //target keeps its own derivation, never the recorded main-project value
            return { tsPath: library.tsPath, rootDir: library.rootDir, stagingDir: stagingDir, kind: 'componentLibrary' };
        }
    }

    private async attachJsDebugger(parentSession: vscode.DebugSession, target: JsDebugTarget) {
        const workspaceFolders = vscode.workspace.workspaceFolders || [];
        const tsPath = target.tsPath.replace(/\s*(?:lib)?pkg:/, '');
        //`tsPath` is a DEVICE path (`pkg:/source/compiled/index.js`), so it is always posix. Using
        //the platform-native helpers here rewrites it to `\source\compiled` on Windows, which
        //matches nothing the device reports back.
        //something like /source/compiled
        const remoteRoot = path.posix.dirname(tsPath);

        const jsDebugTraceConfig = this.jsDebugPathTrace.getJsDebugTraceConfig(workspaceFolders[0]?.uri.fsPath ?? target.rootDir);

        const configuration = parentSession.configuration as BrightScriptLaunchConfiguration;
        let address: string;
        let port: number;
        //over the relay, js-debug's child-process auto-attach would open a second inspector
        //connection into the one tunneled session and crash Hermes on the duplicate `Runtime.enable`;
        //direct LAN attaches give each child its own port, so js-debug's default (enabled) is safe there
        let autoAttachChildProcesses: boolean | undefined;

        const route = this.jsDebugProxyManager.resolveRoute({
            device: configuration.device,
            fallbackHost: configuration.host,
            platform: process.platform,
            forceLanRelay: vscode.workspace.getConfiguration('brightscript.debug').get<boolean>('forceJsDebugRelay') === true
        });
        this.extensionOutputChannel.appendLine(`[js-debug-proxy] ${route.summary}`);

        if (route.useRelay) {
            try {
                port = await this.jsDebugProxyManager.start(parentSession.id, route.device);
            } catch (e) {
                this.extensionOutputChannel.appendLine(`Failed to start JS debug proxy: ${e?.message ?? e}`);
                this.jsDebugProxyManager.stop(parentSession.id);
                return false;
            }

            //the parent session can terminate during the async start() above
            if (!debugSessionManager.isLive(parentSession)) {
                this.jsDebugProxyManager.stop(parentSession.id);
                return false;
            }

            address = '127.0.0.1';
            autoAttachChildProcesses = false;
        } else {
            address = route.host ?? configuration.host;
            port = JS_DEBUG_PORT;
        }

        //A previous app instance may still be listening on the device when this session starts,
        //so attaching before the NEW app is confirmed running can bind js-debug to the OLD process
        //(it'll die when the new app replaces it, with no re-attach). `emitChannelPublishedEvent`
        //is a documented user escape hatch for devices roku-debug says lock up on that event - when
        //it's explicitly disabled, roku-debug never sends it, so gate on staging-known instead so
        //those users don't eat the full grace period.
        const channelPublishedEventEnabled = configuration.emitChannelPublishedEvent !== false;
        const stagingEntry = this.getOrCreateStagingEntry(parentSession.id);
        const attachWaitResult = await this.waitForAttachSignal(parentSession, stagingEntry, channelPublishedEventEnabled);
        if (attachWaitResult === 'died') {
            this.jsDebugProxyManager.stop(parentSession.id);
            return false;
        } else if (attachWaitResult === 'timeout') {
            const signal = channelPublishedEventEnabled ? 'channelPublished' : 'stagingDir (emitChannelPublishedEvent is disabled)';
            this.extensionOutputChannel.appendLine(`[js-debug-proxy] ${signal} not received within ${this.jsAttachStagingGraceMs}ms - proceeding with stagingDir '${stagingEntry.stagingDir ?? target.stagingDir}'`);
        }

        // vscode doesn't trigger the onDidStartDebugSession event until the debugger is actually attached.
        // So there's a window where the parent debug session stops while this is still trying to attach.
        // To more quickly close the node debugger in that situation, we will run much shorter "attach" windows
        // in a loop until we successfully attach or until the parent session ends.

        //tracks what the previous attempt logged, so the retry loop (which can run for a while)
        //only re-logs the summary/guess-vs-actual lines when the stagingDir actually changes
        let previousStagingDirUsed: string | undefined;

        while (debugSessionManager.isLive(parentSession)) {
            // The node debugger attaches against the bundle's local rootDir. If that directory has
            // been deleted (e.g. a `dist-build/bundle` wiped mid-session), vscode rejects the attach
            // synchronously with a modal "The configured `cwd` ... does not exist." Since that
            // rejection never hits the attach timeout below, retrying here would hot-loop and spam
            // the modal as fast as the user can dismiss it. Bail instead — attach cannot succeed
            // without the rootDir, and it will be retried the next time a debug session starts.
            if (!fsExtra.existsSync(target.rootDir)) {
                console.error(`Cannot attach node debugger: rootDir does not exist at '${target.rootDir}'`);
                //don't leave the relay listening with nothing left to attach to it
                this.jsDebugProxyManager.stop(parentSession.id);
                return false;
            }

            //rewrite the debug session name to indicate it's the BRS session (this is just for user clarity in the UI, it has no functional effect)
            parentSession.name = `${parentSession.name.replace(/ \(BRS\)$/, '')} (BRS)`;
            try {
                //recomputed every attempt (not hoisted) so an authoritative stagingDir that arrives
                //after the grace timeout is still picked up by the next retry. Only a 'main' target
                //may substitute the recorded value in - `processStagingDir` only ever reports the
                //MAIN project's stagingDir, which is meaningless for a component library target.
                const stagingDirUsed = target.kind === 'main' ? (stagingEntry.stagingDir ?? target.stagingDir) : target.stagingDir;
                //something like ${stagingDir}/source/compiled - the staged copy is what gets zipped and
                //sideloaded, so its sourcemap is the one whose lines match what the device runs
                const localRoot = path.join(stagingDirUsed, remoteRoot);
                //js-debug matches globs with forward slashes on every platform
                const localRootPosix = localRoot.replace(/\\/g, '/');
                const outFiles = [`${localRootPosix}/*.js`];

                //only log when the stagingDir actually changed since the last attempt (always true
                //on the first attempt) - the retry loop can run for a while and re-logging the same
                //summary every ~2s is just noise
                if (stagingDirUsed !== previousStagingDirUsed) {
                    if (stagingDirUsed !== target.stagingDir) {
                        this.extensionOutputChannel.appendLine(`[js-debug-proxy] stagingDir guess '${target.stagingDir}' differed from actual '${stagingDirUsed}' - using actual`);
                    }
                    this.jsDebugPathTrace.logStartupSummary({
                        platform: process.platform,
                        tsPath: tsPath,
                        remoteRoot: remoteRoot,
                        localRoot: localRoot,
                        outFiles: outFiles,
                        jsDebugTraceFile: jsDebugTraceConfig?.logFile
                    });
                    previousStagingDirUsed = stagingDirUsed;
                }

                const debugConfig: vscode.DebugConfiguration = {
                    type: 'node',
                    //use the same debug config name as the parent, but suffix with (JS) so we can identify the JS debug session in the UI
                    name: `${parentSession.configuration.name} (JS)`,
                    request: 'attach',
                    cwd: target.rootDir,
                    address: address,
                    port: port,
                    timeout: 2_000, // Shorter timeout for retry loop
                    //set to false whenever the relay is in use, omitted on a direct LAN attach - see the derivation above
                    ...(autoAttachChildProcesses === undefined ? {} : { autoAttachChildProcesses: autoAttachChildProcesses }),
                    sourceMaps: true,
                    //this allows us to resolve sourcemaps from ANYWHERE
                    resolveSourceMapLocations: null,
                    // If source maps are enabled, these glob patterns specify the generated JavaScript files. If a pattern starts with `!` the files are excluded. If not specified, the generated code is expected in the same directory as its source.
                    outFiles: outFiles,
                    //Absolute path to the remote directory containing the program. (what path the debugger will send to US, which will be translated to localRoot by the node debugger)
                    remoteRoot: remoteRoot,
                    // where the currently-running javascript (bundled) files live on this system
                    localRoot: localRoot,

                    // don't pause on the first line when attaching
                    stopOnEntry: parentSession.configuration?.stopOnEntry ?? false,

                    // don't pause on the first line when attaching (e.g. when process launched with --inspect-brk)
                    continueOnAttach: !(parentSession.configuration?.stopOnEntry ?? false),

                    // markers so we can identify this session and link it back to the BRS session
                    _isBrightscriptJsSession: true,
                    _brightscriptParentSessionId: parentSession.id,

                    // When `brightscript.debug.jsPathTrace` is on, have js-debug write its full
                    // CDP+DAP wire log to the workspace logs folder. This is the only place the
                    // RAW script urls and its own path-mapping decisions are visible - the DAP
                    // tracker in JsDebugPathTrace only ever sees post-mapping paths.
                    trace: jsDebugTraceConfig
                };

                const success = await vscode.debug.startDebugging(workspaceFolders[0], debugConfig);
                if (success) {
                    //opt this JS session into joint teardown - unconfirmed (failed) attach
                    //attempts must not tear down the parent while this loop is still retrying
                    debugSessionManager.confirmJsSessionsFor(parentSession.id);
                    return true;
                }
            } catch (e) {
                console.error(e);
            }
        }
        // Parent session ended while we were trying to attach; stop() is idempotent
        this.jsDebugProxyManager.stop(parentSession.id);
        return false;
    }

    /** Gets (or lazily creates) the staging-ready entry for a BRS session id. */
    private getOrCreateStagingEntry(parentSessionId: string): StagingReadyEntry {
        let entry = this.stagingReadyByParentSessionId.get(parentSessionId);
        if (!entry) {
            entry = { stagingDir: undefined, channelPublished: false };
            this.stagingReadyByParentSessionId.set(parentSessionId, entry);
        }
        return entry;
    }

    /**
     * Waits for the signal `attachJsDebugger` should gate its first attach attempt on: normally
     * roku-debug's ChannelPublishedEvent (the device now runs THIS session's app), or - when
     * `emitChannelPublishedEvent` is explicitly disabled and roku-debug will never send it -
     * merely the authoritative stagingDir. The grace timeout only applies while NO signal at all
     * has been seen; once staging is known (proof this roku-debug speaks the custom-event
     * protocol) it keeps waiting for channelPublished indefinitely, with session-death as the
     * only exit - a slow RCE sideload must not fall through into the stale-app attach window.
     */
    private async waitForAttachSignal(parentSession: vscode.DebugSession, entry: StagingReadyEntry, channelPublishedEventEnabled: boolean): Promise<'ready' | 'died' | 'timeout'> {
        const deadline = Date.now() + this.jsAttachStagingGraceMs;
        while (true) {
            if (channelPublishedEventEnabled ? entry.channelPublished : entry.stagingDir !== undefined) {
                return 'ready';
            }
            if (!debugSessionManager.isLive(parentSession)) {
                return 'died';
            }
            const stagingSeen = entry.stagingDir !== undefined;
            if (Date.now() >= deadline && !(channelPublishedEventEnabled && stagingSeen)) {
                return 'timeout';
            }
            await new Promise<void>(resolve => {
                setTimeout(resolve, 50);
            });
        }
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
            //the device now runs THIS session's app - unblocks attachJsDebugger's wait for e.session.
            //Guard against re-creating the entry for a session that already terminated.
            if (debugSessionManager.isLive(e.session)) {
                this.getOrCreateStagingEntry(e.session.id).channelPublished = true;
            }
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

        } else if (isProcessCrashEvent(e)) {
            const data: ProcessCrashEventData = e.body;
            const label = data.type === 'uncaughtException' ? 'Uncaught exception' : 'Unhandled rejection';
            const selected = await vscode.window.showErrorMessage(
                `BrightScript debug adapter crashed (${label}): ${data.message}`,
                { modal: true },
                'Report Issue'
            );
            void vscode.debug.stopDebugging(e.session);
            if (selected === 'Report Issue') {
                let additionalInfoSection = '';
                if (data.additionalInfo && Object.keys(data.additionalInfo).length > 0) {
                    const lines = Object.entries(data.additionalInfo).map(([key, value]) => {
                        // Insert a space before all uppercase letters preceded by a lowercase letter, then uppercase the first char
                        const spacedString = key.replace(/([a-z])([A-Z])/g, '$1 $2');
                        const formattedKey = spacedString.charAt(0).toUpperCase() + spacedString.slice(1);
                        return `|${formattedKey}|${typeof value === 'string' ? value : JSON.stringify(value)}|`;
                    });
                    additionalInfoSection = lines.join('\n');
                }
                await vscode.commands.executeCommand('workbench.action.openIssueReporter', {
                    extensionId: 'RokuCommunity.brightscript',
                    issueType: 0,
                    issueTitle: `DAP crash: ${data.type} - ${data.message}`,
                    issueBody: [
                        '## Debug Adapter Crash',
                        `**Type:** ${data.type}`,
                        `**Message:** ${data.message}`,
                        '',
                        '**Steps to reproduce:**',
                        '<!-- Please describe what you were doing when this crash occurred -->',
                        '',
                        '**Stack:**',
                        '```',
                        `${data.stack ?? 'N/A'}`,
                        '```',
                        '',
                        `<details>`,
                        `<summary>Additional Info</summary>`,
                        '',
                        `|Item|Value|`,
                        `|---|---|`,
                        `${additionalInfoSection || ''}`,
                        '',
                        `</details>`
                    ].join('\n')
                });
            }


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
            } else if (isProcessStagingDirCustomRequest(event)) {
                response = await this.processStagingDir(event, session);
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
                    message: (error as Error)?.message,
                    stack: (error as Error)?.stack
                }
            });
        }
    }

    private async executeTask(taskName: string) {
        const tasks = await vscode.tasks.fetchTasks();
        const targetTask = tasks.find(x => x.name === taskName);
        if (!targetTask) {
            throw new Error(`Cannot find task '${taskName}'`);
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
     * Handle the `processStagingDir` reverse request from roku-debug — sent after all projects are
     * staged and before they're packaged. This is where the extension injects the Solid Devtools
     * on-device bridge into the main project's staged TS bundle (no-op for non-TS apps and when
     * the `brightscript.solidDevtools.enabled` setting is off; never fails the launch), and where
     * `attachJsDebugger`'s staging-ready wait for `session` (the BRS session) learns the
     * authoritative stagingDir it was guessing at.
     */
    private async processStagingDir(event: CustomRequestEvent<{ projects: Array<{ type: string; stagingDir: string }> }>, session: vscode.DebugSession) {
        const projects = event.body.projects ?? [];
        const solidDevtoolsEnabled = vscode.workspace.getConfiguration('brightscript').get<boolean>('solidDevtools.enabled', true);
        for (const project of projects) {
            //only the main app project carries the TS bundle
            if (project.type !== 'main') {
                continue;
            }

            //this is the authoritative stagingDir `resolveJsDebugTarget` could only guess at -
            //unblock attachJsDebugger's wait for `session` (the BRS session) right away. Guard
            //against re-creating the entry for a session that already terminated (this handler
            //can finish after `onDidTerminateDebugSession` already cleaned it up).
            if (debugSessionManager.isLive(session)) {
                this.getOrCreateStagingEntry(session.id).stagingDir = project.stagingDir;
            }

            //Always fix the staged sourcemap, regardless of the devtools setting: roku-debug
            //rewrites `sources` while staging and (on Windows) emits them with native separators.
            //Sourcemap `sources` are URLs, so `..\..\packages\x.ts` never collapses against the
            //map's posix location - js-debug ends up with a driveless path and vscode opens a
            //phantom duplicate tab instead of the user's real file. TODO: fix in roku-debug.
            await this.normalizeStagedSourceMaps(project.stagingDir);

            if (solidDevtoolsEnabled) {
                const bridgeResult = await injectDevtoolsBridge({
                    stagingDir: project.stagingDir,
                    devtoolsBridgePath: path.join(this.extensionContext.extensionPath, 'dist', 'solidDevtools', 'bridge.js'),
                    log: (message) => this.extensionOutputChannel.appendLine(`[SolidDevtools] ${message}`)
                });
                if (bridgeResult.bridgeBundleMissing && !this.hasShownMissingDevtoolsBridgeError) {
                    this.hasShownMissingDevtoolsBridgeError = true;
                    void vscode.window.showErrorMessage(
                        'The Solid Devtools on-device bridge is missing from this extension build. The devtools panel will stay empty until this is fixed. See the BrightScript output channel for details.'
                    );
                }
            }
        }
    }

    /**
     * Rewrite backslashes to forward slashes in every staged `.js.map`'s `sources`/`sourceRoot`.
     * Never throws - a malformed map must not break the launch.
     */
    private async normalizeStagedSourceMaps(stagingDir: string) {
        //the TS bundle's map is the one that matters, and the staged manifest's `ts_path` names it
        const manifestPath = s`${stagingDir}/manifest`;
        let mapPath: string;
        try {
            if (!await fsExtra.pathExists(manifestPath)) {
                return;
            }
            const manifest = await fsExtra.readFile(manifestPath, 'utf8');
            const tsPath = /^[ \t]*ts_path[ \t]*=[ \t]*(.+?)[ \t\r]*$/m.exec(manifest)?.[1];
            if (!tsPath) {
                //not a TS/RSG app
                return;
            }
            mapPath = s`${stagingDir}/${tsPath.replace(/^pkg:/i, '').replace(/^[/\\]+/, '')}.map`;
            if (!await fsExtra.pathExists(mapPath)) {
                return;
            }
        } catch (e) {
            this.extensionOutputChannel.appendLine(`[SourceMap] could not locate the staged sourcemap under '${stagingDir}': ${(e as Error)?.message ?? String(e)}`);
            return;
        }

        try {
            const map = await fsExtra.readJson(mapPath);
            const hasBackslash = (value: unknown) => typeof value === 'string' && value.includes('\\');
            if (!Array.isArray(map.sources) || (!map.sources.some(hasBackslash) && !hasBackslash(map.sourceRoot))) {
                return;
            }
            const count = map.sources.filter(hasBackslash).length;
            map.sources = map.sources.map((source: unknown) => (typeof source === 'string' ? source.replace(/\\/g, '/') : source));
            if (typeof map.sourceRoot === 'string') {
                map.sourceRoot = map.sourceRoot.replace(/\\/g, '/');
            }
            await fsExtra.writeJson(mapPath, map);
            this.extensionOutputChannel.appendLine(`[SourceMap] normalized separators in ${count} 'sources' ${count === 1 ? 'entry' : 'entries'} of '${mapPath}'`);
        } catch (e) {
            //a malformed/unreadable map must never break the launch
            this.extensionOutputChannel.appendLine(`[SourceMap] skipped '${mapPath}': ${(e as Error)?.message ?? String(e)}`);
        }
    }

    /**
     * Writes text to a logfile if enabled
     */
    private writeExtensionLog(text: string) {
        let extensionLogfilePath = util.getConfiguration('brightscript').get<string>('extensionLogfilePath');
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
        //holds listening sockets when the js-debug relay is in play (always on windows)
        this.jsDebugProxyManager?.dispose?.();
        this.stagingReadyByParentSessionId.clear();
    }
}
/** The compiled JS bundle a BrightScript debug session should attach the node debugger to. */
interface JsDebugTarget {
    /** Device path to the compiled JS bundle (a `ts_path`-style value, e.g. 'pkg:/source/compiled/main.js') */
    tsPath: string;
    /** rootDir of the project the bundle was built from (the app's rootDir, or the component library's) */
    rootDir: string;
    /** The staging directory the debugger copied this project's files into (where the staged .js and .map live) */
    stagingDir: string;
    /** `processStagingDir` only ever reports the MAIN project's authoritative stagingDir - only a 'main' target may substitute it in for the guess */
    kind: 'main' | 'componentLibrary';
}

/** Per-BRS-session signals `attachJsDebugger` polls before its first attach attempt. */
interface StagingReadyEntry {
    /** The main project's authoritative stagingDir, once `processStagingDir` reports it. */
    stagingDir: string | undefined;
    /** Set once roku-debug's ChannelPublishedEvent confirms the device is running THIS session's app. */
    channelPublished: boolean;
}

export const extension = new Extension();
export async function activate(context: vscode.ExtensionContext) {
    await extension.activate(context);
}

