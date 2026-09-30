import { expect } from 'chai';
import * as sinonActual from 'sinon';
import { WindowManager } from './WindowManager';
import { vscode } from '../mockVscode.spec';

let sinon = sinonActual.createSandbox();

describe('WindowManager', () => {
    let windowManager: WindowManager;

    beforeEach(() => {
        sinon.restore();
        windowManager = new WindowManager();
    });

    afterEach(() => {
        sinon.restore();
    });

    describe('showTimedNotification', () => {
        let clock: sinonActual.SinonFakeTimers;
        let progressStub: { report: sinonActual.SinonStub };
        let withProgressStub: sinonActual.SinonStub;

        // clock.tick() is synchronous so it only fires the first setTimeout in the loop.
        // The next iteration's setTimeout isn't registered until the await microtask runs.
        // This helper ticks one interval at a time and flushes the microtask queue between each.
        async function tickMs(ms: number, intervalMs = 100) {
            const steps = ms / intervalMs;
            for (let i = 0; i < steps; i++) {
                clock.tick(intervalMs);
                await Promise.resolve();
            }
        }

        beforeEach(() => {
            clock = sinon.useFakeTimers();
            progressStub = { report: sinon.stub() };
            withProgressStub = sinon.stub(vscode.window, 'withProgress').callsFake((_options, action) => {
                return action(progressStub);
            });
        });

        it('calls withProgress with the supplied message and Notification location', async () => {
            const promise = windowManager.showTimedNotification('Hello World');
            await tickMs(2000);
            await promise;

            expect(withProgressStub.calledOnce).to.be.true;
            expect(withProgressStub.firstCall.args[0]).to.eql({
                location: vscode.ProgressLocation.Notification,
                title: 'Hello World'
            });
        });

        it('reports progress incrementally until complete', async () => {
            const promise = windowManager.showTimedNotification('Loading', 1000);
            await tickMs(1000);
            await promise;

            // 1000ms / 100ms interval = 10 steps
            expect(progressStub.report.callCount).to.equal(10);
            const increment = progressStub.report.firstCall.args[0].increment;
            expect(increment).to.equal(10); // 100 / 10 steps
        });

        it('uses 2000ms as the default duration', async () => {
            const promise = windowManager.showTimedNotification('Default');
            await tickMs(2000);
            await promise;

            // 2000ms / 100ms interval = 20 steps
            expect(progressStub.report.callCount).to.equal(20);
        });

        it('resolves only after the full duration has elapsed', async () => {
            let resolved = false;
            const promise = windowManager.showTimedNotification('Test', 500).then(() => {
                resolved = true;
            });

            await tickMs(400);
            expect(resolved).to.be.false;

            await tickMs(100);
            await promise;
            expect(resolved).to.be.true;
        });
    });
});
