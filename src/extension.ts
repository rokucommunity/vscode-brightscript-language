import * as vscode from 'vscode';
import * as prettyBytes from 'pretty-bytes';
import { extensions } from 'vscode';
import * as rta from 'roku-test-automation';
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
import { RendezvousViewProvider } from './RendezvousViewProvider';
import { OnlineDevicesViewProvider } from './OnlineDevicesViewProvider';
import {
    RDBCommandsViewProvider,
    SceneGraphInspectorViewProvider,
    RDBRegistryViewProvider
} from './RDBViewProviders';
import { sceneGraphDebugCommands } from './SceneGraphDebugCommands';
import { GlobalStateManager } from './GlobalStateManager';
import { languageServerManager } from './LanguageServerManager';
import { TelemetryManager } from './managers/TelemetryManager';
import { RemoteControlManager } from './managers/RemoteControlManager';
import { WhatsNewManager } from './managers/WhatsNewManager';

const EXTENSION_ID = 'RokuCommunity.brightscript';

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

    public odc?: rta.OnDeviceComponent;

    // register our RDB views
    private rdbViews = {
        SceneGraphInspector: {
            class: SceneGraphInspectorViewProvider
        },
        RDBRegistryView: {
            class: RDBRegistryViewProvider
        },
        RDBCommandsView: {
            class: RDBCommandsViewProvider
        }
    };

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

        this.telemetryManager.sendStartupEvent();
        let activeDeviceManager = new ActiveDeviceManager();

        this.remoteControlManager = new RemoteControlManager(this.telemetryManager);
        this.brightScriptCommands = new BrightScriptCommands(
            this.remoteControlManager,
            this.whatsNewManager,
            context,
            activeDeviceManager
        );

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

        const logOutputManager = new LogOutputManager(this.outputChannel, context, docLinkProvider, declarationProvider);

        const definitionRepo = new DefinitionRepository(declarationProvider);

        let languageServerPromise = languageServerManager.init(context, definitionRepo);

        //register a tree data provider for this extension's "RENDEZVOUS" panel in the debug area
        let rendezvousViewProvider = new RendezvousViewProvider(context);
        vscode.window.registerTreeDataProvider('rendezvousView', rendezvousViewProvider);

        //register a tree data provider for this extension's "Online Devices" panel
        let onlineDevicesViewProvider = new OnlineDevicesViewProvider(context, activeDeviceManager);
        vscode.window.registerTreeDataProvider('onlineDevicesView', onlineDevicesViewProvider);

        context.subscriptions.push(vscode.commands.registerCommand('extension.brightscript.rendezvous.clearHistory', async () => {
            await vscode.debug.activeDebugSession.customRequest('rendezvous.clearHistory');
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
        let configProvider = new BrightScriptDebugConfigurationProvider(context, activeDeviceManager, this.telemetryManager);
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
            return this.debugSessionCustomEventHandler(e, context, docLinkProvider, logOutputManager, rendezvousViewProvider);
        });

        //register all commands for this extension
        this.brightScriptCommands.registerCommands();
        sceneGraphDebugCommands.registerCommands(context, this.sceneGraphDebugChannel);

        vscode.debug.onDidStartDebugSession((e) => {
            //if this is a brightscript debug session
            if (e.type === 'brightscript') {
                logOutputManager.onDidStartDebugSession();
            }
        });

        vscode.debug.onDidTerminateDebugSession((e) => {
            //if this is a brightscript debug session
            if (e.type === 'brightscript') {
                this.chanperfStatusBar.hide();
            }
        });

        vscode.debug.onDidReceiveDebugSessionCustomEvent(async (e) => {
            await logOutputManager.onDidReceiveDebugSessionCustomEvent(e);
        });

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
        await languageServerPromise;
    }

    private async debugSessionCustomEventHandler (e: vscode.DebugSessionCustomEvent, context: vscode.ExtensionContext, docLinkProvider: LogDocumentLinkProvider, logOutputManager: LogOutputManager, rendezvousViewProvider: RendezvousViewProvider) {
        if (e.event === 'BSLaunchStartEvent') {
            const config: BrightScriptLaunchConfiguration = e.body;
            await docLinkProvider.setLaunchConfig(config);
            logOutputManager.setLaunchConfig(config);
            this.registerWebViewProviders(context);
        } else if (e.event === 'BSChannelPublishedEvent') {
            const config: BrightScriptLaunchConfiguration = e.body.launchConfiguration;
            if (!config.injectRdbOnDeviceComponent) {
                void this.odc?.shutdown();
                this.odc = undefined;
            } else {
                this.odc = this.setupODC(config);
            }
            this.setupRDBViewProviders();
            void this.odc?.disableScreenSaver({ disableScreensaver: config.disableScreenSaver });
            //write debug server log statements to the DebugServer output channel
        } else if (e.event === 'BSDebugServerLogOutputEvent') {
            this.extensionOutputChannel.appendLine(e.body);

        } else if (e.event === 'BSRendezvousEvent') {
            rendezvousViewProvider.onDidReceiveDebugSessionCustomEvent(e);

        } else if (e.event === 'BSChanperfEvent') {
            if (!e.body.error) {
                this.chanperfStatusBar.text = `$(dashboard)cpu: ${e.body.cpu.total}%, mem: ${prettyBytes(e.body.memory.total).replace(/ /g, '')}`;
            } else {
                this.chanperfStatusBar.text = e.body.error.message;
            }

            this.chanperfStatusBar.show();

        } else if (!e.event) {
            if (e.body[0]) {
                // open the first file with a compile error
                let uri = vscode.Uri.file(e.body[0].path);
                let doc = await vscode.workspace.openTextDocument(uri);
                let line = (e.body[0].lineNumber - 1 > -1) ? e.body[0].lineNumber - 1 : 0;
                let range = new vscode.Range(new vscode.Position(line, 0), new vscode.Position(line, 0));
                await vscode.window.showTextDocument(doc, { preview: false, selection: range });
            }
        }
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

    private setupODC(config: BrightScriptLaunchConfiguration) {
        const rtaConfig = this.getRtaConfig(config);
        rta.odc.setConfig(rtaConfig);
        return rta.odc;
    }

    private getRtaConfig(config: BrightScriptLaunchConfiguration) {
        const enableDebugging = ['info', 'debug', 'trace'].includes(config.logLevel);
        const rtaConfig: rta.ConfigOptions = {
            RokuDevice: {
                devices: [{
                    host: config.host,
                    password: config.password
                }]
            },
            OnDeviceComponent: {
                logLevel: enableDebugging ? 'verbose' : undefined,
                serverDebugLogging: enableDebugging,
                disableTelnet: true,
                disableCallOriginationLine: true,
                callbackListenPort: config.rdbCallbackPort
            }
        };
        return rtaConfig;
    }

    private registerWebViewProviders(context) {
        for (const viewId in this.rdbViews) {
            const view = this.rdbViews[viewId];
            if (!view.provider) {
                view.provider = new view.class(context);
                vscode.window.registerWebviewViewProvider(viewId, view.provider);
            }
        }
    }

    private setupRDBViewProviders() {
        for (const viewId in this.rdbViews) {
            this.rdbViews[viewId].provider.setOnDeviceComponent(this.odc);
        }
    }

}
export const extension = new Extension();
export async function activate(context: vscode.ExtensionContext) {
    await extension.activate(context);
}
