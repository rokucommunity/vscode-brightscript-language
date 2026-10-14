/**
 * Standalone stdio entry point launched by external MCP clients. It is copied out of the
 * extension to a stable path, so it may only depend on Node built-ins.
 *
 * It connects to the debug MCP server of a running VS Code window (found through the
 * discovery files) and relays newline-delimited JSON-RPC between stdin/stdout and that
 * connection. It auto-connects only when exactly one window has a workspace folder containing
 * the client's working directory; otherwise the agent picks a window with `select_window`.
 * While no window is selected it answers the MCP handshake itself so the agent gets an
 * explanation instead of a dead process, and it reconnects (replaying the client's initialize)
 * as soon as the selected window becomes reachable again. Diagnostics go to stderr only; stdout
 * is the protocol channel and only ever receives complete lines.
 */
import * as fs from 'fs';
import * as net from 'net';
import * as os from 'os';
import * as path from 'path';
import { StringDecoder } from 'string_decoder';
import type { Readable, Writable } from 'stream';

const CONNECT_TIMEOUT_MS = 3000;
const REPLAY_TIMEOUT_MS = 5000;
const RESCAN_INTERVAL_MS = 2000;
const BRIDGE_INITIALIZE_ID = '__debug_mcp_bridge_initialize__';
const LOST_CONNECTION_ERROR_CODE = -32000;
const LOST_CONNECTION_REQUEST_MESSAGE = 'Lost connection to VS Code (window closed or reloaded). Retry the request.';
const SWITCHED_WINDOW_REQUEST_MESSAGE = 'The bridge switched to another VS Code window before this request finished. Retry it if it still applies.';
/** Protocol versions the fallback accepts, newest first; keep in sync with `SUPPORTED_PROTOCOL_VERSIONS` in the MCP SDK (`types`). */
const SUPPORTED_PROTOCOL_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05', '2024-10-07'];
const DEFAULT_BRIDGE_IDENTITY: BridgeIdentity = { serverName: 'debug-mcp', ackProperty: 'debugMcp', productName: 'debugger' };
const SELECTION_GUIDANCE = 'The debugger tools (launch, breakpoints, stepping, variables) appear after a VS Code window is selected. Call list_windows, then select_window.';
const GET_STATUS_TOOL = 'get_status';
const LIST_WINDOWS_TOOL = 'list_windows';
const SELECT_WINDOW_TOOL = 'select_window';

/** Location of the discovery files. The launcher passes the extension's location as `DEBUG_MCP_HOME`. */
export function getDebugMcpHome(environment: NodeJS.ProcessEnv = process.env, homeDirectory = os.homedir()): string {
    return environment.DEBUG_MCP_HOME || path.join(homeDirectory, '.debug-mcp');
}

/** The names the launcher passes in `DEBUG_MCP_SERVER_NAME`, `DEBUG_MCP_ACK_PROPERTY` and `DEBUG_MCP_PRODUCT_NAME`. */
export function readBridgeIdentity(environment: NodeJS.ProcessEnv = process.env): BridgeIdentity {
    return {
        serverName: environment.DEBUG_MCP_SERVER_NAME || DEFAULT_BRIDGE_IDENTITY.serverName,
        ackProperty: environment.DEBUG_MCP_ACK_PROPERTY || DEFAULT_BRIDGE_IDENTITY.ackProperty,
        productName: environment.DEBUG_MCP_PRODUCT_NAME || DEFAULT_BRIDGE_IDENTITY.productName
    };
}

/**
 * The instances whose workspace contains (or equals) the working directory, most recently
 * started first.
 */
export function findMatchingInstances(instances: BridgeInstanceInfo[], workingDirectory: string, platform: NodeJS.Platform = process.platform): BridgeInstanceInfo[] {
    return sortNewestFirst(instances).filter((instance) => matchesFolder(instance, workingDirectory, platform));
}

/** The auto-connect choice: the only matching instance, or undefined when none or several match. */
export function pickInstance(instances: BridgeInstanceInfo[], workingDirectory: string, platform: NodeJS.Platform = process.platform): BridgeInstanceInfo | undefined {
    const matching = findMatchingInstances(instances, workingDirectory, platform);
    return matching.length === 1 ? matching[0] : undefined;
}

