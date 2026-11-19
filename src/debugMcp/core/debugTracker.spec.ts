import { expect } from 'chai';
import { createStateTrackerFactory } from './debugTracker';
import { DebugStateStore } from './debugStateStore';
import { DEBUG_MCP_API_VERSION, DebugMcpRegistry } from './integration';
import type { DebugIntegration, DebugSessionInfo } from './integration';

function makeSession(id: string, type: string, extra: Partial<DebugSessionInfo> = {}): DebugSessionInfo {
    return { id: id, type: type, customRequest: () => Promise.resolve({}), ...extra };
}

describe('debugTracker', () => {
    let store: DebugStateStore;
    let registry: DebugMcpRegistry;

    beforeEach(() => {
        store = new DebugStateStore();
        registry = new DebugMcpRegistry({ enableDefaultIntegration: true });
    });

    afterEach(() => store.dispose());

    it('tracks every session as its own group with the default integration enabled and no integration registered', async () => {
        const tracker = createStateTrackerFactory(store, registry, () => { }).createDebugAdapterTracker(makeSession('py1', 'python'));
        tracker.onDidSendMessage({ type: 'event', event: 'stopped', body: { reason: 'breakpoint', threadId: 1 } });
        expect(store.getStatus('py1')).to.equal('stopped');
        expect(store.getRuntime('py1')).to.equal('python');
        expect(await store.waitForStop({ groupId: 'py1', timeoutMs: 10 }).promise).to.include({ kind: 'stopped', alreadyStopped: true });
    });

    it('feeds a store from the tracker callbacks and survives store errors', () => {
        const logged: string[] = [];
        const factory = createStateTrackerFactory(store, registry, (message) => logged.push(message));
        const tracker = factory.createDebugAdapterTracker(makeSession('brs1', 'brightscript'));
        tracker.onDidSendMessage({ type: 'event', event: 'stopped', body: { reason: 'pause', threadId: 1 } });
        expect(store.getStatus('brs1')).to.equal('stopped');
        tracker.onExit();
        expect(store.getStatus('brs1')).to.equal('terminated');

        (store as any).handleMessage = () => {
            throw new Error('boom');
        };
        tracker.onDidSendMessage({});
        expect(logged[0]).to.contain('boom');
    });

    it('tracks sessions with the runtime and group the integration chose, and skips sessions it leaves out', () => {
        registry.registerDebugIntegration(createFakeIntegration());
        const factory = createStateTrackerFactory(store, registry, () => { });
        expect(factory.createDebugAdapterTracker(makeSession('worker', 'fake-worker', { parentSession: makeSession('main', 'fake') }))).to.not.be.undefined;
        expect(store.getRuntime('worker')).to.equal('secondary');
        expect(factory.createDebugAdapterTracker(makeSession('member', 'fake-member'))).to.be.undefined;
        expect(factory.createDebugAdapterTracker(makeSession('stray', 'fake-stray'))).to.be.undefined;
        expect(store.hasSession('member')).to.be.false;
        expect(store.getRuntime('stray')).to.be.undefined;
    });

    it('judges stops of the session through the integration hook, handing it the stack of the stopped thread', async () => {
        const seen: Array<{ runtime: string; groupId: string; reason: string; framesSeen: number }> = [];
        registry.registerDebugIntegration(createFakeIntegration(async (context) => {
            const stack = await context.fetchStack();
            seen.push({ runtime: context.runtime, groupId: context.groupId, reason: context.stop.reason, framesSeen: stack.frames.length });
            return stack.frames.length > 0;
        }));
        const requests: string[] = [];
        const worker = makeSession('worker', 'fake-worker', {
            parentSession: makeSession('main', 'fake'),
            customRequest: (command) => {
                requests.push(command);
                return Promise.resolve(command === 'stackTrace' ? { stackFrames: [{ id: 1, name: 'f', line: 1, column: 1, source: { path: '/p/a' } }] } : { threads: [{ id: 3, name: 't' }] });
            }
        });
        const tracker = createStateTrackerFactory(store, registry, () => { }).createDebugAdapterTracker(worker);
        const wait = store.waitForStop({ groupId: 'main', runtime: 'secondary', timeoutMs: 1000 });
        tracker.onDidSendMessage({ type: 'event', event: 'stopped', body: { reason: 'breakpoint' } });
        const result: any = await wait.promise;
        expect(result).to.include({ kind: 'stopped', sessionId: 'worker' });
        expect(result.stop.threadId).to.equal(3);
        expect(requests).to.eql(['threads', 'stackTrace']);
        expect(seen).to.eql([{ runtime: 'secondary', groupId: 'main', reason: 'breakpoint', framesSeen: 1 }]);
    });
});

/** Sessions of type `fake` own a group, `fake-worker` sessions join it as the secondary runtime, `fake-member` sessions join without a runtime. */
function createFakeIntegration(shouldReportStop?: DebugIntegration['shouldReportStop']): DebugIntegration {
    return {
        apiVersion: DEBUG_MCP_API_VERSION,
        id: 'fake',
        debugTypes: ['fake', 'fake-worker', 'fake-member', 'fake-stray'],
        runtimes: [{ id: 'primary', description: 'the primary runtime' }, { id: 'secondary', description: 'the secondary runtime' }],
        classifySession: (session) => {
            switch (session.type) {
                case 'fake':
                    return { groupId: session.id, runtime: 'primary' };
                case 'fake-worker':
                    return { groupId: session.parentSession.id, runtime: 'secondary' };
                case 'fake-member':
                    return { groupId: 'main' };
                default:
                    return undefined;
            }
        },
        shouldReportStop: shouldReportStop
    };
}
