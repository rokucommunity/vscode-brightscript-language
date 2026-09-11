import * as vscode from 'vscode';
import * as prettyBytes from 'pretty-bytes';
import { extensions } from 'vscode';
import { isLocalDeviceConfig, isRceDeviceConfig } from 'roku-deploy';
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
import { JsDebugProxyManager, JS_DEBUG_PORT } from './managers/JsDebugProxyManager';
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
        const experimentalFeatures = new ExperimentalFeaturesManager(context);

        //the Roku Cloud Emulator stack is gated by the rokuCloudEmulator experimental feature, but
        //it toggles live rather than at activation: the RceManager reports "no token" while the
        //feature is disabled (and re-announces on every toggle), which empties the finder's device
        //list and idles every consumer; the UI hides through the feature's context key
        const rceManager = new RceManager(context, experimentalFeatures);
        rceManager.register(context);
        this.jsDebugProxyManager = new JsDebugProxyManager(rceManager, (message) => this.extensionOutputChannel.appendLine(message));
        context.subscriptions.push(this.jsDebugProxyManager);
        const rceFinder = new RceFinder(rceManager, (message) => this.extensionOutputChannel.appendLine(message));
        context.subscriptions.push(new RceVideoEditorManager(context, rceManager, rceFinder));
        this.deviceManager = new DeviceManager(context, this.globalStateManager, this.extensionOutputChannel, rceFinder);
        //late-bound: lets the experimental features manager recognize cloud devices when it cleans
        //up the workspace device-identity keys on a feature toggle
        experimentalFeatures.setDeviceManager(this.deviceManager);
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
            return { tsPath: appTsPath, rootDir: configuration.rootDir, stagingDir: stagingDir };
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
            return { tsPath: library.tsPath, rootDir: library.rootDir, stagingDir: stagingDir };
        }
    }

    private async attachJsDebugger(parentSession: vscode.DebugSession, target: JsDebugTarget) {
        const tsPath = target.tsPath.replace(/\s*(?:lib)?pkg:/, '');
        const workspaceFolders = vscode.workspace.workspaceFolders || [];
        //something like ${rootDir}/source/compiled
        const remoteRoot = path.normalize(path.dirname(tsPath));
        //something like ${workspaceFolder}/out/.roku-deploy-staging/source/compiled
        const localRoot = path.normalize(path.join(target.stagingDir, remoteRoot));

        const configuration = parentSession.configuration as BrightScriptLaunchConfiguration;
        let address: string;
        let port: number;
        if (configuration.device && isRceDeviceConfig(configuration.device)) {
            //an RCE device has no LAN address to attach to directly, so route the node debugger
            //through a local proxy that tunnels to the device's JS debug port over the instance api
            try {
                port = await this.jsDebugProxyManager.start(parentSession.id, configuration.device);
            } catch (e) {
                this.extensionOutputChannel.appendLine(`Failed to start JS debug proxy: ${e?.message ?? e}`);
                return false;
            }
            address = '127.0.0.1';
        } else {
            //`device` is authoritative when it's a resolved local device config; the raw `host`
            //field is kept only as a fallback (mirrors the same "device is authoritative, raw host
            //may be an unresolved placeholder" reasoning as RtaManager.setupRtaWithConfig)
            address = (configuration.device && isLocalDeviceConfig(configuration.device)) ? configuration.device.host : configuration.host;
            port = JS_DEBUG_PORT;
        }

        // vscode doesn't trigger the onDidStartDebugSession event until the debugger is actually attached.
        // So there's a window where the parent debug session stops while this is still trying to attach.
        // To more quickly close the node debugger in that situation, we will run much shorter "attach" windows
        // in a loop until we successfully attach or until the parent session ends.

        while (debugSessionManager.isLive(parentSession)) {
            // The node debugger attaches against the bundle's local rootDir. If that directory has
            // been deleted (e.g. a `dist-build/bundle` wiped mid-session), vscode rejects the attach
            // synchronously with a modal "The configured `cwd` ... does not exist." Since that
            // rejection never hits the attach timeout below, retrying here would hot-loop and spam
            // the modal as fast as the user can dismiss it. Bail instead — attach cannot succeed
            // without the rootDir, and it will be retried the next time a debug session starts.
            if (!fsExtra.existsSync(target.rootDir)) {
                console.error(`Cannot attach node debugger: rootDir does not exist at '${target.rootDir}'`);
                return false;
            }

            //rewrite the debug session name to indicate it's the BRS session (this is just for user clarity in the UI, it has no functional effect)
            parentSession.name = `${parentSession.name.replace(/ \(BRS\)$/, '')} (BRS)`;
            try {
                const debugConfig: vscode.DebugConfiguration = {
                    type: 'node',
                    //use the same debug config name as the parent, but suffix with (JS) so we can identify the JS debug session in the UI
                    name: `${parentSession.configuration.name} (JS)`,
                    request: 'attach',
                    cwd: target.rootDir,
                    address: address,
                    port: port,
                    timeout: 2_000, // Shorter timeout for retry loop
                    //Hermes advertises a "Remote Process" child target; js-debug's node
                    //process-tree machinery attaches to it with an extra inspector connection,
                    //which drops the original CDP connection (single debug client). We only ever
                    //debug the one Hermes runtime, so disable child auto-attach entirely.
                    autoAttachChildProcesses: false,
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
                    stopOnEntry: parentSession.configuration?.stopOnEntry ?? false,

                    // don't pause on the first line when attaching (e.g. when process launched with --inspect-brk)
                    continueOnAttach: !(parentSession.configuration?.stopOnEntry ?? false),

                    // markers so we can identify this session and link it back to the BRS session
                    _isBrightscriptJsSession: true,
                    _brightscriptParentSessionId: parentSession.id
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
        // Parent session ended while we were trying to attach
        return false;
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
                response = await this.processStagingDir(event);
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
     * the `brightscript.solidDevtools.enabled` setting is off; never fails the launch).
     */
    private async processStagingDir(event: CustomRequestEvent<{ projects: Array<{ type: string; stagingDir: string }> }>) {
        const projects = event.body.projects ?? [];
        const solidDevtoolsEnabled = vscode.workspace.getConfiguration('brightscript').get<boolean>('solidDevtools.enabled', true);
        if (!solidDevtoolsEnabled) {
            return;
        }
        for (const project of projects) {
            //only the main app project carries the TS bundle
            if (project.type !== 'main') {
                continue;
            }
            await injectDevtoolsBridge({
                stagingDir: project.stagingDir,
                devtoolsBridgePath: path.join(this.extensionContext.extensionPath, 'dist', 'solidDevtools', 'bridge.js'),
                log: (message) => this.extensionOutputChannel.appendLine(`[SolidDevtools] ${message}`)
            });
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
    }
}
export const extension = new Extension();
export async function activate(context: vscode.ExtensionContext) {
    await extension.activate(context);
}

// ---- types ----

interface JsDebugTarget {
    /**
     * Device path to the compiled JS bundle (a `ts_path`-style value, e.g. 'pkg:/source/compiled/main.js')
     */
    tsPath: string;
    /**
     * rootDir of the project the bundle was built from (the app's rootDir, or the component library's)
     */
    rootDir: string;
    /**
     * The staging directory the debugger copied this project's files into (where the staged .js and .map files live)
     */
    stagingDir: string;
}
