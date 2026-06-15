import * as vscode from 'vscode';
import type {
    SolidChildrenData,
    SolidDevtoolsPerfSample,
    SolidInspectData,
    SolidRootsData,
    SolidSearchData,
    SolidValueData
} from './protocol';

/**
 * Talks to the on-device Solid Devtools bridge (globalThis.__SDT, injected at debug
 * staging — see ./bridgeInjection) over the auto-attached vscode-js-debug session's
 * DAP `evaluate` channel — the same CDP connection that already attaches to Hermes
 * for RSG/TS apps (see attachJsDebugger in extension.ts).
 *
 * Transport facts (established by the original spike):
 * - `context:'watch'` evaluates stay out of the Debug Console and work while the app
 *   is RUNNING (no frameId = global execution context).
 * - Evaluate results are truncated around ~1000 chars, so the bridge exposes lazy
 *   calls that return a total base64 length, drained via readResult(off, len) in
 *   CHUNK-sized pieces.
 * - The device has ONE shared result buffer — two lazy fetches must never overlap
 *   (the second would overwrite the buffer mid-drain), so every lazy fetch is
 *   serialized through a promise chain.
 */
export class SolidDevtoolsTransport {

    public constructor(
        private log: (message: string) => void = () => { },
        /** Emitted once per timed bridge round-trip — streamed to the perf overlay. */
        private onPerf: (sample: SolidDevtoolsPerfSample) => void = () => { }
    ) { }

    /** base64 chars per evaluate — safely under the ~1000-char result cap. */
    private static readonly CHUNK = 800;

    /** Sessions that are (or hang off) the BrightScript-spawned JS debug session. */
    private candidateSessions = new Set<vscode.DebugSession>();

    /** Cached evaluable session so the panel's many small requests (roots, children,
     * version polls) don't re-probe every candidate each time. Cleared on a failed
     * evaluate or when the session terminates. */
    private cachedSession: vscode.DebugSession | undefined;

    private lazyChain: Promise<unknown> = Promise.resolve();

    /**
     * Capture the BrightScript-spawned JS session(s) so requests can target the
     * CDP-connected one. Registers trackers for both node + pwa-node (incl. js-debug
     * child sessions) — the resolver figures out which one accepts `evaluate`.
     */
    public register(context: vscode.ExtensionContext): void {
        const factory: vscode.DebugAdapterTrackerFactory = {
            createDebugAdapterTracker: (session: vscode.DebugSession) => {
                this.candidateSessions.add(session);
                return undefined;
            }
        };
        context.subscriptions.push(
            vscode.debug.registerDebugAdapterTrackerFactory('node', factory),
            vscode.debug.registerDebugAdapterTrackerFactory('pwa-node', factory)
        );
    }

    public onDidTerminateDebugSession(session: vscode.DebugSession): void {
        this.candidateSessions.delete(session);
        if (this.cachedSession === session) {
            this.cachedSession = undefined;
        }
    }

    // ---- typed bridge calls (what the view provider consumes) -------------------

    /** The bridge's change counter (polled to drive live refresh), or undefined when
     * there's no evaluable session / the evaluate failed. */
    public async getVersion(): Promise<number | undefined> {
        const session = await this.ensureSession();
        if (!session) {
            return undefined;
        }
        const t0 = Date.now();
        const r = await this.evaluate(session, 'globalThis.__SDT ? globalThis.__SDT.version() : -1');
        const ms = Date.now() - t0;
        if (!r.ok) {
            this.cachedSession = undefined;
            return undefined;
        }
        this.onPerf({ op: 'version', totalMs: ms, deviceMs: ms, roundTrips: 1, bytes: 0 });
        return Number(this.unquote(r.result));
    }

    public getRoots(): Promise<SolidRootsData | undefined> {
        return this.fetchLazy('roots', 'globalThis.__SDT ? globalThis.__SDT.lazyRoots() : -1');
    }

    public getChildren(id: string): Promise<SolidChildrenData | undefined> {
        return this.fetchLazy('children', `globalThis.__SDT.lazyChildren(${JSON.stringify(id)})`);
    }

    public inspect(id: string): Promise<SolidInspectData | undefined> {
        return this.fetchLazy('inspect', `globalThis.__SDT.lazyInspect(${JSON.stringify(id)})`);
    }

    /** Expand one collapsed value by ref (drill-down); refs come from the last inspect. */
    public getValue(ref: number, offset = 0): Promise<SolidValueData | undefined> {
        return this.fetchLazy('value', `globalThis.__SDT.lazyValue(${Number(ref)}, ${Number(offset)})`);
    }

    /** Full-tree search by component name. */
    public search(query: string): Promise<SolidSearchData | undefined> {
        return this.fetchLazy('search', `globalThis.__SDT.lazySearch(${JSON.stringify(query)})`);
    }

    /** True/false = bridge present on device; undefined = no evaluable session. */
    public async hasBridge(): Promise<boolean | undefined> {
        const session = await this.ensureSession();
        if (!session) {
            return undefined;
        }
        const r = await this.evaluate(session, 'typeof globalThis.__SDT');
        if (!r.ok) {
            this.cachedSession = undefined;
            return undefined;
        }
        return this.unquote(r.result) === 'object';
    }

    /** The bridge's last captured internal error ('' when none). */
    public async getBridgeError(): Promise<string> {
        const session = await this.ensureSession();
        if (!session) {
            return '';
        }
        const r = await this.evaluate(session, 'globalThis.__SDT ? globalThis.__SDT.errorB64() : ""');
        return this.b64decode(this.unquote(r.result));
    }

    // ---- session resolution ------------------------------------------------------

    private isBrightscriptJs(session: vscode.DebugSession | undefined): boolean {
        return session?.configuration?._isBrightscriptJsSession === true;
    }

