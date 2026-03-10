import { expect } from 'chai';
import * as sinon from 'sinon';
import { SystemSleepMonitor } from './SystemSleepMonitor';

describe('SystemSleepMonitor', () => {
    let monitor: SystemSleepMonitor;
    let callback: sinon.SinonStub;

    beforeEach(() => {
        callback = sinon.stub();
    });

    afterEach(() => {
        monitor?.stop();
    });

    describe('constructor', () => {
        it('stores callback without calling it', () => {
            monitor = new SystemSleepMonitor(callback);
            expect(callback.called).to.be.false;
            expect(monitor['onSleepDetected']).to.equal(callback);
        });
    });

    describe('normal operation', () => {
        let clock: sinon.SinonFakeTimers;
        const INTERVAL = 1 * 60 * 1_000; // 1 minute

        beforeEach(() => {
            clock = sinon.useFakeTimers();
        });

        afterEach(() => {
            clock.restore();
        });

        it('does not fire callback when intervals are within threshold', () => {
            monitor = new SystemSleepMonitor(callback);
            monitor.start();
            let lastExecutionTime = monitor['lastExecutionTime'];

            // Advance 3 intervals (3 minutes) at normal pace
            clock.tick(INTERVAL);
            clock.tick(INTERVAL);
            clock.tick(INTERVAL);
            let elapsedTime = monitor['lastExecutionTime'];

            expect(callback.called).to.be.false;
            expect(elapsedTime - lastExecutionTime).to.equal(3 * INTERVAL);
        });

        it('fires callback when sleep is detected (gap exceeds threshold)', () => {
            const GAP_THRESHOLD = 2 * 60 * 1_000; // 2 minutes

            monitor = new SystemSleepMonitor(callback);
            monitor.start(); // lastExecutionTime = 0

            // Simulate sleep: jump time forward without firing timers
            clock.setSystemTime(GAP_THRESHOLD + 1_000);

            // Now tick to fire the interval - it should see the gap
            clock.tick(INTERVAL);

            expect(callback.called).to.be.true;
        });
    });

    describe('stop', () => {
        let clock: sinon.SinonFakeTimers;
        const INTERVAL = 1 * 60 * 1_000; // 1 minute

        beforeEach(() => {
            clock = sinon.useFakeTimers();
        });

        afterEach(() => {
            clock.restore();
        });

        it('prevents future callbacks', () => {
            monitor = new SystemSleepMonitor(callback);
            monitor.start();

            // One normal tick
            clock.tick(INTERVAL);

            // Stop the monitor
            monitor.stop();

            // Advance time significantly - no callbacks should fire
            clock.tick(INTERVAL * 10);

            expect(callback.called).to.be.false;
        });

        it('is safe to call when not started', () => {
            monitor = new SystemSleepMonitor(callback);
            expect(() => monitor.stop()).to.not.throw();
        });
    });
});
