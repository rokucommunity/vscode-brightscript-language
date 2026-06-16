// ON-DEVICE CODE (Hermes) — bundled into dist/solidDevtools/bridge.js and injected
// into the staged app bundle by roku-debug. Must stay dependency-free.
//
// The bridge NEVER imports solid-js. It is prepended ahead of the app bundle, and
// roku-debug injects a one-line call right after solid's dev `DevHooks` declaration:
//   globalThis.__SDT && globalThis.__SDT.__connect({hooks:DevHooks,getOwner,untrack,createRoot,getListener})
// That payload — captured here — is the bridge's ONLY access to solid internals.
//
// The classification helpers below are field-check reimplementations of
// @solid-devtools/debugger's pure utils (we used to import ~6 of them; the rest of
// that package can't run on this renderer, so the dependency is dropped entirely).
//
// Types (SolidNode / SolidComponent / SolidApi) are declared at the bottom.

let api: SolidApi | null = null;

export function setSolidApi(a: SolidApi | null): void {
    api = a;
}

export function getSolidApi(): SolidApi | null {
    return api;
}

/** Read `fn()` without subscribing. Falls back to a bare call before `__connect`. */
export function untrackRead<T>(fn: () => T): T {
    return api ? api.untrack(fn) : fn();
}

let bridgeWorking = false;

/**
 * True while the bridge itself is reading app values inside a throwaway root. The
 * capture hooks must skip owners/signals created by bridge work — otherwise every
 * inspect captures its own throwaway root, whose synchronous disposal bumps
 * `version`, which triggers a live refresh, which re-inspects… a refresh loop.
 */
export function isBridgeWork(): boolean {
    return bridgeWorking;
}

/**
 * Run `fn` inside a throwaway root that is disposed synchronously. Reading reactive
 * getters (props, store fields) can CREATE transient computations; without an owner
 * Solid warns "computations created outside a createRoot…" and leaks them.
 */
export function runInThrowawayRoot(fn: () => void): void {
    if (api) {
        bridgeWorking = true;
        try {
            api.createRoot((dispose) => {
                fn();
                dispose();
            });
        } finally {
            bridgeWorking = false;
        }
    } else {
        fn();
    }
}

const REFRESH_PREFIX = '[solid-refresh]';
const NAME_CAP = 36;

function isSolidProxy(v: unknown): boolean {
    return !!api && !!api.$PROXY && typeof v === 'object' && v !== null && (api.$PROXY in v);
}

export function isSolidOwner(o: SolidNode): boolean {
    return 'owned' in o;
}

export function isSolidComputation(o: SolidNode): boolean {
    return !!o.fn;
}

export function isSolidRoot(o: SolidNode): boolean {
    return !('fn' in o);
}

export function isSolidComponent(o: SolidNode): boolean {
    return 'component' in o;
}

export function isSolidSignal(o: SolidNode): boolean {
    return 'value' in o && 'observers' in o && 'observerSlots' in o && 'comparator' in o;
}

export function isSolidStore(o: SolidNode): boolean {
    return !('observers' in o) && isSolidProxy(o.value);
}

export function getOwnerType(o: SolidNode): string {
    if (o.sdtType !== undefined) {
        return o.sdtType;
    }
    if (!isSolidComputation(o)) {
        return ('sources' in o) ? 'CATCH_ERROR' : 'ROOT';
    }
    if (isSolidComponent(o)) {
        return 'COMPONENT';
    }
    if ('comparator' in o) {
        const ownerComponent = o.owner?.component;
        if (ownerComponent && typeof ownerComponent.name === 'string' && ownerComponent.name.startsWith(REFRESH_PREFIX)) {
            return 'REFRESH';
        }
        return 'MEMO';
    }
    if (!o.pure) {
        if (o.user === true) {
            return 'EFFECT';
        }
        if (o.context !== null && (!o.owner || o.owner.context !== o.context)) {
            return 'CONTEXT';
        }
        return 'RENDER';
    }
    return 'COMPUTATION';
}

/** Owner → its type; sourceMap node → SIGNAL / STORE / CUSTOM_VALUE. */
export function getNodeType(o: SolidNode): string {
    if (isSolidOwner(o)) {
        return getOwnerType(o);
    }
    if (isSolidStore(o)) {
        return 'STORE';
    }
    if (isSolidSignal(o)) {
        return 'SIGNAL';
    }
    return 'CUSTOM_VALUE';
}

