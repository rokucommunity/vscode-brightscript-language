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

import { getBrightScriptCommandsInstance } from './BrightScriptCommands';
import { BrightScriptConfigurationProvider } from './BrightScriptConfigurationProvider';
import BrightScriptDefinitionProvider from './BrightScriptDefinitionProvider';
import { BrightScriptDocumentSymbolProvider } from './BrightScriptDocumentSymbolProvider';
import { BrightScriptReferenceProvider } from './BrightScriptReferenceProvider';
import BrightScriptSignatureHelpProvider from './BrightScriptSignatureHelpProvider';
import BrightScriptXmlDefinitionProvider from './BrightScriptXmlDefinitionProvider';
import { DeclarationProvider } from './DeclarationProvider';
import { DefinitionRepository } from './DefinitionRepository';
import { Formatter } from './formatter';
import { LogDocumentLinkProvider } from './LogDocumentLinkProvider';
import { LogOutputManager } from './LogOutputManager';
import {
    BrightScriptWorkspaceSymbolProvider,
    SymbolInformationRepository
} from './SymbolInformationRepository';

let outputChannel: vscode.OutputChannel;
let client: LanguageClient;

export async function activate(context: vscode.ExtensionContext) {
    await configureLanguageServer(context);
    //register the code formatter
    vscode.languages.registerDocumentRangeFormattingEditProvider({
        language: 'brightscript',
        scheme: 'file'
    }, new Formatter());
    outputChannel = vscode.window.createOutputChannel('BrightScript Log');

    let configProvider = new BrightScriptConfigurationProvider(context);
    context.subscriptions.push(vscode.debug.registerDebugConfigurationProvider('brightscript', configProvider));

    let docLinkProvider = new LogDocumentLinkProvider();
    //register a link provider for this extension's "BrightScript Log" output
    vscode.languages.registerDocumentLinkProvider({ language: 'Log' }, docLinkProvider);
    //give the launch config to the link provder any time we launch the app
    vscode.debug.onDidReceiveDebugSessionCustomEvent((e) => {
        if (e.event === 'BSLaunchStartEvent') {
            docLinkProvider.setLaunchConfig(e.body);
        }
    });

    //register the definition provider
    const logOutputManager: LogOutputManager = new LogOutputManager(outputChannel, context);
    const declarationProvider: DeclarationProvider = new DeclarationProvider();
    const definitionRepo = new DefinitionRepository(declarationProvider);
    const definitionProvider = new BrightScriptDefinitionProvider(definitionRepo);
    const selector = { scheme: 'file', pattern: '**/*.{brs}' };
    const brightScriptCommands = getBrightScriptCommandsInstance();
    brightScriptCommands.registerCommands(context);

    // experimental placeholder
    // context.subscriptions.push(vscode.languages.registerCompletionItemProvider(selector, new BrightScriptCompletionItemProvider()));
    context.subscriptions.push(vscode.languages.registerDefinitionProvider(selector, new BrightScriptDefinitionProvider(definitionRepo)));
    context.subscriptions.push(vscode.languages.registerDocumentSymbolProvider(selector, new BrightScriptDocumentSymbolProvider(declarationProvider)));
    context.subscriptions.push(vscode.languages.registerWorkspaceSymbolProvider(new BrightScriptWorkspaceSymbolProvider(declarationProvider)));
    context.subscriptions.push(declarationProvider);
    vscode.languages.registerReferenceProvider(selector, new BrightScriptReferenceProvider());
    vscode.languages.registerSignatureHelpProvider(selector, new BrightScriptSignatureHelpProvider(definitionRepo), '(', ',');

    vscode.debug.onDidStartDebugSession((e) => logOutputManager.onDidStartDebugSession());
    vscode.debug.onDidReceiveDebugSessionCustomEvent((e) => logOutputManager.onDidReceiveDebugSessionCustomEvent(e));

    outputChannel.show();

    //xml support
    const xmlSelector = { scheme: 'file', pattern: '**/*.{xml}' };
    context.subscriptions.push(vscode.languages.registerDefinitionProvider(xmlSelector, new BrightScriptXmlDefinitionProvider(definitionRepo)));
}

export async function configureLanguageServer(context: vscode.ExtensionContext) {
    // The server is implemented in node
    let serverModule = context.asAbsolutePath(
        path.join('out', 'languageServer', 'server.js')
    );
    // The debug options for the server
    // --inspect=6009: runs the server in Node's Inspector mode so VS Code can attach to the server for debugging
    let debugOptions = { execArgv: ['--nolazy', '--inspect=6009'] };

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
            options: debugOptions
        }
    };

    // Options to control the language client
    let clientOptions: LanguageClientOptions = {
        // Register the server for plain text documents
        documentSelector: [
            { scheme: 'file', language: 'brightscript' }
        ],
        synchronize: {
            // Notify the server about file changes to '.clientrc files contained in the workspace
            fileEvents: workspace.createFileSystemWatcher('**/.clientrc')
        }
    };

    // Create the language client and start the client.
    client = new LanguageClient(
        'brightScriptLanguageServer',
        'BrightScript Language Server',
        serverOptions,
        clientOptions
    );
    // Start the client. This will also launch the server
    client.start();
    await client.onReady();
    client.onNotification('critical-failure', (message) => {
        window.showErrorMessage(message);
    });
}
export function deactivate() {
    if (!client) {
        return undefined;
    }
    return client.stop();
}
