/**
 * Why a broadcast (SSDP scan) was ordered. Views filter on this — e.g. a visible view ignores
 * `stale` (timer-driven) orders to avoid surprise scans. (See docs/device-discovery.md "Orders")
 */
export type BroadcastReason =
    | 'startup'
    | 'network'
    | 'sleep'
    | 'refresh-clicked'
    | 'unhealthy-device'
    | 'stale';

/**
 * Why a reconcile (health-check-all) was ordered.
 */
export type ReconcileReason =
    | 'startup'
    | 'network'
    | 'sleep'
    | 'refresh-clicked'
    | 'config-changed'
    | 'stale';

export type OrderType = 'broadcast' | 'reconcile';

/**
 * A unit of deferred work: submitted by triggers, fulfilled by visible views.
 * The discriminated union keeps each order type paired with its own reason vocabulary.
 */
export type Order =
    | { type: 'broadcast'; reason: BroadcastReason }
    | { type: 'reconcile'; reason: ReconcileReason };

/**
 * The pending-orders store (docs/device-discovery.md "Orders"): one set of reasons per order
 * type. The work is idempotent (one scan satisfies every queued "please scan"), so reasons
 * accumulate — different reasons coexist, the same reason never queues twice — and a take
 * drains everything at once for a single execution.
 */
export class Orders {
    public constructor(
        /**
         * Called once per submitted order, after it lands in the pending set — the hook the
         * owner uses to notify live views.
         */
        private onSubmit: (order: Order, timestamp: number) => void
    ) { }

    private pending = {
        broadcast: new Set<BroadcastReason>(),
        reconcile: new Set<ReconcileReason>()
    };

    /**
     * Submit orders. Each order's reason is added to its type's pending set (a reason never
     * queues twice) and announced via the onSubmit hook so visible views can fulfill live.
     */
    public submit(orders: Order[]): void {
        for (const order of orders) {
            (this.pending[order.type] as Set<string>).add(order.reason);
            this.onSubmit(order, Date.now());
        }
    }

    /**
     * The reasons currently pending for an order type (nothing is consumed).
     */
    public getPending(type: 'broadcast'): BroadcastReason[];
    public getPending(type: 'reconcile'): ReconcileReason[];
    public getPending(type: OrderType): string[] {
        return [...this.pending[type]];
    }

    /**
     * Atomically take every pending reason for an order type, or nothing at all.
     *
     * `except` lists reasons that cannot TRIGGER a take on their own (a blacklist on purpose:
     * new reasons act by default). When any non-excepted reason is present, the WHOLE set is
     * returned and cleared — the single execution that follows satisfies every queued reason,
     * excepted ones included. When only excepted reasons (or nothing) are pending, returns
     * undefined and leaves the set untouched.
     *
     * Atomic: when two visible views react to the same order event, the first taker gets the
     * reasons and later callers find the set empty.
     */
    public take(type: 'broadcast', except?: BroadcastReason[]): BroadcastReason[] | undefined;
    public take(type: 'reconcile', except?: ReconcileReason[]): ReconcileReason[] | undefined;
    public take(type: OrderType, except?: string[]): string[] | undefined {
        const set = this.pending[type] as Set<string>;
        const triggers = [...set].filter(x => !except?.includes(x));
        if (triggers.length === 0) {
            return undefined;
        }
        const reasons = [...set];
        set.clear();
        return reasons;
    }
}
