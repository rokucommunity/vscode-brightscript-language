import * as vscode from 'vscode';
import type { LanguageServerManager } from '../LanguageServerManager';

export class ClearNpmPackageCacheCommand {
    public static commandName = 'extension.brightscript.clearNpmPackageCache';

    public register(context: vscode.ExtensionContext, languageServerManager: LanguageServerManager) {
        context.subscriptions.push(vscode.commands.registerCommand(ClearNpmPackageCacheCommand.commandName, async () => {
            await languageServerManager.clearNpmPackageCache();
        }));
    }
}

export const clearNpmPackageCacheCommand = new ClearNpmPackageCacheCommand();
