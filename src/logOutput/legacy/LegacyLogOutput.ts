import * as vscode from 'vscode';
import type { DeclarationProvider } from '../../DeclarationProvider';
import type { BrightScriptLaunchConfiguration } from '../../DebugConfigurationProvider';
import type { LogOutput } from '../LogOutput';
import { isBrightScriptLogDocument } from '../LogOutput';
import { LogDocumentLinkProvider } from './LogDocumentLinkProvider';
import { LogOutputManager } from './LogOutputManager';

/**
 * The original "BrightScript Log" implementation (`LogOutputManager` + `LogDocumentLinkProvider`), unchanged.
 * Kept only as a fallback while its replacement is rolled out, and will be removed afterwards.
 */
export class LegacyLogOutput implements LogOutput {
    constructor(
        outputChannel: vscode.OutputChannel,
        context: vscode.ExtensionContext,
        declarationProvider: DeclarationProvider
    ) {
        this.docLinkProvider = new LogDocumentLinkProvider();
        this.logOutputManager = new LogOutputManager(outputChannel, context, this.docLinkProvider, declarationProvider);

        //only hand out links for our channel, not every other output channel
        context.subscriptions.push(
            vscode.languages.registerDocumentLinkProvider({ scheme: 'output' }, {
                provideDocumentLinks: (document, token) => {
                    return isBrightScriptLogDocument(document) ? this.docLinkProvider.provideDocumentLinks(document, token) : [];
                }
            })
        );
    }

    private docLinkProvider: LogDocumentLinkProvider;
    private logOutputManager: LogOutputManager;

    public async setLaunchConfig(launchConfig: BrightScriptLaunchConfiguration) {
        await this.docLinkProvider.setLaunchConfig(launchConfig);
        this.logOutputManager.setLaunchConfig(launchConfig);
    }

    public onDidStartDebugSession() {
        this.logOutputManager.onDidStartDebugSession();
    }

    public onDidReceiveDebugSessionCustomEvent(e: { event: string; body?: any }) {
        return this.logOutputManager.onDidReceiveDebugSessionCustomEvent(e);
    }
}
