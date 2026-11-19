import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFile } from 'child_process';
import * as vscode from 'vscode';
import { createStateTrackerFactory } from './debugTracker';
import { DebugStateStore } from './debugStateStore';
import { DebugMcpServer } from './DebugMcpServer';
import { writeFileAtomic, writeFileAtomicIfChanged } from './atomicWrite';
import { buildClaudeCodeAddArgs, buildClaudeCodeRemoveArgs, buildCommandInvocation, buildServerEntry, getClaudeDesktopConfigPath, getClientLaunchCommand, hasCmdSpecialCharacters, mergeServerEntry } from './clientConfig';
import type { CommandInvocation, McpServerEntry } from './clientConfig';
import type { DebugMcpIdentity } from './identity';
import type { DebugMcpRegistry } from './integration';
import { buildLauncherScript, getLauncherPath } from './launcher';
import { getDebugMcpHome, getStableBridgePath } from './paths';
import { decideServerAction, ServerHolder } from './serverLifecycle';
import { SessionDirectory } from './sessionDirectory';
import type { SessionSource } from './sessionDirectory';
import { createDebugMcpTools } from './tools';
import { createVscodeHost } from './vscodeHost';

/**
 * Owns the lifecycle of the in-extension debug MCP server and the commands that wire external
 * agents to it. Debug-type specifics come only from the registry.
 */
export class DebugMcpService {
    constructor(
        private readonly options: DebugMcpServiceOptions
    ) {
        this.context = options.context;
        this.log = options.log ?? (() => { });
        this.sessionDirectory = new SessionDirectory(options.registry, options.sessions);
    }

    private readonly context: vscode.ExtensionContext;
    private readonly log: (message: string) => void;
    private readonly sessionDirectory: SessionDirectory;

    private readonly debugMcpHome = getDebugMcpHome(process.env, os.homedir(), this.options.identity);
    private readonly serverHolder = new ServerHolder<DebugMcpServer>();
    private appliedEnabled = false;
    private trackingDisposables: vscode.Disposable[] = [];

    public register(): void {
        const context = this.context;
        context.subscriptions.push(
            vscode.commands.registerCommand(`${this.options.identity.commandPrefix}.addToClaudeCode`, () => this.addToClaudeCode()),
            vscode.commands.registerCommand(`${this.options.identity.commandPrefix}.addToClaudeDesktop`, () => this.addToClaudeDesktop()),
            vscode.commands.registerCommand(`${this.options.identity.commandPrefix}.copyConfig`, () => this.copyConfig()),
            vscode.workspace.onDidChangeConfiguration((event) => {
                if (event.affectsConfiguration(`${this.options.identity.settingsSection}.enabled`)) {
                    this.applyEnabledSetting();
                }
            }),
            vscode.workspace.onDidChangeWorkspaceFolders(() => this.serverHolder.current?.writeInstanceFile()),
            vscode.window.onDidChangeWindowState((state) => {
                if (state.focused) {
                    this.serverHolder.current?.markFocused();
                }
            }),
            this.options.sessions.onDidStartSession(() => this.syncDebugSessionActive()),
            this.options.sessions.onDidTerminateSession(() => this.syncDebugSessionActive()),
            { dispose: () => this.stop() }
        );
        this.appliedEnabled = this.isEnabled();
        void this.startIfEnabled();
    }

    private isEnabled(): boolean {
        return vscode.workspace.getConfiguration(this.options.identity.settingsSection).get<boolean>('enabled', true);
    }

    /** Restarts or stops the server only when the effective setting value changed, so the token stays stable otherwise. */
    private applyEnabledSetting(): void {
        const isEnabled = this.isEnabled();
        const action = decideServerAction(this.appliedEnabled, isEnabled);
        this.appliedEnabled = isEnabled;
        if (action === 'none') {
            return;
        }
        this.stop();
        if (action === 'start') {
            void this.startIfEnabled();
        }
    }

    private async startIfEnabled(): Promise<void> {
        if (!this.isEnabled()) {
            return;
        }
        try {
            this.installClientFiles();
        } catch (error) {
            this.log(`debug MCP bridge install failed: ${(error as Error).message}`);
        }
        const stateStore = this.startTracking();
        try {
            const extensionVersion = vscode.extensions.getExtension(this.options.identity.extensionId)?.packageJSON.version as string ?? 'unknown';
            await this.serverHolder.start(async () => {
                const server = new DebugMcpServer({
                    debugMcpHome: this.debugMcpHome,
                    identity: this.options.identity,
                    tools: createDebugMcpTools({
                        sessions: this.sessionDirectory,
                        registry: this.options.registry,
                        stateStore: stateStore,
                        host: createVscodeHost({ settingsSection: this.options.identity.settingsSection }),
                        extensionVersion: extensionVersion,
                        getWorkspaceFolders: () => this.getWorkspaceFolders(),
                        getWindowName: () => vscode.workspace.name
                    }),
                    extensionVersion: extensionVersion,
                    vscodeVersion: vscode.version,
                    getWorkspaceFolders: () => this.getWorkspaceFolders(),
                    getWindowInfo: () => this.getWindowInfo(),
                    log: this.log
                });
                await server.start();
                server.setDebugSessionActive(this.sessionDirectory.groups.length > 0);
                if (vscode.window.state.focused) {
                    server.markFocused();
                }
                return server;
            });
            if (this.serverHolder.current) {
                this.log(`debug MCP server listening on ${this.serverHolder.current.socketPath}`);
            }
        } catch (error) {
            this.log(`debug MCP server failed to start: ${(error as Error).message}`);
        }
    }

