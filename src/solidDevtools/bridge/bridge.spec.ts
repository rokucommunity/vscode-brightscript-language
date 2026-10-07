/* eslint-disable @typescript-eslint/no-explicit-any */
import { assert, expect } from 'chai';

import { utf8ToBase64 } from './base64';
import { __resetSdtBridgeForTests } from './index';

// ---- fake solid environment ----------------------------------------------------
// The bridge never imports solid; it gets everything through __connect(api). These
// fakes mirror the field shapes the classification helpers check (see solid.ts).

const $PROXY = Symbol('store-proxy');

function makeHooks() {
    return {
        afterUpdate: null,
        afterCreateOwner: null,
        afterCreateSignal: null,
        afterRegisterGraph: null
    } as any;
}

function makeApi(hooks: any, getOwner: () => any = () => null) {
    return {
        hooks: hooks,
        getOwner: getOwner,
        untrack: <T>(fn: () => T) => fn(),
        createRoot: <T>(fn: (dispose: () => void) => T) => fn(() => { }),
        getListener: () => null,
        $PROXY: $PROXY
    };
}

/** A solid root owner: createRoot owners have NO `fn` property at all. */
function makeRoot(parentOwner: any = null) {
    return { owned: [], cleanups: null, owner: parentOwner, context: null } as any;
}

/** A component owner (a computation with a `component` function). */
function makeComponent(name: string, props: any = undefined) {
    const componentFn: any = function () { };
    Object.defineProperty(componentFn, 'name', { value: name });
    return {
        owned: [],
        cleanups: null,
        owner: null,
        context: null,
        fn: function () { },
        component: componentFn,
        name: name,
        props: props
    } as any;
}

/** A non-component computation (render effect) the walk recurses through. */
function makeRenderEffect() {
    return { owned: [], cleanups: null, owner: null, context: null, fn: function () { }, pure: false } as any;
}

function makeSignal(name: string | undefined, value: any) {
    return { value: value, observers: null, observerSlots: null, comparator: function () { }, name: name } as any;
}

function makeMemo(name: string, value: any) {
    return { owned: null, cleanups: null, owner: null, context: null, fn: function () { }, comparator: function () { }, pure: true, name: name, value: value } as any;
}

function link(parent: any, ...children: any[]) {
    for (const c of children) {
        parent.owned.push(c);
        c.owner = parent;
    }
}

/** Simulate disposal: run + clear the owner's cleanups (what solid's cleanNode does). */
function dispose(owner: any) {
    if (owner.cleanups) {
        for (const fn of owner.cleanups) {
            fn();
        }
        owner.cleanups = null;
    }
}

function sdt(): any {
    return (globalThis as any).__SDT;
}

/** Run a lazy call and drain + decode the shared result buffer. */
function callAndRead(len: number): any {
    const b64 = sdt().readResult(0, len);
    return JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
}

