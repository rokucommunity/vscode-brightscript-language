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
    SymbolInformation,
    TextDocument,
    workspace,
    WorkspaceFolder,
    WorkspaceSymbolProvider
} from 'vscode';

import {
    LanguageClient,
    LanguageClientOptions,
    ServerOptions,
    TransportKind
} from 'vscode-languageclient';

import { Formatter } from './formatter';

import { getBrightScriptCommandsInstance } from './BrightScriptCommands';
import BrightScriptDefinitionProvider from './BrightScriptDefinitionProvider';
import { BrightScriptDocumentSymbolProvider } from './BrightScriptDocumentSymbolProvider';
import { BrightScriptReferenceProvider } from './BrightScriptReferenceProvider';
import BrightScriptSignatureHelpProvider from './BrightScriptSignatureHelpProvider';
import BrightScriptXmlDefinitionProvider from './BrightScriptXmlDefinitionProvider';
import { DeclarationProvider } from './DeclarationProvider';
import { DefinitionRepository } from './DefinitionRepository';
import { LogOutputManager } from './LogOutputManager';
import {
    BrightScriptWorkspaceSymbolProvider,
    SymbolInformationRepository
} from './SymbolInformationRepository';

let outputChannel: vscode.OutputChannel;
let client: LanguageClient;

export function activate(context: vscode.ExtensionContext) {
    configureLanguageServer(context);
    //register the code formatter
    vscode.languages.registerDocumentRangeFormattingEditProvider({
        language: 'brightscript',
        scheme: 'file'
    }, new Formatter());
    outputChannel = vscode.window.createOutputChannel('BrightScript Log');

    context.subscriptions.push(vscode.debug.registerDebugConfigurationProvider('brightscript', new BrightScriptConfigurationProvider(context)));

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

export function configureLanguageServer(context: vscode.ExtensionContext) {
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
}

class BrightScriptConfigurationProvider implements vscode.DebugConfigurationProvider {

    public constructor(context: vscode.ExtensionContext) {
        this.context = context;
    }

    public context: vscode.ExtensionContext;

    /**
     * Massage a debug configuration just before a debug session is being launched,
     * e.g. add all missing attributes to the debug configuration.
     */
    public async resolveDebugConfiguration(folder: WorkspaceFolder | undefined, config: BrightScriptDebugConfiguration, token?: CancellationToken): Promise<DebugConfiguration> {
        //fill in default configuration values
        if (config.type.toLowerCase() === 'brightscript') {
            config.name = config.name ? config.name : 'BrightScript Debug: Launch';
            config.consoleOutput = config.consoleOutput ? config.consoleOutput : 'normal';
            config.request = config.request ? config.request : 'launch';
            config.stopOnEntry = config.stopOnEntry === false ? false : true;
            config.rootDir = config.rootDir ? config.rootDir : '${workspaceFolder}';
            config.outDir = config.outDir ? config.outDir : '${workspaceFolder}/out';
            config.retainDeploymentArchive = config.retainDeploymentArchive === false ? false : true;
            config.retainStagingFolder = config.retainStagingFolder === true ? true : false;
            config.clearOutputOnLaunch = config.clearOutputOnLaunch === true ? true : false;
            config.selectOutputOnLogMessage = config.selectOutputOnLogMessage === true ? true : false;
        }
        //prompt for host if not hardcoded
        if (config.host === '${promptForHost}') {
            config.host = await vscode.window.showInputBox({
                placeHolder: 'The IP address of your Roku device',
                value: ''
            });
        }
        if (!config.host) {
            throw new Error('Debug session terminated: host is required.');
        } else {
            await this.context.workspaceState.update('remoteHost', config.host);
        }
        //prompt for password if not hardcoded
        if (config.password === '${promptForPassword}') {
            config.password = await vscode.window.showInputBox({
                placeHolder: 'The developer account password for your Roku device.',
                value: ''
            });
            if (!config.password) {
                throw new Error('Debug session terminated: password is required.');
            }
        }

        //await vscode.window.showInformationMessage('Invalid Roku IP address')
        return config;
    }
}

export function deactivate() {
    if (!client) {
        return undefined;
    }
    return client.stop();
}

interface BrightScriptDebugConfiguration extends DebugConfiguration {
    host: string;
    password: string;
    rootDir: string;
    outDir: string;
    stopOnEntry: boolean;
    consoleOutput: 'full' | 'normal';
    retainDeploymentArchive: boolean;
    retainStagingFolder: boolean;
    clearOutputOnLaunch: boolean;
    selectOutputOnLogMessage: boolean;
}
