import { expect } from 'chai';
import { fetchStackFrames, sendDapRequest } from './dapClient';

describe('dapClient', () => {
    it('rejects with a clear message when the adapter never answers', async () => {
        let message: string;
        try {
            await sendDapRequest({ customRequest: () => new Promise(() => { }) }, 'stackTrace', {}, 20);
        } catch (error) {
            message = (error as Error).message;
        }
        expect(message).to.equal('The debug adapter did not answer \'stackTrace\' within 0.02s');
    });

    it('returns the adapter response and propagates adapter errors', async () => {
        expect(await sendDapRequest({ customRequest: () => Promise.resolve({ ok: true }) }, 'threads')).to.eql({ ok: true });
        let message: string;
        try {
            await sendDapRequest({ customRequest: () => Promise.reject(new Error('nope')) }, 'threads');
        } catch (error) {
            message = (error as Error).message;
        }
        expect(message).to.equal('nope');
    });

    it('maps stack frames with a local path', async () => {
        const frames = await fetchStackFrames({ customRequest: () => Promise.resolve({ stackFrames: [{ id: 1, name: 'a', line: 2, column: 3, source: { path: '/p/a.brs' } }, { id: 2, name: 'b', line: 1, column: 1, source: { name: 'native' } }] }) }, 1, 5);
        expect(frames[0]).to.include({ file: '/p/a.brs', line: 2, column: 3 });
        expect(frames[1]).to.include({ file: undefined, sourceName: 'native' });
    });
});
