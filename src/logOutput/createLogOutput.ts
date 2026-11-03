import * as vscode from 'vscode';
import type { DeclarationProvider } from '../DeclarationProvider';
import { util } from '../util';
import { BrightScriptLogOutput } from './BrightScriptLogOutput';
import { LegacyLogOutput } from './legacy/LegacyLogOutput';
import type { LogOutput } from './LogOutput';

export const USE_LEGACY_LOG_OUTPUT_SETTING = 'brightscript.output.useLegacyLogOutput';

function isLegacyLogOutputEnabled() {
    return util.getConfiguration('brightscript').get('output.useLegacyLogOutput') === true;
}

/**
 * Create the "BrightScript Log" output, using the legacy implementation if the user opted back into it.
 * Switching implementations needs a window reload, so the user is offered one when the setting changes.
 */
export function createLogOutput(outputChannel: vscode.OutputChannel, context: vscode.ExtensionContext, declarationProvider: DeclarationProvider): LogOutput {
    const isLegacy = isLegacyLogOutputEnabled();

    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(async (e) => {
            if (e.affectsConfiguration(USE_LEGACY_LOG_OUTPUT_SETTING) && isLegacyLogOutputEnabled() !== isLegacy) {
                const reload = 'Reload Window';
                const choice = await vscode.window.showInformationMessage(`Reload the window to apply "${USE_LEGACY_LOG_OUTPUT_SETTING}".`, reload);
                if (choice === reload) {
                    await vscode.commands.executeCommand('workbench.action.reloadWindow');
                }
            }
        })
    );

    return isLegacy
        ? new LegacyLogOutput(outputChannel, context, declarationProvider)
        : new BrightScriptLogOutput(outputChannel, context, declarationProvider);
}
