import { evaluateExpression, fetchScopes, fetchStackFrames, fetchVariables, formatFrameLocation } from './dapClient';
import type { DebugMcpTool } from './DebugMcpServer';
import { pickRuntimeSession } from './sessionResolution';
import { waitAndDescribe } from './stopReport';
import {
    DEFAULT_WAIT_TIMEOUT_MS, MAX_WAIT_TIMEOUT_MS, SESSION_ID_PROPERTY, THREAD_ID_PROPERTY, createRuntimeProperty, describeDeclaredRuntimes,
    raceAbort, readBoundedNumber, readSessionOutput, readOptionalNumber, readOptionalString, readRuntime, readString, requireStopped, resolveFrameId, resolveGroupForArgs, resolveTarget, resolveThreadId, tryFetchFrames
} from './toolSupport';
import type { DebugMcpToolContext } from './toolSupport';

const EVALUATE_CONTEXTS = ['repl', 'watch', 'hover'];

export function createInspectionTools(context: DebugMcpToolContext): DebugMcpTool[] {
    const runtimeProperty = createRuntimeProperty(context.registry);
    return [
        {
            name: 'get_debug_state',
            description: `Reports, per runtime${describeDeclaredRuntimes(context.registry)}, whether it is running, stopped (with reason, thread and top frame as file:line:function) or not present, and which runtime/frame the user has focused in the VS Code Call Stack. Lines are 1-based. Needs an active debug session.`,
            inputSchema: { type: 'object', properties: { sessionId: SESSION_ID_PROPERTY } },
            handler: async (args) => {
                const group = resolveGroupForArgs(context, args);
                const state: Record<string, unknown> = {};
                for (const runtime of group.runtimes) {
                    state[runtime.id] = await describeRuntimeState(context, runtime.id === group.primaryRuntime ? group.primary : pickRuntimeSession(group, runtime.id, context.stateStore));
                }
                const focused = context.host.getFocusedStackItem();
                const focusedMember = focused ? group.members.find((member) => member.session.id === focused.sessionId) : undefined;
                return {
                    groupId: group.id,
                    runtimes: state,
                    userFocus: focused && focusedMember
                        ? { runtime: focusedMember.runtime ?? null, sessionId: focused.sessionId, threadId: focused.threadId, frameId: focused.frameId }
                        : null
                };
            }
        },
        {
            name: 'wait_for_stop',
            description: 'Waits until a runtime stops (breakpoint, step, pause, exception) and returns the runtime, reason, thread and top stack frames. If a runtime is already stopped it returns at once with alreadyStopped: true. Returns { terminated: true } if the session ends, or { timedOut: true } after timeoutMs. Pauses the debug integration filters out, such as the automatic pause when a debugger attaches, are ignored. Typical workflow: set_breakpoints, start_debugging, wait_for_stop, get_variables.',
            inputSchema: {
                type: 'object',
                properties: {
                    sessionId: SESSION_ID_PROPERTY,
                    runtime: runtimeProperty,
                    timeoutMs: { type: 'number', description: `How long to wait. Default ${DEFAULT_WAIT_TIMEOUT_MS}, maximum ${MAX_WAIT_TIMEOUT_MS}. Some MCP clients time out a tool call sooner than that; if yours does, call this tool repeatedly with a shorter timeoutMs.` }
                }
            },
            handler: async (args, call) => {
                const timeoutMs = readBoundedNumber(args, 'timeoutMs', DEFAULT_WAIT_TIMEOUT_MS, 1, MAX_WAIT_TIMEOUT_MS);
                const runtime = readRuntime(args);
                const target = resolveTarget(context, args);
                const wait = context.stateStore.waitForStop({ groupId: target.group.id, runtime: runtime, timeoutMs: timeoutMs, signal: call?.signal });
                return waitAndDescribe(context, target, wait, timeoutMs, call);
            }
        },
        {
            name: 'get_stack_trace',
            description: 'Returns the call stack of a stopped runtime: frames with id (use as frameId), name, file (local path), line, column. Lines and columns are 1-based. Needs a paused runtime (see wait_for_stop).',
            inputSchema: {
                type: 'object',
                properties: {
                    sessionId: SESSION_ID_PROPERTY,
                    runtime: runtimeProperty,
                    threadId: THREAD_ID_PROPERTY,
                    levels: { type: 'number', description: 'Maximum number of frames. Default 20.' }
                }
            },
            handler: async (args) => {
                const target = resolveTarget(context, args);
                requireStopped(context, target);
                const threadId = await resolveThreadId(context, target, args);
                const frames = await fetchStackFrames(target.session, threadId, readBoundedNumber(args, 'levels', 20, 1, 200));
                return { runtime: target.runtime, sessionId: target.session.id, threadId: threadId, frames: frames };
            }
        },
        {
            name: 'get_variables',
            description: 'Reads variables of a stopped runtime. Without variablesReference it returns the scopes of a frame (default: top frame) and their variables; with variablesReference it expands that value (any variable with a non-zero variablesReference can be drilled into). Values longer than 500 characters are truncated and flagged. Typical workflow: wait_for_stop, then get_variables, then drill in with variablesReference.',
            inputSchema: {
                type: 'object',
                properties: {
                    sessionId: SESSION_ID_PROPERTY,
                    runtime: runtimeProperty,
                    frameId: { type: 'number', description: 'Frame id from get_stack_trace. Defaults to the top frame of the stopped thread.' },
                    threadId: THREAD_ID_PROPERTY,
                    scope: { type: 'string', description: 'Only return scopes whose name contains this text (case-insensitive), e.g. "local". Expensive scopes other than Local are only expanded when named here.' },
                    variablesReference: { type: 'number', description: 'Expand this variablesReference instead of reading scopes.' },
                    maxDepth: { type: 'number', description: 'Levels of nested values to include. Default 1, maximum 3.' },
                    maxItems: { type: 'number', description: 'Maximum variables per list. Default 50.' }
                }
            },
            handler: async (args) => {
                const target = resolveTarget(context, args);
                requireStopped(context, target);
                const options = { maxDepth: readBoundedNumber(args, 'maxDepth', 1, 1, 3), maxItems: readBoundedNumber(args, 'maxItems', 50, 1, 500) };
                const variablesReference = readOptionalNumber(args, 'variablesReference');
                if (variablesReference !== undefined) {
                    const expanded = await fetchVariables(target.session, variablesReference, options);
                    return { runtime: target.runtime, sessionId: target.session.id, variablesReference: variablesReference, ...expanded };
                }
                const frameId = await resolveFrameId(context, target, args);
                const scopeFilter = readOptionalString(args, 'scope')?.toLowerCase();
                const scopes = await fetchScopes(target.session, frameId, {
                    ...options,
                    shouldExpand: (scope, index, allScopes) => (scopeFilter ? scope.name.toLowerCase().includes(scopeFilter) : shouldExpandByDefault(scope, index, allScopes))
                });
                return {
                    runtime: target.runtime,
                    sessionId: target.session.id,
                    frameId: frameId,
                    scopes: scopeFilter ? scopes.filter((scope) => scope.name.toLowerCase().includes(scopeFilter)) : scopes
                };
            }
        },
        {
            name: 'evaluate',
            description: 'Evaluates an expression in the paused runtime and returns result, type and variablesReference (non-zero means it can be expanded with get_variables). Evaluation runs inside the debugged program and can have side effects in any context ("watch" is the default; "hover" is the most conservative, but not every runtime supports it). Needs a paused runtime (see wait_for_stop). The user may be asked to approve the expression.',
            inputSchema: {
                type: 'object',
                properties: {
                    expression: { type: 'string', description: 'The expression to evaluate.' },
                    sessionId: SESSION_ID_PROPERTY,
                    runtime: runtimeProperty,
                    frameId: { type: 'number', description: 'Frame to evaluate in. Defaults to the top frame of the stopped thread.' },
                    threadId: THREAD_ID_PROPERTY,
                    context: { type: 'string', enum: EVALUATE_CONTEXTS, description: 'DAP evaluate context. Default "watch".' }
                },
                required: ['expression']
            },
            handler: async (args, call) => {
                const expression = readString(args, 'expression');
                const evaluateContext = readOptionalString(args, 'context') ?? 'watch';
                if (!EVALUATE_CONTEXTS.includes(evaluateContext)) {
                    throw new Error(`'context' must be one of: ${EVALUATE_CONTEXTS.join(', ')}.`);
                }
                const target = resolveTarget(context, args);
                requireStopped(context, target);
                if (context.host.getSetting('confirmEvaluate') && !await raceAbort(context.host.confirm('An agent wants to evaluate an expression in the debugger', expression), call?.signal)) {
                    throw new Error('The user denied the evaluate request.');
                }
                const frameId = await resolveFrameId(context, target, args);
                const evaluated = await evaluateExpression(target.session, { expression: expression, frameId: frameId, context: evaluateContext });
                return { runtime: target.runtime, sessionId: target.session.id, frameId: frameId, ...evaluated };
            }
        },
        {
            name: 'get_debug_output',
            description: 'Reads recent debug console output (program output and logs the debug adapter reports) captured for a runtime, newest 200 lines by default. Each line has a category such as stdout or stderr. Pass the returned nextCursor as sinceCursor to read only newer lines. Optionally filter lines with a regular expression or by category.',
            inputSchema: {
                type: 'object',
                properties: {
                    sessionId: SESSION_ID_PROPERTY,
                    runtime: runtimeProperty,
                    sinceCursor: { type: 'number', description: 'The nextCursor of a previous call; only later lines are returned.' },
                    maxLines: { type: 'number', description: 'Maximum lines to return. Default 200, maximum 1000.' },
                    filter: { type: 'string', description: 'Regular expression; only matching lines are returned.' },
                    category: { type: 'string', description: 'Only lines of this output category, for example stdout or stderr.' }
                }
            },
            handler: (args) => readSessionOutput(context, args)
        }
    ];
}

