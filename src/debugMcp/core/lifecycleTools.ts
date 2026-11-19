import type { DebugSessionGroup } from './sessionDirectory';
import type { DebugMcpTool, ToolCallContext } from './DebugMcpServer';
import { listLaunchConfigs, resolveStartTarget } from './launchConfigs';
import { CANCELLED_MESSAGE, describeGroup, pollUntil, raceAbort, withProgress, readBoundedNumber, readOptionalString, readString, readStringList, resolveGroupForArgs, SESSION_ID_PROPERTY } from './toolSupport';
import type { DebugMcpToolContext } from './toolSupport';

const DEFAULT_START_TIMEOUT_MS = 60000;
const PROMPT_HINT_AFTER_MS = 10000;
const POLL_INTERVAL_MS = 200;
const STOP_TIMEOUT_MS = 15000;
const WAIT_FOR_RUNTIMES_PROPERTY = {
    type: 'array',
    items: { type: 'string' },
    description: 'Runtime ids (see the runtime argument of other tools) that attach to the primary session after launch and should be awaited too. Default none.'
};

export function createLifecycleTools(context: DebugMcpToolContext): DebugMcpTool[] {
    const overrideTypes = context.registry.getLaunchOverrides();
    return [
        {
            name: 'list_launch_configs',
            description: 'Lists the launch configurations and compounds from launch.json in every workspace folder: name, kind, type, request, folder, plus the fields the debugger integration reports (for example the target address) when set. Pass a name to start_debugging. Configurations supplied dynamically by an extension are not listed. Needs only a VS Code window.',
            inputSchema: { type: 'object', properties: {} },
            handler: () => ({ launchConfigs: listLaunchConfigs(context.host.getLaunchSources(), context.registry.getLaunchConfigFields()) })
        },
        {
            name: 'start_debugging',
            description: 'Starts a launch configuration or compound by name (see list_launch_configs) and waits until its debug session is running. Optional overrides may only set the keys listed for overrides. The user may be asked to approve the launch, and a prompt may appear in VS Code. Returns the debug group; runtimes that attach to the primary session after launch are only included when named in waitForRuntimes. Typical workflow: set_breakpoints, start_debugging, wait_for_stop.',
            inputSchema: {
                type: 'object',
                properties: {
                    name: { type: 'string', description: 'Launch configuration or compound name.' },
                    folder: { type: 'string', description: 'Workspace folder name, needed only when several folders define the same name.' },
                    overrides: {
                        type: 'object',
                        description: `Shallow overrides of the named configuration. Allowed keys: ${Object.entries(overrideTypes).map(([key, type]) => `${key} (${type})`).join(', ') || 'none'}.`,
                        properties: Object.fromEntries(Object.entries(overrideTypes).map(([key, type]) => [key, { type: type }]))
                    },
                    waitForRuntimes: WAIT_FOR_RUNTIMES_PROPERTY,
                    timeoutMs: { type: 'number', description: `How long to wait for the session. Default ${DEFAULT_START_TIMEOUT_MS}.` }
                },
                required: ['name']
            },
            handler: async (args, call) => {
                const name = readString(args, 'name');
                const target = resolveStartTarget(context.host.getLaunchSources(), {
                    name: name,
                    folder: readOptionalString(args, 'folder'),
                    overrides: args.overrides as Record<string, unknown> | undefined
                }, overrideTypes);
                return startAndWait(context, {
                    displayName: name,
                    folderPath: target.folderPath,
                    nameOrConfiguration: target.configuration ?? target.name,
                    timeoutMs: readBoundedNumber(args, 'timeoutMs', DEFAULT_START_TIMEOUT_MS, 1000, 600000),
                    waitForRuntimes: readStringList(args, 'waitForRuntimes')
                }, call);
            }
        },
        {
            name: 'stop_debugging',
            description: 'Stops the debug session group (its primary session and the sessions attached to it). Needs an active debug session.',
            inputSchema: { type: 'object', properties: { sessionId: SESSION_ID_PROPERTY } },
            handler: async (args) => {
                const group = resolveGroupForArgs(context, args);
                await stopGroup(context, group);
                return { stopped: true, sessionId: group.id };
            }
        },
        {
            name: 'restart_debugging',
            description: 'Stops the debug session group and starts the same configuration again, then waits like start_debugging. Needs an active debug session.',
            inputSchema: {
                type: 'object',
                properties: {
                    sessionId: SESSION_ID_PROPERTY,
                    waitForRuntimes: WAIT_FOR_RUNTIMES_PROPERTY,
                    timeoutMs: { type: 'number', description: `How long to wait for the new session. Default ${DEFAULT_START_TIMEOUT_MS}.` }
                }
            },
            handler: async (args, call) => {
                const group = resolveGroupForArgs(context, args);
                const configuration = { ...group.primary.configuration } as Record<string, unknown>;
                const folderPath = group.primary.workspaceFolder?.uri.fsPath;
                await stopGroup(context, group);
                return startAndWait(context, {
                    displayName: group.primary.name,
                    folderPath: folderPath,
                    nameOrConfiguration: configuration,
                    timeoutMs: readBoundedNumber(args, 'timeoutMs', DEFAULT_START_TIMEOUT_MS, 1000, 600000),
                    waitForRuntimes: readStringList(args, 'waitForRuntimes')
                }, call);
            }
        }
    ];
}