    /**
     * Ordered list of sessions to try `evaluate` against. vscode-js-debug exposes a
     * logical PARENT session that has no CDP target (customRequest there fails
     * instantly with "debug session not found"); the evaluable runtime lives in a
     * CHILD session — and that's also what the Debug Console targets via
     * activeDebugSession. So: the active session first, then children of our
     * brightscript-spawned JS session, then the JS session itself, then anything else.
     */
    private resolveTargetSessions(): vscode.DebugSession[] {
        const live = [...this.candidateSessions];
        const ordered: Array<vscode.DebugSession | undefined> = [
            vscode.debug.activeDebugSession,
            ...live.filter(s => this.isBrightscriptJs(s.parentSession)),
            ...live.filter(s => this.isBrightscriptJs(s)),
            ...live
        ];
        const seen = new Set<string>();
        const result: vscode.DebugSession[] = [];
        for (const s of ordered) {
            if (s && !seen.has(s.id)) {
                seen.add(s.id);
                result.push(s);
            }
        }
        return result;
    }

    private async ensureSession(): Promise<vscode.DebugSession | undefined> {
        if (this.cachedSession) {
            return this.cachedSession;
        }
        for (const candidate of this.resolveTargetSessions()) {
            const r = await this.evaluate(candidate, 'typeof globalThis.__SDT');
            if (r.ok) {
                this.log(`using debug session "${candidate.name}" (typeof __SDT = ${this.unquote(r.result)})`);
                this.cachedSession = candidate;
                return candidate;
            }
        }
        return undefined;
    }

    // ---- evaluate + lazy drain ----------------------------------------------------

    /** A device with a busy/stuck JS thread can leave an evaluate pending forever,
     * which would jam the serialized lazy chain — bound every round-trip. */
    private static readonly EVALUATE_TIMEOUT_MS = 15000;

    private async evaluate(session: vscode.DebugSession, expression: string): Promise<{ ok: boolean; result?: string; error?: string }> {
        let timer: ReturnType<typeof setTimeout>;
        try {
            // NOTE: `context:'watch'` does not echo to the Debug Console, and no
            // `frameId` means the global execution context — which is what lets this
            // work while the app is running (not paused).
            const resp = await Promise.race([
                session.customRequest('evaluate', { expression: expression, context: 'watch' }),
                new Promise((_, reject) => {
                    timer = setTimeout(() => reject(new Error(`evaluate timed out after ${SolidDevtoolsTransport.EVALUATE_TIMEOUT_MS}ms`)), SolidDevtoolsTransport.EVALUATE_TIMEOUT_MS);
                })
            ]);
            return {
                ok: true,
                result: typeof resp?.result === 'string' ? resp.result : JSON.stringify(resp?.result)
            };
        } catch (e: any) {
            return { ok: false, error: e?.message ?? String(e) };
        } finally {
            clearTimeout(timer);
        }
    }

    /**
     * Strip surrounding quotes some adapters add to string results. Strips leading and
     * trailing quotes INDEPENDENTLY — when a result is truncated mid-string the closing
     * quote is lost, so we can't require both to be present.
     */
    private unquote(s: string | undefined): string {
        if (!s) {
            return '';
        }
        let r = s;
        if (r.startsWith('"') || r.startsWith('\'')) {
            r = r.slice(1);
        }
        if (r.endsWith('"') || r.endsWith('\'')) {
            r = r.slice(0, -1);
        }
        return r;
    }

    private b64decode(b64: string): string {
        if (!b64) {
            return '';
        }
        try {
            return Buffer.from(b64, 'base64').toString('utf8');
        } catch {
            return '';
        }
    }

    /** Serialize lazy fetches — the device's single shared result buffer means two
     * drains must never interleave. */
    private serializeLazy<T>(fn: () => Promise<T>): Promise<T> {
        const run = this.lazyChain.then(fn, fn);
        this.lazyChain = run.then(() => undefined, () => undefined);
        return run;
    }

    /**
     * Call a lazy bridge method (`expr` returns the total b64 length of the result),
     * then drain __SDT.readResult in CHUNK-sized pieces and JSON.parse the decoded
     * result. Returns undefined when there's no session or the drain/parse failed.
     */
    private fetchLazy<T>(op: SolidDevtoolsPerfSample['op'], expr: string): Promise<T | undefined> {
        return this.serializeLazy(async () => {
            const session = await this.ensureSession();
            if (!session) {
                return undefined;
            }
            // deviceMs = the lazy call itself: on-device encode + one evaluate round-trip
            const t0 = Date.now();
            const lenR = await this.evaluate(session, expr);
            const deviceMs = Date.now() - t0;
            if (!lenR.ok) {
                this.cachedSession = undefined;
                return undefined;
            }
            const total = Number(this.unquote(lenR.result));
            if (!(total >= 0)) {
                return undefined;
            }
            // drain the single device buffer in CHUNK-sized pieces, one evaluate each
            const drainStart = Date.now();
            let b64 = '';
            let roundTrips = 1; // the length call above
            let guard = 0;
            while (b64.length < total && guard++ < 100000) {
                const r = await this.evaluate(session, `globalThis.__SDT.readResult(${b64.length}, ${SolidDevtoolsTransport.CHUNK})`);
                roundTrips++;
                if (!r.ok) {
                    break;
                }
                const piece = this.unquote(r.result);
                if (!piece) {
                    break;
                }
                b64 += piece;
            }
            this.onPerf({
                op: op,
                totalMs: Date.now() - t0,
                deviceMs: deviceMs,
                drainMs: Date.now() - drainStart,
                roundTrips: roundTrips,
                bytes: b64.length
            });
            try {
                return JSON.parse(this.b64decode(b64)) as T;
            } catch {
                return undefined;
            }
        });
    }
}