/** Cheap scopes expand; of the expensive ones only "Local" (or the first scope when there is none) does. */
function shouldExpandByDefault(scope: { name: string; expensive: boolean }, index: number, allScopes: Array<{ name: string }>): boolean {
    if (!scope.expensive) {
        return true;
    }
    const hasLocal = allScopes.some((candidate) => candidate.name.toLowerCase() === 'local');
    return hasLocal ? scope.name.toLowerCase() === 'local' : index === 0;
}

async function describeRuntimeState(context: DebugMcpToolContext, session: { id: string } | undefined): Promise<Record<string, unknown>> {
    if (!session) {
        return { status: 'not present' };
    }
    const status = context.stateStore.getStatus(session.id);
    if (status === 'untracked') {
        return { status: 'running', sessionId: session.id, note: 'Stop state is unavailable because this session started before the debugger MCP server was enabled.' };
    }
    if (status !== 'stopped') {
        return { status: status, sessionId: session.id };
    }
    const stop = context.stateStore.getStop(session.id);
    const frames = await tryFetchFrames(session as any, stop?.threadId, 1);
    return {
        status: 'stopped',
        sessionId: session.id,
        reason: stop?.reason,
        description: stop?.description,
        threadId: stop?.threadId,
        topFrame: frames.length > 0 ? formatFrameLocation(frames[0]) : null
    };
}
