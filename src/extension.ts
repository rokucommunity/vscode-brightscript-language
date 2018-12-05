import * as vscode from 'vscode';

import {
    CancellationToken,
    CompletionItem,
    CompletionItemProvider,
    DebugConfiguration,
    DocumentSymbolProvider,
    Position,
    SymbolInformation,
    TextDocument,
    WorkspaceFolder,
    WorkspaceSymbolProvider
} from 'vscode';

import { Formatter } from './formatter';

import BrightScriptDefinitionProvider from './BrightScriptDefinitionProvider';
import { BrightScriptReferenceProvider } from './BrightScriptReferenceProvider';
import BrightScriptSignatureHelpProvider from './BrightScriptSignatureHelpProvider';
import { registerCommands } from './commands';
import { BuiltinCompletionItems } from './completion';
import { registerDebugErrorHandler } from './DebugErrorHandler';
import { DeclarationProvider } from './DeclarationProvider';
import { DefinitionRepository } from './DefinitionRepository';
import { readSymbolInformations, SymbolInformationRepository } from './symbol';

let outputChannel: vscode.OutputChannel;

export function getOutputChannel(): vscode.OutputChannel {
    if (!outputChannel) {
        outputChannel = vscode.window.createOutputChannel('BrightScript Log');
    }
    return outputChannel;
}

export function activate(context: vscode.ExtensionContext) {
    //register the code formatter
    vscode.languages.registerDocumentRangeFormattingEditProvider({
        language: 'BrightScript',
        scheme: 'file'
    }, new Formatter());

    // const selector: DocumentSelector = { language: "BrightScript" };
    const declarationProvider: DeclarationProvider = new DeclarationProvider();
    const definitionRepo = new DefinitionRepository(declarationProvider);
    const definitionProvider = new BrightScriptDefinitionProvider(definitionRepo);
    const selector = {scheme: 'file', pattern: '**/*.{brs}'};
    const registerDefinitionProvider = vscode.languages.registerDefinitionProvider(selector, definitionProvider);
    context.subscriptions.push(registerDefinitionProvider);

    // experimental placeholder
    // context.subscriptions.push(vscode.languages.registerCompletionItemProvider(selector, new BrightScriptCompletionItemProvider()));
    context.subscriptions.push(vscode.languages.registerDefinitionProvider(selector, new BrightScriptDefinitionProvider(definitionRepo)));
    context.subscriptions.push(vscode.languages.registerDocumentSymbolProvider(selector, new BrightScriptDocumentSymbolProvider()));
    context.subscriptions.push(vscode.languages.registerWorkspaceSymbolProvider(new BrightScriptWorkspaceSymbolProvider(declarationProvider)));
    context.subscriptions.push(declarationProvider);
    vscode.languages.registerReferenceProvider(selector, new BrightScriptReferenceProvider());
    vscode.languages.registerSignatureHelpProvider(selector, new BrightScriptSignatureHelpProvider(definitionRepo), '(', ',');
    registerDebugErrorHandler();
    getOutputChannel().show();

    registerCommands(context);
}

class BrightScriptConfigurationProvider implements vscode.DebugConfigurationProvider {
    /**
     * Massage a debug configuration just before a debug session is being launched,
     * e.g. add all missing attributes to the debug configuration.
     */
    public async resolveDebugConfiguration(folder: WorkspaceFolder | undefined, config: BrightScriptDebugConfiguration, token?: CancellationToken): Promise<DebugConfiguration> {
        //fill in default configuration values
        if (config.type === 'BrightScript') {
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
            if (!config.host) {
                throw new Error('Debug session terminated: host is required.');
            }
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

class BrightScriptDocumentSymbolProvider implements DocumentSymbolProvider {
    public provideDocumentSymbols(document: TextDocument, token: CancellationToken): SymbolInformation[] {
        return readSymbolInformations(document.uri, document.getText());
    }
}

class BrightScriptWorkspaceSymbolProvider implements WorkspaceSymbolProvider {

    constructor(provider: DeclarationProvider) {
        this.repo = new SymbolInformationRepository(provider);
    }

    private repo: SymbolInformationRepository;

    public provideWorkspaceSymbols(query: string, token: CancellationToken): Promise<SymbolInformation[]> {
        return this.repo.sync().then(() => Array.from(this.repo.find(query)));
    }
}

class BrightScriptCompletionItemProvider implements CompletionItemProvider {
    public provideCompletionItems(document: TextDocument, position: Position, token: CancellationToken, context: vscode.CompletionContext): CompletionItem[] {
        //TODO - do something useful here!
        return BuiltinCompletionItems;
    }
}
