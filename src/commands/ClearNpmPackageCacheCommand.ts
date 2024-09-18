import * as vscode from 'vscode';
import { VscodeCommand } from './VscodeCommand';
import type { LocalPackageManager } from '../managers/LocalPackageManager';

export class ClearNpmPackageCacheCommand {

    public register(context: vscode.ExtensionContext, localPackageManager: LocalPackageManager) {
        context.subscriptions.push(vscode.commands.registerCommand(VscodeCommand.clearNpmPackageCache, async () => {
            await localPackageManager.removeAll();
        }));
    }
}

export const clearNpmPackageCacheCommand = new ClearNpmPackageCacheCommand();
