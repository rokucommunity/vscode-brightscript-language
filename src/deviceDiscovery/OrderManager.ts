import { EventEmitter } from 'eventemitter3';
import type { Disposable } from 'vscode';
import type {
    BroadcastOrder,
    BroadcastReason,
    ReconcileOrder,
    ReconcileReason
} from './types';

export interface OrderManagerOptions {
    /**
     * How often to submit a timer-driven `stale` broadcast order. Default 30 minutes.
     */
    broadcastStaleMs?: number;
    /**
     * How often to submit a timer-driven `stale` reconcile order. Default 5 minutes.
     */
    reconcileStaleMs?: number;
}

/**
 * Coordinates deferred work ("orders") between triggers (startup, network change, sleep,
 * config change, timers, user clicks) and the views that fulfill them.
 *
 * Two order types exist — `broadcast` (SSDP scan) and `reconcile` (health-check known
 * devices). Each carries a *reason* so views can decide whether to act now (e.g. a visible
 * view ignores timer-driven `stale` orders).
 *
 * An order is always emitted as an event (for views that are currently visible) AND stored in
 * a single "pending" slot per type (for views that are hidden). A view consumes the pending
 * slot when it becomes visible. A `stale` reason never downgrades a pending non-stale order,
 * so a real trigger queued while hidden is never masked by a later timer tick.
 */
export class OrderManager {
    constructor(options: OrderManagerOptions = {}) {
        this.broadcastStaleMs = options.broadcastStaleMs ?? OrderManager.DEFAULT_BROADCAST_STALE_MS;
        this.reconcileStaleMs = options.reconcileStaleMs ?? OrderManager.DEFAULT_RECONCILE_STALE_MS;
    }

    public static readonly DEFAULT_BROADCAST_STALE_MS = 30 * 60 * 1_000; // 30 minutes
    public static readonly DEFAULT_RECONCILE_STALE_MS = 5 * 60 * 1_000; // 5 minutes

    private readonly broadcastStaleMs: number;
    private readonly reconcileStaleMs: number;

    private emitter = new EventEmitter();

    private pendingBroadcast: BroadcastOrder | null = null;
    private pendingReconcile: ReconcileOrder | null = null;

    private broadcastStaleTimer: ReturnType<typeof setInterval> | undefined;
    private reconcileStaleTimer: ReturnType<typeof setInterval> | undefined;

    /**
     * Submit a broadcast (SSDP scan) order. Queues it as pending and emits `broadcast-ordered`.
     */
    public submitBroadcast(reason: BroadcastReason): void {
        const order: BroadcastOrder = { type: 'broadcast', reason: reason, timestamp: Date.now() };
        this.pendingBroadcast = this.mergePending(this.pendingBroadcast, order);
        this.emitter.emit('broadcast-ordered', order);
    }

    /**
     * Submit a reconcile (health-check) order. Queues it as pending and emits `reconcile-ordered`.
     */
    public submitReconcile(reason: ReconcileReason): void {
        const order: ReconcileOrder = { type: 'reconcile', reason: reason, timestamp: Date.now() };
        this.pendingReconcile = this.mergePending(this.pendingReconcile, order);
        this.emitter.emit('reconcile-ordered', order);
    }

    /**
     * Decide what stays in the pending slot when a new order arrives. Newer orders win, except a
     * `stale` order never overwrites a pending non-stale order (don't downgrade a real trigger).
     */
    private mergePending<T extends BroadcastOrder | ReconcileOrder>(existing: T | null, incoming: T): T {
        if (existing && existing.reason !== 'stale' && incoming.reason === 'stale') {
            return existing;
        }
        return incoming;
    }

    public getPendingBroadcast(): BroadcastOrder | null {
        return this.pendingBroadcast;
    }

    public getPendingReconcile(): ReconcileOrder | null {
        return this.pendingReconcile;
    }

    /**
     * Atomically consume the pending broadcast order (get + clear in one step). Because
     * `submitBroadcast` fills the pending slot before emitting, a live-event handler can use
     * this as a "did another consumer already fulfill this order?" guard — the first taker
     * gets the order, everyone else gets null.
     */
    public takePendingBroadcast(): BroadcastOrder | null {
        const order = this.pendingBroadcast;
        this.pendingBroadcast = null;
        return order;
    }

    /**
     * Atomically consume the pending reconcile order (get + clear in one step).
     * See {@link takePendingBroadcast} for the single-consumer semantics.
     */
    public takePendingReconcile(): ReconcileOrder | null {
        const order = this.pendingReconcile;
        this.pendingReconcile = null;
        return order;
    }

    public clearPendingBroadcast(): void {
        this.pendingBroadcast = null;
    }

    public clearPendingReconcile(): void {
        this.pendingReconcile = null;
    }

    /**
     * Start the timers that periodically submit `stale` broadcast/reconcile orders.
     * Safe to call repeatedly — existing timers are cleared first.
     */
    public startStaleTimers(): void {
        this.stopStaleTimers();
        this.broadcastStaleTimer = setInterval(() => {
            this.submitBroadcast('stale');
        }, this.broadcastStaleMs);
        this.reconcileStaleTimer = setInterval(() => {
            this.submitReconcile('stale');
        }, this.reconcileStaleMs);
        // Don't keep the process alive just for these timers
        this.broadcastStaleTimer?.unref?.();
        this.reconcileStaleTimer?.unref?.();
    }

    public stopStaleTimers(): void {
        if (this.broadcastStaleTimer) {
            clearInterval(this.broadcastStaleTimer);
            this.broadcastStaleTimer = undefined;
        }
        if (this.reconcileStaleTimer) {
            clearInterval(this.reconcileStaleTimer);
            this.reconcileStaleTimer = undefined;
        }
    }

    public on(eventName: 'broadcast-ordered', handler: (order: BroadcastOrder) => void, disposables?: Disposable[]): () => void;
    public on(eventName: 'reconcile-ordered', handler: (order: ReconcileOrder) => void, disposables?: Disposable[]): () => void;
    public on(eventName: string, handler: (payload: any) => void, disposables?: Disposable[]): () => void {
        this.emitter.on(eventName, handler);
        const unsubscribe = () => {
            this.emitter.removeListener(eventName, handler);
        };
        disposables?.push({ dispose: unsubscribe });
        return unsubscribe;
    }

    public dispose(): void {
        this.stopStaleTimers();
        this.emitter.removeAllListeners();
        this.pendingBroadcast = null;
        this.pendingReconcile = null;
    }
}