export function getNodeName(o: SolidNode): string | undefined {
    let name: string;
    if (typeof o.component === 'function' && typeof o.component.displayName === 'string' && o.component.displayName.length > 0) {
        name = o.component.displayName;
    } else if (typeof o.name === 'string' && o.name.length > 0) {
        name = o.name;
    } else {
        return undefined;
    }
    if (name.startsWith(REFRESH_PREFIX)) {
        name = name.slice(REFRESH_PREFIX.length).trim();
    }
    return name.length > NAME_CAP ? name.slice(0, NAME_CAP) : name;
}

/**
 * Register a disposal callback on an owner (pure solid-core mechanism: `owner.cleanups`
 * runs on dispose). This is how the bridge self-cleans its root/anchor sets.
 */
export function onOwnerCleanup(owner: SolidNode, fn: () => void): () => void {
    if (owner.cleanups === null || owner.cleanups === undefined) {
        owner.cleanups = [fn];
    } else {
        owner.cleanups.push(fn);
    }
    return function removeCleanup() {
        if (owner.cleanups) {
            const i = owner.cleanups.indexOf(fn);
            if (i >= 0) {
                owner.cleanups.splice(i, 1);
            }
        }
    };
}

// ---- types -------------------------------------------------------------------

/**
 * A Solid reactive-graph node as the bridge probes it. Solid's Owner, Computation,
 * Memo, SignalState and store-node shapes overlap heavily, and the bridge only ever
 * reads a known subset of fields AFTER presence-checking them (the `isSolidX` helpers
 * above). So this is ONE permissive shape with all-optional fields — the dynamic
 * `'field' in node` probes would fight a strict discriminated union, and these objects
 * are untyped solid internals anyway. Every field is what the bridge actually touches.
 */
export interface SolidNode {
    /** Child owners (Owner). */
    owned?: SolidNode[] | null;
    /** Parent owner — still set on `<For>`/`<Index>` createRoot owners (Owner / Computation). */
    owner?: SolidNode | null;
    /** Disposal callbacks (Owner) — how the bridge self-cleans its root/anchor sets. */
    cleanups?: Array<() => void> | null;
    /** Context map (Owner) — used to distinguish CONTEXT owners. */
    context?: Record<string, unknown> | null;
    /** Computation body — presence/truthiness marks a Computation (vs a Root). */
    fn?: unknown;
    /** Effect/render flags on a Computation. */
    pure?: boolean;
    user?: boolean;
    /** Memo equality fn — presence marks a MEMO. */
    comparator?: unknown;
    /** Present on a non-computation owner that is a CATCH_ERROR boundary. */
    sources?: unknown;
    /** The component function (Component owner), carrying the dev display name. */
    component?: SolidComponent;
    /** A component's resolved props object. */
    props?: unknown;
    /** Current value (SignalState / Memo / a component's rendered output). */
    value?: unknown;
    /** SignalState observer bookkeeping — presence marks a SIGNAL. */
    observers?: unknown;
    observerSlots?: unknown;
    /** registerGraph sets this only under an Owner — UNSET marks an orphan (unowned) signal. */
    graph?: unknown;
    /** Dev name (Solid's dev naming convention; the SDK names mount roots this way). */
    name?: string;
    /** Signals/stores created under this owner (dev). */
    sourceMap?: SolidNode[];
    /** Bridge/anchor override of the classified type. */
    sdtType?: string;
}

/** A Solid component function as the bridge reads it — callable, optionally carrying a
 *  dev `displayName` (`name` comes from `Function.prototype`). */
export type SolidComponent = ((...args: unknown[]) => unknown) & { displayName?: string };

/** What the injected `__connect(...)` call hands us, from inside solid's module scope. */
export interface SolidApi {
    /**
     * Solid's dev `DevHooks` object. Solid reads its fields at runtime
     * (`DevHooks.afterCreateOwner && DevHooks.afterCreateOwner(owner)`), so
     * assigning them here installs our hooks.
     */
    hooks: {
        afterUpdate: (() => void) | null;
        afterCreateOwner: ((owner: SolidNode) => void) | null;
        afterCreateSignal: ((signal: SolidNode) => void) | null;
        afterRegisterGraph?: (() => void) | null;
    };
    getOwner: () => SolidNode | null;
    untrack: <T>(fn: () => T) => T;
    createRoot: <T>(fn: (dispose: () => void) => T) => T;
    getListener?: () => SolidNode | null;
    /** solid's `$PROXY` symbol — optional; without it store detection degrades (stores show as values). */
    $PROXY?: symbol;
    /**
     * Reads solid's internal `ExecCount` (bumped once per update cycle) — optional;
     * returns -1 when the identifier wasn't available at injection time. When present,
     * the bridge derives its change-detection version from it instead of installing an
     * afterUpdate hook, leaving the app's update path completely untouched.
     */
    getExecCount?: () => number;
}
