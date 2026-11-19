/**
 * How the hosting extension is named on disk, on the wire and in prompts. The defaults are the
 * values existing client configs and discovery files already use.
 */
export interface DebugMcpIdentity {
    extensionId: string;
    /** Configuration section holding `enabled`, `confirmLaunch` and `confirmEvaluate`. */
    settingsSection: string;
    /** Prefix of the `addToClaudeCode`, `addToClaudeDesktop` and `copyConfig` command ids. */
    commandPrefix: string;
    /** Product name shown in prompts and notifications. */
    displayName: string;
    /** MCP server name clients register the bridge under. */
    serverName: string;
    /** Property of the one-line acknowledgement the server writes after a valid token. */
    ackProperty: string;
    /** Prefix of the Windows named pipe the server listens on. */
    pipePrefix: string;
    /** Environment variable that moves the debug MCP home. */
    homeEnvironmentVariable: string;
    /** Path segments of the default debug MCP home under the user's home directory. */
    homeDirectorySegments: string[];
}

export const DEFAULT_IDENTITY: DebugMcpIdentity = {
    extensionId: 'RokuCommunity.brightscript',
    settingsSection: 'brightscript.debugMcp',
    commandPrefix: 'extension.brightscript.debugMcp',
    displayName: 'BrightScript',
    serverName: 'brightscript-debugger',
    ackProperty: 'brightscriptDebugMcp',
    pipePrefix: 'brightscript-debug-mcp',
    homeEnvironmentVariable: 'BRIGHTSCRIPT_DEBUG_MCP_HOME',
    homeDirectorySegments: ['.brightscript', 'debug-mcp']
};