/**
 * Reads the discovery files, dropping (and deleting) those left by crashed windows and
 * ignoring files that cannot be parsed.
 */
export function readLiveInstances(instancesDirectory: string, isProcessAlive: (pid: number) => boolean = isPidAlive): BridgeInstanceInfo[] {
    let fileNames: string[];
    try {
        fileNames = fs.readdirSync(instancesDirectory).filter((fileName) => fileName.endsWith('.json'));
    } catch {
        return [];
    }
    const instances: BridgeInstanceInfo[] = [];
    for (const fileName of fileNames) {
        const filePath = path.join(instancesDirectory, fileName);
        let instance: BridgeInstanceInfo;
        try {
            instance = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        } catch {
            continue;
        }
        if (!instance || typeof instance.pid !== 'number' || typeof instance.socketPath !== 'string' || typeof instance.token !== 'string') {
            continue;
        }
        if (!isProcessAlive(instance.pid)) {
            fs.rmSync(filePath, { force: true });
            continue;
        }
        instances.push({
            ...instance,
            workspaceFolders: Array.isArray(instance.workspaceFolders) ? instance.workspaceFolders : [],
            windowId: typeof instance.windowId === 'string' && instance.windowId ? instance.windowId : `pid:${instance.pid}`,
            windowIdStable: typeof instance.windowId === 'string' && instance.windowId ? instance.windowIdStable !== false : false,
            debugSessionActive: instance.debugSessionActive === true
        });
    }
    return instances;
}

export function isPidAlive(pid: number): boolean {
    try {
        process.kill(pid, 0);
        return true;
    } catch (error) {
        //EPERM means the process exists but belongs to another user
        return (error as NodeJS.ErrnoException).code === 'EPERM';
    }
}

/** Tools the bridge answers itself; with no window selected it also stands in for the server's `get_status`. */
export function createBridgeTools(connected: boolean, productName = DEFAULT_BRIDGE_IDENTITY.productName): BridgeToolDescriptor[] {
    const guidance = connected ? '' : ` ${SELECTION_GUIDANCE}`;
    const listWindows: BridgeToolDescriptor = {
        name: LIST_WINDOWS_TOOL,
        description: `Lists the open VS Code windows that run the ${productName} extension: index, windowId, name, workspace folders, whether a debug session is active, when it was last focused, whether it matches this client's working directory, and which one is selected.${guidance}`,
        inputSchema: { type: 'object', properties: {} }
    };
    const selectWindow: BridgeToolDescriptor = {
        name: SELECT_WINDOW_TOOL,
        description: `Selects the VS Code window the debugger tools act on: by instanceKey, windowId, index from the last list_windows, or by a folder path; each must match exactly one window.${guidance}`,
        inputSchema: {
            type: 'object',
            properties: {
                windowId: { type: 'string', description: 'The windowId from list_windows.' },
                instanceKey: { type: 'string', description: 'The instanceKey from list_windows; unique even when two windows share a windowId.' },
                index: { type: 'integer', description: 'The 1-based index from the last list_windows; selects that exact window.' },
                folder: { type: 'string', description: 'A folder path that equals or lies inside the workspace folder of exactly one window.' }
            }
        }
    };
    if (connected) {
        return [listWindows, selectWindow];
    }
    return [{
        name: GET_STATUS_TOOL,
        description: `Reports whether the bridge is connected to a VS Code window and, when it is not, why not, with the list of open windows.${guidance}`,
        inputSchema: { type: 'object', properties: {} }
    }, listWindows, selectWindow];
}

/**
 * Builds the response for one message when no VS Code window is selected. Returns
 * undefined for notifications and anything that needs no answer. `details` is added to the
 * `get_status` result.
 */
