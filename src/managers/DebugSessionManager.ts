import * as vscode from 'vscode';

/**
 * Single source of truth for the debug sessions this extension cares about.
 *
 * A Roku launch is really a GROUP of sessions, not one:
 *  - the `brightscript` session (roku-debug) — the only adapter that answers this
 *    extension's custom requests (`startPerfettoTracing`, `captureHeapSnapshot`,
 *    `rendezvous.clearHistory`, ...);
 *  - the auto-attached node session that debugs the transpiled JS for RSG/TS apps
 *    (config `_isBrightscriptJsSession === true` — see `attachJsDebugger` in extension.ts);
 *  - that session's pwa-node CDP child(ren) — the only sessions the Solid Devtools
 *    transport can `evaluate` against.
 *
 * Before this manager, three places each tracked sessions their own way and disagreed
 * about which one was "the right session":
 *  - the profiling toolbar commands used `vscode.debug.activeDebugSession` directly, so
 *    clicking a button while the JS session was selected sent the request to
 *    vscode-js-debug (which has no such request) and silently did nothing;
 *  - the Solid transport kept its own candidate Set + heuristic to find the evaluable
 *    JS child;
 *  - extension.ts kept its own Set + bidirectional `linkedSessions` for joint teardown.
 *
 * This manager owns the live-session set, the BRS<->JS<->child grouping, the
 * resolve-the-group-from-whatever-is-active logic, and the joint teardown. Callers ask
 * for the member they need rather than guessing from `activeDebugSession`:
 *  - {@link getActiveBrightScriptSession} — custom requests (profiling, rendezvous)
 *  - {@link getEvaluableJsSessions} — the Solid transport's `evaluate` channel
 */
export class DebugSessionManager {

    private liveSessions = new Map<string, vscode.DebugSession>();

    /**
     * Ids of brightscript-JS sessions that completed their attach (extension.ts confirms them
     * once `startDebugging` resolves true). A JS attach ATTEMPT that fails still starts and
     * terminates a session; without this gate its termination would jointly tear down the
     * healthy parent BRS session while the attach retry loop is still working (the app may not
     * have its JS runtime listening yet - e.g. still waiting for the BS debugger on launch).
     */
    private confirmedJsSessions = new Set<string>();

    private startEmitter = new vscode.EventEmitter<vscode.DebugSession>();
    private terminateEmitter = new vscode.EventEmitter<vscode.DebugSession>();

    /** Fires for every debug session start, after it's been tracked. */
    public readonly onDidStartSession = this.startEmitter.event;
    /** Fires for every debug session termination, after it's been untracked. */
    public readonly onDidTerminateSession = this.terminateEmitter.event;

    /**
     * Subscribe to vscode's debug lifecycle. Call once, during activation and BEFORE any
     * debug session can start, so the manager observes every session — including
     * js-debug child sessions, which also raise `onDidStartDebugSession`.
     */
    public register(context: vscode.ExtensionContext): void {
        context.subscriptions.push(
            vscode.debug.onDidStartDebugSession((session) => this.handleStart(session)),
            vscode.debug.onDidTerminateDebugSession((session) => this.handleTerminate(session)),
            this.startEmitter,
            this.terminateEmitter
        );
    }

    private handleStart(session: vscode.DebugSession): void {
        this.liveSessions.set(session.id, session);
        this.startEmitter.fire(session);
    }

    private handleTerminate(session: vscode.DebugSession): void {
        this.liveSessions.delete(session.id);
        this.terminateEmitter.fire(session);

        // a failed attach attempt only ever stops itself (see confirmedJsSessions)
        if (this.isBrightScriptJs(session) && !this.confirmedJsSessions.has(session.id)) {
            return;
        }
        this.confirmedJsSessions.delete(session.id);

        // Joint teardown: terminating any member of a group tears down the rest, so a Roku
        // app and its attached JS debugger always start and stop together. Derived from the
        // session relationships (not a stored link list), so it stays correct no matter
        // which member the user stopped — and a session in no group only ever stops itself.
        for (const member of this.groupSessionsFor(session)) {
            if (member.id !== session.id && this.isLive(member)) {
                void vscode.debug.stopDebugging(member).then(undefined, (e) => {
                    console.error(`Error stopping linked debug session with id ${member.id}`, e);
                });
            }
        }
    }

    /**
     * Mark the live brightscript-JS session(s) attached to `parentSessionId` as successfully
     * attached, so their termination participates in joint teardown. Called by extension.ts
     * once `startDebugging` for the JS attach resolves true.
     */
    public confirmJsSessionsFor(parentSessionId: string): void {
        for (const session of this.sessions) {
            if (this.isBrightScriptJs(session) && (session.configuration as SessionConfig)._brightscriptParentSessionId === parentSessionId) {
                this.confirmedJsSessions.add(session.id);
            }
        }
    }

    // ---- queries -----------------------------------------------------------------

    /** All currently-live debug sessions. */
    public get sessions(): vscode.DebugSession[] {
        return [...this.liveSessions.values()];
    }

    /** True while vscode considers `session` started (between its start and terminate). */
    public isLive(session: vscode.DebugSession | undefined): boolean {
        return session ? this.liveSessions.has(session.id) : false;
    }

    /** The roku-debug session — the one that answers this extension's custom requests. */
    public isBrightScript(session: vscode.DebugSession | undefined): boolean {
        return session?.type === 'brightscript';
    }

