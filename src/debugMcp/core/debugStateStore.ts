import { BreakpointVerificationTracker } from './breakpointVerification';
import type { StackFrameInfo } from './dapClient';
import { OutputBuffer } from './outputBuffer';
import type { OutputReadOptions, OutputReadResult } from './outputBuffer';
import type { StopReportDecision } from './integration';
import type { RuntimeStateView, RuntimeStatus } from './sessionResolution';

const RESUME_COMMANDS = new Set(['continue', 'next', 'stepIn', 'stepOut']);
const MAX_TERMINATED_RECORDS = 20;

/**
 * Per debug session state fed by a debug adapter tracker: whether the session is stopped, its
 * output, breakpoint verification, and the waiters blocked on the next stop.
 *
 * A session tracked with `shouldReportStop` has each stop judged by that hook before it is
 * reported; while an asynchronous judgement is pending the session reads as running.
 */
export class DebugStateStore implements RuntimeStateView {
    constructor(
        private readonly options: DebugStateStoreOptions = {}
    ) { }

    public readonly breakpoints = new BreakpointVerificationTracker(this.options.ownsFile);

    private records = new Map<string, SessionRecord>();
    private waiters = new Set<StopWaiter>();
    private stopSequence = 0;

    public trackSession(sessionId: string, runtime: string, options: TrackSessionOptions): void {
        if (this.records.has(sessionId)) {
            return;
        }
        this.records.set(sessionId, {
            sessionId: sessionId,
            runtime: runtime,
            groupId: options.groupId,
            fetchStackFrames: options.fetchStackFrames,
            shouldReportStop: options.shouldReportStop,
            status: 'running',
            stopGeneration: 0,
            lastStopSequence: 0,
            knownThreadIds: [],
            requestCounts: new Map(),
            pendingResumes: new Map(),
            output: new OutputBuffer(this.options.outputCapacity)
        });
        this.breakpoints.trackSession(sessionId, runtime);
        this.pruneTerminatedRecords();
    }

    public hasSession(sessionId: string): boolean {
        return this.records.has(sessionId);
    }

    public getRuntime(sessionId: string): string | undefined {
        return this.records.get(sessionId)?.runtime;
    }

    public getStatus(sessionId: string): RuntimeStatus {
        return this.records.get(sessionId)?.status ?? 'untracked';
    }

    public getLastStopSequence(sessionId: string): number {
        return this.records.get(sessionId)?.lastStopSequence ?? 0;
    }

    /** The current stop, or undefined when the session is not stopped. */
    public getStop(sessionId: string): StopSnapshot | undefined {
        const record = this.records.get(sessionId);
        return record?.status === 'stopped' ? record.stop : undefined;
    }

    /** How many requests with this command the adapter has been sent for the session. */
    public getRequestCount(sessionId: string, command: string): number {
        return this.records.get(sessionId)?.requestCounts.get(command) ?? 0;
    }

    public getLastThreadId(sessionId: string): number | undefined {
        const record = this.records.get(sessionId);
        return record?.stop?.threadId ?? record?.lastStoppedThreadId ?? record?.knownThreadIds[0];
    }

    public readOutput(sessionId: string, options: OutputReadOptions): OutputReadResult | undefined {
        return this.records.get(sessionId)?.output.read(options);
    }

    /** Feed requests the client sends to the adapter. */
    public handleRequest(sessionId: string, message: any): void {
        const record = this.records.get(sessionId);
        if (!record || message?.type !== 'request') {
            return;
        }
        this.breakpoints.handleRequest(sessionId, message);
        record.requestCounts.set(message.command, (record.requestCounts.get(message.command) ?? 0) + 1);
        if (message.command === 'restart' && record.status !== 'terminated') {
            record.stopGeneration++;
            record.status = 'running';
            record.stop = undefined;
        } else if (RESUME_COMMANDS.has(message.command) && record.status === 'stopped') {
            record.pendingResumes.set(message.seq, { stop: record.stop, generation: record.stopGeneration });
            record.status = 'running';
            record.stop = undefined;
        }
    }

    /** Feed responses and events the adapter sends to the client. */
    public handleMessage(sessionId: string, message: any): void {
        const record = this.records.get(sessionId);
        if (!record) {
            return;
        }
        this.breakpoints.handleMessage(sessionId, message);
        if (message?.type === 'response') {
            this.handleResponse(record, message);
        } else if (message?.type === 'event') {
            this.handleEvent(record, message);
        }
    }

    /** Marks the session ended and releases waiters that can no longer be satisfied. */
    public handleSessionEnded(sessionId: string): void {
        const record = this.records.get(sessionId);
        if (!record || record.status === 'terminated') {
            return;
        }
        record.status = 'terminated';
        record.stop = undefined;
        record.stopGeneration++;
        this.breakpoints.forgetSession(sessionId);
        for (const waiter of [...this.waiters]) {
            if (record.groupId === waiter.groupId && (record.sessionId === record.groupId || this.areAllTerminated(waiter))) {
                this.settle(waiter, { kind: 'terminated', sessionId: sessionId, runtime: record.runtime });
            }
        }
    }

