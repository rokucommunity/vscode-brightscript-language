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

export function activate(context: vscode.ExtensionContext) {
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
        if (config.host === '${promptForHost}' || (config.deepLinkUrl && config.deepLinkUrl.indexOf('${promptForHost}') > -1)) {
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
        if (config.deepLinkUrl) {
            config.deepLinkUrl = config.deepLinkUrl.replace('${host}', config.host);
            config.deepLinkUrl = config.deepLinkUrl.replace('${promptForHost}', config.host);
            if (config.deepLinkUrl.indexOf('${promptForContentId') > -1) {
                let contentId = await vscode.window.showInputBox({
                    placeHolder: 'Content id for deep link',
                    value: ''
                });
                config.deepLinkUrl = config.deepLinkUrl.replace('${promptForContentId}', contentId);
            }
            if (config.deepLinkUrl.indexOf('${promptForMediaType') > -1) {
                let mediaType = await vscode.window.showInputBox({
                    placeHolder: 'Content id for deep link',
                    value: ''
                });
                config.deepLinkUrl = config.deepLinkUrl.replace('${promptForMediaType}', mediaType);
            }
            if (config.deepLinkUrl === '${promptForDeepLinkUrl}') {
                config.deepLinkUrl = await vscode.window.showInputBox({
                    placeHolder: 'Full deep link url',
                    value: ''
                });
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
    deepLinkUrl: string;
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
