/* eslint-disable @typescript-eslint/no-explicit-any */
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

/** What the injected `__connect(...)` call hands us, from inside solid's module scope. */
export interface SolidApi {
    /**
     * Solid's dev `DevHooks` object. Solid reads its fields at runtime
     * (`DevHooks.afterCreateOwner && DevHooks.afterCreateOwner(owner)`), so
     * assigning them here installs our hooks.
     */
    hooks: {
        afterUpdate: (() => void) | null;
        afterCreateOwner: ((owner: any) => void) | null;
        afterCreateSignal: ((signal: any) => void) | null;
        [key: string]: any;
    };
    getOwner: () => any;
    untrack: <T>(fn: () => T) => T;
    createRoot: <T>(fn: (dispose: () => void) => T) => T;
    getListener?: () => any;
    /** solid's `$PROXY` symbol — optional; without it store detection degrades (stores show as values). */
    $PROXY?: symbol;
}

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

/**
 * Run `fn` inside a throwaway root that is disposed synchronously. Reading reactive
 * getters (props, store fields) can CREATE transient computations; without an owner
 * Solid warns "computations created outside a createRoot…" and leaks them.
 */
export function runInThrowawayRoot(fn: () => void): void {
    if (api) {
        api.createRoot((dispose) => {
            fn();
            dispose();
        });
    } else {
        fn();
    }
}

const REFRESH_PREFIX = '[solid-refresh]';
const NAME_CAP = 36;

function isSolidProxy(v: any): boolean {
    return !!api && !!api.$PROXY && typeof v === 'object' && v !== null && (api.$PROXY in v);
}

export function isSolidOwner(o: any): boolean {
    return 'owned' in o;
}

export function isSolidComputation(o: any): boolean {
    return !!o.fn;
}

export function isSolidRoot(o: any): boolean {
    return !('fn' in o);
}

export function isSolidComponent(o: any): boolean {
    return 'component' in o;
}

export function isSolidSignal(o: any): boolean {
    return 'value' in o && 'observers' in o && 'observerSlots' in o && 'comparator' in o;
}

export function isSolidStore(o: any): boolean {
    return !('observers' in o) && isSolidProxy(o.value);
}

export function getOwnerType(o: any): string {
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
        if (ownerComponent && typeof ownerComponent.name === 'string' && ownerComponent.name.indexOf(REFRESH_PREFIX) === 0) {
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
export function getNodeType(o: any): string {
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

export function getNodeName(o: any): string | undefined {
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
export function onOwnerCleanup(owner: any, fn: () => void): () => void {
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