    /**
     * Waits for a stop in a debug group, optionally limited to one runtime. Sessions that join
     * the group later (a session that attaches after the call) are included. Unless
     * `onlyNewStops` is set, a session that is already stopped resolves immediately. Create the
     * wait before sending the request that is expected to cause the stop, so the stop cannot
     * be missed.
     */
    public waitForStop(options: { groupId: string; runtime?: string; timeoutMs: number; onlyNewStops?: boolean; signal?: AbortSignal }): StopWait {
        const groupRecords = [...this.records.values()].filter((record) => record.groupId === options.groupId);
        if (groupRecords.length === 0) {
            throw new Error('Stop tracking is not available for this session because it started before the debugger MCP server was enabled. Restart the debug session.');
        }
        const matching = groupRecords.filter((record) => !options.runtime || record.runtime === options.runtime);
        let settle: (result: StopWaitResult) => void;
        const promise = new Promise<StopWaitResult>((resolve) => {
            settle = resolve;
        });
        const immediate = (result: StopWaitResult): StopWait => {
            settle(result);
            return { promise: promise, cancel: () => { } };
        };

        if (!options.onlyNewStops) {
            const stopped = matching.filter((record) => record.status === 'stopped').sort((left, right) => right.stop.sequence - left.stop.sequence)[0];
            if (stopped) {
                return immediate({ kind: 'stopped', alreadyStopped: true, sessionId: stopped.sessionId, runtime: stopped.runtime, stop: stopped.stop });
            }
        }
        const groupPrimary = groupRecords.find((record) => record.sessionId === record.groupId);
        if (groupPrimary?.status === 'terminated' || (matching.length > 0 && matching.every((record) => record.status === 'terminated'))) {
            const ended = groupPrimary?.status === 'terminated' ? groupPrimary : matching[0];
            return immediate({ kind: 'terminated', sessionId: ended.sessionId, runtime: ended.runtime });
        }
        if (options.signal?.aborted) {
            return immediate({ kind: 'cancelled' });
        }

        const waiter: StopWaiter = { groupId: options.groupId, runtime: options.runtime, baselineSequence: this.stopSequence, resolve: settle, timer: undefined };
        waiter.timer = setTimeout(() => this.settle(waiter, { kind: 'timeout' }), options.timeoutMs);
        this.waiters.add(waiter);
        const cancel = () => this.settle(waiter, { kind: 'cancelled' });
        options.signal?.addEventListener('abort', cancel, { once: true });
        return { promise: promise, cancel: cancel };
    }

    /** Releases every waiter and drops all state. */
    public dispose(): void {
        for (const waiter of [...this.waiters]) {
            this.settle(waiter, { kind: 'cancelled' });
        }
        this.records.clear();
    }

    private handleResponse(record: SessionRecord, message: any): void {
        const pendingResume = record.pendingResumes.get(message.request_seq);
        if (pendingResume) {
            record.pendingResumes.delete(message.request_seq);
            if (message.success === false && record.status === 'running' && record.stopGeneration === pendingResume.generation) {
                record.status = 'stopped';
                record.stop = pendingResume.stop;
            }
        }
        if (message.command === 'threads' && message.success !== false && Array.isArray(message.body?.threads)) {
            record.knownThreadIds = message.body.threads.map((thread: { id: number }) => thread.id);
        }
    }

    private handleEvent(record: SessionRecord, message: any): void {
        switch (message.event) {
            case 'stopped':
                this.handleStopped(record, message.body ?? {});
                break;
            case 'continued':
                record.stopGeneration++;
                if (record.status === 'stopped' || record.status === 'running') {
                    record.status = 'running';
                    record.stop = undefined;
                }
                break;
            case 'terminated':
                this.handleSessionEnded(record.sessionId);
                break;
            case 'output':
                if (message.body?.category !== 'telemetry' && typeof message.body?.output === 'string') {
                    record.output.append(message.body.category ?? 'console', message.body.output);
                }
                break;
        }
    }

    private handleStopped(record: SessionRecord, body: any): void {
        const generation = ++record.stopGeneration;
        if (!record.shouldReportStop) {
            this.confirmStop(record, body, body.threadId);
            return;
        }
        record.status = 'running';
        record.stop = undefined;
        let threadId: number | undefined = body.threadId;
        const fetchStack = async () => {
            const stack = await record.fetchStackFrames(body.threadId);
            threadId = body.threadId ?? stack.threadId;
            return stack;
        };
        let decision: StopReportDecision | Promise<StopReportDecision>;
        try {
            decision = record.shouldReportStop(body, fetchStack);
        } catch {
            decision = true;
        }
        if (typeof decision === 'object') {
            void decision.catch(() => true).then((resolved) => {
                if (record.stopGeneration === generation) {
                    this.applyStopDecision(record, body, threadId, resolved);
                }
            });
        } else {
            this.applyStopDecision(record, body, threadId, decision);
        }
    }

