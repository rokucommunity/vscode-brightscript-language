import * as crypto from 'crypto';
import * as fs from 'fs';
import * as net from 'net';
import * as path from 'path';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { writeFileAtomic } from './atomicWrite';
import { DEFAULT_IDENTITY } from './identity';
import type { DebugMcpIdentity } from './identity';
import { getInstancesDirectory, getSocketsDirectory } from './paths';
import { SocketTransport } from './SocketTransport';
import { deriveWindowId } from './windowId';

const HANDSHAKE_TIMEOUT_MS = 5000;
const MAX_HANDSHAKE_BYTES = 1024;

/**
 * Hosts an MCP server inside the extension host, reachable over a local IPC endpoint (unix
 * socket, or named pipe on Windows). A client must send the instance token as its first line
 * before any MCP traffic is accepted; the server answers a valid token with a single
 * acknowledgement line. Every accepted connection gets its own MCP `Server`.
 * A discovery file lets the bridge locate the endpoint.
 */
export class DebugMcpServer {
    constructor(
        private readonly options: DebugMcpServerOptions
    ) { }

    private readonly identity = this.options.identity ?? DEFAULT_IDENTITY;
    /** Written once after a valid token, before any MCP traffic; the bridge waits for it. */
    private readonly ackLine = JSON.stringify({ [this.identity.ackProperty]: 'ok' }) + '\n';

    public readonly token = crypto.randomBytes(32).toString('hex');
    public socketPath: string;

    private listener: net.Server;
    private connections = new Set<net.Socket>();
    private mcpServers = new Set<Server>();
    private instanceFilePath: string;
    private debugSessionActive = false;
    private focusedAt: string | undefined;

    public async start(): Promise<void> {
        const pid = process.pid;
        this.socketPath = this.createSocketPath(pid);
        if (process.platform !== 'win32') {
            fs.mkdirSync(path.dirname(this.socketPath), { recursive: true, mode: 0o700 });
            fs.rmSync(this.socketPath, { force: true });
        }

        this.listener = net.createServer((socket) => this.handleConnection(socket));
        await new Promise<void>((resolve, reject) => {
            this.listener.once('error', reject);
            this.listener.listen(this.socketPath, () => {
                this.listener.off('error', reject);
                resolve();
            });
        });
        this.listener.on('error', (error) => this.options.log?.(`listener error: ${error.message}`));
        try {
            if (process.platform !== 'win32') {
                fs.chmodSync(this.socketPath, 0o600);
            }

            const instancesDirectory = getInstancesDirectory(this.options.debugMcpHome);
            fs.mkdirSync(instancesDirectory, { recursive: true, mode: 0o700 });
            this.instanceFilePath = path.join(instancesDirectory, `${pid}.json`);
            this.writeInstanceFile();
        } catch (error) {
            this.dispose();
            throw error;
        }
    }

    /** Records whether a debug session is live, rewriting the discovery file only when the value changed. */
    public setDebugSessionActive(active: boolean): void {
        if (active !== this.debugSessionActive) {
            this.debugSessionActive = active;
            this.writeInstanceFile();
        }
    }

    /** Records that the window gained focus; the bridge lists it so agents can tell which window the user is in. */
    public markFocused(): void {
        this.focusedAt = new Date().toISOString();
        this.writeInstanceFile();
    }

    /** Rewrites the discovery file, e.g. after the workspace folders change. */
    public writeInstanceFile(): void {
        if (!this.instanceFilePath) {
            return;
        }
        const workspaceFolders = this.options.getWorkspaceFolders();
        const windowInfo = this.options.getWindowInfo?.() ?? {};
        const identity = deriveWindowId({ workspaceFile: windowInfo.workspaceFile, workspaceFolders: workspaceFolders, uriScheme: windowInfo.uriScheme, pid: process.pid });
        const instance: DebugMcpInstanceInfo = {
            pid: process.pid,
            socketPath: this.socketPath,
            token: this.token,
            workspaceFolders: workspaceFolders,
            windowId: identity.windowId,
            windowIdStable: identity.stable,
            name: windowInfo.name,
            appName: windowInfo.appName,
            debugSessionActive: this.debugSessionActive,
            focusedAt: this.focusedAt,
            vscodeVersion: this.options.vscodeVersion,
            extensionVersion: this.options.extensionVersion,
            startedAt: this.startedAt
        };
        writeFileAtomic(this.instanceFilePath, JSON.stringify(instance, null, 2), 0o600);
    }

    public dispose(): void {
        this.listener?.close();
        for (const mcpServer of this.mcpServers) {
            void mcpServer.close().catch(() => { });
        }
        for (const socket of this.connections) {
            socket.destroy();
        }
        this.connections.clear();
        this.mcpServers.clear();
        if (this.instanceFilePath) {
            fs.rmSync(this.instanceFilePath, { force: true });
        }
        if (this.socketPath && process.platform !== 'win32') {
            fs.rmSync(this.socketPath, { force: true });
        }
    }

    private readonly startedAt = new Date().toISOString();

    private createSocketPath(pid: number): string {
        if (process.platform === 'win32') {
            return `\\\\.\\pipe\\${this.identity.pipePrefix}-${pid}-${crypto.randomBytes(8).toString('hex')}`;
        }
        return path.join(getSocketsDirectory(this.options.debugMcpHome), `${pid}.sock`);
    }

