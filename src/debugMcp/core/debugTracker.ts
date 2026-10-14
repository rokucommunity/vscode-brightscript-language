import { fetchStackForStop } from './dapClient';
import type { DebugStateStore } from './debugStateStore';
import type { DebugMcpRegistry, DebugSessionInfo } from './integration';

/** Builds the tracker factory that feeds a state store. Tracker errors are logged, never thrown into the debug adapter. */
export function createStateTrackerFactory(store: DebugStateStore, registry: DebugMcpRegistry, log: (message: string) => void): TrackerFactory {
    const guard = (action: () => void) => {
        try {
            action();
        } catch (error) {
            log(`debug MCP tracker error: ${(error as Error).message}`);
        }
    };
    return {
        createDebugAdapterTracker: (session) => {
            const classification = registry.classify(session);
            if (!classification?.runtime) {
                return undefined;
            }
            const { integration, groupId, runtime } = classification;
            store.trackSession(session.id, runtime, {
                groupId: groupId,
                fetchStackFrames: integration.shouldReportStop ? (threadId) => fetchStackForStop(session, threadId) : undefined,
                shouldReportStop: integration.shouldReportStop
                    ? (stop, fetchStack) => registry.judgeStop(integration, { session: session, runtime: runtime, groupId: groupId, stop: stop, fetchStack: fetchStack })
                    : undefined
            });
            return {
                onWillReceiveMessage: (message) => guard(() => store.handleRequest(session.id, message)),
                onDidSendMessage: (message) => guard(() => store.handleMessage(session.id, message)),
                onExit: () => guard(() => store.handleSessionEnded(session.id))
            };
        }
    };
}

export interface TrackerFactory {
    createDebugAdapterTracker(session: DebugSessionInfo): {
        onWillReceiveMessage(message: any): void;
        onDidSendMessage(message: any): void;
        onExit(): void;
    } | undefined;
}