    //an unreadable stack cannot be told apart from a real stop, so a failed judgement reports it
    private applyStopDecision(record: SessionRecord, body: any, threadId: number | undefined, decision: StopReportDecision): void {
        if (decision === 'entry') {
            this.confirmStop(record, { ...body, reason: 'entry' }, threadId);
        } else if (decision) {
            this.confirmStop(record, body, threadId);
        }
    }

    private confirmStop(record: SessionRecord, body: any, threadId: number | undefined): void {
        const stop: StopSnapshot = {
            sequence: ++this.stopSequence,
            reason: body.reason ?? 'unknown',
            description: body.description,
            text: body.text,
            threadId: threadId,
            allThreadsStopped: body.allThreadsStopped
        };
        record.status = 'stopped';
        record.stop = stop;
        record.lastStopSequence = stop.sequence;
        if (threadId !== undefined) {
            record.lastStoppedThreadId = threadId;
        }
        for (const waiter of [...this.waiters]) {
            if (this.matchesWaiter(record, waiter) && stop.sequence > waiter.baselineSequence) {
                this.settle(waiter, { kind: 'stopped', alreadyStopped: false, sessionId: record.sessionId, runtime: record.runtime, stop: stop });
            }
        }
    }

    private settle(waiter: StopWaiter, result: StopWaitResult): void {
        if (!this.waiters.delete(waiter)) {
            return;
        }
        clearTimeout(waiter.timer);
        waiter.resolve(result);
    }

    private matchesWaiter(record: SessionRecord, waiter: StopWaiter): boolean {
        return record.groupId === waiter.groupId && (!waiter.runtime || record.runtime === waiter.runtime);
    }

    private areAllTerminated(waiter: StopWaiter): boolean {
        const matching = [...this.records.values()].filter((record) => this.matchesWaiter(record, waiter));
        return matching.length > 0 && matching.every((record) => record.status === 'terminated');
    }

    private pruneTerminatedRecords(): void {
        const terminated = [...this.records.values()].filter((record) => record.status === 'terminated');
        for (const record of terminated.slice(0, Math.max(0, terminated.length - MAX_TERMINATED_RECORDS))) {
            this.records.delete(record.sessionId);
        }
    }
}

interface SessionRecord {
    sessionId: string;
    runtime: string;
    /** Id of the primary session of the group this session belongs to. */
    groupId: string;
    fetchStackFrames?: StackFetcher;
    shouldReportStop?: StopJudge;
    status: RuntimeStatus;
    stop?: StopSnapshot;
    /** Bumped on every stopped, continued and terminated event so a late stack fetch can tell it is out of date. */
    stopGeneration: number;
    lastStopSequence: number;
    lastStoppedThreadId?: number;
    knownThreadIds: number[];
    requestCounts: Map<string, number>;
    pendingResumes: Map<number, { stop?: StopSnapshot; generation: number }>;
    output: OutputBuffer;
}

interface StopWaiter {
    groupId: string;
    runtime?: string;
    baselineSequence: number;
    resolve: (result: StopWaitResult) => void;
    timer: ReturnType<typeof setTimeout> | undefined;
}

export interface DebugStateStoreOptions {
    outputCapacity?: number;
    /** See `DebugIntegration.ownsFile`. */
    ownsFile?: (filePath: string) => string | undefined;
}

export interface TrackSessionOptions {
    /** Id of the primary session of the session's group. */
    groupId: string;
    /** Reads the stack of a stopped thread; needed by a `shouldReportStop` that inspects frames. */
    fetchStackFrames?: StackFetcher;
    /** Judges each `stopped` event of the session; see `StopReportDecision`. */
    shouldReportStop?: StopJudge;
}

export type StopJudge = (stop: Record<string, any>, fetchStack: () => ReturnType<StackFetcher>) => StopReportDecision | Promise<StopReportDecision>;

export type StackFetcher = (threadId: number | undefined) => Promise<{ threadId?: number; frames: StackFrameInfo[] }>;

export interface StopSnapshot {
    /** Orders stops across all sessions of the store. */
    sequence: number;
    reason: string;
    description?: string;
    text?: string;
    threadId?: number;
    allThreadsStopped?: boolean;
}

export interface StopWait {
    promise: Promise<StopWaitResult>;
    /** Releases the wait with a `cancelled` result, e.g. when the request that should cause the stop failed. */
    cancel: () => void;
}

export type StopWaitResult =
    | { kind: 'stopped'; alreadyStopped: boolean; sessionId: string; runtime: string; stop: StopSnapshot }
    | { kind: 'terminated'; sessionId: string; runtime: string }
    | { kind: 'timeout' }
    | { kind: 'cancelled' };
