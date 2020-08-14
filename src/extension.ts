import * as vscode from 'vscode';
import { window } from 'vscode';
import { gte as semverGte } from 'semver';
import { env, extensions } from 'vscode';
import { ActiveDeviceManager } from './ActiveDeviceManager';
import { brightScriptCommands } from './BrightScriptCommands';
import BrightScriptDefinitionProvider from './BrightScriptDefinitionProvider';
import { BrightScriptDocumentSymbolProvider } from './BrightScriptDocumentSymbolProvider';
import { BrightScriptReferenceProvider } from './BrightScriptReferenceProvider';
import BrightScriptSignatureHelpProvider from './BrightScriptSignatureHelpProvider';
import BrightScriptXmlDefinitionProvider from './BrightScriptXmlDefinitionProvider';
import { BrightScriptDebugConfigurationProvider } from './DebugConfigurationProvider';
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
import { GlobalStateManager } from './GlobalStateManager';
import { languageServerManager } from './LanguageServerManager';

const EXTENSION_ID = 'celsoaf.brightscript';

export class Extension {

    public outputChannel: vscode.OutputChannel;
    public debugServerOutputChannel: vscode.OutputChannel;
    public globalStateManager: GlobalStateManager;

    public async activate(context: vscode.ExtensionContext) {
        this.globalStateManager = new GlobalStateManager(context);

        var previousExtensionVersion = this.globalStateManager.lastRunExtensionVersion;

        var currentExtensionVersion = extensions.getExtension(EXTENSION_ID).packageJSON.version;
        //update the tracked version of the extension
        this.globalStateManager.lastRunExtensionVersion = currentExtensionVersion;

        let activeDeviceManager = new ActiveDeviceManager();
        let languageServerPromise = languageServerManager.init(context);

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

        this.outputChannel = vscode.window.createOutputChannel('BrightScript Log');
        this.debugServerOutputChannel = vscode.window.createOutputChannel('BrightScript Debug Server');
        this.debugServerOutputChannel.appendLine('Extension startup');

        let configProvider = new BrightScriptDebugConfigurationProvider(context, activeDeviceManager);
        context.subscriptions.push(vscode.debug.registerDebugConfigurationProvider('brightscript', configProvider));

        let docLinkProvider = new LogDocumentLinkProvider();
        //register a link provider for this extension's "BrightScript Log" output
        vscode.languages.registerDocumentLinkProvider({ language: 'Log' }, docLinkProvider);
        //give the launch config to the link provider any time we launch the app
        vscode.debug.onDidReceiveDebugSessionCustomEvent(async (e) => {
            if (e.event === 'BSLaunchStartEvent') {
                docLinkProvider.setLaunchConfig(e.body);
                logOutputManager.setLaunchConfig(e.body);

                //write debug server log statements to the DebugServer output channel
            } else if (e.event === 'BSDebugServerLogOutputEvent') {
                this.debugServerOutputChannel.appendLine(e.body);

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
        const logOutputManager: LogOutputManager = new LogOutputManager(this.outputChannel, context, docLinkProvider, declarationProvider);
        const definitionRepo = new DefinitionRepository(declarationProvider);
        const definitionProvider = new BrightScriptDefinitionProvider(definitionRepo);
        const selector = { scheme: 'file', pattern: '**/*.{brs,bs}' };

        brightScriptCommands.registerCommands(context);

        // experimental placeholder
        // context.subscriptions.push(vscode.languages.registerCompletionItemProvider(selector, new BrightScriptCompletionItemProvider(), '.'));
        context.subscriptions.push(vscode.languages.registerDefinitionProvider(selector, definitionProvider));
        context.subscriptions.push(vscode.languages.registerDocumentSymbolProvider(selector, new BrightScriptDocumentSymbolProvider(declarationProvider)));
        context.subscriptions.push(vscode.languages.registerWorkspaceSymbolProvider(new BrightScriptWorkspaceSymbolProvider(declarationProvider, symbolInformationRepository)));
        context.subscriptions.push(declarationProvider);
        vscode.languages.registerReferenceProvider(selector, new BrightScriptReferenceProvider());
        vscode.languages.registerSignatureHelpProvider(selector, new BrightScriptSignatureHelpProvider(definitionRepo), '(', ',');

        vscode.debug.onDidStartDebugSession((e) => {
            //if this is a brightscript debug session
            if (e.type === 'brightscript') {
                logOutputManager.onDidStartDebugSession();
            }
        });
        vscode.debug.onDidReceiveDebugSessionCustomEvent((e) => {
            logOutputManager.onDidReceiveDebugSessionCustomEvent(e);
        });

        //focus the output panel on extension startup (only if configured to do so...defaults to false)
        if (vscode.workspace.getConfiguration('brightscript')?.focusOutputPanelOnStartup === true) {
            this.outputChannel.show();
        }

        //xml support
        const xmlSelector = { scheme: 'file', pattern: '**/*.{xml}' };
        context.subscriptions.push(vscode.languages.registerDefinitionProvider(xmlSelector, new BrightScriptXmlDefinitionProvider(definitionRepo)));

        this.showWelcomeOrWhatsNew(previousExtensionVersion, currentExtensionVersion);
        await languageServerPromise;
    }

    public async showWelcomeOrWhatsNew(lastRunExtensionVersion: string, currentExtensionVersion: string) {
        let config = vscode.workspace.getConfiguration('brightscript');
        let isReleaseNotificationsEnabled = config.get('enableReleaseNotifications') === false ? false : true;
        //this is the first launch of the extension
        if (lastRunExtensionVersion === undefined) {

            //if release notifications are enabled
            //TODO once we have the welcome page content prepared, remove the `&& false` from the condition below
            if (isReleaseNotificationsEnabled && false) {
                let viewText = 'View the get started guide';
                let response = await window.showInformationMessage(
                    'Thank you for installing the BrightScript VSCode extension. Click the button below to read some tips on how to get the most out of this extension.',
                    viewText
                );
                if (response === viewText) {
                    env.openExternal(vscode.Uri.parse('https://github.com/rokucommunity/vscode-brightscript-language/blob/master/Welcome.md'));
                }
            }
            this.globalStateManager.lastSeenReleaseNotesVersion = currentExtensionVersion;
            return;
        }
        //List of version numbers that should prompt the ReleaseNotes page.
        //these should be in highest-to-lowest order, because we will launch the highest version
        let versionWhitelist = [
            '2.0.0'
        ];
        for (let whitelistVersion of versionWhitelist) {
            if (
                //if the current version is larger than the whitelist version
                semverGte(whitelistVersion, lastRunExtensionVersion) &&
                //if the user hasn't seen this popup before
                this.globalStateManager.lastSeenReleaseNotesVersion !== whitelistVersion &&
                //if ReleaseNote popups are enabled
                isReleaseNotificationsEnabled
            ) {
                //mark this version as viewed
                this.globalStateManager.lastSeenReleaseNotesVersion = whitelistVersion;
                let viewText = 'View Release Notes';
                let response = await window.showInformationMessage(
                    `BrightScript Language v${whitelistVersion} includes significant changes from previous versions. Please take a moment to review the release notes.`,
                    viewText
                );
                if (response === viewText) {
                    env.openExternal(vscode.Uri.parse(`https://github.com/rokucommunity/vscode-brightscript-language/blob/master/ReleaseNotes.md#${whitelistVersion}`));
                }
                this.globalStateManager.lastSeenReleaseNotesVersion = currentExtensionVersion;
            }
        }
    }

}
export const extension = new Extension();
export function activate(context: vscode.ExtensionContext) {
    extension.activate(context);
}
