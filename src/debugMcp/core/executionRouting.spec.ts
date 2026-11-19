import { expect } from 'chai';
import { chooseExecutionPath, toThreadCommandTarget } from './executionRouting';

const base = { sessionId: 'brs1', threadId: 1, focused: undefined };

describe('chooseExecutionPath', () => {
    it('uses the VS Code command only when the focused item is exactly the target session and thread', () => {
        expect(chooseExecutionPath({ ...base, focused: { sessionId: 'brs1', threadId: 1, frameId: 5 } })).to.equal('ui-command');
    });

    it('sends the request when the focus is another session or thread, or has no thread', () => {
        expect(chooseExecutionPath({ ...base, focused: { sessionId: 'js1', threadId: 1 } })).to.equal('request');
        expect(chooseExecutionPath({ ...base, focused: { sessionId: 'brs1', threadId: 2 } })).to.equal('request');
        expect(chooseExecutionPath({ ...base, focused: { sessionId: 'brs1' } })).to.equal('request');
    });

    it('sends the request when nothing is focused', () => {
        expect(chooseExecutionPath(base)).to.equal('request');
    });

    it('addresses a thread the way VS Code identifies it', () => {
        expect(toThreadCommandTarget('abc', 3)).to.eql({ sessionId: 'abc', threadId: 'thread:abc:3' });
    });
});
