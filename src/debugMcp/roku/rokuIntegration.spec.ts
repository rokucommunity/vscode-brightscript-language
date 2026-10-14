import { expect } from 'chai';
import { createStateTrackerFactory } from '../core/debugTracker';
import { DebugStateStore } from '../core/debugStateStore';
import { DebugMcpRegistry } from '../core/integration';
import type { DebugSessionInfo } from '../core/integration';
import { SessionDirectory } from '../core/sessionDirectory';
import { classifyRokuSession, createRokuDebugIntegration } from './rokuIntegration';

function makeSession(id: string, type: string, extra: Partial<DebugSessionInfo> = {}): DebugSessionInfo {
    return { id: id, type: type, customRequest: () => Promise.resolve({}), ...extra };
}

const jsParent = makeSession('node1', 'node', { configuration: { _isBrightscriptJsSession: true, _brightscriptParentSessionId: 'brs1', continueOnAttach: true } });

describe('Roku debug integration', () => {
    let registry: DebugMcpRegistry;
    let store: DebugStateStore;

    beforeEach(() => {
        registry = new DebugMcpRegistry();
        registry.registerDebugIntegration(createRokuDebugIntegration());
        store = new DebugStateStore({ ownsFile: (filePath) => registry.ownsFile(filePath) });
    });

    afterEach(() => store.dispose());

    describe('classifySession', () => {
        it('classifies BrightScript sessions, the JS attach session, and the pwa-node descendants of the attach session', () => {
            expect(classifyRokuSession(makeSession('a', 'brightscript'))).to.eql({ groupId: 'a', runtime: 'brs' });
            expect(classifyRokuSession(jsParent)).to.eql({ groupId: 'brs1' });
            const child = makeSession('child', 'pwa-node', { parentSession: jsParent });
            expect(classifyRokuSession(child)).to.eql({ groupId: 'brs1', runtime: 'js' });
            expect(classifyRokuSession(makeSession('grandchild', 'pwa-node', { parentSession: child }))).to.eql({ groupId: 'brs1', runtime: 'js' });
        });

        it('leaves out node sessions that are not part of a BrightScript launch', () => {
            expect(classifyRokuSession(makeSession('c', 'pwa-node', { parentSession: makeSession('p', 'node', { configuration: {} }) }))).to.be.undefined;
            expect(classifyRokuSession(makeSession('d', 'pwa-node'))).to.be.undefined;
            expect(classifyRokuSession(makeSession('e', 'node', { configuration: { _isBrightscriptJsSession: true } }))).to.be.undefined;
        });
    });

    describe('registry behavior with the Roku integration', () => {
        it('ignores node sessions of other launches and other debug types', () => {
            expect(registry.classify(makeSession('d', 'pwa-node'))).to.be.undefined;
            expect(registry.classify(makeSession('py', 'python'))).to.be.undefined;
            expect(registry.classify(makeSession('brs1', 'brightscript'))).to.include({ groupId: 'brs1', runtime: 'brs' });
        });

        it('lets a python session coexist with a Roku launch without affecting groups, the active group or tracking', () => {
            const brightScript = makeSession('brs1', 'brightscript');
            const python = makeSession('py', 'python');
            const directory = new SessionDirectory(registry, {
                getSessions: () => [brightScript, python] as any[],
                getActiveSession: () => python as any,
                onDidStartSession: (() => ({ dispose: () => { } })) as any,
                onDidTerminateSession: (() => ({ dispose: () => { } })) as any
            });
            expect(directory.groups.map((group) => group.id)).to.eql(['brs1']);
            expect(directory.activeGroup.id).to.equal('brs1');
            expect(createStateTrackerFactory(store, registry, () => { }).createDebugAdapterTracker(python)).to.be.undefined;
            expect(registry.getDeclaredRuntimes().map((runtime) => runtime.id)).to.eql(['brs', 'js']);
        });

        it('owns BrightScript, Brighterscript and XML files for the brs runtime only', () => {
            expect(registry.ownsFile('/p/source/main.brs')).to.equal('brs');
            expect(registry.ownsFile('/p/source/main.BS')).to.equal('brs');
            expect(registry.ownsFile('/p/components/Scene.xml')).to.equal('brs');
            expect(registry.ownsFile('/p/src/Scene.tsx')).to.be.undefined;
        });

        it('settles a BrightScript file on the brs answer alone', () => {
            store.trackSession('brs1', 'brs', { groupId: 'brs1' });
            store.trackSession('js1', 'js', { groupId: 'brs1' });
            const file = '/projects/app/source/main.brs';
            const request = { type: 'request', seq: 1, command: 'setBreakpoints', arguments: { source: { path: file }, breakpoints: [{ line: 7 }] } };
            store.handleRequest('js1', request);
            store.handleMessage('js1', { type: 'response', 'request_seq': 1, command: 'setBreakpoints', success: true, body: { breakpoints: [{ verified: false }] } });
            expect(store.breakpoints.isSettled(file, 7, 0)).to.be.false;
            store.handleRequest('brs1', request);
            store.handleMessage('brs1', { type: 'response', 'request_seq': 1, command: 'setBreakpoints', success: true, body: { breakpoints: [{ verified: true, line: 7 }] } });
            expect(store.breakpoints.isSettled(file, 7, 0)).to.be.true;
        });

        it('groups a launch from the sessions the extension tracks', () => {
            const brightScript = makeSession('brs1', 'brightscript');
            const child = makeSession('child', 'pwa-node', { parentSession: jsParent });
            const unrelated = makeSession('py', 'python');
            const directory = new SessionDirectory(registry, {
                getSessions: () => [brightScript, jsParent, child, unrelated] as any[],
                getActiveSession: () => child as any,
                onDidStartSession: (() => ({ dispose: () => { } })) as any,
                onDidTerminateSession: (() => ({ dispose: () => { } })) as any
            });
            const groups = directory.groups;
            expect(groups.map((group) => group.id)).to.eql(['brs1']);
            expect(groups[0].primaryRuntime).to.equal('brs');
            expect(groups[0].runtimes.map((runtime) => runtime.id)).to.eql(['brs', 'js']);
            expect(groups[0].members.map((member) => [member.session.id, member.runtime])).to.eql([['brs1', 'brs'], ['node1', undefined], ['child', 'js']]);
            expect(directory.activeGroup.id).to.equal('brs1');
        });
    });

    describe('stop filtering through the tracker', () => {
        function createChild(id: string, parent: DebugSessionInfo, frames: any[]) {
            return makeSession(id, 'pwa-node', {
                parentSession: parent,
                customRequest: (command) => Promise.resolve(command === 'stackTrace' ? { stackFrames: frames } : { threads: [{ id: 3, name: 't' }] })
            });
        }

        it('feeds BrightScript stops through without judging them', () => {
            const tracker = createStateTrackerFactory(store, registry, () => { }).createDebugAdapterTracker(makeSession('brs1', 'brightscript'));
            tracker.onDidSendMessage({ type: 'event', event: 'stopped', body: { reason: 'pause', threadId: 1 } });
            expect(store.getStatus('brs1')).to.equal('stopped');
        });

        it('reports a JS stop whose stack has a source frame, on the tracked session, in the launch group', async () => {
            const child = createChild('child', jsParent, [{ id: 1, name: 'f', line: 1, column: 1, source: { path: '/p/a' } }]);
            const tracker = createStateTrackerFactory(store, registry, () => { }).createDebugAdapterTracker(child);
            const wait = store.waitForStop({ groupId: 'brs1', runtime: 'js', timeoutMs: 1000 });
            tracker.onDidSendMessage({ type: 'event', event: 'stopped', body: { reason: 'breakpoint' } });
            const result: any = await wait.promise;
            expect(result).to.include({ kind: 'stopped', sessionId: 'child' });
            expect(result.stop.threadId).to.equal(3);
        });

        it('hides the source-less pause a JS session makes on attach', async () => {
            const child = createChild('child', jsParent, [{ id: 1, name: '(anonymous)', line: 1, column: 1 }]);
            const tracker = createStateTrackerFactory(store, registry, () => { }).createDebugAdapterTracker(child);
            const wait = store.waitForStop({ groupId: 'brs1', runtime: 'js', timeoutMs: 40 });
            tracker.onDidSendMessage({ type: 'event', event: 'stopped', body: { reason: 'pause', threadId: 1 } });
            expect((await wait.promise).kind).to.equal('timeout');
            expect(store.getStatus('child')).to.equal('running');
        });

        it('reports the attach pause as an entry stop when the attach was configured with stopOnEntry', async () => {
            const stopOnEntryParent = makeSession('node2', 'node', { configuration: { _isBrightscriptJsSession: true, _brightscriptParentSessionId: 'brs2', continueOnAttach: false } });
            const child = createChild('child2', stopOnEntryParent, [{ id: 1, name: '(anonymous)', line: 1, column: 1 }]);
            const tracker = createStateTrackerFactory(store, registry, () => { }).createDebugAdapterTracker(child);
            const wait = store.waitForStop({ groupId: 'brs2', runtime: 'js', timeoutMs: 1000 });
            tracker.onDidSendMessage({ type: 'event', event: 'stopped', body: { reason: 'pause', threadId: 1 } });
            expect((await wait.promise as any).stop.reason).to.equal('entry');
        });

        it('reports the stop when the stack cannot be read', async () => {
            const child = makeSession('child', 'pwa-node', { parentSession: jsParent, customRequest: () => Promise.reject(new Error('boom')) });
            const tracker = createStateTrackerFactory(store, registry, () => { }).createDebugAdapterTracker(child);
            tracker.onDidSendMessage({ type: 'event', event: 'stopped', body: { reason: 'exception', threadId: 2 } });
            await new Promise((resolve) => {
                setTimeout(resolve, 0);
            });
            expect(store.getStatus('child')).to.equal('stopped');
        });
    });
});
