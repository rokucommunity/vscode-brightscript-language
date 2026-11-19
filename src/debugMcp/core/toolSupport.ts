import type * as vscode from 'vscode';
import { fetchStackFrames, fetchThreads } from './dapClient';
import type { StackFrameInfo } from './dapClient';
import type { DebugStateStore } from './debugStateStore';
import { compileOutputFilter } from './outputBuffer';
import type { ToolCallContext } from './DebugMcpServer';
import type { DebugMcpHost } from './host';
import type { DebugMcpRegistry } from './integration';
import type { DebugSessionGroup, SessionDirectoryView } from './sessionDirectory';
import { getGroupSessions, resolveGroup, resolveRuntimeTarget } from './sessionResolution';

export const DEFAULT_WAIT_TIMEOUT_MS = 30000;
export const MAX_WAIT_TIMEOUT_MS = 300000;

/** The group a call targets: the one containing `sessionId`, else the active group. */
export function resolveGroupForArgs(context: DebugMcpToolContext, args: Record<string, unknown>): DebugSessionGroup {
    return resolveGroup(context.sessions.groups, context.sessions.activeGroup, readOptionalString(args, 'sessionId'));
}

/** Resolves group, runtime and session; see `resolveRuntimeTarget` for how an omitted runtime is chosen. */
export function resolveTarget(context: DebugMcpToolContext, args: Record<string, unknown>, options: { preferStopped?: boolean } = {}): ResolvedTarget {
    const group = resolveGroupForArgs(context, args);
    const target = resolveRuntimeTarget(group, context.stateStore, {
        runtime: readRuntime(args),
        sessionId: readOptionalString(args, 'sessionId'),
        preferStopped: options.preferStopped
    });
    return { group: group, runtime: target.runtime, session: target.session };
}

/** Throws unless the target is stopped; stop tracking that is unavailable is not an error. */
export function requireStopped(context: DebugMcpToolContext, target: ResolvedTarget): void {
    const status = context.stateStore.getStatus(target.session.id);
    if (status === 'running') {
        throw new Error(`The ${target.runtime} runtime is running, not stopped. Use wait_for_stop or pause.`);
    }
    if (status === 'terminated') {
        throw new Error(`The ${target.runtime} debug session has ended.`);
    }
}

/** The thread to act on: the explicit one, else the stopped thread, else the first thread. */
export async function resolveThreadId(context: DebugMcpToolContext, target: ResolvedTarget, args: Record<string, unknown>): Promise<number> {
    const explicit = readOptionalNumber(args, 'threadId');
    if (explicit !== undefined) {
        return explicit;
    }
    const known = context.stateStore.getLastThreadId(target.session.id);
    if (known !== undefined) {
        return known;
    }
    const threads = await fetchThreads(target.session);
    if (threads.length === 0) {
        throw new Error(`The ${target.runtime} runtime reported no threads.`);
    }
    return threads[0].id;
}

/** The explicit frame, else the top frame of the target's stopped thread. */
export async function resolveFrameId(context: DebugMcpToolContext, target: ResolvedTarget, args: Record<string, unknown>): Promise<number> {
    const explicit = readOptionalNumber(args, 'frameId');
    if (explicit !== undefined) {
        return explicit;
    }
    const threadId = await resolveThreadId(context, target, args);
    const frames = await fetchStackFrames(target.session, threadId, 1);
    if (frames.length === 0) {
        throw new Error(`The ${target.runtime} thread ${threadId} has no stack frames.`);
    }
    return frames[0].id;
}

export async function tryFetchFrames(session: vscode.DebugSession, threadId: number | undefined, levels: number): Promise<StackFrameInfo[]> {
    if (threadId === undefined) {
        return [];
    }
    try {
        return await fetchStackFrames(session, threadId, levels);
    } catch {
        return [];
    }
}

export function findSessionById(group: DebugSessionGroup, sessionId: string): vscode.DebugSession | undefined {
    return getGroupSessions(group).find((session) => session.id === sessionId);
}

export function describeSession(session: vscode.DebugSession) {
    return { id: session.id, name: session.name };
}

export function describeGroup(group: DebugSessionGroup) {
    return {
        id: group.id,
        primary: describeSession(group.primary),
        sessions: group.members.map((member) => ({ ...describeSession(member.session), runtime: member.runtime ?? null }))
    };
}

export const CANCELLED_MESSAGE = 'The request was cancelled.';
const PROGRESS_INTERVAL_MS = 5000;

/** Polls `condition` until it holds, `timeoutMs` passes or `signal` aborts; returns whether it held. */
export async function pollUntil(condition: () => boolean, timeoutMs: number, intervalMs = 100, signal?: AbortSignal): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (!condition()) {
        if (Date.now() >= deadline || signal?.aborted) {
            return false;
        }
        await new Promise((resolve) => {
            setTimeout(resolve, intervalMs);
        });
    }
    return true;
}

/** Rejects with a cancellation error when `signal` aborts first. */
export function raceAbort<T>(promise: Promise<T>, signal: AbortSignal | undefined): Promise<T> {
    if (!signal) {
        return promise;
    }
    return new Promise<T>((resolve, reject) => {
        if (signal.aborted) {
            reject(new Error(CANCELLED_MESSAGE));
            return;
        }
        signal.addEventListener('abort', () => reject(new Error(CANCELLED_MESSAGE)), { once: true });
        promise.then(resolve, reject);
    });
}

