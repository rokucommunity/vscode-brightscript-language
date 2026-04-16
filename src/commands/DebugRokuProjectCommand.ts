import * as vscode from 'vscode';
import { ProjectTreeItem } from '../viewProviders/RokuProjectsViewProvider';
import type { RokuProjectManager } from '../managers/RokuProject/RokuProjectManager';
import { VscodeCommand } from './VscodeCommand';

export class DebugRokuProjectCommand {
    public register(context: vscode.ExtensionContext, rokuProjectManager: RokuProjectManager) {
        context.subscriptions.push(
            vscode.commands.registerCommand(VscodeCommand.debugRokuProject, (arg?: vscode.Uri | ProjectTreeItem) => {
                const uri = arg instanceof ProjectTreeItem ? arg.project.configUri : arg;
                void rokuProjectManager.debugProject(uri);
            })
        );
    }
}

export const debugRokuProjectCommand = new DebugRokuProjectCommand();
