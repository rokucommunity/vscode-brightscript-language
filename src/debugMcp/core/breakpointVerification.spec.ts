import { expect } from 'chai';
import { BreakpointVerificationTracker, summarizeVerification } from './breakpointVerification';

const FILE = '/proj/source/main.brs';

function setBreakpointsRequest(seq: number, lines: number[], filePath = FILE) {
    return { type: 'request', seq: seq, command: 'setBreakpoints', arguments: { source: { path: filePath }, breakpoints: lines.map((line) => ({ line: line })) } };
}

function setBreakpointsResponse(requestSeq: number, breakpoints: any[], success = true) {
    return { type: 'response', 'request_seq': requestSeq, command: 'setBreakpoints', success: success, body: { breakpoints: breakpoints } };
}

describe('BreakpointVerificationTracker', () => {
    let tracker: BreakpointVerificationTracker;

    beforeEach(() => {
        tracker = new BreakpointVerificationTracker();
        tracker.trackSession('brs1', 'brs');
        tracker.trackSession('js1', 'js');
    });

    it('is pending until an adapter answers', () => {
        tracker.handleRequest('brs1', setBreakpointsRequest(1, [42]));
        expect(tracker.lookup(FILE, 42)).to.eql({});
        expect(summarizeVerification(tracker.lookup(FILE, 42))).to.equal('pending');
    });

    it('matches response breakpoints to the requested lines by position', () => {
        tracker.handleRequest('brs1', setBreakpointsRequest(1, [42, 51]));
        tracker.handleMessage('brs1', setBreakpointsResponse(1, [{ id: 1, verified: true, line: 42 }, { id: 2, verified: true, line: 52 }]));
        expect(tracker.lookup(FILE, 42).brs).to.eql({ verified: true, actualLine: 42, message: undefined });
        expect(tracker.lookup(FILE, 51).brs.actualLine).to.equal(52);
        expect(tracker.lookup(FILE, 99)).to.eql({});
    });

    it('reports per runtime and summarizes unverified results', () => {
        tracker.handleRequest('brs1', setBreakpointsRequest(1, [10]));
        tracker.handleMessage('brs1', setBreakpointsResponse(1, [{ verified: false, message: 'no code here' }]));
        tracker.handleRequest('js1', setBreakpointsRequest(1, [10]));
        tracker.handleMessage('js1', setBreakpointsResponse(1, [{ verified: false }]));
        const verifications = tracker.lookup(FILE, 10);
        expect(verifications.brs.message).to.equal('no code here');
        expect(verifications.js.verified).to.be.false;
        expect(summarizeVerification(verifications)).to.equal('unverified');
    });

    it('applies breakpoint events to the matching adapter id', () => {
        tracker.handleRequest('js1', setBreakpointsRequest(1, [10]));
        tracker.handleMessage('js1', setBreakpointsResponse(1, [{ id: 7, verified: false }]));
        tracker.handleMessage('js1', { type: 'event', event: 'breakpoint', body: { reason: 'changed', breakpoint: { id: 7, verified: true, line: 12 } } });
        expect(tracker.lookup(FILE, 10).js).to.include({ verified: true, actualLine: 12 });
    });

    it('treats a failed response as unverified with the adapter message', () => {
        tracker.handleRequest('brs1', setBreakpointsRequest(1, [10]));
        tracker.handleMessage('brs1', { type: 'response', 'request_seq': 1, command: 'setBreakpoints', success: false, message: 'device busy' });
        expect(tracker.lookup(FILE, 10).brs).to.include({ verified: false, message: 'device busy' });
    });

    it('replaces earlier results for the same file when VS Code resends the list', () => {
        tracker.handleRequest('brs1', setBreakpointsRequest(1, [10]));
        tracker.handleMessage('brs1', setBreakpointsResponse(1, [{ verified: true, line: 10 }]));
        tracker.handleRequest('brs1', setBreakpointsRequest(2, [20]));
        tracker.handleMessage('brs1', setBreakpointsResponse(2, [{ verified: true, line: 20 }]));
        expect(tracker.lookup(FILE, 10)).to.eql({});
        expect(tracker.lookup(FILE, 20).brs.verified).to.be.true;
    });

    it('honors zero-based lines announced in initialize', () => {
        tracker.handleRequest('brs1', { type: 'request', seq: 1, command: 'initialize', arguments: { linesStartAt1: false } });
        tracker.handleRequest('brs1', setBreakpointsRequest(2, [41]));
        tracker.handleMessage('brs1', setBreakpointsResponse(2, [{ verified: true, line: 41 }]));
        expect(tracker.lookup(FILE, 42).brs.actualLine).to.equal(42);
    });

    it('forgets a session when it ends', () => {
        tracker.handleRequest('brs1', setBreakpointsRequest(1, [10]));
        tracker.handleMessage('brs1', setBreakpointsResponse(1, [{ verified: true, line: 10 }]));
        tracker.forgetSession('brs1');
        expect(tracker.lookup(FILE, 10)).to.eql({});
    });
});
