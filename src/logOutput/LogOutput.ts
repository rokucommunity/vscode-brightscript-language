import type * as vscode from 'vscode';
import type { BrightScriptLaunchConfiguration } from '../DebugConfigurationProvider';

export const BRIGHTSCRIPT_LOG_CHANNEL_NAME = 'BrightScript Log';

/**
 * Is this document the "BrightScript Log" output channel?
 *
 * Every plain output channel shares VS Code's "Log" language (which colorizer extensions such as
 * IBM.output-colorizer rely on, so we keep ours on it too), so a provider can't be scoped to our channel
 * by language. Instead, check the channel id VS Code puts in the document uri,
 * which looks like `extension-output-<extensionId>-#<n>-<channel name>`.
 */
export function isBrightScriptLogDocument(document: vscode.TextDocument): boolean {
    return document.uri.scheme === 'output' && document.uri.path.endsWith(`-${BRIGHTSCRIPT_LOG_CHANNEL_NAME}`);
}

/**
 * Everything the extension needs from the "BrightScript Log" output: receiving device log output from the
 * debug session, writing it to the output channel, and linking file references back to source files.
 */
export interface LogOutput {
    /**
     * Called whenever a brightscript debug session launches, with that session's launch configuration
     */
    setLaunchConfig(launchConfig: BrightScriptLaunchConfiguration): Promise<void>;

    /**
     * Called when a brightscript debug session starts
     */
    onDidStartDebugSession(): void;

    /**
     * Called for every custom event emitted by a brightscript debug session
     */
    onDidReceiveDebugSessionCustomEvent(e: { event: string; body?: any }): Promise<void>;
}
