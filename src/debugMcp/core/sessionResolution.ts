export const NO_ACTIVE_SESSION_MESSAGE = 'No active debug session. Use list_launch_configs and start_debugging.';

/** Finds the group that `sessionId` belongs to; any member session matches. */
export function findGroup<TSession extends SessionRef, TGroup extends GroupRef<TSession>>(groups: TGroup[], sessionId: string): TGroup | undefined {
    return groups.find((group) => getGroupSessions(group).some((session) => session.id === sessionId));
}

/** The group a tool call targets: the one containing `sessionId`, else the active group. */
export function resolveGroup<TSession extends SessionRef, TGroup extends GroupRef<TSession>>(groups: TGroup[], activeGroup: TGroup | undefined, sessionId?: string): TGroup {
    if (sessionId) {
        const group = findGroup(groups, sessionId);
        if (!group) {
            throw new Error(`No debug session with id '${sessionId}'. Use list_debug_sessions to see the live sessions.`);
        }
        return group;
    }
    if (groups.length === 0) {
        throw new Error(NO_ACTIVE_SESSION_MESSAGE);
    }
    if (!activeGroup) {
        throw new Error('Several debug sessions are running and none is active. Pass sessionId (see list_debug_sessions).');
    }
    return activeGroup;
}

/** The session of `runtime` that owns the threads: the one that stopped most recently, else the first. */
export function pickRuntimeSession<TSession extends SessionRef>(group: GroupRef<TSession>, runtime: string, view: RuntimeStateView): TSession | undefined {
    let best: TSession | undefined;
    let bestSequence = 0;
    const candidates = group.members.filter((member) => member.runtime === runtime).map((member) => member.session);
    for (const candidate of candidates) {
        const sequence = view.getLastStopSequence(candidate.id);
        if (sequence > bestSequence) {
            best = candidate;
            bestSequence = sequence;
        }
    }
    return best ?? candidates[0];
}

/**
 * Chooses the runtime and session a tool acts on. An explicit `runtime` wins. Otherwise a
 * `sessionId` naming a session of a non-primary runtime selects that session, else the
 * non-primary runtime that is currently stopped (when the primary one is not), else the
 * primary runtime.
 */
export function resolveRuntimeTarget<TSession extends SessionRef>(group: GroupRef<TSession>, view: RuntimeStateView, request: { runtime?: string; sessionId?: string; preferStopped?: boolean }): RuntimeTarget<TSession> {
    const primary = { runtime: group.primaryRuntime, session: group.primary };
    const requestedMember = request.sessionId
        ? group.members.find((member) => member.session.id === request.sessionId && member.runtime && member.runtime !== group.primaryRuntime && (!request.runtime || member.runtime === request.runtime))
        : undefined;
    if (request.runtime === group.primaryRuntime) {
        return primary;
    }
    if (request.runtime || requestedMember) {
        const runtime = request.runtime ?? requestedMember.runtime;
        const session = requestedMember?.session ?? pickRuntimeSession(group, runtime, view);
        if (!session) {
            throw new Error(describeMissingRuntime(group, runtime));
        }
        return { runtime: runtime, session: session };
    }
    if (request.preferStopped !== false && view.getStatus(group.primary.id) !== 'stopped') {
        for (const runtime of group.runtimes.map((descriptor) => descriptor.id).filter((id) => id !== group.primaryRuntime)) {
            const session = pickRuntimeSession(group, runtime, view);
            if (session && view.getStatus(session.id) === 'stopped') {
                return { runtime: runtime, session: session };
            }
        }
    }
    return primary;
}

export function getGroupSessions<TSession extends SessionRef>(group: GroupRef<TSession>): TSession[] {
    return group.members.map((member) => member.session);
}

function describeMissingRuntime(group: GroupRef<SessionRef>, runtime: string): string {
    const declared = group.runtimes.some((descriptor) => descriptor.id === runtime);
    const hasUnclassifiedMember = group.members.some((member) => !member.runtime);
    if (declared && hasUnclassifiedMember) {
        return `The ${runtime} runtime has no debug target yet (its session has not started). Try again shortly.`;
    }
    const present = [...new Set(group.members.map((member) => member.runtime).filter((id) => !!id))];
    return `This debug group has no ${runtime} runtime; it has: ${present.join(', ')}. Use one of those runtimes.`;
}

export type RuntimeStatus = 'running' | 'stopped' | 'terminated' | 'untracked';

export interface SessionRef {
    id: string;
}

export interface GroupMemberRef<TSession extends SessionRef> {
    session: TSession;
    /** Absent for a session that belongs to the group without being a runtime of its own. */
    runtime?: string;
}

export interface GroupRef<TSession extends SessionRef> {
    /** The session that owns the group; its id is the group id. */
    primary: TSession;
    primaryRuntime: string;
    /** The runtimes the group's integration declares, primary first. */
    runtimes: Array<{ id: string }>;
    members: Array<GroupMemberRef<TSession>>;
}

export interface RuntimeStateView {
    getStatus(sessionId: string): RuntimeStatus;
    /** Orders stops across sessions; 0 when the session never stopped. */
    getLastStopSequence(sessionId: string): number;
}

export interface RuntimeTarget<TSession extends SessionRef> {
    runtime: string;
    session: TSession;
}
