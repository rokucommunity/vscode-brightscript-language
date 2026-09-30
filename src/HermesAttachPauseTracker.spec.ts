import { expect } from 'chai';
import * as sinon from 'sinon';
import { createHermesAttachPauseTracker } from './HermesAttachPauseTracker';

describe('createHermesAttachPauseTracker', () => {
    let customRequest: sinon.SinonStub;
    let reported: string[];
    let tracker: ReturnType<typeof createHermesAttachPauseTracker>;

    beforeEach(() => {
        customRequest = sinon.stub().resolves();
        reported = [];
        tracker = createHermesAttachPauseTracker({ customRequest: customRequest } as any, undefined, line => reported.push(line));
    });

    function stopped(reason: string, threadId?: number) {
        tracker.onDidSendMessage({ type: 'event', event: 'stopped', body: { reason: reason, description: 'Paused', threadId: threadId } });
    }

    function threads(id: number) {
        tracker.onDidSendMessage({ type: 'response', command: 'threads', body: { threads: [{ id: id }] } });
    }

    function stackTrace(...paths: Array<string | undefined>) {
        tracker.onDidSendMessage({ type: 'response', command: 'stackTrace', body: { stackFrames: paths.map((p, i) => ({ line: i + 1, source: p ? { path: p } : undefined })) } });
    }

    it('continues a pause with no source-backed frames', () => {
        stopped('pause', 1);
        stackTrace(undefined);

        expect(customRequest.calledOnceWithExactly('continue', { threadId: 1 })).to.be.true;
    });

    it('uses the threadId from the threads response when the stopped event has none', () => {
        stopped('pause');
        threads(7);
        stackTrace(undefined);

        expect(customRequest.calledOnceWithExactly('continue', { threadId: 7 })).to.be.true;
    });

    it('does not continue a pause that landed on a real source frame, even as the first stop', () => {
        //Hermes doesn't report hit breakpoints, so js-debug labels the user's breakpoints `pause`
        stopped('pause', 1);
        stackTrace('/app/src/index.ts');

        expect(customRequest.called).to.be.false;
    });

    it('continues the first stop when js-debug reports it as a step (its script-entry pause)', () => {
        //threadId 0 is a valid id and must not be treated as missing
        stopped('step', 0);
        stackTrace('/sdk/packages/rsg-ts/src/main.ts');

        expect(customRequest.calledOnceWithExactly('continue', { threadId: 0 })).to.be.true;
        expect(reported).to.include('auto-continued script-entry pause');
    });

    it('continues the script-entry pause once the threadId arrives from the threads response', () => {
        stopped('step');
        expect(customRequest.called).to.be.false;

        threads(3);
        stackTrace('/sdk/packages/rsg-ts/src/main.ts');
        stackTrace('/sdk/packages/rsg-ts/src/main.ts');

        expect(customRequest.calledOnceWithExactly('continue', { threadId: 3 })).to.be.true;
    });

    it('does not continue a step that is not the first stop (a real user step)', () => {
        stopped('pause', 1);
        stackTrace('/app/src/index.ts');
        stopped('step', 1);
        stackTrace('/app/src/index.ts');

        expect(customRequest.called).to.be.false;
    });

    it('matches the sequence seen on device: continues only the script-entry pause, stops at every breakpoint', () => {
        stopped('step', 0);
        stackTrace('/sdk/packages/rsg-ts/src/main.ts');
        stopped('pause', 0);
        stackTrace('/app/src/index.ts');
        stopped('pause', 0);
        stackTrace('/sdk/packages/native/src/process.ts');
        stopped('pause', 0);
        stackTrace('/app/src/components/plain-grid-app.tsx');

        expect(customRequest.callCount).to.equal(1);
    });

    it('does not continue a breakpoint stop', () => {
        stopped('breakpoint', 1);
        stackTrace('/app/src/index.ts');

        expect(customRequest.called).to.be.false;
    });

    it('does not continue an empty stack once the current stop already showed a real frame', () => {
        stopped('breakpoint', 1);
        stackTrace('/app/src/index.ts');
        stackTrace(undefined);

        expect(customRequest.called).to.be.false;
    });

    it('reports each stop with its reason and top source frame, once per stop', () => {
        stopped('pause', 1);
        stackTrace(undefined, '/sdk/packages/rsg-ts/src/main.ts');
        stackTrace(undefined, '/sdk/packages/rsg-ts/src/main.ts');
        stopped('breakpoint', 1);
        stackTrace('/app/src/index.ts');

        expect(reported).to.eql([
            `stop #1: reason='pause' description='Paused' threadId=1`,
            `stop #1 stack: 2 frame(s), top: /sdk/packages/rsg-ts/src/main.ts:2`,
            `stop #2: reason='breakpoint' description='Paused' threadId=1`,
            `stop #2 stack: 1 frame(s), top: /app/src/index.ts:1`
        ]);
    });

    it('reports the auto-continue', () => {
        stopped('pause', 1);
        stackTrace(undefined);

        expect(reported).to.include('auto-continued empty-stack pause');
    });
});
