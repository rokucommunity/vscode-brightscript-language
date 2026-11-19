import type { ToolCallContext } from './DebugMcpServer';
import type { StopWait } from './debugStateStore';
import type { StopWaitResult } from './debugStateStore';
import { findSessionById, tryFetchFrames, withProgress } from './toolSupport';
import type { DebugMcpToolContext, ResolvedTarget } from './toolSupport';

const REPORTED_FRAMES = 5;

/** Turns a wait outcome into the JSON a tool returns, including the top stack frames of a stop. */
/** The stopped session is looked up among the live sessions, so a session that joined the group after the target was resolved still yields frames. */
export async function describeWaitResult(context: DebugMcpToolContext, target: ResolvedTarget, result: StopWaitResult, timeoutMs: number): Promise<Record<string, unknown>> {
    switch (result.kind) {
        case 'stopped': {
            const session = context.sessions.sessions.find((candidate) => candidate.id === result.sessionId) ?? findSessionById(target.group, result.sessionId);
            const frames = session ? await tryFetchFrames(session, result.stop.threadId, REPORTED_FRAMES) : [];
            return {
                stopped: true,
                alreadyStopped: result.alreadyStopped || undefined,
                runtime: result.runtime,
                sessionId: result.sessionId,
                reason: result.stop.reason,
                description: result.stop.description,
                threadId: result.stop.threadId,
                frames: frames
            };
        }
        case 'terminated':
            return { terminated: true, runtime: result.runtime, sessionId: result.sessionId, message: 'The debug session ended before a stop was reported.' };
        case 'cancelled':
            return { stopped: false, cancelled: true, message: 'The wait was cancelled.' };
        default:
            return { stopped: false, timedOut: true, message: `No stop within ${timeoutMs} ms; the program is still running. Call wait_for_stop again, or use pause.` };
    }
}

/** Awaits a stop wait, reporting progress while pending, and describes the outcome. */
export async function waitAndDescribe(context: DebugMcpToolContext, target: ResolvedTarget, wait: StopWait, timeoutMs: number, call: ToolCallContext | undefined): Promise<Record<string, unknown>> {
    const result = await withProgress(call, () => 'Still waiting for the program to stop', () => wait.promise);
    return describeWaitResult(context, target, result, timeoutMs);
}
