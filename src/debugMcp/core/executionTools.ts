import type { DebugMcpTool } from './DebugMcpServer';
import { DAP_REQUEST_TIMEOUT_MS, fetchThreads, sendDapRequest, withTimeout } from './dapClient';
import { chooseExecutionPath, toThreadCommandTarget, UI_COMMAND_FALLBACK_NOTE, UI_COMMAND_REQUEST_WAIT_MS, UI_COMMANDS, UI_NOTE } from './executionRouting';
import type { ExecutionCommand } from './executionRouting';
import type { ToolCallContext } from './DebugMcpServer';
import { waitAndDescribe } from './stopReport';
import {
    DEFAULT_WAIT_TIMEOUT_MS, MAX_WAIT_TIMEOUT_MS, SESSION_ID_PROPERTY, THREAD_ID_PROPERTY, createRuntimeProperty,
    pollUntil, raceAbort, readBoundedNumber, readOptionalBoolean, readOptionalNumber, requireStopped, resolveTarget, resolveThreadId
} from './toolSupport';
import type { DebugMcpToolContext, ResolvedTarget } from './toolSupport';

export function createExecutionTools(context: DebugMcpToolContext): DebugMcpTool[] {
    const runtimeProperty = createRuntimeProperty(context.registry);
    const definitions: ExecutionDefinition[] = [
        {
            name: 'continue',
            description: 'Resumes a stopped runtime. With waitForStop: true it waits for the next stop in any runtime of the group (breakpoint, exception) and returns it like wait_for_stop; by default it returns immediately.',
            command: 'continue',
            defaultWaitForStop: false,
            watchBothRuntimes: true
        },
        {
            name: 'step_over',
            description: 'Steps over the current line of a stopped runtime, then (by default) waits and returns the new location with its top stack frames. Set waitForStop: false to return immediately.',
            command: 'next',
            defaultWaitForStop: true,
            watchBothRuntimes: false
        },
        {
            name: 'step_into',
            description: 'Steps into the call on the current line of a stopped runtime, then (by default) waits and returns the new location with its top stack frames. Set waitForStop: false to return immediately.',
            command: 'stepIn',
            defaultWaitForStop: true,
            watchBothRuntimes: false
        },
        {
            name: 'step_out',
            description: 'Runs until the current function returns, then (by default) waits and returns the new location with its top stack frames. Set waitForStop: false to return immediately.',
            command: 'stepOut',
            defaultWaitForStop: true,
            watchBothRuntimes: false
        },
        {
            name: 'pause',
            description: 'Pauses a running runtime. With waitForStop: true it waits for the pause and returns the location like wait_for_stop; by default it returns immediately (follow with wait_for_stop). Without a runtime it pauses the primary runtime of the group.',
            command: 'pause',
            defaultWaitForStop: false,
            watchBothRuntimes: false
        }
    ];
    return definitions.map((definition): DebugMcpTool => ({
        name: definition.name,
        description: definition.description,
        inputSchema: {
            type: 'object',
            properties: {
                sessionId: SESSION_ID_PROPERTY,
                runtime: runtimeProperty,
                threadId: THREAD_ID_PROPERTY,
                waitForStop: { type: 'boolean', description: `Wait for the resulting stop and return it. Default ${definition.defaultWaitForStop}.` },
                timeoutMs: { type: 'number', description: `Wait limit when waiting. Default ${DEFAULT_WAIT_TIMEOUT_MS}, maximum ${MAX_WAIT_TIMEOUT_MS}.` }
            }
        },
        handler: (args, call) => runExecutionCommand(context, args, definition, call)
    }));
}

async function runExecutionCommand(context: DebugMcpToolContext, args: Record<string, unknown>, definition: ExecutionDefinition, call: ToolCallContext | undefined): Promise<Record<string, unknown>> {
    const isPause = definition.command === 'pause';
    const target = resolveTarget(context, args, { preferStopped: !isPause });
    if (isPause) {
        if (context.stateStore.getStatus(target.session.id) === 'stopped') {
            throw new Error(`The ${target.runtime} runtime is already stopped.`);
        }
    } else {
        requireStopped(context, target);
    }
    const threadId = isPause ? await resolvePauseThreadId(target.session, args) : await resolveThreadId(context, target, args);

    const timeoutMs = readBoundedNumber(args, 'timeoutMs', DEFAULT_WAIT_TIMEOUT_MS, 1, MAX_WAIT_TIMEOUT_MS);
    const shouldWait = readOptionalBoolean(args, 'waitForStop') ?? definition.defaultWaitForStop;
    //the wait is registered before the request so a fast stop cannot be missed
    const wait = shouldWait
        ? context.stateStore.waitForStop({
            groupId: target.group.id,
            runtime: definition.watchBothRuntimes ? undefined : target.runtime,
            timeoutMs: timeoutMs,
            onlyNewStops: true,
            signal: call?.signal
        })
        : undefined;
    let route = chooseExecutionPath({ sessionId: target.session.id, threadId: threadId, focused: context.host.getFocusedStackItem() });
    let uiNote: string | undefined;
    try {
        if (route === 'ui-command') {
            const requestsBefore = context.stateStore.getRequestCount(target.session.id, definition.command);
            const command = UI_COMMANDS[definition.command];
            await raceAbort(withTimeout(context.host.executeCommand(command, toThreadCommandTarget(target.session.id, threadId)), `VS Code did not complete '${command}' within ${DAP_REQUEST_TIMEOUT_MS / 1000}s`), call?.signal);
            const sent = await pollUntil(() => context.stateStore.getRequestCount(target.session.id, definition.command) > requestsBefore, UI_COMMAND_REQUEST_WAIT_MS, 50, call?.signal);
            if (!sent) {
                route = 'request';
                uiNote = isPause ? undefined : UI_COMMAND_FALLBACK_NOTE;
            }
        } else if (!isPause) {
            uiNote = UI_NOTE;
        }
        if (route === 'request') {
            await sendDapRequest(target.session, definition.command, { threadId: threadId });
        }
    } catch (error) {
        wait?.cancel();
        throw error;
    }
    if (!wait) {
        return { ok: true, command: definition.command, runtime: target.runtime, sessionId: target.session.id, threadId: threadId, uiNote: uiNote };
    }
    return { ...await waitAndDescribe(context, target, wait, timeoutMs, call), uiNote: uiNote };
}

async function resolvePauseThreadId(session: ResolvedTarget['session'], args: Record<string, unknown>): Promise<number> {
    const explicit = readOptionalNumber(args, 'threadId');
    if (explicit !== undefined) {
        return explicit;
    }
    return (await fetchThreads(session))[0]?.id ?? 0;
}

interface ExecutionDefinition {
    name: string;
    description: string;
    command: ExecutionCommand;
    defaultWaitForStop: boolean;
    watchBothRuntimes: boolean;
}