export function createFallbackResponse(message: any, reason: string, details: object = {}, identity: BridgeIdentity = DEFAULT_BRIDGE_IDENTITY): object | undefined {
    if (!message || typeof message !== 'object' || message.id === undefined || typeof message.method !== 'string') {
        return undefined;
    }
    const respond = (result: object) => ({ jsonrpc: '2.0', id: message.id, result: result });
    switch (message.method) {
        case 'initialize':
            return respond({
                protocolVersion: SUPPORTED_PROTOCOL_VERSIONS.includes(message.params?.protocolVersion) ? message.params.protocolVersion : SUPPORTED_PROTOCOL_VERSIONS[0],
                capabilities: { tools: { listChanged: true } },
                serverInfo: { name: `${identity.serverName}-bridge`, version: '1.0.0' }
            });
        case 'ping':
            return respond({});
        case 'tools/list':
            return respond({ tools: createBridgeTools(false, identity.productName) });
        case 'tools/call':
            return respond(message.params?.name === GET_STATUS_TOOL
                ? toolResult({ connected: false, message: reason, ...details })
                : toolError(reason));
        default:
            return { jsonrpc: '2.0', id: message.id, error: { code: -32601, message: `Method not found: ${message.method}` } };
    }
}

function toolResult(value: object): object {
    return { content: [{ type: 'text', text: JSON.stringify(value, undefined, 2) }] };
}

function toolError(text: string): object {
    return { isError: true, content: [{ type: 'text', text: text }] };
}

function sortNewestFirst(instances: BridgeInstanceInfo[]): BridgeInstanceInfo[] {
    return [...instances].sort((left, right) => (Date.parse(right.startedAt) || 0) - (Date.parse(left.startedAt) || 0) || left.windowId.localeCompare(right.windowId));
}

/** Identifies one running window process; unlike `windowId` it is unique even when two windows show the same folder. */
export function getInstanceKey(instance: Pick<BridgeInstanceInfo, 'pid' | 'socketPath'>): string {
    return `${instance.pid}:${instance.socketPath}`;
}

function matchesFolder(instance: BridgeInstanceInfo, folderPath: string, platform: NodeJS.Platform = process.platform): boolean {
    return instance.workspaceFolders.some((folder) => isSameOrInside(folderPath, folder, platform));
}

function getDisplayName(instance: BridgeInstanceInfo): string {
    return instance.name || instance.windowId;
}

function isSameOrInside(candidate: string, folder: string, platform: NodeJS.Platform): boolean {
    const normalize = (value: string) => {
        const absolute = path.resolve(value);
        let resolved: string;
        try {
            resolved = fs.realpathSync(absolute);
        } catch {
            resolved = absolute;
        }
        resolved = resolved.replace(/[\\/]+$/, '');
        return platform === 'win32' || platform === 'darwin' ? resolved.toLowerCase() : resolved;
    };
    const normalizedCandidate = normalize(candidate);
    const normalizedFolder = normalize(folder);
    return normalizedCandidate === normalizedFolder || normalizedCandidate.startsWith(normalizedFolder + path.sep);
}

function log(message: string): void {
    process.stderr.write(`[${readBridgeIdentity().serverName} bridge] ${message}\n`);
}

function readWorkspaceArgument(argv: string[]): string | undefined {
    const flagIndex = argv.indexOf('--workspace');
    return flagIndex >= 0 ? argv[flagIndex + 1] : undefined;
}

function isRequest(message: any): boolean {
    return !!message && typeof message === 'object' && message.id !== undefined && typeof message.method === 'string';
}

function isResponse(message: any): boolean {
    return !!message && typeof message === 'object' && message.id !== undefined && message.method === undefined;
}

/** Splits a byte stream into complete, trimmed, non-empty lines, tolerating multi-byte characters split across chunks. */
export class LineBuffer {
    private readonly decoder = new StringDecoder('utf8');
    private pending = '';

    public push(chunk: Buffer | string): string[] {
        this.pending += typeof chunk === 'string' ? chunk : this.decoder.write(chunk);
        const lines: string[] = [];
        let newlineIndex: number;
        while ((newlineIndex = this.pending.indexOf('\n')) >= 0) {
            const line = this.pending.slice(0, newlineIndex).trim();
            this.pending = this.pending.slice(newlineIndex + 1);
            if (line) {
                lines.push(line);
            }
        }
        return lines;
    }
}

