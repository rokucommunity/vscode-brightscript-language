import { expect } from 'chai';
import { DebugStateStore } from './debugStateStore';
import type { DebugStateStoreOptions } from './debugStateStore';

const stopped = (threadId = 1, reason = 'breakpoint') => ({ type: 'event', event: 'stopped', body: { reason: reason, threadId: threadId } });
const continued = { type: 'event', event: 'continued', body: { threadId: 1 } };
const request = (command: string, seq: number) => ({ type: 'request', seq: seq, command: command, arguments: {} });

async function flush() {
    await new Promise((resolve) => {
        setTimeout(resolve, 0);
    });
}

describe('DebugStateStore', () => {
    let store: DebugStateStore;

    function createStore(options: DebugStateStoreOptions = {}) {
        store = new DebugStateStore(options);
        store.trackSession('brs1', 'brs', { groupId: 'brs1' });
        return store;
    }

    afterEach(() => store?.dispose());

    describe('stop state', () => {
        it('tracks stopped and continued events', () => {
            createStore();
            expect(store.getStatus('brs1')).to.equal('running');
            store.handleMessage('brs1', stopped(3, 'step'));
            expect(store.getStatus('brs1')).to.equal('stopped');
            expect(store.getStop('brs1')).to.include({ reason: 'step', threadId: 3 });
            store.handleMessage('brs1', continued);
            expect(store.getStatus('brs1')).to.equal('running');
            expect(store.getStop('brs1')).to.be.undefined;
            expect(store.getLastThreadId('brs1')).to.equal(3);
        });

        it('reports untracked sessions', () => {
            createStore();
            expect(store.getStatus('nope')).to.equal('untracked');
        });

        it('marks a session running as soon as a resume request is sent, and restores it when the request fails', () => {
            createStore();
            store.handleMessage('brs1', stopped());
            store.handleRequest('brs1', request('next', 5));
            expect(store.getStatus('brs1')).to.equal('running');
            store.handleMessage('brs1', { type: 'response', 'request_seq': 5, command: 'next', success: false });
            expect(store.getStatus('brs1')).to.equal('stopped');
        });

        it('does not restore a stop after a newer stop arrived', () => {
            createStore();
            store.handleMessage('brs1', stopped(1));
            store.handleRequest('brs1', request('next', 5));
            store.handleMessage('brs1', stopped(1, 'step'));
            store.handleMessage('brs1', { type: 'response', 'request_seq': 5, command: 'next', success: false });
            expect(store.getStop('brs1').reason).to.equal('step');
        });

        it('remembers thread ids from threads responses', () => {
            createStore();
            store.handleMessage('brs1', { type: 'response', 'request_seq': 1, command: 'threads', success: true, body: { threads: [{ id: 9, name: 'main' }] } });
            expect(store.getLastThreadId('brs1')).to.equal(9);
        });
    });

    describe('waitForStop', () => {
        it('resolves immediately with alreadyStopped when a session is stopped', async () => {
            createStore();
            store.handleMessage('brs1', stopped(2));
            const result = await store.waitForStop({ groupId: 'brs1', runtime: 'brs', timeoutMs: 1000 }).promise;
            expect(result).to.include({ kind: 'stopped', alreadyStopped: true, sessionId: 'brs1', runtime: 'brs' });
        });

        it('resolves on the next stop', async () => {
            createStore();
            const wait = store.waitForStop({ groupId: 'brs1', runtime: 'brs', timeoutMs: 1000 });
            store.handleMessage('brs1', stopped(4, 'breakpoint'));
            const result = await wait.promise;
            expect(result).to.include({ kind: 'stopped', alreadyStopped: false });
            expect((result as any).stop).to.include({ reason: 'breakpoint', threadId: 4 });
        });

        it('with onlyNewStops ignores a stop that already happened', async () => {
            createStore();
            store.handleMessage('brs1', stopped(1));
            const wait = store.waitForStop({ groupId: 'brs1', runtime: 'brs', timeoutMs: 20, onlyNewStops: true });
            expect((await wait.promise).kind).to.equal('timeout');
        });

        it('with onlyNewStops resolves on a stop that follows a resume', async () => {
            createStore();
            store.handleMessage('brs1', stopped(1));
            const wait = store.waitForStop({ groupId: 'brs1', runtime: 'brs', timeoutMs: 1000, onlyNewStops: true });
            store.handleRequest('brs1', request('next', 2));
            store.handleMessage('brs1', stopped(1, 'step'));
            expect(await wait.promise).to.include({ kind: 'stopped', alreadyStopped: false });
        });

        it('times out', async () => {
            createStore();
            expect((await store.waitForStop({ groupId: 'brs1', runtime: 'brs', timeoutMs: 10 }).promise).kind).to.equal('timeout');
        });

        it('resolves as terminated when the BrightScript session ends', async () => {
            createStore();
            store.trackSession('js1', 'js', { groupId: 'brs1' });
            const wait = store.waitForStop({ groupId: 'brs1', timeoutMs: 1000 });
            store.handleMessage('brs1', { type: 'event', event: 'terminated' });
            expect(await wait.promise).to.include({ kind: 'terminated', sessionId: 'brs1', runtime: 'brs' });
        });

        it('resolves as terminated when every watched JS session ended, but not before', async () => {
            createStore();
            store.trackSession('js1', 'js', { groupId: 'brs1' });
            store.trackSession('js2', 'js', { groupId: 'brs1' });
            const wait = store.waitForStop({ groupId: 'brs1', runtime: 'js', timeoutMs: 1000 });
            store.handleSessionEnded('js1');
            store.handleMessage('js2', stopped());
            expect((await wait.promise).kind).to.equal('stopped');
            store.handleSessionEnded('js2');
            expect((await store.waitForStop({ groupId: 'brs1', runtime: 'js', timeoutMs: 1000 }).promise).kind).to.equal('terminated');
        });

        it('resolves a wait on an already ended session as terminated', async () => {
            createStore();
            store.handleSessionEnded('brs1');
            expect((await store.waitForStop({ groupId: 'brs1', runtime: 'brs', timeoutMs: 1000 }).promise).kind).to.equal('terminated');
        });

        it('watches sessions that join the group after the wait started', async () => {
            createStore();
            const wait = store.waitForStop({ groupId: 'brs1', runtime: 'js', timeoutMs: 1000 });
            store.trackSession('js9', 'js', { groupId: 'brs1' });
            store.handleMessage('js9', stopped(5));
            expect(await wait.promise).to.include({ kind: 'stopped', sessionId: 'js9', runtime: 'js' });
        });

        it('ignores stops in other groups and in the other runtime', async () => {
            createStore();
            store.trackSession('brs2', 'brs', { groupId: 'brs2' });
            const wait = store.waitForStop({ groupId: 'brs1', runtime: 'js', timeoutMs: 30 });
            store.handleMessage('brs2', stopped());
            store.handleMessage('brs1', stopped());
            expect((await wait.promise).kind).to.equal('timeout');
        });

        it('is cancelled by an abort signal', async () => {
            createStore();
            const controller = new AbortController();
            const wait = store.waitForStop({ groupId: 'brs1', timeoutMs: 1000, signal: controller.signal });
            controller.abort();
            expect((await wait.promise).kind).to.equal('cancelled');
        });

        it('can be cancelled and is released on dispose', async () => {
            createStore();
            const cancelled = store.waitForStop({ groupId: 'brs1', runtime: 'brs', timeoutMs: 1000 });
            cancelled.cancel();
            expect((await cancelled.promise).kind).to.equal('cancelled');
            const pending = store.waitForStop({ groupId: 'brs1', runtime: 'brs', timeoutMs: 1000 });
            store.dispose();
            expect((await pending.promise).kind).to.equal('cancelled');
        });

        it('rejects when none of the sessions is tracked', () => {
            createStore();
            expect(() => store.waitForStop({ groupId: 'unknown', timeoutMs: 10 })).to.throw('Stop tracking is not available');
        });
    });

    describe('stop judgement', () => {
        const sourceFrame = { id: 1, name: 'f', line: 1, column: 1, file: '/proj/a' };
        const sourcelessFrame = { id: 2, name: 'g', line: 1, column: 1 };

        /** Hides a stop whose stack has no frame with a source, or reports it as "entry" when `entry` is set. */
        function trackJudged(options: { frames: Array<typeof sourceFrame | typeof sourcelessFrame>; entry?: boolean; fetchedThreadIds?: Array<number | undefined> }) {
            createStore();
            store.trackSession('js1', 'js', {
                groupId: 'brs1',
                fetchStackFrames: (threadId) => {
                    options.fetchedThreadIds?.push(threadId);
                    return Promise.resolve({ threadId: 7, frames: options.frames as any });
                },
                shouldReportStop: async (_stop, fetchStack) => {
                    const stack = await fetchStack();
                    if (stack.frames.some((frame) => !!frame.file)) {
                        return true;
                    }
                    return options.entry ? 'entry' : false;
                }
            });
        }

        it('does not report a stop the hook hides, and reads as running meanwhile', async () => {
            trackJudged({ frames: [sourcelessFrame] });
            const wait = store.waitForStop({ groupId: 'brs1', runtime: 'js', timeoutMs: 30 });
            store.handleMessage('js1', stopped(1, 'pause'));
            expect(store.getStatus('js1')).to.equal('running');
            await flush();
            expect(store.getStatus('js1')).to.equal('running');
            expect((await wait.promise).kind).to.equal('timeout');
        });

        it('reports a real stop that follows a hidden one', async () => {
            const frameSets = [[sourcelessFrame], [sourceFrame]];
            createStore();
            store.trackSession('js1', 'js', {
                groupId: 'brs1',
                fetchStackFrames: () => Promise.resolve({ threadId: 1, frames: frameSets.shift() as any }),
                shouldReportStop: async (_stop, fetchStack) => (await fetchStack()).frames.some((frame) => !!frame.file)
            });
            const wait = store.waitForStop({ groupId: 'brs1', runtime: 'js', timeoutMs: 1000 });
            store.handleMessage('js1', stopped(1, 'pause'));
            await flush();
            store.handleMessage('js1', continued);
            store.handleMessage('js1', stopped(1, 'breakpoint'));
            const result: any = await wait.promise;
            expect(result.kind).to.equal('stopped');
            expect(result.stop.reason).to.equal('breakpoint');
        });

        it('fills in a missing thread id from the stack the hook read', async () => {
            trackJudged({ frames: [sourcelessFrame, sourceFrame] });
            const wait = store.waitForStop({ groupId: 'brs1', runtime: 'js', timeoutMs: 1000 });
            store.handleMessage('js1', { type: 'event', event: 'stopped', body: { reason: 'breakpoint' } });
            const result: any = await wait.promise;
            expect(result.stop.threadId).to.equal(7);
            expect(store.getStatus('js1')).to.equal('stopped');
        });

        it('drops a judgement that finishes after the runtime continued', async () => {
            trackJudged({ frames: [sourceFrame] });
            store.handleMessage('js1', stopped(1));
            store.handleMessage('js1', continued);
            await flush();
            expect(store.getStatus('js1')).to.equal('running');
        });

        it('reports the stop when the judgement fails', async () => {
            createStore();
            store.trackSession('js1', 'js', { groupId: 'brs1', shouldReportStop: () => Promise.reject(new Error('boom')) });
            store.handleMessage('js1', stopped(2));
            await flush();
            expect(store.getStatus('js1')).to.equal('stopped');
            store.trackSession('js2', 'js', {
                groupId: 'brs1', shouldReportStop: () => {
                    throw new Error('boom');
                }
            });
            store.handleMessage('js2', stopped(2));
            expect(store.getStatus('js2')).to.equal('stopped');
        });

        it('reports a stop as an entry stop when the hook answers "entry"', async () => {
            trackJudged({ frames: [sourcelessFrame], entry: true });
            const wait = store.waitForStop({ groupId: 'brs1', runtime: 'js', timeoutMs: 1000 });
            store.handleMessage('js1', stopped(1, 'pause'));
            const result: any = await wait.promise;
            expect(result.kind).to.equal('stopped');
            expect(result.stop.reason).to.equal('entry');
        });

        it('applies a synchronous judgement at once and leaves sessions without a hook alone', () => {
            createStore();
            store.trackSession('js1', 'js', { groupId: 'brs1', shouldReportStop: () => false });
            store.handleMessage('js1', stopped());
            expect(store.getStatus('js1')).to.equal('running');
            store.trackSession('js2', 'js', { groupId: 'brs1', shouldReportStop: () => true });
            store.handleMessage('js2', stopped());
            expect(store.getStatus('js2')).to.equal('stopped');
            store.handleMessage('brs1', stopped());
            expect(store.getStatus('brs1')).to.equal('stopped');
        });
    });

    describe('restart', () => {
        it('treats a restart request like a resume', () => {
            createStore();
            store.handleMessage('brs1', stopped());
            store.handleRequest('brs1', request('restart', 3));
            expect(store.getStatus('brs1')).to.equal('running');
            expect(store.getStop('brs1')).to.be.undefined;
        });

        it('drops a JS stop check that is still in flight', async () => {
            createStore();
            store.trackSession('js1', 'js', { groupId: 'brs1', shouldReportStop: () => Promise.resolve(true) });
            store.handleMessage('js1', stopped());
            store.handleRequest('js1', request('restart', 3));
            await flush();
            expect(store.getStatus('js1')).to.equal('running');
        });
    });

    describe('output', () => {
        it('captures output events per session and skips telemetry', () => {
            createStore();
            store.handleMessage('brs1', { type: 'event', event: 'output', body: { category: 'stdout', output: 'hello\nworld\n' } });
            store.handleMessage('brs1', { type: 'event', event: 'output', body: { category: 'telemetry', output: 'x' } });
            store.handleMessage('brs1', { type: 'event', event: 'output', body: { output: 'no category' } });
            const result = store.readOutput('brs1', { maxLines: 10 });
            expect(result.lines.map((line) => [line.category, line.text])).to.eql([['stdout', 'hello'], ['stdout', 'world'], ['console', 'no category']]);
            expect(store.readOutput('nope', { maxLines: 10 })).to.be.undefined;
        });

        it('keeps output of an ended session readable', () => {
            createStore();
            store.handleMessage('brs1', { type: 'event', event: 'output', body: { category: 'stdout', output: 'last words\n' } });
            store.handleSessionEnded('brs1');
            expect(store.readOutput('brs1', { maxLines: 10 }).lines).to.have.length(1);
        });
    });

    it('feeds breakpoint verification from tracked traffic', () => {
        createStore();
        store.handleRequest('brs1', { type: 'request', seq: 1, command: 'setBreakpoints', arguments: { source: { path: '/p/a.brs' }, breakpoints: [{ line: 3 }] } });
        store.handleMessage('brs1', { type: 'response', 'request_seq': 1, command: 'setBreakpoints', success: true, body: { breakpoints: [{ verified: true, line: 3 }] } });
        expect(store.breakpoints.lookup('/p/a.brs', 3).brs.verified).to.be.true;
        store.handleSessionEnded('brs1');
        expect(store.breakpoints.lookup('/p/a.brs', 3)).to.eql({});
    });
});