/** Runs `action`, sending a progress notification every few seconds while it is pending. */
export async function withProgress<T>(call: ToolCallContext | undefined, describe: () => string, action: () => Promise<T>): Promise<T> {
    if (!call?.reportProgress) {
        return action();
    }
    const timer = setInterval(() => call.reportProgress(describe()), PROGRESS_INTERVAL_MS);
    try {
        return await action();
    } finally {
        clearInterval(timer);
    }
}

/**
 * Reads captured output for the session an `args` object targets, with the `sinceCursor`,
 * `maxLines`, `filter` and `category` arguments of the output tools. `runtime` and
 * `categories` preset what the caller fixes itself.
 */
export function readSessionOutput(context: DebugMcpToolContext, args: Record<string, unknown>, preset: { runtime?: string; categories?: string[] } = {}) {
    const requestedSessionId = readOptionalString(args, 'sessionId');
    const runtime = preset.runtime ?? readRuntime(args);
    //a session that already ended is no longer in a group but still has captured output
    const matchesRuntime = preset.runtime ? context.stateStore.getRuntime(requestedSessionId) === preset.runtime : !runtime;
    const isTrackedRequest = !!requestedSessionId && context.stateStore.hasSession(requestedSessionId) && matchesRuntime;
    const outputSessionId = isTrackedRequest
        ? requestedSessionId
        : resolveTarget(context, { ...args, runtime: runtime }, { preferStopped: false }).session.id;
    const category = readOptionalString(args, 'category');
    const result = context.stateStore.readOutput(outputSessionId, {
        sinceCursor: readOptionalNumber(args, 'sinceCursor'),
        maxLines: readBoundedNumber(args, 'maxLines', 200, 1, 1000),
        filter: compileOutputFilter(readOptionalString(args, 'filter')),
        categories: preset.categories ?? (category ? [category] : undefined)
    });
    if (!result) {
        throw new Error('Output capture is not available for this session because it started before the debugger MCP server was enabled. Restart the debug session.');
    }
    return { sessionId: outputSessionId, ...result };
}

export function readString(args: Record<string, unknown>, key: string): string {
    const value = args[key];
    if (typeof value !== 'string' || value.length === 0) {
        throw new Error(`'${key}' is required and must be a non-empty string.`);
    }
    return value;
}

export function readOptionalString(args: Record<string, unknown>, key: string): string | undefined {
    const value = args[key];
    if (value === undefined || value === null || value === '') {
        return undefined;
    }
    if (typeof value !== 'string') {
        throw new Error(`'${key}' must be a string.`);
    }
    return value;
}

export function readStringList(args: Record<string, unknown>, key: string): string[] {
    const value = args[key];
    if (value === undefined || value === null) {
        return [];
    }
    if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string')) {
        throw new Error(`'${key}' must be an array of strings.`);
    }
    return value;
}

export function readOptionalNumber(args: Record<string, unknown>, key: string): number | undefined {
    const value = args[key];
    if (value === undefined || value === null) {
        return undefined;
    }
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new Error(`'${key}' must be a number.`);
    }
    return value;
}

/** A number clamped to `[minimum, maximum]`, or `fallback` when absent. */
export function readBoundedNumber(args: Record<string, unknown>, key: string, fallback: number, minimum: number, maximum: number): number {
    const value = readOptionalNumber(args, key);
    return value === undefined ? fallback : Math.min(Math.max(Math.floor(value), minimum), maximum);
}

export function readOptionalBoolean(args: Record<string, unknown>, key: string): boolean | undefined {
    const value = args[key];
    if (value === undefined || value === null) {
        return undefined;
    }
    if (typeof value !== 'boolean') {
        throw new Error(`'${key}' must be a boolean.`);
    }
    return value;
}

export function readRuntime(args: Record<string, unknown>): string | undefined {
    return readOptionalString(args, 'runtime');
}

/** Input schema fragments shared by the session-targeting tools. */
export const SESSION_ID_PROPERTY = {
    type: 'string',
    description: 'Id of any session in the target debug group (see list_debug_sessions). Defaults to the active group.'
};

/** The `runtime` argument, described from the runtimes the registered integrations declare. */
export function createRuntimeProperty(registry: DebugMcpRegistry) {
    const runtimes = registry.getDeclaredRuntimes();
    if (runtimes.length === 0) {
        return {
            type: 'string',
            description: 'Runtime of the group to target; see list_debug_sessions. When omitted, the group\'s primary runtime is used.'
        };
    }
    return {
        type: 'string',
        enum: runtimes.map((runtime) => runtime.id),
        description: `${runtimes.map((runtime) => `"${runtime.id}" is ${runtime.description}`).join('; ')}. When omitted, the runtime that is currently stopped is used (if exactly one is), otherwise "${runtimes[0].id}".`
    };
}

/** Names the declared runtimes for a sentence, e.g. ` ("brs" and "js")`, or nothing when there are none. */
export function describeDeclaredRuntimes(registry: DebugMcpRegistry): string {
    const ids = registry.getDeclaredRuntimes().map((runtime) => `"${runtime.id}"`);
    return ids.length === 0 ? '' : ` (${ids.join(' and ')})`;
}

export const THREAD_ID_PROPERTY = {
    type: 'number',
    description: 'Thread id. Defaults to the thread that stopped most recently.'
};

/** What tools, whether core or from a tool provider, can use to act on the debug sessions. */
export interface DebugMcpToolContext {
    sessions: SessionDirectoryView;
    registry: DebugMcpRegistry;
    stateStore: DebugStateStore;
    host: DebugMcpHost;
    extensionVersion: string;
    getWorkspaceFolders: () => string[];
    getWindowName?: () => string | undefined;
}

export interface ResolvedTarget {
    group: DebugSessionGroup;
    runtime: string;
    session: vscode.DebugSession;
}
