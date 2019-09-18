import * as path from 'path';
import * as vscode from 'vscode';

import {
    CancellationToken,
    CompletionItem,
    CompletionItemProvider,
    DebugConfiguration,
    DocumentSymbolProvider,
    ExtensionContext,
    Position,
    Range,
    SymbolInformation,
    TextDocument,
    Uri,
    window,
    workspace,
    WorkspaceFolder,
    WorkspaceSymbolProvider,
} from 'vscode';

import {
    LanguageClient,
    LanguageClientOptions,
    ServerOptions,
    TransportKind
} from 'vscode-languageclient';

import { ActiveDeviceManager } from './ActiveDeviceManager';
import { getBrightScriptCommandsInstance } from './BrightScriptCommands';
import BrightScriptCompletionItemProvider from './BrightScriptCompletionItemProvider';
import BrightScriptDefinitionProvider from './BrightScriptDefinitionProvider';
import { BrightScriptDocumentSymbolProvider } from './BrightScriptDocumentSymbolProvider';
import { BrightScriptReferenceProvider } from './BrightScriptReferenceProvider';
import BrightScriptSignatureHelpProvider from './BrightScriptSignatureHelpProvider';
import BrightScriptXmlDefinitionProvider from './BrightScriptXmlDefinitionProvider';
import { BrightScriptDebugConfigurationProvider as BrsDebugConfigurationProvider } from './DebugConfigurationProvider';
import { DeclarationProvider } from './DeclarationProvider';
import { DefinitionRepository } from './DefinitionRepository';
import { Formatter } from './formatter';
import { LogDocumentLinkProvider } from './LogDocumentLinkProvider';
import { LogOutputManager } from './LogOutputManager';
import { RendezvousViewProvider } from './RendezvousViewProvider';
import {
    BrightScriptWorkspaceSymbolProvider,
    SymbolInformationRepository
} from './SymbolInformationRepository';

let outputChannel: vscode.OutputChannel;
let client: LanguageClient;