/**
 * Message-aware relay between an MCP client (input/output streams) and the debug MCP server
 * of a VS Code window. Whole lines are forwarded in both directions. Requests without a
 * response yet are tracked so a dropped connection answers each with an error. While no
 * window is connected every client request triggers a rescan of the discovery files, and a
 * periodic rescan covers an idle client; the client is told through
 * `notifications/tools/list_changed` whenever the bridge moves between fallback and connected.
 *
 * Which window is used is decided by `selectedWindowId`, which lasts for the bridge's lifetime:
 * set by auto-selection (exactly one window matches the working directory) or `select_window`.
 * After a drop the bridge only ever reconnects to a window with that same id, so a reloaded
 * window is found again and an unrelated one never is. The bridge answers `list_windows` and
 * `select_window` itself in every state and appends them to the server's tool list.
 */
export class DebugMcpBridge {
    constructor(
        private readonly options: DebugMcpBridgeOptions
    ) { }

    private readonly clientLines = new LineBuffer();
    private readonly outstandingRequests = new Map<string, unknown>();
    private connection: ServerConnection | undefined;
    private taskQueue: Promise<void> = Promise.resolve();
    private rescanTimer: NodeJS.Timeout | undefined;
    private rescanQueued = false;
    private stopped = false;
    private initializeRequest: any;
    private initializedNotificationReceived = false;
    private announcedConnected = false;
    private selectedWindowId: string | undefined;
    private selectedWindowName: string | undefined;
    private selectedWindowFolders: string[] = [];
    private connectedInstance: BridgeInstanceInfo | undefined;
    private lastListedInstances: BridgeInstanceInfo[] = [];
    private readonly pendingToolsListIds = new Set<string>();
    private onInputData: (chunk: Buffer | string) => void;
    private onInputEnd: () => void;

    public start(): void {
        this.onInputData = (chunk) => {
            for (const line of this.clientLines.push(chunk)) {
                this.enqueue(() => this.handleClientLine(line));
            }
        };
        this.onInputEnd = () => {
            this.stop();
            this.options.onInputEnd?.();
        };
        this.options.input.on('data', this.onInputData);
        this.options.input.on('end', this.onInputEnd);
        this.rescanTimer = setInterval(() => {
            if (!this.rescanQueued) {
                this.rescanQueued = true;
                this.enqueue(async () => {
                    try {
                        if (this.connection) {
                            this.refreshConnectedWindow(this.readInstances());
                        } else {
                            await this.connectIfNeeded(false);
                        }
                    } finally {
                        this.rescanQueued = false;
                    }
                });
            }
        }, this.options.rescanIntervalMs ?? RESCAN_INTERVAL_MS);
        this.rescanTimer.unref();
    }

    public stop(): void {
        this.stopped = true;
        clearInterval(this.rescanTimer);
        this.options.input.off('data', this.onInputData);
        this.options.input.off('end', this.onInputEnd);
        this.connection?.socket.destroy();
        this.connection = undefined;
    }

    /** Resolves once everything received so far has been processed. */
    public async idle(): Promise<void> {
        await this.taskQueue;
    }

    private enqueue(task: () => Promise<void>): void {
        this.taskQueue = this.taskQueue.then(task).catch((error) => this.log(`unexpected error: ${(error as Error).message}`));
    }

    private get identity(): BridgeIdentity {
        return this.options.identity ?? DEFAULT_BRIDGE_IDENTITY;
    }

    private log(message: string): void {
        (this.options.log ?? log)(message);
    }

    private writeLine(line: string): void {
        this.options.output.write(line + '\n');
    }

    private writeMessage(message: object): void {
        this.writeLine(JSON.stringify(message));
    }

    private readInstances(): BridgeInstanceInfo[] {
        return readLiveInstances(path.join(this.options.debugMcpHome, 'instances'));
    }

    /**
     * Reads the live windows in a stable order. Only an explicit listing (`list_windows`,
     * `get_status`) is remembered, since that is what `select_window` resolves an index against.
     */
    private listWindows(remember: boolean): WindowSummary[] {
        const instances = this.readInstances();
        this.refreshConnectedWindow(instances);
        const sorted = sortNewestFirst(instances);
        if (remember) {
            this.lastListedInstances = sorted;
        }
        return sorted.map((instance, position) => this.summarizeWindow(instance, position + 1));
    }

