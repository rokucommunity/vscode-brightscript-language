import * as vscode from 'vscode';
import { isLogOutputEvent } from 'roku-debug';
import type { DebugMcpTool } from '../core/DebugMcpServer';
import { OutputBuffer, compileOutputFilter } from '../core/outputBuffer';
import type { OutputReadResult } from '../core/outputBuffer';
import { SESSION_ID_PROPERTY, readBoundedNumber, readOptionalNumber, readOptionalString } from '../core/toolSupport';
import type { DebugMcpToolContext } from '../core/toolSupport';
import { resolveBrightScriptTarget } from './deviceTarget';

export const DEVICE_LOG_CAPACITY = 20000;
const MAX_REMEMBERED_SESSIONS = 20;
const DEVICE_LOG_CATEGORY = 'device';

/**
 * The device's BrightScript console, per debug session, from the `LogOutputEvent` custom event
 * the Roku debug adapter sends for every device line (and for nothing else).
 */
export class DeviceLogStore {
    constructor(
        private readonly capacity = DEVICE_LOG_CAPACITY
    ) { }

    private buffers = new Map<string, OutputBuffer>();

    /** Feeds a custom event of a debug session; events other than device log lines are ignored. */
    public handleCustomEvent(sessionId: string, event: { event: string; body?: { line?: unknown } }): void {
        if (!isLogOutputEvent(event) || typeof event.body?.line !== 'string') {
            return;
        }
        this.getOrCreateBuffer(sessionId).append(DEVICE_LOG_CATEGORY, event.body.line);
    }

    public has(sessionId: string): boolean {
        return this.buffers.has(sessionId);
    }

    public read(sessionId: string, options: { sinceCursor?: number; maxLines: number; filter?: RegExp }): OutputReadResult {
        return (this.buffers.get(sessionId) ?? new OutputBuffer(1)).read(options);
    }

    private getOrCreateBuffer(sessionId: string): OutputBuffer {
        let buffer = this.buffers.get(sessionId);
        if (!buffer) {
            buffer = new OutputBuffer(this.capacity);
            this.buffers.set(sessionId, buffer);
            for (const oldestId of [...this.buffers.keys()].slice(0, Math.max(0, this.buffers.size - MAX_REMEMBERED_SESSIONS))) {
                this.buffers.delete(oldestId);
            }
        }
        return buffer;
    }
}

/** Starts feeding `store` from the debug sessions' custom events. */
export function captureDeviceLogs(store: DeviceLogStore): vscode.Disposable {
    return vscode.debug.onDidReceiveDebugSessionCustomEvent((event) => store.handleCustomEvent(event.session.id, event));
}

export function createDeviceLogsTool(context: DebugMcpToolContext, store: DeviceLogStore): DebugMcpTool {
    return {
        name: 'get_device_logs',
        description: 'Reads the Roku device\'s BrightScript console log (print statements, runtime errors and backtraces, system messages) captured for a BrightScript debug session, newest 200 lines by default, up to the last 20000. Pass the returned nextCursor as sinceCursor to read only newer lines. Optionally filter lines with a regular expression. Works after the session ended when sessionId names it. Logging starts when the debugger tools are enabled; get_debug_output holds the debug adapter\'s own messages.',
        inputSchema: {
            type: 'object',
            properties: {
                sessionId: SESSION_ID_PROPERTY,
                sinceCursor: { type: 'number', description: 'The nextCursor of a previous call; only later lines are returned.' },
                maxLines: { type: 'number', description: 'Maximum lines to return. Default 200, maximum 1000.' },
                filter: { type: 'string', description: 'Regular expression; only matching lines are returned.' }
            }
        },
        handler: (args) => {
            //a session that already ended is no longer in a group but its log is kept
            const requestedSessionId = readOptionalString(args, 'sessionId');
            const sessionId = requestedSessionId && store.has(requestedSessionId)
                ? requestedSessionId
                : resolveBrightScriptTarget(context, args).session.id;
            const result = store.read(sessionId, {
                sinceCursor: readOptionalNumber(args, 'sinceCursor'),
                maxLines: readBoundedNumber(args, 'maxLines', 200, 1, 1000),
                filter: compileOutputFilter(readOptionalString(args, 'filter'))
            });
            return { sessionId: sessionId, ...result };
        }
    };
}
