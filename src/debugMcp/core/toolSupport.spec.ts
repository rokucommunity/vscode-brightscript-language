import { expect } from 'chai';
import { CANCELLED_MESSAGE, pollUntil, raceAbort, withProgress } from './toolSupport';

describe('toolSupport', () => {
    it('raceAbort rejects when the signal aborts first', async () => {
        const controller = new AbortController();
        const pending = raceAbort(new Promise<number>(() => { }), controller.signal);
        controller.abort();
        let message: string;
        try {
            await pending;
        } catch (error) {
            message = (error as Error).message;
        }
        expect(message).to.equal(CANCELLED_MESSAGE);
        expect(await raceAbort(Promise.resolve(3), undefined)).to.equal(3);
    });

    it('pollUntil stops on abort', async () => {
        const controller = new AbortController();
        setTimeout(() => controller.abort(), 20);
        expect(await pollUntil(() => false, 5000, 10, controller.signal)).to.be.false;
    });

    it('withProgress only reports when the client asked for progress', async () => {
        const messages: string[] = [];
        expect(await withProgress(undefined, () => 'x', () => Promise.resolve(1))).to.equal(1);
        expect(await withProgress({ reportProgress: (message) => messages.push(message) }, () => 'x', () => Promise.resolve(2))).to.equal(2);
        expect(messages).to.be.empty;
    });
});