async function stopGroup(context: DebugMcpToolContext, group: DebugSessionGroup): Promise<void> {
    await context.host.stopDebugging(group.primary);
    const gone = await pollUntil(() => !context.sessions.groups.some((candidate) => candidate.id === group.id), STOP_TIMEOUT_MS, POLL_INTERVAL_MS);
    if (!gone) {
        throw new Error(`The debug session did not stop within ${STOP_TIMEOUT_MS / 1000} seconds.`);
    }
}

async function startAndWait(context: DebugMcpToolContext, options: StartOptions, call: ToolCallContext | undefined): Promise<Record<string, unknown>> {
    if (context.host.getSetting('confirmLaunch') && !await raceAbort(context.host.confirm(`An agent wants to start debugging '${options.displayName}'`), call?.signal)) {
        throw new Error('The user denied the request to start debugging.');
    }
    const knownGroupIds = new Set(context.sessions.groups.map((group) => group.id));
    const findNewGroup = () => context.sessions.groups.find((group) => !knownGroupIds.has(group.id));

    let startResolved = false;
    let startResult: boolean | undefined;
    let startError: Error | undefined;
    context.host.startDebugging(options.folderPath, options.nameOrConfiguration).then(
        (started) => {
            startResolved = true;
            startResult = started;
        },
        (error) => {
            startResolved = true;
            startError = error as Error;
        }
    );

    const startedAt = Date.now();
    await withProgress(call, () => `Still waiting for '${options.displayName}' to start`, () => pollUntil(() => !!findNewGroup() || (startResolved && (startError !== undefined || startResult === false)), options.timeoutMs, POLL_INTERVAL_MS, call?.signal));
    if (call?.signal?.aborted) {
        throw new Error(CANCELLED_MESSAGE);
    }
    const group = findNewGroup();
    if (!group) {
        if (startError) {
            throw new Error(`VS Code could not start '${options.displayName}': ${startError.message}`);
        }
        if (startResolved && startResult === false) {
            throw new Error(`VS Code could not start '${options.displayName}' (the launch was cancelled or failed; check the Debug Console and the extension's output in VS Code).`);
        }
        const promptHint = !startResolved && Date.now() - startedAt >= PROMPT_HINT_AFTER_MS
            ? ' A prompt (for example the device or password picker) may be waiting for an answer in VS Code.'
            : '';
        throw new Error(`Timed out after ${options.timeoutMs / 1000} seconds waiting for '${options.displayName}' to start.${promptHint}`);
    }

    const findCurrentGroup = () => context.sessions.groups.find((candidate) => candidate.id === group.id);
    const hasJoined = (runtime: string) => (findCurrentGroup() ?? group).members.some((member) => member.runtime === runtime);
    const pendingRuntimes = options.waitForRuntimes.filter((runtime) => !hasJoined(runtime));
    if (pendingRuntimes.length > 0) {
        const remainingMs = Math.max(0, options.timeoutMs - (Date.now() - startedAt));
        await pollUntil(() => pendingRuntimes.every((runtime) => hasJoined(runtime)), remainingMs, POLL_INTERVAL_MS, call?.signal);
    }
    const missingRuntimes = options.waitForRuntimes.filter((runtime) => !hasJoined(runtime));
    return {
        started: true,
        group: describeGroup(findCurrentGroup() ?? group),
        note: missingRuntimes.length > 0 ? `The ${missingRuntimes.join(', ')} runtime did not join in time; it may not exist for this app, or it may join later (see get_debug_state).` : undefined
    };
}

interface StartOptions {
    displayName: string;
    folderPath: string | undefined;
    nameOrConfiguration: string | Record<string, unknown>;
    timeoutMs: number;
    waitForRuntimes: string[];
}