    /** While connected, follows the window's id when it changed without a restart (a workspace folder was added or removed). */
    private refreshConnectedWindow(instances: BridgeInstanceInfo[]): void {
        if (!this.connection || !this.connectedInstance) {
            return;
        }
        const connectedKey = getInstanceKey(this.connectedInstance);
        const current = instances.find((instance) => getInstanceKey(instance) === connectedKey);
        if (current) {
            this.connectedInstance = current;
            this.selectedWindowId = current.windowId;
            this.selectedWindowName = getDisplayName(current);
            this.selectedWindowFolders = current.workspaceFolders;
        }
    }

    private summarizeWindow(instance: BridgeInstanceInfo, index?: number): WindowSummary {
        return {
            index: index,
            instanceKey: getInstanceKey(instance),
            windowId: instance.windowId,
            appName: instance.appName ?? null,
            windowIdStable: instance.windowIdStable !== false,
            name: getDisplayName(instance),
            workspaceFolders: instance.workspaceFolders,
            debugSessionActive: instance.debugSessionActive === true,
            focusedAt: instance.focusedAt ?? null,
            matchesWorkingDirectory: matchesFolder(instance, this.options.workingDirectory),
            selected: !!this.connection && !!this.connectedInstance && getInstanceKey(this.connectedInstance) === getInstanceKey(instance)
        };
    }

    /** Explains why no window is connected, ending with how to proceed. */
    private describeUnselectedState(windows: WindowSummary[]): string {
        if (this.selectedWindowId !== undefined) {
            const sameId = windows.filter((window) => window.windowId === this.selectedWindowId);
            if (sameId.length > 1) {
                return `Several open VS Code windows match the selected window '${this.selectedWindowName}'. Call list_windows, then select_window with an instanceKey or index to choose one.`;
            }
            if (sameId.length === 1) {
                return `Could not connect to the selected window '${this.selectedWindowName}'; it may still be starting. Retry shortly.`;
            }
            return `The selected window '${this.selectedWindowName}' (folders: ${this.selectedWindowFolders.join(', ') || 'none'}) is not open. Reopen it or call select_window to choose another.`;
        }
        if (windows.length === 0) {
            return `No VS Code window with the ${this.identity.productName} extension is running. Open a project in VS Code with the ${this.identity.productName} extension enabled. This server connects automatically only when exactly one window has this working directory open; otherwise call list_windows and select_window.`;
        }
        const matching = windows.filter((window) => window.matchesWorkingDirectory);
        if (matching.length === 0) {
            return `No open VS Code window has a workspace folder containing the working directory ${this.options.workingDirectory}. ${SELECTION_GUIDANCE}`;
        }
        if (matching.length > 1) {
            return `Several open VS Code windows contain the working directory ${this.options.workingDirectory} (${matching.map((window) => `'${window.name}'`).join(', ')}). ${SELECTION_GUIDANCE}`;
        }
        return `Could not connect to the matching VS Code window '${matching[0].name}'; it may still be starting. Retry shortly.`;
    }

    private async handleClientLine(line: string): Promise<void> {
        let message: any;
        try {
            message = JSON.parse(line);
        } catch (error) {
            this.log(`ignoring unparseable input: ${(error as Error).message}`);
            return;
        }
        if (message?.method === 'notifications/initialized') {
            this.initializedNotificationReceived = true;
        }
        if (message?.method === 'notifications/cancelled' && message.params?.requestId !== undefined) {
            this.outstandingRequests.delete(JSON.stringify(message.params.requestId));
            this.pendingToolsListIds.delete(JSON.stringify(message.params.requestId));
        }
        const request = isRequest(message);
        const isInitialize = request && message.method === 'initialize';
        if (request && !this.connection) {
            await this.connectIfNeeded(isInitialize);
        }
        if (isInitialize) {
            this.initializeRequest = message;
            this.initializedNotificationReceived = false;
        }
        if (request && message.method === 'tools/call' && (message.params?.name === LIST_WINDOWS_TOOL || message.params?.name === SELECT_WINDOW_TOOL)) {
            await this.handleBridgeToolCall(message);
            return;
        }
        if (this.connection) {
            if (request) {
                this.outstandingRequests.set(JSON.stringify(message.id), message.id);
                if (message.method === 'tools/list') {
                    this.pendingToolsListIds.add(JSON.stringify(message.id));
                }
            }
            this.connection.socket.write(line + '\n');
        } else if (request) {
            const windows = this.listWindows(message.method === 'tools/call' && message.params?.name === GET_STATUS_TOOL);
            const response = createFallbackResponse(message, this.describeUnselectedState(windows), { workingDirectory: this.options.workingDirectory, windows: windows }, this.identity);
            if (response) {
                this.writeMessage(response);
            }
        }
    }