    private stop(): void {
        this.serverHolder.stop();
        this.stopTracking();
    }

    /** Observes every debug session so tools can report stops, output and breakpoint verification. */
    private startTracking(): DebugStateStore {
        this.stopTracking();
        const stateStore = new DebugStateStore({ ownsFile: (filePath) => this.options.registry.ownsFile(filePath) });
        this.trackingDisposables = [
            vscode.debug.registerDebugAdapterTrackerFactory('*', createStateTrackerFactory(stateStore, this.options.registry, this.log)),
            this.options.sessions.onDidTerminateSession((session) => stateStore.handleSessionEnded(session.id)),
            { dispose: () => stateStore.dispose() }
        ];
        return stateStore;
    }

    private stopTracking(): void {
        for (const disposable of this.trackingDisposables.splice(0)) {
            disposable.dispose();
        }
    }

    private syncDebugSessionActive(): void {
        this.serverHolder.current?.setDebugSessionActive(this.sessionDirectory.groups.length > 0);
    }

    private getWindowInfo(): { name?: string; workspaceFile?: string; uriScheme?: string; appName?: string } {
        return { name: vscode.workspace.name, workspaceFile: vscode.workspace.workspaceFile?.fsPath, uriScheme: vscode.env.uriScheme, appName: vscode.env.appName };
    }

    private getWorkspaceFolders(): string[] {
        return (vscode.workspace.workspaceFolders ?? []).map((folder) => folder.uri.fsPath);
    }

    /** Copies the compiled bridge and writes the launcher beside it, each only when the content differs. */
    private installClientFiles(): void {
        const sourcePath = this.options.bridgeSourcePath;
        if (!fs.existsSync(sourcePath)) {
            this.log(`bridge not found at ${sourcePath}`);
            return;
        }
        fs.mkdirSync(this.debugMcpHome, { recursive: true, mode: 0o700 });
        const bridgePath = getStableBridgePath(this.debugMcpHome);
        writeFileAtomicIfChanged(bridgePath, fs.readFileSync(sourcePath));
        writeFileAtomicIfChanged(
            getLauncherPath(this.debugMcpHome),
            buildLauncherScript({
                platform: process.platform,
                executablePath: process.execPath,
                bridgePath: bridgePath,
                environment: {
                    DEBUG_MCP_HOME: this.debugMcpHome,
                    DEBUG_MCP_SERVER_NAME: this.options.identity.serverName,
                    DEBUG_MCP_ACK_PROPERTY: this.options.identity.ackProperty,
                    DEBUG_MCP_PRODUCT_NAME: this.options.identity.displayName
                }
            }),
            0o755
        );
    }

    /** `portable` entries go into committed files, so they avoid user-specific absolute paths. */
    private getEntry(options: { includeType: boolean; portable: boolean }): McpServerEntry {
        const launchCommand = getClientLaunchCommand(this.debugMcpHome, {
            portable: options.portable,
            isHomeOverridden: !!process.env[this.options.identity.homeEnvironmentVariable],
            identity: this.options.identity
        });
        const entry = buildServerEntry(launchCommand, { includeType: options.includeType });
        if (process.platform === 'win32' && entry.args.some((argument) => hasCmdSpecialCharacters(argument))) {
            const message = `The launcher path "${entry.args[entry.args.length - 1]}" contains characters that cmd may mis-handle. If the MCP server fails to start, set ${this.options.identity.homeEnvironmentVariable} to a simpler path.`;
            this.log(message);
            void vscode.window.showWarningMessage(message);
        }
        return entry;
    }

    private async addToClaudeCode(): Promise<void> {
        const scope = await vscode.window.showQuickPick(
            [
                { label: 'User (all projects)', scope: 'user' },
                { label: 'This workspace (.mcp.json)', scope: 'workspace' }
            ],
            { placeHolder: `Where should the ${this.options.identity.displayName} debugger MCP server be added?` }
        );
        if (!scope) {
            return;
        }
        try {
            if (scope.scope === 'user') {
                await this.addToClaudeCodeUserScope(this.getEntry({ includeType: true, portable: false }));
            } else {
                await this.addToWorkspaceMcpJson(this.getEntry({ includeType: true, portable: true }));
            }
        } catch (error) {
            void vscode.window.showErrorMessage(`Could not add the MCP server: ${(error as Error).message}`);
        }
    }

