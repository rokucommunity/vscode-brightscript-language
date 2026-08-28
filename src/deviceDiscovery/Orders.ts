/**
 * Why a broadcast (SSDP scan) was ordered
 */
export type BroadcastReason =
    | 'startup'
    | 'network'
    | 'sleep'
    | 'refresh-clicked'
    | 'unhealthy-device'
    | 'stale';

/**
 * Why a reconcile (health-check-all) was ordered
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
 * A unit of deferred work: submitted by triggers, fulfilled by visible views
 */
export type Order =
    | { type: 'broadcast'; reason: BroadcastReason }
    | { type: 'reconcile'; reason: ReconcileReason };

/**
 * Payload of the `order-submitted` event
 */
export type SubmittedOrder = Order & { timestamp: number };

/**
 * Everything a take drained for one order type; a single execution satisfies all of it
 */
export type TakenOrders =
    | { type: 'broadcast'; reasons: BroadcastReason[] }
    | { type: 'reconcile'; reasons: ReconcileReason[] };

/**
 * The pending-orders store (docs/device-discovery.md "Orders"): one set of reasons per order
 * type. Reasons accumulate (the same reason never queues twice) and a take drains everything
 * at once for a single execution.
 */
export class Orders {
    public constructor(
        /**
         * Called once per submitted order
         */
        private onSubmit: (order: Order, timestamp: number) => void
    ) { }

    private pending = {
        broadcast: new Set<BroadcastReason>(),
        reconcile: new Set<ReconcileReason>()
    };

    public submit(orders: Order[]): void {
        for (const order of orders) {
            (this.pending[order.type] as Set<string>).add(order.reason);
            this.onSubmit(order, Date.now());
        }
    }

    public getPending(type: 'broadcast'): BroadcastReason[];
    public getPending(type: 'reconcile'): ReconcileReason[];
    public getPending(type: OrderType): string[] {
        return [...this.pending[type]];
    }

    /**
     * Atomically take the pending reasons for the requested order types, one entry per type
     * that had something to take. `except` reasons can't trigger a take on their own, but when
     * another reason triggers one, the type's WHOLE set is drained (the single execution that
     * follows satisfies excepted reasons too). Atomic per type: concurrent takers can't drain
     * the same set twice.
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
