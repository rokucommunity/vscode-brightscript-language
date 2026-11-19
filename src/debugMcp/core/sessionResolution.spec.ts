import { expect } from 'chai';
import { findGroup, NO_ACTIVE_SESSION_MESSAGE, pickRuntimeSession, resolveGroup, resolveRuntimeTarget } from './sessionResolution';
import type { RuntimeStateView, RuntimeStatus } from './sessionResolution';

function session(id: string) {
    return { id: id };
}

/** A group whose primary runtime is "brs" with an optional attach session and secondary "js" sessions, like the shape an integration produces. */
function makeGroup(primaryId: string, secondaryIds: string[] = [], hasAttachSession = secondaryIds.length > 0) {
    return {
        primary: session(primaryId),
        primaryRuntime: 'brs',
        runtimes: [{ id: 'brs' }, { id: 'js' }],
        members: [
            { session: session(primaryId), runtime: 'brs' },
            ...(hasAttachSession ? [{ session: session(`${primaryId}-attach`) }] : []),
            ...secondaryIds.map((id) => ({ session: session(id), runtime: 'js' }))
        ]
    };
}

function makeView(statuses: Record<string, RuntimeStatus> = {}, sequences: Record<string, number> = {}): RuntimeStateView {
    return {
        getStatus: (sessionId) => statuses[sessionId] ?? 'running',
        getLastStopSequence: (sessionId) => sequences[sessionId] ?? 0
    };
}

describe('sessionResolution', () => {
    describe('resolveGroup', () => {
        it('resolves any member session to its group', () => {
            const first = makeGroup('brs1', ['child1']);
            const second = makeGroup('brs2');
            expect(resolveGroup([first, second], undefined, 'child1')).to.equal(first);
            expect(resolveGroup([first, second], undefined, 'brs1-attach')).to.equal(first);
            expect(findGroup([first, second], 'brs2')).to.equal(second);
        });

        it('defaults to the active group', () => {
            const group = makeGroup('brs1');
            expect(resolveGroup([group], group)).to.equal(group);
        });

        it('explains when nothing is running, the id is unknown, or the choice is ambiguous', () => {
            expect(() => resolveGroup([], undefined)).to.throw(NO_ACTIVE_SESSION_MESSAGE);
            expect(() => resolveGroup([makeGroup('brs1')], undefined, 'nope')).to.throw('No debug session with id \'nope\'');
            expect(() => resolveGroup([makeGroup('brs1'), makeGroup('brs2')], undefined)).to.throw('Pass sessionId');
        });
    });

    describe('pickRuntimeSession', () => {
        it('prefers the session that stopped most recently, else the first', () => {
            const group = makeGroup('brs1', ['child1', 'child2']);
            expect(pickRuntimeSession(group, 'js', makeView()).id).to.equal('child1');
            expect(pickRuntimeSession(group, 'js', makeView({}, { child1: 3, child2: 7 })).id).to.equal('child2');
        });

        it('is undefined when the runtime has no session yet', () => {
            expect(pickRuntimeSession(makeGroup('brs1', [], true), 'js', makeView())).to.be.undefined;
        });
    });

    describe('resolveRuntimeTarget', () => {
        it('honors an explicit runtime', () => {
            const group = makeGroup('brs1', ['child1']);
            expect(resolveRuntimeTarget(group, makeView(), { runtime: 'js' })).to.eql({ runtime: 'js', session: session('child1') });
            expect(resolveRuntimeTarget(group, makeView({ child1: 'stopped' }), { runtime: 'brs' }).runtime).to.equal('brs');
        });

        it('errors clearly when the requested runtime is absent, pending, or unknown', () => {
            expect(() => resolveRuntimeTarget(makeGroup('brs1'), makeView(), { runtime: 'js' })).to.throw('no js runtime; it has: brs');
            expect(() => resolveRuntimeTarget(makeGroup('brs1', [], true), makeView(), { runtime: 'js' })).to.throw('no debug target yet');
            expect(() => resolveRuntimeTarget(makeGroup('brs1'), makeView(), { runtime: 'other' })).to.throw('no other runtime');
        });

        it('defaults to the one stopped non-primary runtime, else the primary runtime', () => {
            const group = makeGroup('brs1', ['child1']);
            expect(resolveRuntimeTarget(group, makeView({ child1: 'stopped' }), {}).runtime).to.equal('js');
            expect(resolveRuntimeTarget(group, makeView({ brs1: 'stopped' }), {}).runtime).to.equal('brs');
            expect(resolveRuntimeTarget(group, makeView({ brs1: 'stopped', child1: 'stopped' }), {}).runtime).to.equal('brs');
            expect(resolveRuntimeTarget(group, makeView(), {}).runtime).to.equal('brs');
        });

        it('skips the stopped-runtime default when asked', () => {
            const group = makeGroup('brs1', ['child1']);
            expect(resolveRuntimeTarget(group, makeView({ child1: 'stopped' }), { preferStopped: false }).runtime).to.equal('brs');
        });

        it('selects the session named by sessionId when runtime is omitted', () => {
            const group = makeGroup('brs1', ['child1', 'child2']);
            expect(resolveRuntimeTarget(group, makeView(), { sessionId: 'child2' })).to.eql({ runtime: 'js', session: session('child2') });
        });

        it('targets the only session of a single-runtime group', () => {
            const group = { primary: session('node1'), primaryRuntime: 'node', runtimes: [{ id: 'node' }], members: [{ session: session('node1'), runtime: 'node' }] };
            expect(resolveRuntimeTarget(group, makeView(), {})).to.eql({ runtime: 'node', session: session('node1') });
            expect(() => resolveRuntimeTarget(group, makeView(), { runtime: 'js' })).to.throw('has: node');
        });
    });
});