    private handleConnection(socket: net.Socket): void {
        this.connections.add(socket);
        socket.once('close', () => this.connections.delete(socket));
        socket.on('error', () => socket.destroy());

        let pending = Buffer.alloc(0);
        const timer = setTimeout(() => socket.destroy(), HANDSHAKE_TIMEOUT_MS);
        const onData = (chunk: Buffer) => {
            pending = Buffer.concat([pending, chunk]);
            const newlineIndex = pending.indexOf('\n');
            if (newlineIndex === -1) {
                if (pending.length > MAX_HANDSHAKE_BYTES) {
                    clearTimeout(timer);
                    socket.destroy();
                }
                return;
            }
            clearTimeout(timer);
            socket.off('data', onData);
            const presentedToken = pending.toString('utf8', 0, newlineIndex).replace(/\r$/, '');
            if (!this.isValidToken(presentedToken)) {
                socket.destroy();
                return;
            }
            socket.write(this.ackLine);
            void this.attachMcpServer(socket, pending.subarray(newlineIndex + 1));
        };
        socket.on('data', onData);
        socket.once('close', () => clearTimeout(timer));
    }

    private isValidToken(presentedToken: string): boolean {
        const expected = Buffer.from(this.token);
        const presented = Buffer.from(presentedToken);
        return presented.length === expected.length && crypto.timingSafeEqual(presented, expected);
    }

    private async attachMcpServer(socket: net.Socket, leftover: Buffer): Promise<void> {
        const mcpServer = new Server(
            { name: this.identity.serverName, version: this.options.extensionVersion },
            { capabilities: { tools: { listChanged: true } } }
        );
        const toolsByName = new Map(this.options.tools.map((tool) => [tool.name, tool]));

        mcpServer.setRequestHandler(ListToolsRequestSchema, () => ({
            tools: this.options.tools.map((tool) => ({
                name: tool.name,
                description: tool.description,
                inputSchema: tool.inputSchema
            }))
        }));
        mcpServer.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
            const tool = toolsByName.get(request.params.name);
            if (!tool) {
                return { isError: true, content: [{ type: 'text' as const, text: `Unknown tool: ${request.params.name}` }] };
            }
            try {
                const progressToken = request.params._meta?.progressToken;
                let progressCount = 0;
                const call: ToolCallContext = {
                    signal: extra.signal,
                    reportProgress: progressToken === undefined
                        ? undefined
                        : (message) => {
                            extra.sendNotification({ method: 'notifications/progress', params: { progressToken: progressToken, progress: ++progressCount, message: message } }).catch(() => { });
                        }
                };
                const result = await tool.handler(request.params.arguments ?? {}, call);
                if (result instanceof ToolContentResult) {
                    return { content: result.content };
                }
                return { content: [{ type: 'text' as const, text: JSON.stringify(result, undefined, 2) }] };
            } catch (error) {
                return { isError: true, content: [{ type: 'text' as const, text: (error as Error)?.message ?? String(error) }] };
            }
        });

        this.mcpServers.add(mcpServer);
        const transport = new SocketTransport(socket);
        transport.onerror = (error) => this.options.log?.(`transport error: ${error.message}`);
        mcpServer.onclose = () => this.mcpServers.delete(mcpServer);
        await mcpServer.connect(transport);
        if (leftover.length > 0) {
            transport.receive(leftover);
        }
    }
}

export interface DebugMcpServerOptions {
    /** Directory that holds the instances and sockets directories. */
    debugMcpHome: string;
    /** Names used on the wire; defaults to `DEFAULT_IDENTITY`. */
    identity?: Pick<DebugMcpIdentity, 'serverName' | 'ackProperty' | 'pipePrefix'>;
    tools: DebugMcpTool[];
    extensionVersion: string;
    vscodeVersion: string;
    getWorkspaceFolders: () => string[];
    /** Window details for the discovery file; the window id is derived from these and the folders. */
    getWindowInfo?: () => { name?: string; workspaceFile?: string; uriScheme?: string; appName?: string };
    log?: (message: string) => void;
}

export interface DebugMcpTool {
    name: string;
    description: string;
    inputSchema: { type: 'object'; properties?: Record<string, unknown>; required?: string[] };
    /** What the tool needs in order to be useful, for the `get_status` summary. Default `session`. */
    needs?: ToolNeeds;
    /** Returns a JSON-serializable value, or a `ToolContentResult` for non-text content; thrown errors are reported to the client as tool errors. */
    handler: (args: Record<string, unknown>, call?: ToolCallContext) => unknown;
}

export type ToolNeeds = 'window' | 'session' | 'pausedRuntime';

/** A tool result made of MCP content items instead of JSON, e.g. an image next to a text note. */
export class ToolContentResult {
    constructor(
        public readonly content: ToolContentItem[]
    ) { }
}

export type ToolContentItem =
    | { type: 'text'; text: string }
    | { type: 'image'; data: string; mimeType: string };

/** What a long-running tool can use from the MCP request that invoked it. */
export interface ToolCallContext {
    /** Aborted when the client sends a cancellation notification for the request. */
    signal?: AbortSignal;
    /** Sends a progress notification; present only when the client asked for progress. */
    reportProgress?: (message: string) => void;
}

/** Contents of the per-window discovery file the bridge reads. */
export interface DebugMcpInstanceInfo {
    pid: number;
    socketPath: string;
    token: string;
    workspaceFolders: string[];
    /** Survives Reload Window; see `deriveWindowId`. */
    windowId: string;
    windowIdStable: boolean;
    name?: string;
    /** `vscode.env.appName`, e.g. Visual Studio Code or Cursor. */
    appName?: string;
    debugSessionActive: boolean;
    /** ISO time the window last gained focus. */
    focusedAt?: string;
    vscodeVersion: string;
    extensionVersion: string;
    startedAt: string;
}
