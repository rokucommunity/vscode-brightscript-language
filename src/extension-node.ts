import * as vscode from 'vscode';
import * as prettyBytes from 'pretty-bytes';
import { window } from 'vscode';
import { gte as semverGte } from 'semver';
import { env, extensions } from 'vscode';
import * as rta from 'roku-test-automation';

import { ActiveDeviceManager } from './ActiveDeviceManager';
import { brightScriptCommands } from './BrightScriptCommands';
import BrightScriptXmlDefinitionProvider from './BrightScriptXmlDefinitionProvider';
import { BrightScriptDebugConfigurationProvider, BrightScriptLaunchConfiguration } from './DebugConfigurationProvider';
import { DeclarationProvider } from './DeclarationProvider';
import { DefinitionRepository } from './DefinitionRepository';
import { Formatter } from './formatter';
import { LogDocumentLinkProvider } from './LogDocumentLinkProvider';
import { LogOutputManager } from './LogOutputManager';
import { RendezvousViewProvider } from './RendezvousViewProvider';
import { RDBCommandsViewProvider, RDBRegistryViewProvider } from './RDBViewProviders';
import { sceneGraphDebugCommands } from './SceneGraphDebugCommands';
import { languageServerManager } from './LanguageServerManager';
import { Extension } from './extension';

export class ExtensionNode extends Extension {

    public odc?: rta.OnDeviceComponent;

    // register our RDB views
    private rdbViews = {
        RDBRegistryView: {
            class: RDBRegistryViewProvider
        },
        RDBCommandsView: {
            class: RDBCommandsViewProvider
        }
    };

    public async activate(context: vscode.ExtensionContext) {
        super.activate(context);

        let activeDeviceManager = new ActiveDeviceManager();

        const declarationProvider = new DeclarationProvider();
        context.subscriptions.push(declarationProvider);

        let docLinkProvider = new LogDocumentLinkProvider();

        const logOutputManager = new LogOutputManager(this.outputChannels.debugConsole, context, docLinkProvider, declarationProvider);

        const definitionRepo = new DefinitionRepository(declarationProvider);

        let languageServerPromise = languageServerManager.init(context, definitionRepo);

        //register a tree data provider for this extension's "RENDEZVOUS" panel in the debug area
        let rendezvousViewProvider = new RendezvousViewProvider(context);
        vscode.window.registerTreeDataProvider('rendezvousView', rendezvousViewProvider);

        context.subscriptions.push(vscode.commands.registerCommand('extension.brightscript.rendezvous.clearHistory', () => {
            vscode.debug.activeDebugSession.customRequest('rendezvous.clearHistory');
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
        let configProvider = new BrightScriptDebugConfigurationProvider(context, activeDeviceManager);
        context.subscriptions.push(
            vscode.debug.registerDebugConfigurationProvider('brightscript', configProvider)
        );

        //register a link provider for this extension's "BrightScript Log" output
        context.subscriptions.push(
            vscode.languages.registerDocumentLinkProvider({ language: 'Log' }, docLinkProvider)
        );

        vscode.window.registerUriHandler({
            handleUri: async function(uri: vscode.Uri) {
                if (uri.path.startsWith('/openFile/')) {
                    let docUri = vscode.Uri.file(uri.path.substr(10));
                    let doc = await vscode.workspace.openTextDocument(docUri);
                    await vscode.window.showTextDocument(doc, { preview: false });
                    let editor = vscode.window.activeTextEditor;
                    let lineNumber = Number(uri.fragment) ? Number(uri.fragment) - 1 : 0;
                    editor.selection = new vscode.Selection(lineNumber, 0, lineNumber, 0);
                    vscode.commands.executeCommand('revealLine', {
                        lineNumber: lineNumber,
                        at: 'center'
                    });
                }
            }
        });

        //give the launch config to the link provider any time we launch the app
        vscode.debug.onDidReceiveDebugSessionCustomEvent(async (e) => {
            if (e.event === 'BSLaunchStartEvent') {
                const config: BrightScriptLaunchConfiguration = e.body;
                docLinkProvider.setLaunchConfig(config);
                logOutputManager.setLaunchConfig(config);
                this.setupRDB(context, config);
                //write debug server log statements to the DebugServer output channel
            } else if (e.event === 'BSDebugServerLogOutputEvent') {
                this.outputChannels.debugServer.appendLine(e.body);

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
        });

        //register all commands for this extension
        brightScriptCommands.registerCommands(context);
        sceneGraphDebugCommands.registerCommands(context, this.outputChannels.sceneGraphCommands);

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

        vscode.debug.onDidReceiveDebugSessionCustomEvent((e) => {
            logOutputManager.onDidReceiveDebugSessionCustomEvent(e);
        });


        //xml support
        const xmlSelector = { scheme: 'file', pattern: '**/*.{xml}' };
        context.subscriptions.push(vscode.languages.registerDefinitionProvider(xmlSelector, new BrightScriptXmlDefinitionProvider(definitionRepo)));

        await languageServerPromise;
    }

    private setupODC(config: BrightScriptLaunchConfiguration) {
        const rtaConfig: rta.ConfigOptions = {
            RokuDevice: {
                devices: [{
                    host: config.host,
                    password: config.password
                }]
            },
            // uncomment for debugging
            // OnDeviceComponent: {
            //     logLevel: 'verbose',
            //     serverDebugLogging: true
            // }
        };
        const device = new rta.RokuDevice(rtaConfig);
        return new rta.OnDeviceComponent(device, rtaConfig);
    }

    private setupRDB(context: vscode.ExtensionContext, config: BrightScriptLaunchConfiguration) {
        // TODO handle case where user changes their Roku Device
        if (!config.injectRdbOnDeviceComponent || this.odc) {
            return;
        }
        this.odc = this.setupODC(config);

        for (const viewId in this.rdbViews) {
            const view = this.rdbViews[viewId];
            view.provider = new view.class(context);
            vscode.window.registerWebviewViewProvider(viewId, view.provider);
        }

        for (const viewId in this.rdbViews) {
            this.rdbViews[viewId].provider.setOnDeviceComponent(this.odc);
        }
    }

}
export const extension = new Extension();
export function activate(context: vscode.ExtensionContext) {
    extension.activate(context);
}
