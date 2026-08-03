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
 * Payload of the `order-submitted` event: the order plus when it was submitted (ms epoch).
 */
export type SubmittedOrder = Order & { timestamp: number };

/**
 * What a take drained for one order type: every reason that was pending. The taker is
 * expected to execute the type's work once — a single execution satisfies all of them.
 */
export type TakenOrders =
    | { type: 'broadcast'; reasons: BroadcastReason[] }
    | { type: 'reconcile'; reasons: ReconcileReason[] };

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
     * Atomically take the pending reasons for the requested order types. Returns one entry
     * per type that actually had something to take — the caller executes each entry's work
     * once (a single execution satisfies all of its reasons).
     *
     * `except` lists reasons that cannot TRIGGER a take on their own (a blacklist on purpose:
     * new reasons act by default). When any non-excepted reason is present for a type, that
     * type's WHOLE set is drained — the execution satisfies every queued reason, excepted
     * ones included. When only excepted reasons (or nothing) are pending, the type is omitted
     * from the result and its set is left untouched.
     *
     * Atomic per type: when two visible views react to the same order event, the first taker
     * gets the reasons and later callers find the set empty.
     */
    public take(options: { types: OrderType[]; except?: Array<BroadcastReason | ReconcileReason> }): TakenOrders[] {
        const except = options.except as string[] | undefined;
        const taken: TakenOrders[] = [];
        for (const type of options.types) {
            const set = this.pending[type] as Set<string>;
            const triggers = [...set].filter(x => !except?.includes(x));
            if (triggers.length === 0) {
                continue;
            }
            const reasons = [...set];
            set.clear();
            taken.push({ type: type, reasons: reasons } as TakenOrders);
        }
        return taken;
    }
}
