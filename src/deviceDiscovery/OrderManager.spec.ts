import { expect } from 'chai';
import * as sinon from 'sinon';
import { OrderManager } from './OrderManager';
import type { BroadcastOrder, ReconcileOrder } from './types';

describe('OrderManager', () => {
    let manager: OrderManager;

    beforeEach(() => {
        manager = new OrderManager();
    });

    afterEach(() => {
        manager.dispose();
    });

    describe('submitBroadcast', () => {
        it('queues a pending broadcast order with the given reason', () => {
            manager.submitBroadcast('network');
            const pending = manager.getPendingBroadcast();
            expect(pending).to.include({ type: 'broadcast', reason: 'network' });
            expect(pending.timestamp).to.be.a('number');
        });

        it('emits broadcast-ordered with the order', () => {
            const handler = sinon.stub();
            manager.on('broadcast-ordered', handler);

            manager.submitBroadcast('refresh-clicked');

            expect(handler.calledOnce).to.be.true;
            const order = handler.firstCall.args[0] as BroadcastOrder;
            expect(order).to.include({ type: 'broadcast', reason: 'refresh-clicked' });
        });

        it('does not emit reconcile-ordered', () => {
            const handler = sinon.stub();
            manager.on('reconcile-ordered', handler);
            manager.submitBroadcast('startup');
            expect(handler.called).to.be.false;
        });
    });

    describe('submitReconcile', () => {
        it('queues a pending reconcile order with the given reason', () => {
            manager.submitReconcile('config-changed');
            const pending = manager.getPendingReconcile();
            expect(pending).to.include({ type: 'reconcile', reason: 'config-changed' });
        });

        it('emits reconcile-ordered with the order', () => {
            const handler = sinon.stub();
            manager.on('reconcile-ordered', handler);

            manager.submitReconcile('sleep');

            expect(handler.calledOnce).to.be.true;
            const order = handler.firstCall.args[0] as ReconcileOrder;
            expect(order).to.include({ type: 'reconcile', reason: 'sleep' });
        });
    });

    describe('pending slot behavior', () => {
        it('starts with no pending orders', () => {
            expect(manager.getPendingBroadcast()).to.be.null;
            expect(manager.getPendingReconcile()).to.be.null;
        });

        it('keeps the latest order when the same type is submitted repeatedly', () => {
            manager.submitBroadcast('startup');
            manager.submitBroadcast('network');
            expect(manager.getPendingBroadcast()).to.include({ reason: 'network' });
        });

        it('a stale reason does NOT downgrade a pending non-stale order', () => {
            manager.submitBroadcast('network');
            manager.submitBroadcast('stale');
            expect(manager.getPendingBroadcast()).to.include({ reason: 'network' });
        });

        it('a non-stale reason DOES upgrade a pending stale order', () => {
            manager.submitBroadcast('stale');
            manager.submitBroadcast('network');
            expect(manager.getPendingBroadcast()).to.include({ reason: 'network' });
        });

        it('still emits the event even when the pending slot is not downgraded', () => {
            const handler = sinon.stub();
            manager.on('broadcast-ordered', handler);

            manager.submitBroadcast('network');
            manager.submitBroadcast('stale');

            // both submits emit, even though pending stays 'network'
            expect(handler.calledTwice).to.be.true;
            expect(handler.secondCall.args[0]).to.include({ reason: 'stale' });
            expect(manager.getPendingBroadcast()).to.include({ reason: 'network' });
        });

        it('broadcast and reconcile pending slots are independent', () => {
            manager.submitBroadcast('network');
            manager.submitReconcile('config-changed');
            expect(manager.getPendingBroadcast()).to.include({ reason: 'network' });
            expect(manager.getPendingReconcile()).to.include({ reason: 'config-changed' });
        });

        it('takePendingBroadcast clears only the broadcast slot', () => {
            manager.submitBroadcast('network');
            manager.submitReconcile('network');
            manager.takePendingBroadcast();
            expect(manager.getPendingBroadcast()).to.be.null;
            expect(manager.getPendingReconcile()).to.not.be.null;
        });

        it('takePendingReconcile clears only the reconcile slot', () => {
            manager.submitBroadcast('network');
            manager.submitReconcile('network');
            manager.takePendingReconcile();
            expect(manager.getPendingReconcile()).to.be.null;
            expect(manager.getPendingBroadcast()).to.not.be.null;
        });

        it('takePendingBroadcast returns the pending order and empties the slot', () => {
            manager.submitBroadcast('network');
            expect(manager.takePendingBroadcast()).to.include({ type: 'broadcast', reason: 'network' });
            expect(manager.getPendingBroadcast()).to.be.null;
            //a second take gets nothing — the order was already consumed
            expect(manager.takePendingBroadcast()).to.be.null;
        });

        it('takePendingReconcile returns the pending order and empties the slot', () => {
            manager.submitReconcile('sleep');
            expect(manager.takePendingReconcile()).to.include({ type: 'reconcile', reason: 'sleep' });
            expect(manager.getPendingReconcile()).to.be.null;
            expect(manager.takePendingReconcile()).to.be.null;
        });

        it('takePending returns null when nothing is pending', () => {
            expect(manager.takePendingBroadcast()).to.be.null;
            expect(manager.takePendingReconcile()).to.be.null;
        });

        it('take on one slot does not disturb the other', () => {
            manager.submitBroadcast('network');
            manager.submitReconcile('config-changed');
            manager.takePendingBroadcast();
            expect(manager.getPendingReconcile()).to.include({ reason: 'config-changed' });
        });

        it('take after a stale merge returns the surviving non-stale order', () => {
            manager.submitBroadcast('network');
            manager.submitBroadcast('stale');
            expect(manager.takePendingBroadcast()).to.include({ reason: 'network' });
        });
    });

    describe('on()', () => {
        it('returns an unsubscribe function that stops delivery', () => {
            const handler = sinon.stub();
            const unsubscribe = manager.on('broadcast-ordered', handler);

            manager.submitBroadcast('startup');
            unsubscribe();
            manager.submitBroadcast('network');

            expect(handler.calledOnce).to.be.true;
        });

        it('registers disposal into a provided disposables array', () => {
            const handler = sinon.stub();
            const disposables: Array<{ dispose: () => void }> = [];
            manager.on('reconcile-ordered', handler, disposables as any);

            expect(disposables).to.have.lengthOf(1);
            disposables[0].dispose();
            manager.submitReconcile('startup');
            expect(handler.called).to.be.false;
        });
    });

    describe('stale timers', () => {
        let clock: sinon.SinonFakeTimers;

        beforeEach(() => {
            clock = sinon.useFakeTimers();
        });

        afterEach(() => {
            clock.restore();
        });

        it('does not submit any orders before timers are started', () => {
            manager = new OrderManager({ broadcastStaleMs: 1000, reconcileStaleMs: 500 });
            clock.tick(5000);
            expect(manager.getPendingBroadcast()).to.be.null;
            expect(manager.getPendingReconcile()).to.be.null;
        });

        it('submits a stale broadcast on the broadcast interval', () => {
            manager = new OrderManager({ broadcastStaleMs: 1000, reconcileStaleMs: 999_999 });
            const handler = sinon.stub();
            manager.on('broadcast-ordered', handler);

            manager.startStaleTimers();
            clock.tick(1000);

            expect(handler.calledOnce).to.be.true;
            expect(handler.firstCall.args[0]).to.include({ reason: 'stale' });
        });

        it('submits a stale reconcile on the reconcile interval', () => {
            manager = new OrderManager({ broadcastStaleMs: 999_999, reconcileStaleMs: 500 });
            const handler = sinon.stub();
            manager.on('reconcile-ordered', handler);

            manager.startStaleTimers();
            clock.tick(1500);

            expect(handler.callCount).to.equal(3);
            expect(handler.firstCall.args[0]).to.include({ reason: 'stale' });
        });

        it('stopStaleTimers prevents further stale orders', () => {
            manager = new OrderManager({ broadcastStaleMs: 1000, reconcileStaleMs: 1000 });
            const broadcast = sinon.stub();
            manager.on('broadcast-ordered', broadcast);

            manager.startStaleTimers();
            clock.tick(1000);
            manager.stopStaleTimers();
            clock.tick(10_000);

            expect(broadcast.calledOnce).to.be.true;
        });

        it('startStaleTimers is idempotent (does not stack intervals)', () => {
            manager = new OrderManager({ broadcastStaleMs: 1000, reconcileStaleMs: 999_999 });
            const handler = sinon.stub();
            manager.on('broadcast-ordered', handler);

            manager.startStaleTimers();
            manager.startStaleTimers();
            clock.tick(1000);

            expect(handler.calledOnce).to.be.true;
        });

        it('dispose stops timers and removes listeners', () => {
            manager = new OrderManager({ broadcastStaleMs: 1000, reconcileStaleMs: 1000 });
            const handler = sinon.stub();
            manager.on('broadcast-ordered', handler);
            manager.startStaleTimers();

            manager.dispose();
            clock.tick(10_000);

            expect(handler.called).to.be.false;
            expect(manager.getPendingBroadcast()).to.be.null;
        });
    });
});
