import type * as vscode from 'vscode';
import type { DebugMcpRegistry, RuntimeDescriptor } from './integration';

/**
 * The live debug sessions arranged into groups by the registered integrations. A group exists
 * while its primary session (the one whose id is the group id) is live.
 */
export class SessionDirectory {
    constructor(
        private readonly registry: DebugMcpRegistry,
        private readonly source: SessionSource
    ) { }

    public get sessions(): vscode.DebugSession[] {
        return this.source.getSessions();
    }

    public get groups(): DebugSessionGroup[] {
        const sessions = this.sessions;
        const classified = sessions.map((session) => ({ session: session, classification: this.registry.classify(session) }));
        const groups: DebugSessionGroup[] = [];
        for (const { session, classification } of classified) {
            if (!classification || classification.groupId !== session.id) {
                continue;
            }
            const members: GroupMember[] = classified
                .filter((candidate) => candidate.classification?.groupId === session.id)
                .map((candidate) => ({ session: candidate.session, runtime: candidate.classification.runtime }));
            const runtimes = classification.integration.runtimes;
            groups.push({
                id: session.id,
                primary: session,
                primaryRuntime: classification.runtime ?? runtimes[0].id,
                runtimes: runtimes,
                members: members
            });
        }
        return groups;
    }

    /**
     * The group the user is currently in, resolved from the active session whichever member of
     * the group it is. Falls back to the sole running group when nothing relevant is active.
     */
    public get activeGroup(): DebugSessionGroup | undefined {
        const groups = this.groups;
        const active = this.source.getActiveSession();
        if (active) {
            const match = groups.find((group) => group.members.some((member) => member.session.id === active.id));
            if (match) {
                return match;
            }
        }
        return groups.length === 1 ? groups[0] : undefined;
    }
}

/** What the core needs from the host to follow debug sessions. */
export interface SessionSource {
    getSessions(): vscode.DebugSession[];
    getActiveSession(): vscode.DebugSession | undefined;
    /** Fires after a session is added to `getSessions`. */
    onDidStartSession: vscode.Event<vscode.DebugSession>;
    /** Fires after a session is removed from `getSessions`. */
    onDidTerminateSession: vscode.Event<vscode.DebugSession>;
}

export interface DebugSessionGroup {
    /** Id of the primary session. */
    id: string;
    /** The session that owns the group: what start, stop and restart act on. */
    primary: vscode.DebugSession;
    primaryRuntime: string;
    /** The runtimes the group's integration declares, primary first. */
    runtimes: RuntimeDescriptor[];
    /** Every live session of the group, the primary included. */
    members: GroupMember[];
}

export interface GroupMember {
    session: vscode.DebugSession;
    /** Absent for a session that belongs to the group without being a runtime of its own. */
    runtime?: string;
}

/** The part of `SessionDirectory` the tools read. */
export type SessionDirectoryView = Pick<SessionDirectory, 'sessions' | 'groups' | 'activeGroup'>;
