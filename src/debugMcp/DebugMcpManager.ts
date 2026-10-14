import * as path from 'path';
import * as vscode from 'vscode';
import { EXTENSION_ID } from '../constants';
import { debugSessionManager } from '../managers/DebugSessionManager';
import { DebugMcpService } from './core/DebugMcpService';
import { DebugMcpRegistry } from './core/integration';
import { RceManager } from '../managers/RceManager';
import type { SessionSource } from './core/sessionDirectory';
import { registerRokuDebugMcp } from './roku';

/**
 * Wires the generic debug MCP core to this extension: Roku's integration and tools, and the
 * extension's own debug session tracking.
 */
export class DebugMcpManager {
    constructor(
        private readonly context: vscode.ExtensionContext,
        private readonly log: (message: string) => void = () => { }
    ) { }

    public register(): void {
        const registry = new DebugMcpRegistry({ log: this.log });
        const sessions: SessionSource = {
            getSessions: () => debugSessionManager.sessions,
            getActiveSession: () => vscode.debug.activeDebugSession,
            onDidStartSession: debugSessionManager.onDidStartSession,
            onDidTerminateSession: debugSessionManager.onDidTerminateSession
        };
        //only reads the account token from secret storage, so it is independent of the extension's own RceManager
        const rceManager = new RceManager(this.context);
        this.context.subscriptions.push(...registerRokuDebugMcp(registry, { getRceToken: () => rceManager.getToken() }));
        new DebugMcpService({
            context: this.context,
            registry: registry,
            sessions: sessions,
            bridgeSourcePath: path.join(this.context.extensionPath, 'dist', 'debugMcp', 'core', 'bridge.js'),
            identity: {
                extensionId: EXTENSION_ID,
                settingsSection: 'brightscript.debugMcp',
                commandPrefix: 'extension.brightscript.debugMcp',
                displayName: 'BrightScript',
                serverName: 'brightscript-debugger',
                ackProperty: 'brightscriptDebugMcp',
                pipePrefix: 'brightscript-debug-mcp',
                homeEnvironmentVariable: 'BRIGHTSCRIPT_DEBUG_MCP_HOME',
                homeDirectorySegments: ['.brightscript', 'debug-mcp']
            },
            log: this.log
        }).register();
    }
}
