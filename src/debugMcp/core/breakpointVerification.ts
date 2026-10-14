import { toPathKey } from './pathKey';

/**
 * Observes the `setBreakpoints` request/response pairs and `breakpoint` events of each debug
 * adapter so a VS Code breakpoint can be reported as verified (or not) per runtime.
 */
export class BreakpointVerificationTracker {
    constructor(
        private readonly ownsFile: (filePath: string) => string | undefined = () => undefined
    ) { }

    private sessions = new Map<string, SessionBreakpoints>();
    private updateCounter = 0;

    public trackSession(sessionId: string, runtime: string): void {
        this.sessions.set(sessionId, { runtime: runtime, linesStartAt1: true, pendingRequests: new Map(), entriesByPath: new Map() });
    }

    public forgetSession(sessionId: string): void {
        this.sessions.delete(sessionId);
    }

    /** Feed requests sent to the adapter. */
    public handleRequest(sessionId: string, message: any): void {
        const session = this.sessions.get(sessionId);
        if (!session || message?.type !== 'request') {
            return;
        }
        if (message.command === 'initialize') {
            session.linesStartAt1 = message.arguments?.linesStartAt1 !== false;
        } else if (message.command === 'setBreakpoints' && message.arguments?.source?.path) {
            const requested: any[] = message.arguments.breakpoints ?? (message.arguments.lines ?? []).map((line: number) => ({ line: line }));
            session.pendingRequests.set(message.seq, {
                pathKey: toPathKey(message.arguments.source.path),
                requestedLines: requested.map((entry) => this.toOneBased(session, entry.line))
            });
        }
    }

    /** Feed responses and events received from the adapter. */
    public handleMessage(sessionId: string, message: any): void {
        const session = this.sessions.get(sessionId);
        if (!session) {
            return;
        }
        if (message?.type === 'response' && message.command === 'setBreakpoints') {
            this.handleSetBreakpointsResponse(session, message);
        } else if (message?.type === 'event' && message.event === 'breakpoint' && message.body?.breakpoint) {
            this.handleBreakpointEvent(session, message.body.breakpoint);
        }
    }

    /** Counter that increases on every answer from an adapter; capture it before changing breakpoints. */
    public get currentUpdate(): number {
        return this.updateCounter;
    }

    /**
     * Whether the breakpoint at `line` of `filePath` has been answered, by answers newer than
     * `sinceUpdate`. A file owned by a runtime (see `DebugIntegration.ownsFile`) is settled by that
     * runtime's answers alone, and all of them must be verified. For any other file, one verified
     * answer is enough, else every runtime must have answered.
     */
    public isSettled(filePath: string, line: number, sinceUpdate: number): boolean {
        const pathKey = toPathKey(filePath);
        const owningRuntime = this.ownsFile(filePath);
        const relevant = [...this.sessions.values()].filter((session) => !owningRuntime || session.runtime === owningRuntime);
        const answers = relevant
            .map((session) => session.entriesByPath.get(pathKey)?.find((candidate) => candidate.requestedLine === line))
            .filter((entry) => !!entry && entry.updateOrder > sinceUpdate);
        if (owningRuntime) {
            return answers.length > 0 && answers.every((entry) => entry.verified);
        }
        return answers.some((entry) => entry.verified) || (relevant.length > 0 && answers.length === relevant.length);
    }

    /** Verification results for the breakpoint at `line` (1-based) of `filePath`, newest per runtime. */
    public lookup(filePath: string, line: number): RuntimeVerifications {
        const pathKey = toPathKey(filePath);
        const newestByRuntime = new Map<string, VerificationEntry>();
        for (const session of this.sessions.values()) {
            for (const entry of session.entriesByPath.get(pathKey) ?? []) {
                const current = newestByRuntime.get(session.runtime);
                if (entry.requestedLine === line && (!current || entry.updateOrder > current.updateOrder)) {
                    newestByRuntime.set(session.runtime, entry);
                }
            }
        }
        const result: RuntimeVerifications = {};
        for (const [runtime, entry] of newestByRuntime) {
            result[runtime] = { verified: entry.verified, actualLine: entry.actualLine, message: entry.message };
        }
        return result;
    }

    private handleSetBreakpointsResponse(session: SessionBreakpoints, message: any): void {
        const request = session.pendingRequests.get(message.request_seq);
        if (!request) {
            return;
        }
        session.pendingRequests.delete(message.request_seq);
        const responded: any[] = message.body?.breakpoints ?? [];
        const entries: VerificationEntry[] = request.requestedLines.map((requestedLine, index) => {
            const adapterBreakpoint = responded[index];
            return {
                requestedLine: requestedLine,
                adapterId: adapterBreakpoint?.id,
                verified: message.success !== false && adapterBreakpoint?.verified === true,
                actualLine: adapterBreakpoint?.line === undefined ? undefined : this.toOneBased(session, adapterBreakpoint.line),
                message: adapterBreakpoint?.message ?? (message.success === false ? message.message : undefined),
                updateOrder: ++this.updateCounter
            };
        });
        session.entriesByPath.set(request.pathKey, entries);
    }

    private handleBreakpointEvent(session: SessionBreakpoints, adapterBreakpoint: any): void {
        if (adapterBreakpoint.id === undefined) {
            return;
        }
        for (const entries of session.entriesByPath.values()) {
            const entry = entries.find((candidate) => candidate.adapterId === adapterBreakpoint.id);
            if (entry) {
                entry.verified = adapterBreakpoint.verified === true;
                entry.actualLine = adapterBreakpoint.line === undefined ? entry.actualLine : this.toOneBased(session, adapterBreakpoint.line);
                entry.message = adapterBreakpoint.message;
                entry.updateOrder = ++this.updateCounter;
            }
        }
    }

    private toOneBased(session: SessionBreakpoints, line: number): number {
        return session.linesStartAt1 ? line : line + 1;
    }
}

/** `pending` until an adapter has answered, then `verified` if any runtime verified it. */
export function summarizeVerification(verifications: RuntimeVerifications): 'pending' | 'verified' | 'unverified' {
    const results = Object.values(verifications);
    if (results.length === 0) {
        return 'pending';
    }
    return results.some((result) => result.verified) ? 'verified' : 'unverified';
}

interface SessionBreakpoints {
    runtime: string;
    linesStartAt1: boolean;
    pendingRequests: Map<number, { pathKey: string; requestedLines: number[] }>;
    entriesByPath: Map<string, VerificationEntry[]>;
}

interface VerificationEntry {
    /** 1-based line VS Code asked for. */
    requestedLine: number;
    adapterId?: number;
    verified: boolean;
    actualLine?: number;
    message?: string;
    updateOrder: number;
}

export interface BreakpointVerification {
    verified: boolean;
    /** 1-based line the adapter placed the breakpoint on. */
    actualLine?: number;
    message?: string;
}

export type RuntimeVerifications = Record<string, BreakpointVerification>;