export async function activate(context: vscode.ExtensionContext) {
    let activeDeviceManager = new ActiveDeviceManager();
    await configureLanguageServer(context);
    let subscriptions = context.subscriptions;

    //register a tree data provider for this extension's "RENDEZVOUS" panel in the debug area
    let rendezvousViewProvider = new RendezvousViewProvider(context);
    vscode.window.registerTreeDataProvider('rendezvousView', rendezvousViewProvider);

    subscriptions.push(vscode.commands.registerCommand('extension.brightscript.rendezvous.clearHistory', () => {
        vscode.debug.activeDebugSession.customRequest('rendezvous.clearHistory');
    }));

    //register the code formatter
    vscode.languages.registerDocumentRangeFormattingEditProvider({
        language: 'brightscript',
        scheme: 'file'
    }, new Formatter());
    vscode.languages.registerDocumentRangeFormattingEditProvider({
        language: 'brighterscript',
        scheme: 'file'
    }, new Formatter());
    outputChannel = vscode.window.createOutputChannel('BrightScript Log');

    let configProvider = new BrsDebugConfigurationProvider(context, activeDeviceManager);
    context.subscriptions.push(vscode.debug.registerDebugConfigurationProvider('brightscript', configProvider));

    let docLinkProvider = new LogDocumentLinkProvider();
    //register a link provider for this extension's "BrightScript Log" output
    vscode.languages.registerDocumentLinkProvider({ language: 'Log' }, docLinkProvider);
    //give the launch config to the link provider any time we launch the app
    vscode.debug.onDidReceiveDebugSessionCustomEvent(async (e) => {
        if (e.event === 'BSLaunchStartEvent') {
            docLinkProvider.setLaunchConfig(e.body);
            logOutputManager.setLaunchConfig(e.body);
        } else if (e.event === 'BSRendezvousEvent') {
            rendezvousViewProvider.onDidReceiveDebugSessionCustomEvent(e);
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
    //register the definition provider
    const declarationProvider: DeclarationProvider = new DeclarationProvider();
    const symbolInformationRepository = new SymbolInformationRepository(declarationProvider);
    const logOutputManager: LogOutputManager = new LogOutputManager(outputChannel, context, docLinkProvider, declarationProvider);
    const definitionRepo = new DefinitionRepository(declarationProvider);
    const definitionProvider = new BrightScriptDefinitionProvider(definitionRepo);
    const selector = { scheme: 'file', pattern: '**/*.{brs,bs}' };
    const brightScriptCommands = getBrightScriptCommandsInstance();
    brightScriptCommands.registerCommands(context);

    // experimental placeholder
    context.subscriptions.push(vscode.languages.registerCompletionItemProvider(selector, new BrightScriptCompletionItemProvider(), '.'));
    context.subscriptions.push(vscode.languages.registerDefinitionProvider(selector, definitionProvider));
    context.subscriptions.push(vscode.languages.registerDocumentSymbolProvider(selector, new BrightScriptDocumentSymbolProvider(declarationProvider)));
    context.subscriptions.push(vscode.languages.registerWorkspaceSymbolProvider(new BrightScriptWorkspaceSymbolProvider(declarationProvider, symbolInformationRepository)));
    context.subscriptions.push(declarationProvider);
    vscode.languages.registerReferenceProvider(selector, new BrightScriptReferenceProvider());
    vscode.languages.registerSignatureHelpProvider(selector, new BrightScriptSignatureHelpProvider(definitionRepo), '(', ',');

    vscode.debug.onDidStartDebugSession((e) => {
        logOutputManager.onDidStartDebugSession();
    });
    vscode.debug.onDidReceiveDebugSessionCustomEvent((e) => {
        logOutputManager.onDidReceiveDebugSessionCustomEvent(e);
    });

    //xml support
    const xmlSelector = { scheme: 'file', pattern: '**/*.{xml}' };
    context.subscriptions.push(vscode.languages.registerDefinitionProvider(xmlSelector, new BrightScriptXmlDefinitionProvider(definitionRepo)));
}

export async function configureLanguageServer(context: vscode.ExtensionContext) {
    // The server is implemented in node
    let serverModule = context.asAbsolutePath(
        path.join('out', 'LanguageServerRunner.js')
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
            { scheme: 'file', language: 'xml' }
        ],
        synchronize: {
            // Notify the server about file changes to every filetype it cares about
            fileEvents: workspace.createFileSystemWatcher('**/*')
        }
    };

    // Create the language client and start the client.
    client = new LanguageClient(
        'brighterScriptLanguageServer',
        'BrighterScript Language Server',
        serverOptions,
        clientOptions
    );
    // Start the client. This will also launch the server
    client.start();
    await client.onReady();

    client.onNotification('critical-failure', (message) => {
        window.showErrorMessage(message);
    });

    let buildStatusStatusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
    buildStatusStatusBar.text = '$(flame)';
    buildStatusStatusBar.tooltip = 'BrightScript Language server is running';
    buildStatusStatusBar.color = '#673293';
    buildStatusStatusBar.show();
    //update the statusbar with build statuses
    client.onNotification('build-status', (message) => {
        if (message === 'building') {
            buildStatusStatusBar.text = '$(flame)...';
            buildStatusStatusBar.tooltip = 'BrightScript Language server is running';
            buildStatusStatusBar.color = '#673293';

        } else if (message === 'success') {
            buildStatusStatusBar.text = '$(flame)';
            buildStatusStatusBar.tooltip = 'BrightScript Language server is running';
            buildStatusStatusBar.color = '#673293';

        } else if (message === 'critical-error') {
            buildStatusStatusBar.text = '$(flame)';
            buildStatusStatusBar.tooltip = 'BrightScript Language server encountered a critical runtime error';
            buildStatusStatusBar.color = '#FF0000';
        }
    });
}
export function deactivate() {
    if (!client) {
        return undefined;
    }
    return client.stop();
}
