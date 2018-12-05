import * as vscode from 'vscode';
import {
    CancellationToken,
    CompletionItem,
    CompletionItemProvider,
    DebugConfiguration,
    Definition,
    DefinitionProvider,
    DocumentSymbolProvider,
    Position,
    SymbolInformation,
    TextDocument,
    WorkspaceFolder,
    WorkspaceSymbolProvider
} from 'vscode';

import { registerCommands } from './commands';
import { BuiltinComplationItems } from './completion';
import { DeclarationProvider } from './declaration';
import { DefinitionRepository } from './definitionProvider';
import { Formatter } from './formatter';
import {
    readSymbolInformations,
    SymbolInformationRepository
} from './symbol';

export function activate(context: vscode.ExtensionContext) {
    //register the code formatter
    vscode.languages.registerDocumentRangeFormattingEditProvider({ language: 'brightscript', scheme: 'file' }, new Formatter());

    // const selector: DocumentSelector = { language: "Brightscript" };
    const provider: DeclarationProvider = new DeclarationProvider();
    const definitionProvider = new BrightscriptDefinitionProvider(provider);
    const selector = { scheme: 'file', pattern: '**/*.{brs}' };
    const registerDefinitionProvider = vscode.languages.registerDefinitionProvider(selector, definitionProvider);
    context.subscriptions.push(registerDefinitionProvider);

    // experimental placeholder
    // context.subscriptions.push(vscode.languages.registerCompletionItemProvider(selector, new BrightscriptCompletionItemProvider()));
    context.subscriptions.push(vscode.languages.registerDefinitionProvider(selector, new BrightscriptDefinitionProvider(provider)));
    context.subscriptions.push(vscode.languages.registerDocumentSymbolProvider(selector, new BrightscriptDocumentSymbolProvider()));
    context.subscriptions.push(vscode.languages.registerWorkspaceSymbolProvider(new BrightscriptWorkspaceSymbolProvider(provider)));
    context.subscriptions.push(provider);

    registerCommands(context);
}

class BrightscriptConfigurationProvider implements vscode.DebugConfigurationProvider {
    /**
     * Massage a debug configuration just before a debug session is being launched,
     * e.g. add all missing attributes to the debug configuration.
     */
    public async resolveDebugConfiguration(folder: WorkspaceFolder | undefined, config: BrightscriptDebugConfiguration, token?: CancellationToken): Promise<DebugConfiguration> {
        //fill in default configuration values
        if (config.type === 'brightscript') {
            config.name = config.name ? config.name : 'BrightScript Debug: Launch';
            config.consoleOutput = config.consoleOutput ? config.consoleOutput : 'normal';
            config.request = config.request ? config.request : 'launch';
            config.stopOnEntry = config.stopOnEntry === false ? false : true;
            config.rootDir = config.rootDir ? config.rootDir : '${workspaceFolder}';
            config.outDir = config.outDir ? config.outDir : '${workspaceFolder}/out';
            config.retainDeploymentArchive = config.retainDeploymentArchive === false ? false : true;
            config.retainStagingFolder = config.retainStagingFolder === true ? true : false;
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

interface BrightscriptDebugConfiguration extends DebugConfiguration {
    host: string;
    password: string;
    rootDir: string;
    outDir: string;
    stopOnEntry: boolean;
    consoleOutput: 'full' | 'normal';
    retainDeploymentArchive: boolean;
    retainStagingFolder: boolean;
}

class BrightscriptDefinitionProvider implements DefinitionProvider {

    constructor(provider: DeclarationProvider) {
        this.repo = new DefinitionRepository(provider);
    }

    private repo: DefinitionRepository;

    public provideDefinition(document: TextDocument, position: Position, token: CancellationToken): Promise<Definition> {
        return this.repo.sync().then(() => Array.from(this.repo.find(document, position)));
    }
}

class BrightscriptDocumentSymbolProvider implements DocumentSymbolProvider {
    public provideDocumentSymbols(document: TextDocument, token: CancellationToken): SymbolInformation[] {
        return readSymbolInformations(document.uri, document.getText());
    }
}

class BrightscriptWorkspaceSymbolProvider implements WorkspaceSymbolProvider {

    constructor(provider: DeclarationProvider) {
        this.repo = new SymbolInformationRepository(provider);
    }

    private repo: SymbolInformationRepository;

    public provideWorkspaceSymbols(query: string, token: CancellationToken): Promise<SymbolInformation[]> {
        return this.repo.sync().then(() => Array.from(this.repo.find(query)));
    }
}

class BrightscriptCompletionItemProvider implements CompletionItemProvider {
    public provideCompletionItems(document: TextDocument, position: Position, token: CancellationToken, context: vscode.CompletionContext): CompletionItem[] {
        //TODO - do something useful here!
        return BuiltinComplationItems;
    }
}