    private async handleBridgeToolCall(message: any): Promise<void> {
        const args = message.params?.arguments ?? {};
        let outcome: BridgeToolOutcome;
        if (message.params.name === LIST_WINDOWS_TOOL) {
            const windows = this.listWindows(true);
            outcome = { value: { workingDirectory: this.options.workingDirectory, connected: !!this.connection, selectedWindowId: this.selectedWindowId ?? null, windows: windows } };
        } else {
            outcome = await this.selectWindow(args);
        }
        this.writeMessage({ jsonrpc: '2.0', id: message.id, result: outcome.error !== undefined ? toolError(outcome.error) : toolResult(outcome.value ?? {}) });
        if (outcome.toolsChanged) {
            this.announceConnectionState(true, true);
        }
    }

    private async selectWindow(args: Record<string, unknown>): Promise<BridgeToolOutcome> {
        const instances = this.readInstances();
        this.refreshConnectedWindow(instances);
        let candidates: BridgeInstanceInfo[];
        if (typeof args.instanceKey === 'string') {
            candidates = instances.filter((instance) => getInstanceKey(instance) === args.instanceKey);
        } else if (typeof args.windowId === 'string') {
            candidates = instances.filter((instance) => instance.windowId === args.windowId);
        } else if (typeof args.index === 'number') {
            const listed = this.lastListedInstances[args.index - 1];
            if (!listed) {
                return { error: `No window at index ${args.index}. Call list_windows and use an index from its result.` };
            }
            candidates = instances.filter((instance) => getInstanceKey(instance) === getInstanceKey(listed));
        } else if (typeof args.folder === 'string') {
            candidates = instances.filter((instance) => matchesFolder(instance, args.folder as string));
        } else {
            return { error: 'Provide instanceKey, windowId, index, or folder. Call list_windows to see the options.' };
        }
        if (candidates.length === 0) {
            return { error: 'No open window matches. Call list_windows to see the open windows.' };
        }
        if (candidates.length > 1) {
            return { error: `Several open windows match (${sortNewestFirst(candidates).map((instance) => `'${getDisplayName(instance)}' ${getInstanceKey(instance)}`).join(', ')}). Select one by instanceKey or index from list_windows.` };
        }
        const target = candidates[0];
        if (this.connection && this.connectedInstance && getInstanceKey(this.connectedInstance) === getInstanceKey(target)) {
            return { value: { selected: this.summarizeWindow(target) } };
        }
        const connection = await this.establishConnection(target, false);
        if (!connection) {
            return { error: `Could not connect to window '${getDisplayName(target)}'. It may still be starting; try again.` };
        }
        if (this.stopped) {
            connection.socket.destroy();
            return { error: 'The bridge is shutting down.' };
        }
        const previous = this.connection;
        this.connection = undefined;
        if (previous) {
            previous.socket.destroy();
            this.failOutstandingRequests(SWITCHED_WINDOW_REQUEST_MESSAGE);
        }
        this.adoptConnection(connection, target);
        return { value: { selected: this.summarizeWindow(target) }, toolsChanged: true };
    }

    /**
     * Connects to the selected window, or auto-selects when exactly one window matches the
     * working directory. With a selection that is not open nothing is connected.
     */
    private async connectIfNeeded(skipReplay: boolean): Promise<void> {
        if (this.connection || this.stopped) {
            return;
        }
        const instances = this.readInstances();
        let candidates: BridgeInstanceInfo[];
        if (this.selectedWindowId !== undefined) {
            const sameId = instances.filter((instance) => instance.windowId === this.selectedWindowId);
            candidates = sameId.length === 1 ? sameId : [];
        } else {
            const autoSelected = pickInstance(instances, this.options.workingDirectory);
            candidates = autoSelected ? [autoSelected] : [];
        }
        for (const instance of candidates) {
            const connection = await this.establishConnection(instance, skipReplay);
            if (!connection) {
                continue;
            }
            if (this.stopped) {
                connection.socket.destroy();
                return;
            }
            this.adoptConnection(connection, instance);
            this.announceConnectionState(true);
            return;
        }
    }

