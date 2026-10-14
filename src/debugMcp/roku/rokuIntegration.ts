import { DEBUG_MCP_API_VERSION } from '../core/integration';
import type { DebugIntegration, DebugSessionInfo, SessionClassification, StopReportContext, StopReportDecision } from '../core/integration';

export const BRIGHTSCRIPT_RUNTIME = 'brs';
export const JAVASCRIPT_RUNTIME = 'js';

const BRIGHTSCRIPT_FILE_PATTERN = /\.(brs|bs|xml)$/i;

/**
 * Roku debugging: a `brightscript` session owns the group, and a TypeScript SDK app adds a node
 * session (the extension's JS attach, marked `_isBrightscriptJsSession`) whose pwa-node
 * descendants are the Hermes runtime.
 */
export function createRokuDebugIntegration(): DebugIntegration {
    return {
        apiVersion: DEBUG_MCP_API_VERSION,
        id: 'roku',
        debugTypes: ['brightscript', 'node', 'pwa-node'],
        runtimes: [
            { id: BRIGHTSCRIPT_RUNTIME, description: 'the BrightScript runtime' },
            { id: JAVASCRIPT_RUNTIME, description: 'the Hermes JavaScript runtime of a TypeScript SDK app' }
        ],
        classifySession: classifyRokuSession,
        shouldReportStop: shouldReportRokuStop,
        ownsFile: (filePath) => (BRIGHTSCRIPT_FILE_PATTERN.test(filePath) ? BRIGHTSCRIPT_RUNTIME : undefined),
        launchOverrides: { host: 'string', stopOnEntry: 'boolean' },
        launchConfigFields: ['host', 'rootDir', 'stopOnEntry']
    };
}

/** A `brightscript` session is the BrightScript runtime; a node session whose parent chain reaches the JS attach session is the JS runtime. The attach session itself only belongs to the group. */
export function classifyRokuSession(session: DebugSessionInfo): SessionClassification | undefined {
    if (session.type === 'brightscript') {
        return { groupId: session.id, runtime: BRIGHTSCRIPT_RUNTIME };
    }
    if (session.configuration?._isBrightscriptJsSession === true) {
        const groupId = session.configuration._brightscriptParentSessionId;
        return groupId ? { groupId: groupId } : undefined;
    }
    const groupId = findJsAttachSession(session)?.configuration?._brightscriptParentSessionId;
    if (!groupId) {
        return undefined;
    }
    return { groupId: groupId, runtime: session.type === 'pwa-node' || session.type === 'node' ? JAVASCRIPT_RUNTIME : undefined };
}

/**
 * A JS stop is reported only when its stack has a frame with a source path: the Hermes runtime
 * pauses on attach with source-less frames. That pause is reported, as "entry", only when the
 * attach was configured not to continue (stopOnEntry).
 */
export function shouldReportRokuStop(context: StopReportContext): StopReportDecision | Promise<StopReportDecision> {
    if (context.runtime !== JAVASCRIPT_RUNTIME) {
        return true;
    }
    return judgeJsStop(context);
}

async function judgeJsStop(context: StopReportContext): Promise<StopReportDecision> {
    try {
        const stack = await context.fetchStack();
        if (stack.frames.some((frame) => !!frame.file)) {
            return true;
        }
    } catch {
        //an unreadable stack cannot be told apart from a real stop, so it is reported
        return true;
    }
    return findJsAttachSession(context.session)?.configuration?.continueOnAttach === false ? 'entry' : false;
}

function findJsAttachSession(session: DebugSessionInfo): DebugSessionInfo | undefined {
    let current = session.parentSession;
    while (current) {
        if (current.configuration?._isBrightscriptJsSession === true) {
            return current;
        }
        current = current.parentSession;
    }
    return undefined;
}