describe('solidDevtools bridge', () => {
    let hooks: any;
    let api: any;
    let currentOwner: any;

    beforeEach(() => {
        __resetSdtBridgeForTests();
        hooks = makeHooks();
        currentOwner = null;
        api = makeApi(hooks, () => currentOwner);
    });

    describe('utf8ToBase64', () => {
        it('matches Buffer base64 for ascii, unicode, and surrogate pairs', () => {
            for (const s of ['', 'a', 'ab', 'abc', 'hello world', 'héllo wörld', '日本語テキスト', 'emoji 🎉🚀 pair', '{"k":"v","n":[1,2,3]}']) {
                assert.equal(utf8ToBase64(s), Buffer.from(s, 'utf8').toString('base64'), JSON.stringify(s));
            }
        });
    });

    describe('install + connect', () => {
        it('installs __SDT at module load, status "waiting" until connect', () => {
            assert.isObject(sdt());
            assert.equal(sdt().status(), 'waiting|0|0|0|0');
        });

        it('connects with a valid payload and installs creation hooks', () => {
            assert.equal(sdt().__connect(api), 'ok');
            assert.isFunction(hooks.afterCreateOwner);
            assert.isFunction(hooks.afterCreateSignal);
            // afterUpdate stays uninstalled until a client interacts — idle debug
            // sessions pay zero bridge cost on the update path
            assert.isNull(hooks.afterUpdate);
            assert.equal(sdt().status().split('|')[0], 'ready'); // first client call…
            assert.isFunction(hooks.afterUpdate); // …starts observation
        });

        it('rejects a bad payload without throwing', () => {
            assert.equal(sdt().__connect({}), 'bad-payload');
            assert.equal(sdt().status().split('|')[0], 'connect-error');
        });

        it('is idempotent', () => {
            assert.equal(sdt().__connect(api), 'ok');
            assert.equal(sdt().__connect(api), 'already-connected');
        });

        it('chains pre-existing hooks instead of clobbering them', () => {
            let called = 0;
            hooks.afterCreateOwner = () => called++;
            sdt().__connect(api);
            hooks.afterCreateOwner(makeRoot());
            assert.equal(called, 1);
        });
    });

    describe('version', () => {
        it('bumps on updates once a client is observing (creation itself does not bump)', () => {
            sdt().__connect(api);
            const v0 = sdt().version(); // first client call installs afterUpdate
            hooks.afterCreateOwner(makeRoot());
            assert.equal(sdt().version(), v0, 'owner creation alone must not bump (afterUpdate covers it in real apps)');
            hooks.afterUpdate();
            assert.isAbove(sdt().version(), v0);
        });

        it('bumps on root disposal (cleanup path)', () => {
            sdt().__connect(api);
            const root = makeRoot();
            hooks.afterCreateOwner(root);
            const v0 = sdt().version();
            dispose(root);
            assert.isAbove(sdt().version(), v0);
        });

        it('derives version from solid ExecCount when available — no afterUpdate hook at all', () => {
            let execCount = 7;
            sdt().__connect({ ...api, getExecCount: () => execCount });
            const v0 = sdt().version(); // first client call — observation starts
            assert.isNull(hooks.afterUpdate, 'ExecCount makes the update-path hook unnecessary');
            execCount += 3; // solid ran 3 update cycles
            assert.equal(sdt().version(), v0 + 3);
            // local bumps (e.g. root disposal) still contribute
            const root = makeRoot();
            hooks.afterCreateOwner(root);
            dispose(root);
            assert.isAbove(sdt().version(), v0 + 3);
        });

        it('falls back to the afterUpdate hook when getExecCount reports unavailable', () => {
            sdt().__connect({ ...api, getExecCount: () => -1 });
            sdt().version();
            assert.isFunction(hooks.afterUpdate);
        });
    });

    describe('lazy tree', () => {
        it('hoists component children of captured roots (roots are transparent)', () => {
            sdt().__connect(api);
            const root = makeRoot();
            const app = makeComponent('App');
            link(root, app);
            hooks.afterCreateOwner(root);

            const data = callAndRead(sdt().lazyRoots());
            assert.equal(data.kind, 'roots');
            assert.isTrue(data.connected);
            assert.lengthOf(data.nodes, 1);
            assert.equal(data.nodes[0].type, 'COMPONENT');
            assert.equal(data.nodes[0].name, 'App');
        });

        it('recurses through non-component owners to the next component layer', () => {
            sdt().__connect(api);
            const root = makeRoot();
            const app = makeComponent('App');
            const effect = makeRenderEffect();
            const child = makeComponent('Child');
            link(root, app);
            link(app, effect);
            link(effect, child);
            hooks.afterCreateOwner(root);

            const roots = callAndRead(sdt().lazyRoots());
            const appId = roots.nodes[0].id;
            const kids = callAndRead(sdt().lazyChildren(appId));
            assert.equal(kids.kind, 'children');
            assert.lengthOf(kids.nodes, 1);
            assert.equal(kids.nodes[0].name, 'Child');
        });

        it('marks childless component nodes leaf up front (so the tree shows no phantom chevron)', () => {
            sdt().__connect(api);
            const root = makeRoot();
            const app = makeComponent('App');
            const branch = makeComponent('Branch');
            const grandchild = makeComponent('Grandchild');
            const leaf = makeComponent('Leaf');
            link(root, app);
            link(app, branch, leaf);
            link(branch, grandchild); // Branch HAS a component descendant → not a leaf
            link(leaf, makeRenderEffect()); // Leaf has only a non-component child → leaf
            hooks.afterCreateOwner(root);

            const appId = callAndRead(sdt().lazyRoots()).nodes[0].id;
            const kids = callAndRead(sdt().lazyChildren(appId));
            const byName: Record<string, any> = {};
            for (const n of kids.nodes) {
                byName[n.name] = n;
            }
            assert.isUndefined(byName.Branch.leaf, 'a component with a component descendant is not a leaf');
            assert.isTrue(byName.Leaf.leaf, 'a component with no component descendants is marked leaf');
        });

        it('reports missing for an unknown id', () => {
            sdt().__connect(api);
            const data = callAndRead(sdt().lazyChildren('#nope'));
            assert.isTrue(data.missing);
            assert.lengthOf(data.nodes, 0);
        });

        it('drops disposed roots (self-clean via owner.cleanups)', async () => {
            sdt().__connect(api);
            const root = makeRoot();
            link(root, makeComponent('App'));
            hooks.afterCreateOwner(root);
            assert.lengthOf(callAndRead(sdt().lazyRoots()).nodes, 1);

            const v = sdt().version();
            dispose(root);
            root.owned = []; // solid clears the subtree on dispose
            assert.isAbove(sdt().version(), v, 'disposal bumps version (drives live refresh)');
            await new Promise<void>(resolve => {
                setTimeout(resolve, 300);
            }); // root index TTL is 250ms
            assert.lengthOf(callAndRead(sdt().lazyRoots()).nodes, 0);
        });

        it('stitches sub-roots under their nearest component ancestor', () => {
            sdt().__connect(api);
            const root = makeRoot();
            const list = makeComponent('List');
            const effect = makeRenderEffect();
            link(root, list);
            link(list, effect);
            // a <For>-style item root: detached downward, linked upward via .owner
            const itemRoot = makeRoot(effect);
            const item = makeComponent('Item');
            link(itemRoot, item);
            hooks.afterCreateOwner(root);
            hooks.afterCreateOwner(itemRoot);

            const roots = callAndRead(sdt().lazyRoots());
            assert.lengthOf(roots.nodes, 1, 'item root must not appear top-level');
            assert.equal(roots.nodes[0].name, 'List');
            const kids = callAndRead(sdt().lazyChildren(roots.nodes[0].id));
            assert.deepEqual(kids.nodes.map((n: any) => n.name), ['Item']);
        });

        it('prefers named anchors as top-level entries', () => {
            sdt().__connect(api);
            const anchorOwner = makeRoot();
            link(anchorOwner, makeComponent('Screen'));
            hooks.afterCreateOwner(anchorOwner);
            currentOwner = anchorOwner;
            assert.isTrue(sdt().attachAnchor('App'));

            const data = callAndRead(sdt().lazyRoots());
            const anchor = data.nodes.find((n: any) => n.type === 'ANCHOR');
            assert.isDefined(anchor);
            assert.equal(anchor.name, 'App');
            assert.equal(anchor.childCount, 1);

            const kids = callAndRead(sdt().lazyChildren(anchor.id));
            assert.equal(kids.nodes[0].name, 'Screen');
        });

        it('attachAnchor is a safe no-op before connect', () => {
            assert.isFalse(sdt().attachAnchor('App'));
        });

        it('shows a dev-named top-level root as a named anchor (SDK names anchor mount roots)', () => {
            sdt().__connect(api);
            const root = makeRoot();
            root.name = 'App'; // Solid's dev naming convention — the RSG SDK sets this on TS-component mount roots
            link(root, makeComponent('KeyHandler'));
            const plainRoot = makeRoot(); // unnamed sibling stays hidden while named entries exist
            link(plainRoot, makeComponent('Stray'));
            hooks.afterCreateOwner(root);
            hooks.afterCreateOwner(plainRoot);

            const data = callAndRead(sdt().lazyRoots());
            assert.lengthOf(data.nodes, 1);
            assert.equal(data.nodes[0].type, 'ANCHOR');
            assert.equal(data.nodes[0].name, 'App');
            assert.equal(data.nodes[0].childCount, 1);

            const kids = callAndRead(sdt().lazyChildren(data.nodes[0].id));
            assert.deepEqual(kids.nodes.map((n: any) => n.name), ['KeyHandler']);
        });

        it('does not emit the same owner twice when attachAnchor names a dev-named root', () => {
            sdt().__connect(api);
            const root = makeRoot();
            root.name = 'App';
            link(root, makeComponent('KeyHandler'));
            hooks.afterCreateOwner(root);
            currentOwner = root;
            sdt().attachAnchor('App');

            const data = callAndRead(sdt().lazyRoots());
            assert.lengthOf(data.nodes, 1);
        });
    });

    describe('lazyInspect', () => {
        function inspectableComponent() {
            const storeProxy: any = { theme: 'dark' };
            storeProxy[$PROXY] = true;
            const comp = makeComponent('Card', {
                title: 'hello',
                count: 42,
                children: { huge: true },
                big: { a: { b: { c: { d: 1 } } } }
            });
            comp.sourceMap = [
                makeSignal('visible', true),
                { value: storeProxy, name: 'uiStore' } // store node: no `observers`, proxy value
            ];
            const memo = makeMemo('total', 99);
            link(comp, memo);
            comp.value = new (class SGNode { })();
            return comp;
        }

        function inspect(comp: any): any {
            sdt().__connect(api);
            const root = makeRoot();
            link(root, comp);
            hooks.afterCreateOwner(root);
            const roots = callAndRead(sdt().lazyRoots());
            return callAndRead(sdt().lazyInspect(roots.nodes[0].id));
        }

        it('reports props (skipping children), signals, stores, memos, and value', () => {
            const data = inspect(inspectableComponent());
            assert.equal(data.kind, 'inspect');
            assert.equal(data.name, 'Card');
            assert.equal(data.type, 'COMPONENT');

            const props = new Map(data.props.map((p: any) => [p.key, p]));
            assert.deepEqual((props.get('title') as any).value, { t: 'string', v: 'hello' });
            assert.deepEqual((props.get('count') as any).value, { t: 'number', v: 42 });
            assert.isUndefined((props.get('children') as any).value, 'children must not be resolved');

            assert.lengthOf(data.signals, 1);
            assert.equal(data.signals[0].name, 'visible');
            assert.deepEqual(data.signals[0].value, { t: 'boolean', v: true });

            assert.lengthOf(data.stores, 1);
            assert.equal(data.stores[0].name, 'uiStore');

            assert.lengthOf(data.memos, 1);
            assert.equal(data.memos[0].name, 'total');
            assert.deepEqual(data.memos[0].value, { t: 'number', v: 99 });

            assert.equal(data.value.t, 'object');
            assert.equal(data.value.ctor, 'SGNode');
        });

        it('tags values beyond the encode depth with refs for drill-down', () => {
            const data = inspect(inspectableComponent());
            const big = data.props.find((p: any) => p.key === 'big').value;
            // depth 2: a → b shown; c is a collapsed object carrying a ref
            const c = big.entries[0].value.entries[0].value;
            assert.equal(c.t, 'object');
            assert.isUndefined(c.entries);
            assert.isNumber(c.ref);
        });

        it('reports missing for an unknown id', () => {
            sdt().__connect(api);
            const data = callAndRead(sdt().lazyInspect('#nope'));
            assert.isTrue(data.missing);
        });

        it('does not capture its own throwaway roots or bump version (would loop live refresh)', () => {
            sdt().__connect(api);
            // make createRoot behave like REAL solid DEV: fire afterCreateOwner for
            // the new root and run its cleanups on dispose — this is exactly how the
            // bridge's own throwaway inspect roots are born on device
            api.createRoot = <T>(fn: (d: () => void) => T) => {
                const throwaway = makeRoot();
                hooks.afterCreateOwner(throwaway);
                return fn(() => dispose(throwaway));
            };
            const comp = inspectableComponent();
            const appRoot = makeRoot();
            link(appRoot, comp);
            hooks.afterCreateOwner(appRoot);
            const roots = callAndRead(sdt().lazyRoots());
            const v0 = sdt().version();

            const data = callAndRead(sdt().lazyInspect(roots.nodes[0].id));

            assert.equal(data.name, 'Card'); // sanity: the inspect itself worked
            assert.equal(sdt().version(), v0, 'inspect must not change version');
            const rootsAfter = callAndRead(sdt().lazyRoots());
            assert.deepEqual(rootsAfter.nodes.map((n: any) => n.id), roots.nodes.map((n: any) => n.id), 'tree must be unchanged');
        });

        it('resolves owners by id in WeakRef mode (the on-device default)', () => {
            // Node has WeakRef, so the bridge stores owners weakly; a live owner (held by
            // the test + the roots set) must still resolve through deref().
            const data = inspect(inspectableComponent());
            assert.equal(data.name, 'Card');
            assert.equal(data.type, 'COMPONENT');
        });

        it('resolves owners by id in the capped strong-ref fallback (no WeakRef)', () => {
            __resetSdtBridgeForTests({ forceCapMode: true });
            const data = inspect(inspectableComponent());
            assert.equal(data.name, 'Card');
            assert.equal(data.type, 'COMPONENT');
        });
    });

    describe('lazyValue (drill-down)', () => {
        function refFromInspect(propValue: any): { data: any; ref: number } {
            sdt().__connect(api);
            const comp = makeComponent('Holder', { target: propValue });
            const root = makeRoot();
            link(root, comp);
            hooks.afterCreateOwner(root);
            const roots = callAndRead(sdt().lazyRoots());
            const data = callAndRead(sdt().lazyInspect(roots.nodes[0].id));
            const target = data.props.find((p: any) => p.key === 'target').value;
            return { data: target, ref: findDeepRef(target) };
        }

        function findDeepRef(node: any): number {
            if (node.ref) {
                return node.ref;
            }
            for (const e of node.entries || []) {
                const r = findDeepRef(e.value);
                if (r) {
                    return r;
                }
            }
            for (const it of node.items || []) {
                const r = findDeepRef(it);
                if (r) {
                    return r;
                }
            }
            return 0;
        }

        it('expands a collapsed plain object one level', () => {
            const { ref } = refFromInspect({ a: { b: { c: { leaf: 'found' } } } });
            assert.isAbove(ref, 0);
            const v = callAndRead(sdt().lazyValue(ref, 0));
            assert.equal(v.kind, 'value');
            assert.equal(v.ref, ref);
            assert.equal(v.node.t, 'object');
            assert.isAtLeast(v.node.entries.length, 1);
        });

        it('expands a class instance via its own properties', () => {
            const inst: any = new (class Model { })();
            inst.field = 'secret';
            const { data } = refFromInspect({ wrap: inst });
            // the instance itself is collapsed with a ref (never auto-walked)
            const instNode = data.entries[0].value;
            assert.equal(instNode.ctor, 'Model');
            assert.isNumber(instNode.ref);
            const v = callAndRead(sdt().lazyValue(instNode.ref, 0));
            assert.deepEqual(v.node.entries[0], { k: 'field', value: { t: 'string', v: 'secret' } });
        });

        it('pages long strings by offset', () => {
            const long = 'x'.repeat(5000);
            const { data } = refFromInspect(long);
            assert.equal(data.len, 5000);
            assert.isNumber(data.ref);
            const page1 = callAndRead(sdt().lazyValue(data.ref, 400));
            assert.equal(page1.node.offset, 400);
            assert.equal(page1.node.v.length, 2000);
            assert.equal(page1.node.ref, data.ref, 'same ref pages again');
            const page2 = callAndRead(sdt().lazyValue(data.ref, 4900));
            assert.equal(page2.node.v.length, 100);
            assert.isUndefined(page2.node.ref, 'no more pages');
        });

        it('pages wide arrays by offset', () => {
            const arr = Array.from({ length: 100 }, (_, i) => i);
            // depth 2 prop encoding: `deep` is shown, so `arr` sits exactly at the
            // collapse boundary and carries the ref
            const { data } = refFromInspect({ deep: { arr: arr } });
            const ref = findDeepRef(data);
            assert.isAbove(ref, 0);
            const v = callAndRead(sdt().lazyValue(ref, 0));
            assert.equal(v.node.t, 'array');
            assert.equal(v.node.len, 100);
            assert.lengthOf(v.node.items, 40); // VALUE_BREADTH
            assert.equal(v.node.more, 60);
            assert.equal(v.node.ref, ref, 'same ref pages again');

            const page3 = callAndRead(sdt().lazyValue(ref, 80));
            assert.lengthOf(page3.node.items, 20);
            assert.deepEqual(page3.node.items[0], { t: 'number', v: 80 });
            assert.isUndefined(page3.node.more, 'no more pages');
        });

        it('reports missing for a stale ref (refs reset on each inspect)', () => {
            const { ref } = refFromInspect({ a: { b: { c: { d: 1 } } } });
            assert.isAbove(ref, 0);
            const roots = callAndRead(sdt().lazyRoots());
            callAndRead(sdt().lazyInspect(roots.nodes[0].id)); // resets the registry
            // the ref counter is monotonic, so the old id is never re-issued to a new value
            const v = callAndRead(sdt().lazyValue(ref, 0));
            assert.isTrue(v.missing);
        });
    });

    describe('encodeValue: circular vs shared references', () => {
        /** Inspect a component with a single `target` prop and return its encoded value. */
        function inspectTarget(value: any): any {
            sdt().__connect(api);
            const comp = makeComponent('Holder', { target: value });
            const root = makeRoot();
            link(root, comp);
            hooks.afterCreateOwner(root);
            const roots = callAndRead(sdt().lazyRoots());
            const data = callAndRead(sdt().lazyInspect(roots.nodes[0].id));
            return data.props.find((p: any) => p.key === 'target').value;
        }

        it('emits a repeated object (no cycle) as a ref, not circular', () => {
            const shared = { x: 1 };
            const target = inspectTarget({ item: shared, selected: shared });
            const item = target.entries.find((e: any) => e.k === 'item').value;
            const selected = target.entries.find((e: any) => e.k === 'selected').value;
            assert.equal(item.t, 'object');
            assert.isArray(item.entries);
            assert.equal(selected.t, 'object');
            assert.isUndefined(selected.entries, 'second occurrence must not be re-walked');
            assert.isNumber(selected.ref, 'second occurrence must still be drillable');
        });

        it('emits a repeated array (no cycle) as a ref, not circular', () => {
            const shared = [1, 2, 3];
            const target = inspectTarget({ item: shared, selected: shared });
            const item = target.entries.find((e: any) => e.k === 'item').value;
            const selected = target.entries.find((e: any) => e.k === 'selected').value;
            assert.equal(item.t, 'array');
            assert.isArray(item.items);
            assert.equal(selected.t, 'array');
            assert.isUndefined(selected.items, 'second occurrence must not be re-walked');
            assert.isNumber(selected.ref, 'second occurrence must still be drillable');
        });

        it('reports a direct self-reference as circular', () => {
            const o: any = {};
            o.self = o;
            const target = inspectTarget(o);
            const self = target.entries.find((e: any) => e.k === 'self').value;
            assert.equal(self.t, 'circular');
        });

        it('reports an array that contains itself as circular', () => {
            const a: any[] = [1];
            a.push(a);
            const target = inspectTarget(a);
            assert.equal(target.t, 'array');
            assert.equal(target.items[1].t, 'circular');
        });

        it('reports a two-level ancestor cycle as circular at the innermost node', () => {
            const a: any = {};
            a.b = { c: a };
            const target = inspectTarget(a);
            const b = target.entries.find((e: any) => e.k === 'b').value;
            const c = b.entries.find((e: any) => e.k === 'c').value;
            assert.equal(c.t, 'circular');
        });

        it('does not flag a sibling-then-descend shared reference as circular', () => {
            const shared = { foo: 1 };
            const target = inspectTarget({ x: shared, y: { z: shared } });
            const x = target.entries.find((e: any) => e.k === 'x').value;
            const y = target.entries.find((e: any) => e.k === 'y').value;
            const z = y.entries.find((e: any) => e.k === 'z').value;
            assert.equal(x.t, 'object');
            assert.isArray(x.entries, 'first occurrence (x) is walked');
            assert.equal(z.t, 'object', 'y.z is a collapsed shape, not circular');
            assert.isUndefined(z.entries);
            assert.isNumber(z.ref);
        });

        it('reports circular for a self-referencing page root expanded via lazyValue', () => {
            const o: any = {};
            o.self = o;
            // nest deep enough that `o` itself collapses to a ref at inspect time
            // (depth 2 shows target → a → b, so `b`'s value collapses)
            const target = inspectTarget({ a: { b: o } });
            const a = target.entries.find((e: any) => e.k === 'a').value;
            const b = a.entries.find((e: any) => e.k === 'b').value;
            assert.equal(b.t, 'object');
            assert.isUndefined(b.entries, 'o is collapsed with a ref, not yet walked');
            assert.isNumber(b.ref);
            const expanded = callAndRead(sdt().lazyValue(b.ref, 0));
            const self = expanded.node.entries.find((e: any) => e.k === 'self').value;
            assert.equal(self.t, 'circular', 'root must be its own ancestor for this expansion');
        });
    });

    describe('globals + orphans', () => {
        it('auto-captures unowned signals and inspects them', () => {
            sdt().__connect(api);
            hooks.afterCreateSignal(makeSignal(undefined, 'orphan-value'));
            hooks.afterCreateSignal({ ...makeSignal('named', 7), graph: {} }); // owned → ignored

            const roots = callAndRead(sdt().lazyRoots());
            const orphans = roots.nodes.find((n: any) => n.id === '@orphans');
            assert.isDefined(orphans);
            assert.isTrue(orphans.leaf);
            assert.include(orphans.name, '(1)');

            const data = callAndRead(sdt().lazyInspect('@orphans'));
            assert.lengthOf(data.signals, 1);
            assert.deepEqual(data.signals[0].value, { t: 'string', v: 'orphan-value' });
        });

        it('registerGlobals shows a named group with current values', () => {
            sdt().__connect(api);
            let count = 5;
            sdt().registerGlobals('appState', {
                count: () => count,
                title: { get: () => 'home' },
                flag: true
            });

            const roots = callAndRead(sdt().lazyRoots());
            const g = roots.nodes.find((n: any) => n.id === '@g:appState');
            assert.isDefined(g);
            assert.isTrue(g.leaf);

            count = 6;
            const data = callAndRead(sdt().lazyInspect('@g:appState'));
            const byName = new Map(data.signals.map((s: any) => [s.name, s.value]));
            assert.deepEqual(byName.get('count'), { t: 'number', v: 6 });
            assert.deepEqual(byName.get('title'), { t: 'string', v: 'home' });
            assert.deepEqual(byName.get('flag'), { t: 'boolean', v: true });
        });

        it('lazyChildren on a synthetic @ id is an empty leaf', () => {
            sdt().__connect(api);
            sdt().registerGlobals('ns', { a: 1 });
            const data = callAndRead(sdt().lazyChildren('@g:ns'));
            assert.lengthOf(data.nodes, 0);
        });
    });

    describe('lazySearch', () => {
        function buildTree() {
            sdt().__connect(api);
            const root = makeRoot();
            root.name = 'App'; // named top root → ANCHOR
            const screen = makeComponent('ScreenManager');
            const list = makeComponent('Carousel');
            link(root, screen);
            link(screen, list);
            hooks.afterCreateOwner(root);
        }

        it('finds a deep component by name with an ancestor name + id path', () => {
            buildTree();
            const data = callAndRead(sdt().lazySearch('carou'));
            assert.equal(data.kind, 'search');
            assert.lengthOf(data.matches, 1);
            const m = data.matches[0];
            assert.equal(m.name, 'Carousel');
            assert.equal(m.type, 'COMPONENT');
            assert.equal(m.path, 'App › ScreenManager');
            // ancestorIds (top → parent) must actually lead to the match
            assert.lengthOf(m.ancestorIds, 2);
            const roots = callAndRead(sdt().lazyRoots());
            assert.equal(m.ancestorIds[0], roots.nodes.find((n: any) => n.name === 'App').id, 'top ancestor is the App anchor');
            const kids = callAndRead(sdt().lazyChildren(m.ancestorIds[m.ancestorIds.length - 1]));
            assert.isTrue(kids.nodes.some((n: any) => n.id === m.id), 'last ancestor lists the match as a child');
        });

        it('is case-insensitive and returns every match', () => {
            sdt().__connect(api);
            const root = makeRoot();
            root.name = 'App';
            link(root, makeComponent('CardA'), makeComponent('CardB'));
            hooks.afterCreateOwner(root);
            const data = callAndRead(sdt().lazySearch('CARD'));
            assert.deepEqual(data.matches.map((m: any) => m.name).sort(), ['CardA', 'CardB']);
        });

        it('matches the named anchor itself (empty path)', () => {
            buildTree();
            const data = callAndRead(sdt().lazySearch('app'));
            const hit = data.matches.find((m: any) => m.name === 'App');
            assert.isDefined(hit);
            assert.equal(hit.path, '');
        });

        it('an empty/whitespace query returns no matches', () => {
            buildTree();
            assert.lengthOf(callAndRead(sdt().lazySearch('   ')).matches, 0);
        });
    });

    describe('result buffer + errors', () => {
        it('readResult slices the base64 buffer for chunked drains', () => {
            sdt().__connect(api);
            const len = sdt().lazyRoots();
            let b64 = '';
            const CHUNK = 7;
            for (let off = 0; off < len; off += CHUNK) {
                b64 += sdt().readResult(off, CHUNK);
            }
            expect(() => JSON.parse(Buffer.from(b64, 'base64').toString('utf8'))).to.not.throw();
        });

        it('errorB64 starts empty', () => {
            assert.equal(sdt().errorB64(), '');
        });
    });
});