    /** The node session a brightscript launch auto-attaches to debug the transpiled JS. */
    public isBrightScriptJs(session: vscode.DebugSession | undefined): boolean {
        return (session?.configuration as SessionConfig)?._isBrightscriptJsSession === true;
    }

    /** The session groups currently live — one per `brightscript` session. */
    public get groups(): DebugSessionGroup[] {
        const sessions = this.sessions;
        return sessions
            .filter((session) => this.isBrightScript(session))
            .map((brightScript) => {
                const members = sessions.filter((session) => this.brightScriptIdFor(session) === brightScript.id);
                const js = members.find((session) => this.isBrightScriptJs(session));
                const jsChildren = members.filter((session) => session.id !== brightScript.id && session.id !== js?.id);
                return { brightScript: brightScript, js: js, jsChildren: jsChildren };
            });
    }

    /**
     * The group the user is currently "in", resolved from `activeDebugSession` regardless
     * of which member is selected — picking the JS session in the Call Stack still resolves
     * to its BRS sibling. Falls back to the sole running group when nothing relevant is
     * active (the common single-launch case).
     */
    public get activeGroup(): DebugSessionGroup | undefined {
        const groups = this.groups;
        const active = vscode.debug.activeDebugSession;
        if (active) {
            const brightScriptId = this.brightScriptIdFor(active);
            const match = groups.find((group) => group.brightScript.id === brightScriptId);
            if (match) {
                return match;
            }
        }
        return groups.length === 1 ? groups[0] : undefined;
    }

    /**
     * The BrightScript session to send custom requests to (profiling, rendezvous, ...).
     * Resolves correctly even when the user has the JS session selected — which is the
     * whole reason this manager exists.
     */
    public getActiveBrightScriptSession(): vscode.DebugSession | undefined {
        return this.activeGroup?.brightScript;
    }

    /**
     * JS sessions to try the Solid transport's `evaluate` against, best-first: the active
     * session (only when it is itself node/pwa-node), then children of our brightscript-spawned
     * JS session, then that JS session itself, then any other node session. vscode-js-debug's
     * logical PARENT session has no CDP target (an `evaluate` there fails instantly), so the
     * evaluable runtime lives in a CHILD — which is why children rank above the parent.
     */
    public getEvaluableJsSessions(): vscode.DebugSession[] {
        const nodeishSessions = this.sessions.filter((session) => this.isNodeish(session));
        const active = vscode.debug.activeDebugSession;
        return this.dedupById([
            this.isNodeish(active) ? active : undefined,
            ...nodeishSessions.filter((session) => this.isBrightScriptJs(session.parentSession)),
            ...nodeishSessions.filter((session) => this.isBrightScriptJs(session)),
            ...nodeishSessions
        ]);
    }

    // ---- helpers -----------------------------------------------------------------

    /** vscode-js-debug session types (the only ones that can service `evaluate` for the bridge). */
    private isNodeish(session: vscode.DebugSession | undefined): boolean {
        return session?.type === 'node' || session?.type === 'pwa-node';
    }

    /**
     * The id of the `brightscript` session `session` belongs to, or undefined when it's
     * not part of one of our groups. Walks `parentSession` so a pwa-node grandchild still
     * resolves up through its JS session to the BRS session.
     */
    private brightScriptIdFor(session: vscode.DebugSession | undefined): string | undefined {
        if (this.isBrightScript(session)) {
            return session.id;
        }
        let current = session;
        while (current) {
            if (this.isBrightScriptJs(current)) {
                return (current.configuration as SessionConfig)._brightscriptParentSessionId;
            }
            current = current.parentSession;
        }
        return undefined;
    }

    /**
     * Every currently-known session in the same group as `session` (including `session`
     * itself, even if it's already been untracked mid-terminate). A session that belongs to
     * no group is its own lone group, so unrelated debug sessions never tear each other down.
     */
    private groupSessionsFor(session: vscode.DebugSession): vscode.DebugSession[] {
        const brightScriptId = this.brightScriptIdFor(session);
        if (!brightScriptId) {
            return [session];
        }
        const members = this.sessions.filter((candidate) => this.brightScriptIdFor(candidate) === brightScriptId);
        return members.some((member) => member.id === session.id) ? members : [...members, session];
    }

    private dedupById(sessions: Array<vscode.DebugSession | undefined>): vscode.DebugSession[] {
        const seen = new Set<string>();
        const result: vscode.DebugSession[] = [];
        for (const session of sessions) {
            if (session && !seen.has(session.id)) {
                seen.add(session.id);
                result.push(session);
            }
        }
        return result;
    }
}

export const debugSessionManager = new DebugSessionManager();

// ---- types -----------------------------------------------------------------------

/** A Roku debug launch and the sessions that hang off it. */
export interface DebugSessionGroup {
    /** The `brightscript` (roku-debug) session — answers this extension's custom requests. */
    brightScript: vscode.DebugSession;
    /** The auto-attached node session debugging the transpiled JS, when this is an RSG/TS app. */
    js?: vscode.DebugSession;
    /** pwa-node CDP child sessions of `js` — what the Solid transport evaluates against. */
    jsChildren: vscode.DebugSession[];
}

/** The extra fields attachJsDebugger stamps onto a debug session's configuration. */
interface SessionConfig {
    _isBrightscriptJsSession?: boolean;
    _brightscriptParentSessionId?: string;
}