    private async addToClaudeCodeUserScope(entry: McpServerEntry): Promise<void> {
        try {
            try {
                await runClaude(buildClaudeCodeAddArgs(entry, this.options.identity.serverName));
            } catch (error) {
                if (!/already exists/i.test((error as Error).message)) {
                    throw error;
                }
                //add refuses to overwrite; the previous registration is only dropped once it is known to exist
                await runClaude(buildClaudeCodeRemoveArgs(this.options.identity.serverName));
                await runClaude(buildClaudeCodeAddArgs(entry, this.options.identity.serverName));
            }
            void vscode.window.showInformationMessage(`Added "${this.options.identity.serverName}" to Claude Code (user scope).`);
        } catch (error) {
            const choice = await vscode.window.showWarningMessage(
                `Could not register with the "claude" command (${(error as Error).message}). Add this entry to your Claude Code MCP config manually.`,
                'Copy JSON'
            );
            if (choice === 'Copy JSON') {
                await vscode.env.clipboard.writeText(JSON.stringify({ [this.options.identity.serverName]: entry }, undefined, 2));
            }
        }
    }

    private async addToWorkspaceMcpJson(entry: McpServerEntry): Promise<void> {
        const folders = vscode.workspace.workspaceFolders ?? [];
        if (folders.length === 0) {
            throw new Error('No workspace folder is open');
        }
        const folder = folders.length === 1 ? folders[0] : await vscode.window.showWorkspaceFolderPick();
        if (!folder) {
            return;
        }
        const filePath = path.join(folder.uri.fsPath, '.mcp.json');
        this.mergeIntoFile(filePath, entry);
        const platformLabel = process.platform === 'win32' ? 'Windows' : 'macOS/Linux';
        void vscode.window.showInformationMessage(`Added "${this.options.identity.serverName}" to ${filePath}. The entry is for ${platformLabel}; teammates on the other OS should add it at user scope instead.`);
    }

    private addToClaudeDesktop(): void {
        if (vscode.env.remoteName) {
            void vscode.window.showInformationMessage(
                'Claude Desktop runs on your local machine and cannot reach a debugger running in a remote window. Use Claude Code in the remote terminal instead (Add to Claude Code).'
            );
            return;
        }
        try {
            const filePath = getClaudeDesktopConfigPath(os.homedir());
            this.mergeIntoFile(filePath, this.getEntry({ includeType: false, portable: false }));
            void vscode.window.showInformationMessage(`Added "${this.options.identity.serverName}" to ${filePath}. Restart Claude Desktop to pick it up.`);
        } catch (error) {
            void vscode.window.showErrorMessage(`Could not update the Claude Desktop config: ${(error as Error).message}`);
        }
    }

    private async copyConfig(): Promise<void> {
        await vscode.env.clipboard.writeText(JSON.stringify({ mcpServers: { [this.options.identity.serverName]: this.getEntry({ includeType: true, portable: false }) } }, undefined, 2));
        void vscode.window.showInformationMessage(`${this.options.identity.displayName} debugger MCP server config copied to the clipboard.`);
    }

    private mergeIntoFile(filePath: string, entry: McpServerEntry): void {
        const targetPath = fs.existsSync(filePath) ? fs.realpathSync(filePath) : filePath;
        const existingText = fs.existsSync(targetPath) ? fs.readFileSync(targetPath, 'utf8') : undefined;
        const mergedText = mergeServerEntry(existingText, entry, this.options.identity.serverName);
        fs.mkdirSync(path.dirname(targetPath), { recursive: true });
        writeFileAtomic(targetPath, mergedText);
    }
}

function runClaude(args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
        let invocation: CommandInvocation;
        try {
            invocation = buildCommandInvocation('claude', args);
        } catch (error) {
            reject(error);
            return;
        }
        execFile(invocation.file, invocation.args, { timeout: 30000, windowsVerbatimArguments: invocation.windowsVerbatimArguments }, (error, stdout, stderr) => {
            if (error) {
                reject(new Error(stderr?.trim() || stdout?.trim() || error.message));
            } else {
                resolve();
            }
        });
    });
}

export interface DebugMcpServiceOptions {
    context: vscode.ExtensionContext;
    registry: DebugMcpRegistry;
    sessions: SessionSource;
    /** Absolute path of the compiled bridge that is copied to the stable location clients launch. */
    bridgeSourcePath: string;
    identity: DebugMcpIdentity;
    log?: (message: string) => void;
}