    private adoptConnection(connection: ServerConnection, instance: BridgeInstanceInfo): void {
        this.log(`connected to VS Code window '${getDisplayName(instance)}' (pid ${instance.pid})`);
        this.connection = connection;
        this.selectedWindowId = instance.windowId;
        this.selectedWindowName = getDisplayName(instance);
        this.selectedWindowFolders = instance.workspaceFolders;
        this.connectedInstance = instance;
    }

    private async establishConnection(instance: BridgeInstanceInfo, skipReplay: boolean): Promise<ServerConnection | undefined> {
        const connection = await this.openConnection(instance);
        if (!connection) {
            return undefined;
        }
        if (this.initializeRequest && !skipReplay && !(await this.replayHandshake(connection))) {
            connection.socket.destroy();
            return undefined;
        }
        connection.ready = true;
        return connection;
    }

    /** Connects and presents the token; resolves only after the server acknowledged it. */
    private openConnection(instance: BridgeInstanceInfo): Promise<ServerConnection | undefined> {
        return new Promise((resolve) => {
            const socket = net.connect(instance.socketPath);
            const connection: ServerConnection = { socket: socket, lines: new LineBuffer(), accepted: false, ready: false };
            const settle = (result: ServerConnection | undefined) => {
                clearTimeout(timer);
                if (!result) {
                    socket.destroy();
                }
                resolve(result);
            };
            const timer = setTimeout(() => settle(undefined), this.options.connectTimeoutMs ?? CONNECT_TIMEOUT_MS);
            socket.on('connect', () => socket.write(instance.token + '\n'));
            socket.on('error', (error) => {
                this.log(`connection error for ${instance.socketPath}: ${error.message}`);
                settle(undefined);
            });
            socket.on('close', () => {
                if (!connection.accepted) {
                    settle(undefined);
                }
                connection.resolveReplay?.(false);
                this.handleConnectionClosed(connection);
            });
            socket.on('data', (chunk: Buffer) => {
                for (const line of connection.lines.push(chunk)) {
                    if (connection.accepted) {
                        this.handleServerLine(connection, line);
                    } else if (isAcknowledgement(line, this.identity.ackProperty)) {
                        connection.accepted = true;
                        settle(connection);
                    } else {
                        settle(undefined);
                        return;
                    }
                }
            });
        });
    }

    /** Re-sends the client's initialize (and initialized notification) so the new server session matches the client's. */
    private async replayHandshake(connection: ServerConnection): Promise<boolean> {
        const accepted = new Promise<boolean>((resolve) => {
            const timer = setTimeout(() => resolve(false), REPLAY_TIMEOUT_MS);
            connection.resolveReplay = (success) => {
                clearTimeout(timer);
                resolve(success);
            };
        });
        connection.socket.write(JSON.stringify({
            jsonrpc: '2.0',
            id: BRIDGE_INITIALIZE_ID,
            method: 'initialize',
            params: this.initializeRequest.params
        }) + '\n');
        if (!(await accepted)) {
            return false;
        }
        if (this.initializedNotificationReceived) {
            connection.socket.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
        }
        return true;
    }

    private handleServerLine(connection: ServerConnection, line: string): void {
        let message: any;
        try {
            message = JSON.parse(line);
        } catch {
            message = undefined;
        }
        if (message?.id === BRIDGE_INITIALIZE_ID && isResponse(message)) {
            connection.resolveReplay?.(!message.error);
            return;
        }
        if (!connection.ready) {
            return;
        }
        if (isResponse(message)) {
            const key = JSON.stringify(message.id);
            this.outstandingRequests.delete(key);
            if (this.pendingToolsListIds.delete(key) && Array.isArray(message.result?.tools)) {
                const bridgeTools = createBridgeTools(true, this.identity.productName);
                const serverTools = message.result.tools.filter((tool: any) => !bridgeTools.some((bridgeTool) => bridgeTool.name === tool?.name));
                this.writeMessage({ ...message, result: { ...message.result, tools: [...serverTools, ...bridgeTools] } });
                return;
            }
        }
        this.writeLine(line);
    }

