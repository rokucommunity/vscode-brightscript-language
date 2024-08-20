import * as vscode from 'vscode';
import type { LanguageServerManager } from '../LanguageServerManager';
import { VscodeCommand } from './VscodeCommand';

export class ClearNpmPackageCacheCommand {

    public register(context: vscode.ExtensionContext, languageServerManager: LanguageServerManager) {
        context.subscriptions.push(vscode.commands.registerCommand(VscodeCommand.clearNpmPackageCache, async () => {
            await languageServerManager.clearNpmPackageCache();
        }));
    }
}

export const clearNpmPackageCacheCommand = new ClearNpmPackageCacheCommand();
