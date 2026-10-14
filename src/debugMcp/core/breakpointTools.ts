import type { DebugMcpTool } from './DebugMcpServer';
import { summarizeVerification } from './breakpointVerification';
import { resolveWorkspaceFile } from './filePathResolution';
import type { HostBreakpoint, HostBreakpointRequest } from './host';
import { toPathKey } from './pathKey';
import { pollUntil, readOptionalNumber, readOptionalString } from './toolSupport';
import type { DebugMcpToolContext } from './toolSupport';

const VERIFICATION_WAIT_MS = 3000;

export function createBreakpointTools(context: DebugMcpToolContext): DebugMcpTool[] {
    return [
        {
            name: 'list_breakpoints',
            description: 'Lists the source breakpoints set in VS Code with their ids, file, line (1-based), enabled state, condition, and verification status per runtime. Status is "pending" until a debug adapter has answered. Needs only a VS Code window.',
            inputSchema: { type: 'object', properties: {} },
            handler: () => ({ breakpoints: context.host.listBreakpoints().map((breakpoint) => describeBreakpoint(context, breakpoint)) })
        },
        {
            name: 'set_breakpoints',
            description: 'Adds source breakpoints in VS Code (visible to the user). Each entry needs file (absolute, workspace-relative, or a bare file name if unique) and line (1-based); optional column (1-based), condition, hitCondition and logMessage. A breakpoint already at the same file and line is replaced. Works before a session starts; when a session is active the result waits up to 3 seconds for every live runtime that handles the file to verify it, and reports verification per runtime. Typical workflow: set_breakpoints, start_debugging, wait_for_stop.',
            inputSchema: {
                type: 'object',
                properties: {
                    breakpoints: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                file: { type: 'string' },
                                line: { type: 'number', description: '1-based line number.' },
                                column: { type: 'number', description: '1-based column.' },
                                condition: { type: 'string' },
                                hitCondition: { type: 'string' },
                                logMessage: { type: 'string' }
                            },
                            required: ['file', 'line']
                        }
                    }
                },
                required: ['breakpoints']
            },
            handler: async (args) => {
                const requests = dedupeRequests(await parseBreakpointRequests(context, args.breakpoints));
                const replacedIds = context.host.listBreakpoints()
                    .filter((existing) => requests.some((request) => isSameLocation(request, existing)))
                    .map((existing) => existing.id);
                if (replacedIds.length > 0) {
                    context.host.removeBreakpoints(replacedIds);
                }
                const baselineUpdate = context.stateStore.breakpoints.currentUpdate;
                const created = context.host.addBreakpoints(requests);
                if (context.sessions.sessions.length > 0) {
                    await pollUntil(() => created.every((breakpoint) => context.stateStore.breakpoints.isSettled(breakpoint.file, breakpoint.line, baselineUpdate)), VERIFICATION_WAIT_MS);
                }
                return { breakpoints: created.map((breakpoint) => describeBreakpoint(context, breakpoint)) };
            }
        },
        {
            name: 'remove_breakpoints',
            description: 'Removes breakpoints by ids (from list_breakpoints), by { file, line } entries (line is 1-based), or all of them with all: true. Returns what was removed.',
            inputSchema: {
                type: 'object',
                properties: {
                    ids: { type: 'array', items: { type: 'string' } },
                    breakpoints: { type: 'array', items: { type: 'object', properties: { file: { type: 'string' }, line: { type: 'number' } }, required: ['file', 'line'] } },
                    all: { type: 'boolean' }
                }
            },
            handler: async (args) => {
                const existing = context.host.listBreakpoints();
                const idsToRemove = new Set<string>();
                if (args.all === true) {
                    for (const breakpoint of existing) {
                        idsToRemove.add(breakpoint.id);
                    }
                }
                if (Array.isArray(args.ids)) {
                    for (const id of args.ids) {
                        if (typeof id === 'string') {
                            idsToRemove.add(id);
                        }
                    }
                }
                if (Array.isArray(args.breakpoints)) {
                    for (const entry of args.breakpoints) {
                        const file = await resolveWorkspaceFile(readOptionalString(entry, 'file') ?? '', createResolutionOptions(context));
                        const line = readOptionalNumber(entry, 'line');
                        for (const breakpoint of existing.filter((candidate) => isSameLocation(candidate, { file: file, line: line }))) {
                            idsToRemove.add(breakpoint.id);
                        }
                    }
                }
                if (idsToRemove.size === 0 && args.all !== true && !Array.isArray(args.ids) && !Array.isArray(args.breakpoints)) {
                    throw new Error('Pass ids, breakpoints, or all: true.');
                }
                const removed = existing.filter((breakpoint) => idsToRemove.has(breakpoint.id));
                context.host.removeBreakpoints(removed.map((breakpoint) => breakpoint.id));
                return { removed: removed.map((breakpoint) => ({ id: breakpoint.id, file: breakpoint.file, line: breakpoint.line })) };
            }
        }
    ];
}

async function parseBreakpointRequests(context: DebugMcpToolContext, value: unknown): Promise<HostBreakpointRequest[]> {
    if (!Array.isArray(value) || value.length === 0) {
        throw new Error(`'breakpoints' must be a non-empty array of { file, line }.`);
    }
    const requests: HostBreakpointRequest[] = [];
    for (const entry of value) {
        const file = readOptionalString(entry ?? {}, 'file');
        const line = readOptionalNumber(entry ?? {}, 'line');
        if (!file || line === undefined || line < 1 || !Number.isInteger(line)) {
            throw new Error(`Each breakpoint needs a file and a 1-based integer line.`);
        }
        requests.push({
            file: await resolveWorkspaceFile(file, createResolutionOptions(context)),
            line: line,
            column: readOptionalNumber(entry, 'column'),
            condition: readOptionalString(entry, 'condition'),
            hitCondition: readOptionalString(entry, 'hitCondition'),
            logMessage: readOptionalString(entry, 'logMessage')
        });
    }
    return requests;
}

function isSameLocation(left: { file: string; line: number }, right: { file: string; line: number }): boolean {
    return left.line === right.line && toPathKey(left.file) === toPathKey(right.file);
}

/** Drops repeated entries for one location (and column), keeping the first. */
function dedupeRequests(requests: HostBreakpointRequest[]): HostBreakpointRequest[] {
    const seen = new Set<string>();
    return requests.filter((request) => {
        const key = `${toPathKey(request.file)}:${request.line}:${request.column ?? ''}`;
        if (seen.has(key)) {
            return false;
        }
        seen.add(key);
        return true;
    });
}

function createResolutionOptions(context: DebugMcpToolContext) {
    return {
        workspaceFolders: context.host.getWorkspaceFolders(),
        fileExists: (filePath: string) => context.host.fileExists(filePath),
        findBySuffix: (relativePath: string) => context.host.findFilesBySuffix(relativePath)
    };
}

function describeBreakpoint(context: DebugMcpToolContext, breakpoint: HostBreakpoint) {
    const verification = context.stateStore.breakpoints.lookup(breakpoint.file, breakpoint.line);
    return {
        id: breakpoint.id,
        file: breakpoint.file,
        line: breakpoint.line,
        column: breakpoint.column,
        enabled: breakpoint.enabled,
        condition: breakpoint.condition,
        hitCondition: breakpoint.hitCondition,
        logMessage: breakpoint.logMessage,
        status: breakpoint.enabled ? summarizeVerification(verification) : 'disabled',
        verification: verification
    };
}