    private handleConnectionClosed(connection: ServerConnection): void {
        if (!connection.ready || this.connection !== connection) {
            return;
        }
        this.connection = undefined;
        this.failOutstandingRequests(LOST_CONNECTION_REQUEST_MESSAGE);
        this.log(`The connection to window '${this.selectedWindowName}' was lost; waiting for it to return.`);
        this.announceConnectionState(false);
    }

    private failOutstandingRequests(message: string): void {
        for (const id of this.outstandingRequests.values()) {
            this.writeMessage({ jsonrpc: '2.0', id: id, error: { code: LOST_CONNECTION_ERROR_CODE, message: message } });
        }
        this.outstandingRequests.clear();
        this.pendingToolsListIds.clear();
    }

    /** Tells the client its tool list changed; `force` announces even when the connected state is unchanged (a switch between windows). */
    private announceConnectionState(connected: boolean, force = false): void {
        if (connected === this.announcedConnected && !force) {
            return;
        }
        this.announcedConnected = connected;
        if (this.initializedNotificationReceived) {
            this.writeMessage({ jsonrpc: '2.0', method: 'notifications/tools/list_changed' });
        }
    }
}

function isAcknowledgement(line: string, ackProperty: string): boolean {
    try {
        return JSON.parse(line)?.[ackProperty] === 'ok';
    } catch {
        return false;
    }
}

if (require.main === module) {
    new DebugMcpBridge({
        input: process.stdin,
        output: process.stdout,
        debugMcpHome: getDebugMcpHome(),
        identity: readBridgeIdentity(),
        workingDirectory: readWorkspaceArgument(process.argv) ?? process.cwd(),
        onInputEnd: () => process.exit(0)
    }).start();
}

export interface BridgeIdentity {
    serverName: string;
    ackProperty: string;
    productName: string;
}

export interface DebugMcpBridgeOptions {
    input: Readable;
    output: Writable;
    /** Directory that holds the instances directory. */
    debugMcpHome: string;
    workingDirectory: string;
    /** Names used in messages and the acknowledgement check; defaults are neutral. */
    identity?: BridgeIdentity;
    rescanIntervalMs?: number;
    connectTimeoutMs?: number;
    onInputEnd?: () => void;
    log?: (message: string) => void;
}

interface ServerConnection {
    socket: net.Socket;
    lines: LineBuffer;
    /** The server acknowledged the token. */
    accepted: boolean;
    /** Handshake replay (if any) finished; traffic may flow. */
    ready: boolean;
    resolveReplay?: (success: boolean) => void;
}

export interface BridgeInstanceInfo {
    pid: number;
    socketPath: string;
    token: string;
    workspaceFolders: string[];
    appName?: string;
    /** Survives Reload Window; `pid:<pid>` (and unstable) for files that predate it or windows with no folder. */
    windowId: string;
    windowIdStable?: boolean;
    name?: string;
    debugSessionActive?: boolean;
    focusedAt?: string;
    vscodeVersion?: string;
    extensionVersion?: string;
    startedAt: string;
}

export interface BridgeToolDescriptor {
    name: string;
    description: string;
    inputSchema: { type: 'object'; properties: Record<string, unknown> };
}

interface WindowSummary {
    /** 1-based position in the listing; absent when describing a just-selected window. */
    index?: number;
    /** Unique per running window; `select_window` accepts it. */
    instanceKey: string;
    windowId: string;
    appName: string | null;
    windowIdStable: boolean;
    name: string;
    workspaceFolders: string[];
    debugSessionActive: boolean;
    focusedAt: string | null;
    matchesWorkingDirectory: boolean;
    selected: boolean;
}

interface BridgeToolOutcome {
    value?: object;
    error?: string;
    /** The client should re-read the tool list. */
    toolsChanged?: boolean;
}
