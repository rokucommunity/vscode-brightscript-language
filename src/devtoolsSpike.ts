import * as vscode from 'vscode';

/**
 * THROWAWAY SPIKE — Solid Devtools transport feasibility test.
 *
 * Goal: prove that we can stream the @solid-devtools/debugger reactivity graph
 * out of the on-device Hermes runtime to VS Code by issuing DAP `evaluate`
 * requests against the auto-attached `pwa-node` (vscode-js-debug) session — the
 * same CDP connection that already attaches to Hermes for RSG/TS apps
 * (see attachJsDebugger() in extension.ts).
 *
 * It answers four questions, all WITHOUT touching the app source:
 *   1. Invisibility  — does `context:'watch'` evaluate stay out of the Debug Console
 *                      (vs `context:'repl'` which echoes)?
 *   2. While-running — does `evaluate` work when the app is NOT paused at a breakpoint?
 *   3. Truncation    — how big a result string survives one round-trip before
 *                      vscode-js-debug truncates it? (sets our chunk size)
 *   4. Drain loop    — can we reassemble a multi-message outbox via repeated drains?
 *
 * The on-device harness is installed via a single `evaluate` of an IIFE that
 * defines `globalThis.__sdt`. Remove this whole file + its wiring when done.
 */

const CONTEXT_INVISIBLE = 'watch'; // does NOT echo to the Debug Console
const CONTEXT_VISIBLE = 'repl'; // DOES echo to the Debug Console

/** Sessions that are (or hang off) the BrightScript-spawned JS debug session. */
const candidateSessions = new Set<vscode.DebugSession>();

let channel: vscode.OutputChannel | undefined;
function log(line = '') {
    channel?.appendLine(line);
}

function isBrightscriptJs(session: vscode.DebugSession | undefined): boolean {
    return session?.configuration?._isBrightscriptJsSession === true;
}

/**
 * Ordered list of sessions to try `evaluate` against. vscode-js-debug exposes a
 * logical PARENT session that has no CDP target (customRequest there fails
 * instantly with "debug session not found"); the evaluable runtime lives in a
 * CHILD session — and that's also what the Debug Console targets via
 * activeDebugSession. So we try the active session first, then children of our
 * brightscript-spawned JS session, then the JS session itself, then anything else.
 */
function resolveTargetSessions(): vscode.DebugSession[] {
    const live = [...candidateSessions];
    const ordered: Array<vscode.DebugSession | undefined> = [
        // what the Debug Console evaluates against (guaranteed registered)
        vscode.debug.activeDebugSession,
        // real debuggee children of our JS session
        ...live.filter(s => isBrightscriptJs(s.parentSession)),
        // the JS session itself
        ...live.filter(s => isBrightscriptJs(s)),
        // any other captured JS session
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

function describe(s: vscode.DebugSession | undefined): string {
    if (!s) {
        return '(none)';
    }
    const parent = s.parentSession ? `parent="${s.parentSession.name}"(${s.parentSession.type})` : 'parent=none';
    return `name="${s.name}" type=${s.type} ${parent} id=${s.id.slice(0, 8)}`;
}

interface EvalResult {
    ok: boolean;
    result?: string;
    variablesReference?: number;
    ms: number;
    error?: string;
}

async function evaluate(session: vscode.DebugSession, expression: string, context = CONTEXT_INVISIBLE): Promise<EvalResult> {
    const t0 = Date.now();
    try {
        // NOTE: no `frameId` — this evaluates against the global execution context,
        // which is what lets it work while the app is running (not paused).
        const resp = await session.customRequest('evaluate', { expression: expression, context: context });
        return {
            ok: true,
            result: typeof resp?.result === 'string' ? resp.result : JSON.stringify(resp?.result),
            variablesReference: resp?.variablesReference,
            ms: Date.now() - t0
        };
    } catch (e: any) {
        return { ok: false, ms: Date.now() - t0, error: e?.message ?? String(e) };
    }
}

/**
 * Strip surrounding quotes some adapters add to string results. Strips leading and
 * trailing quotes INDEPENDENTLY — when a result is truncated mid-string the closing
 * quote is lost, so we can't require both to be present.
 */
function unquote(s: string | undefined): string {
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

/** The on-device harness, installed via one evaluate. Defines globalThis.__sdt. */
const HARNESS_SRC = `(function(){
  if (!globalThis.__sdt) {
    globalThis.__sdt = {
      ping: function(){ return 'pong@' + Date.now(); },
      makeBig: function(n){ return 'x'.repeat(n); },
      makeBigLen: function(n){ return ('x'.repeat(n)).length; },
      makeObj: function(n){ return { s: 'x'.repeat(n), len: n }; },
      // deterministic payload + slice accessor, for the chunked-pull integrity test
      payload: '',
      setPayload: function(n){ var s=''; while(s.length<n){ s+='0123456789'; } globalThis.__sdt.payload = s.slice(0,n); return globalThis.__sdt.payload.length; },
      chunkAt: function(off, len){ return globalThis.__sdt.payload.slice(off, off+len); },
      // a string with chars that JSON/display-rendering tends to escape: " \\ <LF> <TAB> + unicode
      special: function(){ return 'A' + String.fromCharCode(34) + 'B' + String.fromCharCode(92) + 'C' + String.fromCharCode(10) + 'D' + String.fromCharCode(9) + 'E' + String.fromCharCode(0x00fc) + 'Z'; }
    };
  }
  return 'installed; typeof __sdt=' + (typeof globalThis.__sdt) + '; repeat=' + (typeof ''.repeat);
})()`;

async function runSpike(): Promise<void> {
    channel ??= vscode.window.createOutputChannel('Solid Devtools Spike');
    channel.clear();
    channel.show(true);

    log('=== Solid Devtools evaluate-channel spike ===');
    log(new Date().toISOString());

    const candidates = resolveTargetSessions();
    log(`active session: ${describe(vscode.debug.activeDebugSession)}`);
    log(`candidate sessions (${candidates.length}):`);
    for (const c of candidates) {
        log(`  - ${describe(c)}`);
    }
    if (candidates.length === 0) {
        log('');
        log('NO TARGET SESSION FOUND.');
        log('Start "Debug Rewrite" (or any RSG/TS brightscript launch) and wait for the');
        log('"(JS)" session to attach to Hermes, then run this command again.');
        return;
    }
    log('');

    // ---- Probe 0: find an evaluable session + install harness ---------------
    // vscode-js-debug exposes a logical parent with no CDP target (customRequest
    // there fails instantly with "debug session not found"). Try each candidate
    // until one accepts `evaluate`.
    log('--- Probe 0: install on-device harness (one evaluate) ---');
    let session: vscode.DebugSession | undefined;
    let install: EvalResult | undefined;
    for (const c of candidates) {
        const r = await evaluate(c, HARNESS_SRC);
        log(`  try ${describe(c)} -> ok=${r.ok} ${r.ms}ms ${r.ok ? unquote(r.result) : `ERROR: ${r.error}`}`);
        if (r.ok) {
            session = c;
            install = r;
            break;
        }
    }
    if (!session || !install) {
        log('');
        log('INSTALL FAILED on every candidate session.');
        log('If errors mention a stack frame / not paused, this js-debug build needs a');
        log('paused frame to evaluate. If they say "debug session not found", every');
        log('candidate was a logical parent with no CDP target — check the list above.');
        return;
    }
    log(`=> using session ${describe(session)} (installed in ${install.ms}ms)`);
    log('');

    // ---- Probe 1: invisibility + works-while-running ------------------------
    log('--- Probe 1: invisibility (watch vs repl) + works-while-running ---');
    log('>>> ACTION: make sure the app is RUNNING (not paused at a breakpoint) for this probe.');
    const watchPing = await evaluate(session, 'globalThis.__sdt.ping()', CONTEXT_INVISIBLE);
    const replPing = await evaluate(session, 'globalThis.__sdt.ping()', CONTEXT_VISIBLE);
    log(`watch-context ping: ok=${watchPing.ok} ${watchPing.ms}ms result=${unquote(watchPing.result)} ${watchPing.error ?? ''}`);
    log(`repl-context  ping: ok=${replPing.ok} ${replPing.ms}ms result=${unquote(replPing.result)} ${replPing.error ?? ''}`);
    log('>>> CHECK the Debug Console now: the repl ping should appear there, the watch ping should NOT.');
    log('');

    log('latency while running (8x watch pings, ~150ms apart):');
    const lats: number[] = [];
    for (let i = 0; i < 8; i++) {
        const p = await evaluate(session, 'globalThis.__sdt.ping()', CONTEXT_INVISIBLE);
        lats.push(p.ms);
        log(`  ping ${i + 1}: ok=${p.ok} ${p.ms}ms ${p.ok ? `-> ${unquote(p.result)}` : `ERROR ${p.error}`}`);
        await delay(150);
    }
    if (lats.length) {
        const sorted = [...lats].sort((a, b) => a - b);
        log(`  latency min=${sorted[0]}ms median=${sorted[Math.floor(sorted.length / 2)]}ms max=${sorted[sorted.length - 1]}ms`);
    }
    log('');

    // ---- Probe 2: truncation sweep ------------------------------------------
    log('--- Probe 2: result-size truncation sweep ---');
    log('requested | device-made | received | truncated? | varRef | ms');
    const sizes = [500, 1000, 2000, 4000, 8000, 16000, 32000, 64000, 128000, 256000];
    let lastGoodSize = 0;
    for (const n of sizes) {
        const made = await evaluate(session, `globalThis.__sdt.makeBigLen(${n})`);
        const big = await evaluate(session, `globalThis.__sdt.makeBig(${n})`);
        const received = unquote(big.result).length;
        const truncated = received < n;
        if (!truncated && big.ok) {
            lastGoodSize = n;
        }
        log(
            `${String(n).padStart(9)} | ${String(unquote(made.result)).padStart(11)} | ${String(received).padStart(8)} | ` +
            `${(truncated ? 'YES' : 'no').padStart(10)} | ${String(big.variablesReference ?? 0).padStart(6)} | ${big.ms}ms` +
            `${big.ok ? '' : `  ERROR ${big.error}`}`
        );
        if (!big.ok) {
            break;
        }
    }
    log(`=> largest size received intact in one evaluate result: ~${lastGoodSize} chars`);
    log('');

    // ---- Probe 2b: does an OBJECT result give an expandable varRef? ----------
    // If returning an object (vs a raw string) yields a non-zero variablesReference,
    // we may be able to fetch larger values via a follow-up `variables` request,
    // which would beat ~1000-char string chunks for throughput.
    log('--- Probe 2b: object-result variablesReference ---');
    const obj = await evaluate(session, 'globalThis.__sdt.makeObj(8000)');
    log(`makeObj(8000): ok=${obj.ok} varRef=${obj.variablesReference ?? 0} ms=${obj.ms}`);
    if (obj.ok && obj.variablesReference) {
        try {
            const vars = await session.customRequest('variables', { variablesReference: obj.variablesReference });
            const sProp = (vars?.variables ?? []).find((v: any) => v.name === 's');
            log(`  expanded "s": length=${unquote(sProp?.value).length} (device made 8000) -> ${unquote(sProp?.value).length >= 8000 ? 'FULL VALUE via varRef!' : 'also truncated'}`);
        } catch (e: any) {
            log(`  variables request failed: ${e?.message ?? e}`);
        }
    } else {
        log('  no varRef on object result -> string chunking is the only path.');
    }
    log('');

    // ---- Probe 3: lossless chunked pull of a payload bigger than the cap -----
    log('--- Probe 3: chunked pull of a 20000-char payload (proves lossless transfer over the 1000-char cap) ---');
    const payloadSize = 20000;
    const chunkLen = 800; // safely under the ~1000-char result cap
    const setp = await evaluate(session, `globalThis.__sdt.setPayload(${payloadSize})`);
    log(`built device payload: ${unquote(setp.result)} chars; pulling in ${chunkLen}-char chunks`);
    let assembled = '';
    let pulls = 0;
    const tStart = Date.now();
    while (assembled.length < payloadSize && pulls < 1000) {
        const r = await evaluate(session, `globalThis.__sdt.chunkAt(${assembled.length}, ${chunkLen})`);
        pulls++;
        if (!r.ok) {
            log(`  pull ${pulls}: ERROR ${r.error}`);
            break;
        }
        const piece = unquote(r.result);
        if (piece.length === 0) {
            log(`  pull ${pulls}: empty piece (off=${assembled.length}) — stopping`);
            break;
        }
        assembled += piece;
    }
    const elapsed = Date.now() - tStart;
    let expected = '';
    while (expected.length < payloadSize) {
        expected += '0123456789';
    }
    expected = expected.slice(0, payloadSize);
    const intact = assembled.length === payloadSize && assembled === expected;
    log(`=> pulled ${assembled.length}/${payloadSize} chars in ${pulls} chunks, ${elapsed}ms (~${Math.round((assembled.length / 1024) / (elapsed / 1000))} KB/s)`);
    log(`   integrity: ${intact ? 'OK (lossless)' : 'MISMATCH'}`);
    if (!intact) {
        log(`   head got:      ${JSON.stringify(assembled.slice(0, 24))}`);
        log(`   head expected: ${JSON.stringify(expected.slice(0, 24))}`);
        log(`   tail got:      ${JSON.stringify(assembled.slice(-24))}`);
    }
    log('');

    // ---- Probe 3b: special-char fidelity (do we need base64?) ---------------
    // The evaluate result is a DISPLAY rendering. If special chars come back escaped
    // (e.g. newline -> "\\n"), raw JSON chunks would be corrupted and the device must
    // base64-encode payloads. Expected on device: A " B \ C <LF> D <TAB> E ü Z
    log('--- Probe 3b: special-char fidelity ---');
    const expectedSpecial = 'A"B\\C\nD\tEüZ';
    const sp = await evaluate(session, 'globalThis.__sdt.special()');
    const got = unquote(sp.result);
    log(`expected (${expectedSpecial.length} chars) codes: [${[...expectedSpecial].map(c => c.charCodeAt(0)).join(',')}]`);
    log(`received (${got.length} chars) codes: [${[...got].map(c => c.charCodeAt(0)).join(',')}]`);
    log(`received raw: ${JSON.stringify(got)}`);
    log(`=> ${got === expectedSpecial ? 'CLEAN — raw strings round-trip intact, no base64 needed' : 'ESCAPED/MANGLED — device should base64-encode payloads'}`);
    log('');
    log('=== spike complete ===');
}

function delay(ms: number): Promise<void> {
    return new Promise(resolve => {
        setTimeout(resolve, ms);
    });
}

// =========================================================================
// Real-bridge reader: drains globalThis.__SDT (the on-device @solid-devtools
// bridge in the ukor app) over the same evaluate channel and decodes the tree.
// =========================================================================

const CHUNK = 800; // base64 chars per evaluate (safely under the ~1000 cap)

function b64decode(b64: string): string {
    if (!b64) {
        return '';
    }
    try {
        return Buffer.from(b64, 'base64').toString('utf8');
    } catch {
        return '';
    }
}

async function findEvaluableSession(): Promise<vscode.DebugSession | undefined> {
    for (const c of resolveTargetSessions()) {
        const r = await evaluate(c, 'typeof globalThis.__SDT');
        if (r.ok) {
            log(`evaluable session: ${describe(c)} (typeof __SDT = ${unquote(r.result)})`);
            return c;
        }
    }
    return undefined;
}

async function runReadTree(): Promise<void> {
    channel ??= vscode.window.createOutputChannel('Solid Devtools Spike');
    channel.clear();
    channel.show(true);
    log('=== Solid Devtools: read real on-device bridge ===');
    log(new Date().toISOString());

    const session = await findEvaluableSession();
    if (!session) {
        log('NO EVALUABLE SESSION. Launch "Debug Rewrite", wait for the (JS) session, then retry.');
        return;
    }

    const statusRaw = await evaluate(session, 'globalThis.__SDT ? globalThis.__SDT.status() : "NO_BRIDGE"');
    const status = unquote(statusRaw.result);
    if (status === 'NO_BRIDGE') {
        log('');
        log('globalThis.__SDT is not present — the app was not built with the on-device bridge.');
        log('Rebuild the ukor app (build-rewrite) so src/devtools/sdtBridge.ts is bundled, then relaunch.');
        return;
    }

    const [bridgeStatus, rootsCount, attached] = status.split('|');
    log(`bridge: status=${bridgeStatus} roots=${rootsCount} attachedRoots=${attached}`);

    const errB64 = await evaluate(session, 'globalThis.__SDT.errorB64()');
    const errText = b64decode(unquote(errB64.result));
    if (errText) {
        log(`bridge lastError: ${errText}`);
    }

    if (bridgeStatus === 'solid-not-dev') {
        log('');
        log('=> The app build is NOT a dev build (solid-js DEV missing), so the graph cannot be');
        log('   walked. Build/launch a dev build (solid-js "development" condition / __SIGNAL__).');
        return;
    }
    if (bridgeStatus !== 'ready') {
        log(`=> bridge not ready (status=${bridgeStatus}); see lastError above.`);
        return;
    }
    if (Number(rootsCount) === 0) {
        log('');
        log('Bridge is ready but no roots captured yet (attachSdtRoot not called). Make sure the');
        log('App component has rendered, then run again.');
        return;
    }

    // Snapshot on demand: trigger the imperative owner-graph walk, then drain it.
    log('');
    log('requesting snapshot…');
    const snap = await evaluate(session, 'globalThis.__SDT.snapshot()');
    const queueLen = Number(unquote(snap.result));
    if (!(queueLen > 0)) {
        log(`=> snapshot() returned ${unquote(snap.result)} ${snap.error ? '(' + snap.error + ')' : ''} — see lastError.`);
        const e2 = b64decode(unquote((await evaluate(session, 'globalThis.__SDT.errorB64()')).result));
        if (e2) {
            log(`bridge lastError: ${e2}`);
        }
        return;
    }

    log(`draining ${queueLen} message(s) in ${CHUNK}-char chunks...`);
    const messages: any[] = [];
    const tStart = Date.now();
    let totalChunks = 0;
    for (let i = 0; i < queueLen; i++) {
        const lenR = await evaluate(session, `globalThis.__SDT.lenAt(${i})`);
        const total = Number(unquote(lenR.result));
        let b64 = '';
        while (b64.length < total && totalChunks < 100000) {
            const r = await evaluate(session, `globalThis.__SDT.readAt(${i}, ${b64.length}, ${CHUNK})`);
            totalChunks++;
            if (!r.ok) {
                log(`  msg ${i}: read ERROR ${r.error}`);
                break;
            }
            const piece = unquote(r.result);
            if (!piece) {
                break;
            }
            b64 += piece;
        }
        try {
            const json = b64decode(b64);
            const msg = JSON.parse(json);
            messages.push(msg);
            const kind = msg && typeof msg === 'object' && 'kind' in msg ? msg.kind : `(keys: ${Object.keys(msg || {}).join(',')})`;
            log(`  msg ${i}: ${total} b64 chars -> ${json.length} bytes -> ${kind}`);
        } catch (e: any) {
            log(`  msg ${i}: decode/parse failed: ${e?.message ?? e} (b64 len ${b64.length})`);
        }
    }
    log(`=> drained ${messages.length}/${queueLen} messages in ${totalChunks} chunks, ${Date.now() - tStart}ms`);

    if (messages[0]) {
        log('');
        log('first message (raw, truncated 1500 chars):');
        log(JSON.stringify(messages[0]).slice(0, 1500));
    }
    log('');
    log(`message kinds: ${messages.map(m => m?.kind).join(', ')}`);
    const structure = [...messages].reverse().find(m => m?.kind === 'StructureSnapshot' || m?.kind === 'StructureUpdates');
    if (structure) {
        log('');
        log(`latest ${structure.kind}.data (truncated 6000 chars):`);
        log(JSON.stringify(structure.data, null, 2).slice(0, 6000));
    }

    await evaluate(session, 'globalThis.__SDT.clear()');
    log('');
    log('=== read complete (queue cleared) ===');
}

// === Lazy/virtualized tree webview ======================================
let treePanel: vscode.WebviewPanel | undefined;

/** Cache the evaluable session across the panel's many small requests (roots,
 *  children, version polls) so we don't re-probe every candidate each time.
 *  Cleared on a failed evaluate or when the session terminates. */
let cachedSession: vscode.DebugSession | undefined;
async function ensureSession(): Promise<vscode.DebugSession | undefined> {
    if (cachedSession) {
        return cachedSession;
    }
    cachedSession = await findEvaluableSession();
    return cachedSession;
}

// The device exposes ONE shared result buffer (__SDT.lastResult), filled by a lazy
// call and drained in chunks via readResult(off,len). Two lazy fetches must NEVER
// overlap — the second would overwrite the buffer mid-drain and corrupt the first.
// The live-refresh cascade fires many lazy calls back-to-back, so serialize them.
let lazyChain: Promise<unknown> = Promise.resolve();
function serializeLazy<T>(fn: () => Promise<T>): Promise<T> {
    const run = lazyChain.then(fn, fn);
    lazyChain = run.then(() => undefined, () => undefined);
    return run;
}

/** Call a lazy bridge method that returns the total b64 length, then drain
 *  __SDT.readResult in CHUNK-sized pieces and JSON.parse the decoded result.
 *  Serialized against every other lazy fetch (shared device buffer). */
function fetchLazy(session: vscode.DebugSession, expr: string): Promise<any> {
    return serializeLazy(async () => {
        const lenR = await evaluate(session, expr);
        const total = Number(unquote(lenR.result));
        if (!(total >= 0)) {
            return null;
        }
        let b64 = '';
        let guard = 0;
        while (b64.length < total && guard++ < 100000) {
            const r = await evaluate(session, `globalThis.__SDT.readResult(${b64.length}, ${CHUNK})`);
            if (!r.ok) {
                break;
            }
            const piece = unquote(r.result);
            if (!piece) {
                break;
            }
            b64 += piece;
        }
        try {
            return JSON.parse(b64decode(b64));
        } catch {
            return null;
        }
    });
}

/** Wire a (newly-created OR reload-restored) tree panel: set HTML + message handler.
 *  Shared so the WebviewPanelSerializer can re-init a panel after a window reload —
 *  without it the restored panel keeps its tab but shows a blank webview. */
function wireTreePanel(panel: vscode.WebviewPanel): void {
    channel ??= vscode.window.createOutputChannel('Solid Devtools Spike'); // so panel logs (e.g. [inspect] timing) have a home
    treePanel = panel;
    panel.webview.options = { enableScripts: true }; // re-assert on restore (scripts must be enabled)
    panel.webview.html = getTreeHtml();
    panel.onDidDispose(() => {
        if (treePanel === panel) {
            treePanel = undefined;
        }
    });

    panel.webview.onDidReceiveMessage(async (msg: any) => {
        const post = (m: any) => {
            void panel.webview.postMessage(m);
        };
        try {
            const session = await ensureSession();
            if (!session) {
                post({ type: 'status', text: 'No debug session — launch "Debug Rewrite" and wait for the (JS) session.' });
                return;
            }
            if (msg.type === 'getRoots') {
                const data = await fetchLazy(session, 'globalThis.__SDT ? globalThis.__SDT.lazyRoots() : -1');
                if (!data) {
                    if (msg.reason === 'refresh') {
                        // Transient (drain race / mid-navigation) — keep the current tree and
                        // let the next poll retry; don't flash a scary banner or drop the session.
                        post({ type: 'refreshFailed' });
                        return;
                    }
                    // Initial load: only here do we conclude the bridge truly isn't there.
                    const probe = await evaluate(session, 'typeof globalThis.__SDT');
                    if (unquote(probe.result) !== 'object') {
                        cachedSession = undefined; // wrong/stale session; re-probe next time
                    }
                    post({ type: 'status', text: 'No __SDT bridge on device yet — rebuild the app with the bridge, or wait for it to finish loading, then Refresh.' });
                    return;
                }
                post({ type: 'roots', reason: msg.reason, nodes: data.nodes ?? [] });
            } else if (msg.type === 'getChildren') {
                const data = await fetchLazy(session, `globalThis.__SDT.lazyChildren(${JSON.stringify(msg.id)})`);
                post({ type: 'children', id: msg.id, reason: msg.reason, ok: !!data, nodes: data?.nodes ?? [] });
            } else if (msg.type === 'getInspect') {
                const t0 = Date.now();
                const data = await fetchLazy(session, `globalThis.__SDT.lazyInspect(${JSON.stringify(msg.id)})`);
                log(`[inspect] id=${msg.id} ${Date.now() - t0}ms ${data ? 'ok ' + JSON.stringify(data).length + 'B' : 'NULL'}`);
                if (data) {
                    // Nest under `data` — the payload has its OWN `type` (the owner type), which
                    // would clobber the envelope `type:'inspect'` if spread.
                    post({ type: 'inspect', data: data });
                } else {
                    // ALWAYS answer so the pane never hangs at "inspecting…". A null here means
                    // the device returned nothing parseable — value too heavy, a getter threw,
                    // or a drain hiccup. Surface the bridge's lastError if there is one.
                    const errB64 = await evaluate(session, 'globalThis.__SDT ? globalThis.__SDT.errorB64() : ""');
                    const detail = b64decode(unquote(errB64.result)) || 'no response from device (value too large or a getter failed)';
                    post({ type: 'inspect', data: { id: msg.id, error: detail } });
                }
            } else if (msg.type === 'getVersion') {
                // Cheap single evaluate; the webview polls this to know when to live-refresh.
                const r = await evaluate(session, 'globalThis.__SDT ? globalThis.__SDT.version() : -1');
                if (!r.ok) {
                    cachedSession = undefined;
                }
                post({ type: 'version', value: Number(unquote(r.result)) });
            }
        } catch (e: any) {
            cachedSession = undefined;
            post({ type: 'status', text: 'error: ' + (e?.message ?? String(e)) });
        }
    });
}

function runDevtoolsPanel(): void {
    if (treePanel) {
        treePanel.reveal(vscode.ViewColumn.Beside);
        return;
    }
    const panel = vscode.window.createWebviewPanel('sdtTree', 'Solid Devtools (tree)', vscode.ViewColumn.Beside, {
        enableScripts: true,
        retainContextWhenHidden: true
    });
    wireTreePanel(panel);
}

function getTreeHtml(): string {
    const nonce = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
    return `<!DOCTYPE html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
<style>
  html, body { height:100%; }
  body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); font-size: 13px; margin:0; display:flex; flex-direction:column; }
  #bar { flex:0 0 auto; display:flex; align-items:center; gap:10px; padding:6px; }
  #status { opacity: .65; }
  label.live { display:inline-flex; align-items:center; gap:4px; opacity:.8; cursor:pointer; user-select:none; }
  #tree { flex:1 1 auto; overflow:auto; padding:2px 4px 8px; }
  .row { display:flex; align-items:center; white-space:nowrap; padding:2px 0; border-radius:3px; }
  .row:hover { background: var(--vscode-list-hoverBackground); }
  .row.sel { background: var(--vscode-list-activeSelectionBackground); color: var(--vscode-list-activeSelectionForeground); }
  /* CSS chevron (no glyph font): a small corner that rotates right->down, like VS Code */
  .tw { flex:0 0 auto; width:16px; height:18px; display:inline-flex; align-items:center; justify-content:center; cursor:pointer; user-select:none; }
  .tw::before { content:''; width:5px; height:5px; border:solid var(--vscode-icon-foreground, #c5c5c5); border-width:0 1.4px 1.4px 0; opacity:.85; transform: translateX(1px) rotate(-45deg); transition: transform .1s ease; }
  .tw.open::before { transform: translateY(-1px) rotate(45deg); }
  .tw.leaf::before { display:none; }
  .tw.loading::before { opacity:.3; }
  .row.sel .tw::before { border-color: var(--vscode-list-activeSelectionForeground); }
  .lbl { cursor:pointer; }
  /* nested children container = one indent level; its left border is the VS Code-style guide line */
  .wrap { margin-left:8px; padding-left:8px; border-left:1px solid var(--vscode-tree-indentGuidesStroke, rgba(128,128,128,.28)); }
  .name { color: var(--vscode-symbolIcon-classForeground, #4ec9b0); }
  .rootlabel { color: var(--vscode-symbolIcon-classForeground, #4ec9b0); font-style:italic; }
  .type { opacity:.45; font-size:11px; margin-left:6px; }
  .count { opacity:.5; font-size:11px; margin-left:5px; }
  button { font: inherit; }
  /* Inspector pane */
  #inspect { flex:0 0 42%; overflow:auto; border-top:1px solid var(--vscode-panel-border, #4444); padding:6px 8px; }
  #inspect .imsg { opacity:.5; }
  #inspect .ihdr { margin-bottom:6px; padding-bottom:4px; border-bottom:1px solid var(--vscode-panel-border, #4444); }
  #inspect .isec { margin:6px 0; }
  #inspect .ititle { font-size:11px; text-transform:uppercase; letter-spacing:.04em; opacity:.55; margin-bottom:2px; }
  #inspect .irow { white-space:pre-wrap; word-break:break-word; padding:1px 0 1px 8px; font-family: var(--vscode-editor-font-family, monospace); font-size:12px; }
  #inspect .key { color: var(--vscode-symbolIcon-propertyForeground, #9cdcfe); }
  .num { color: var(--vscode-debugTokenExpression-number, #b5cea8); }
  .bool { color: var(--vscode-debugTokenExpression-boolean, #569cd6); }
  .str { color: var(--vscode-debugTokenExpression-string, #ce9178); }
  .fn { color: var(--vscode-symbolIcon-functionForeground, #dcdcaa); font-style:italic; }
  .sym { color: #d7ba7d; }
  .nul { opacity:.5; }
  .ctor { color: var(--vscode-symbolIcon-classForeground, #4ec9b0); }
  .punc { opacity:.6; }
  /* flash a row when its value changes, then fade out (like the Variables view) */
  @keyframes sdtflash { 0% { background: var(--vscode-debugView-valueChangedHighlight, #648589); } 100% { background: transparent; } }
  #inspect .irow.flash { animation: sdtflash 1s ease-out; border-radius: 3px; }
</style></head><body>
<div id="bar">
  <button id="refresh">Refresh</button>
  <label class="live"><input type="checkbox" id="live" checked> Live</label>
  <span id="status">loading…</span>
</div>
<div id="tree"></div>
<div id="inspect"><div class="imsg">Select a component to inspect its props, signals &amp; memos.</div></div>
<script nonce="${nonce}">
const vscode = acquireVsCodeApi();
const treeEl = document.getElementById('tree');
const statusEl = document.getElementById('status');
const liveEl = document.getElementById('live');
const inspectEl = document.getElementById('inspect');
const POLL_MS=1500;
let selectedId = null;

// Stable-id node registry so refreshes reconcile in place (no collapse/flicker).
const reg = {};              // id -> {id,depth,parentId,row,wrap,tw,lbl,expanded,loaded}
const kidsOf = {};           // parentKey('__root__'|id) -> ordered child id[]
let rootCount = 0;
let lastVersion = null;
let refreshing = false, pendingReq = 0;

function esc(s){return String(s==null?'':s).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));}

function setTwisty(r){
  if(r.loaded && (kidsOf[r.id]||[]).length===0){ r.tw.className='tw leaf'; return; } // leaf: hide chevron, keep 16px space so labels align
  r.tw.className = r.expanded ? 'tw open' : 'tw';
}
function updateRow(r, node){
  let html='';
  if(node.name) html+='<span class="name">'+esc(node.name)+'</span>';
  if(node.label) html+='<span class="rootlabel">'+esc(node.label)+'</span>';
  html+='<span class="type">'+esc(node.type)+'</span>';
  if(node.childCount) html+='<span class="count">'+node.childCount+'</span>';
  r.lbl.innerHTML=html;
}
function toggle(r){
  if(r.leaf) return; // leaf (e.g. Globals) — nothing to expand
  r.expanded=!r.expanded;
  r.wrap.style.display=r.expanded?'block':'none';
  if(r.expanded && !r.loaded){ r.tw.className='tw open loading'; vscode.postMessage({type:'getChildren', id:r.id, reason:'expand'}); }
  else setTwisty(r);
}
// Expand a node (no-op if already open). Used by the straight-line auto-expand.
function expandNode(r){
  if(r.expanded) return;
  r.expanded=true;
  r.wrap.style.display='block';
  if(!r.loaded){ r.tw.className='tw open loading'; vscode.postMessage({type:'getChildren', id:r.id, reason:'expand'}); }
  else setTwisty(r);
}
function createRow(node, depth, parentId){
  const row=document.createElement('div'); row.className='row'; // indentation comes from nested .wrap borders, not padding
  const tw=document.createElement('span'); tw.className='tw'; // chevron is drawn via CSS ::before
  const lbl=document.createElement('span'); lbl.className='lbl';
  row.appendChild(tw); row.appendChild(lbl);
  const wrap=document.createElement('div'); wrap.className='wrap'; wrap.style.display='none';
  const r={ id:node.id, depth, parentId, row, wrap, tw, lbl, expanded:false, loaded:false, leaf:!!node.leaf };
  if(r.leaf){ r.loaded=true; tw.className='tw leaf'; } // no children to expand (e.g. a Globals entry) — select to inspect
  reg[node.id]=r;
  updateRow(r, node);
  tw.addEventListener('click', ()=>toggle(r));
  lbl.addEventListener('click', ()=>select(r.id));
  return r;
}
function removeTree(id){
  for(const k of (kidsOf[id]||[])) removeTree(k);
  delete kidsOf[id];
  const r=reg[id];
  if(r){ r.row.remove(); r.wrap.remove(); delete reg[id]; }
  if(id===selectedId){ selectedId=null; inspectEl.innerHTML='<div class="imsg">Selected node was removed.</div>'; }
}
// Diff newNodes against what's rendered in container: drop gone ids, add new ones,
// update + reorder survivors (appendChild moves existing nodes into newNodes order).
function reconcile(container, parentId, depth, newNodes){
  const key = parentId==null ? '__root__' : parentId;
  const newIds = newNodes.map(n=>n.id);
  const newSet = new Set(newIds);
  for(const id of (kidsOf[key]||[])){ if(!newSet.has(id)) removeTree(id); }
  for(const node of newNodes){
    let r = reg[node.id];
    if(!r){ r = createRow(node, depth, parentId); }
    else { updateRow(r, node); if(r.loaded) setTwisty(r); }
    container.appendChild(r.row); container.appendChild(r.wrap);
  }
  kidsOf[key] = newIds;
}
function cascadeRefresh(parentKey){
  for(const id of (kidsOf[parentKey]||[])){
    const r=reg[id];
    if(r && r.expanded && r.loaded){ pendingReq++; vscode.postMessage({type:'getChildren', id, reason:'refresh'}); }
  }
}
function endReq(){ if(--pendingReq<=0){ pendingReq=0; refreshing=false; updateStatus(); } }
function updateStatus(){
  statusEl.textContent = rootCount+' root(s)' + (refreshing?' \\u00b7 refreshing\\u2026':(liveEl.checked?' \\u00b7 live':''));
}

// ---- Inspector pane --------------------------------------------------------
let inspectTimer=null;
let inspectPending=false; // avoid piling up inspect requests on the serialized channel during live refresh
function select(id){
  if(selectedId && reg[selectedId]) reg[selectedId].row.classList.remove('sel');
  if(id!==selectedId) lastInspectValues={}; // new node → don't flash everything on first render
  selectedId=id;
  const r=reg[id]; if(r) r.row.classList.add('sel');
  inspectEl.innerHTML='<div class="imsg">inspecting\\u2026</div>';
  inspectPending=true;
  clearTimeout(inspectTimer);
  inspectTimer=setTimeout(function(){ inspectPending=false; if(selectedId===id) inspectEl.innerHTML='<div class="imsg">Inspect timed out \\u2014 no response from device. The channel may be busy (uncheck Live) or this node has no readable state.</div>'; }, 8000);
  vscode.postMessage({type:'getInspect', id});
}
// Render an encodeValue() payload to a compact one-line HTML preview.
function rv(v){
  if(!v) return '';
  switch(v.t){
    case 'number': return '<span class="num">'+esc(v.v)+'</span>';
    case 'boolean': return '<span class="bool">'+v.v+'</span>';
    case 'string': return '<span class="str">"'+esc(v.v)+'"</span>'+(v.len?'<span class="punc"> \\u2026'+v.len+' chars</span>':'');
    case 'function': return '<span class="fn">\\u0192 '+esc(v.v)+'()</span>';
    case 'symbol': return '<span class="sym">'+esc(v.v)+'</span>';
    case 'null': return '<span class="nul">null</span>';
    case 'undefined': return '<span class="nul">undefined</span>';
    case 'circular': return '<span class="nul">[circular]</span>';
    case 'array': {
      let s='<span class="punc">[</span>';
      if(v.items){ s+=v.items.map(rv).join('<span class="punc">, </span>'); if(v.more) s+='<span class="punc"> \\u2026+'+v.more+'</span>'; }
      else if(v.len) s+='<span class="punc">\\u2026'+v.len+'</span>';
      return s+'<span class="punc">]</span>';
    }
    case 'object': {
      let s=(v.ctor?'<span class="ctor">'+esc(v.ctor)+'</span> ':'')+'<span class="punc">{</span>';
      if(v.entries){ s+=v.entries.map(function(e){return '<span class="key">'+esc(e.k)+'</span>: '+rv(e.value);}).join('<span class="punc">, </span>'); if(v.more) s+='<span class="punc"> \\u2026+'+v.more+'</span>'; }
      return s+'<span class="punc">}</span>';
    }
    default: return '<span class="nul">'+esc(v.t)+'</span>';
  }
}
// Value-change flash: compare each row's rendered HTML to the previous inspect of the
// same node; rows whose value changed get the .flash class (which animates + fades).
let lastInspectValues = {};
let _next = {};
function rowClass(key, html){
  _next[key] = html;
  return (lastInspectValues.hasOwnProperty(key) && lastInspectValues[key] !== html) ? 'irow flash' : 'irow';
}
function sect(title, arr, prefix, fn){
  if(!arr||!arr.length) return '';
  let s='<div class="isec"><div class="ititle">'+title+'</div>';
  for(let i=0;i<arr.length;i++){
    const x=arr[i];
    const key=prefix+(x.key!=null?x.key:(x.name||i));
    const html=fn(x);
    s+='<div class="'+rowClass(key,html)+'">'+html+'</div>';
  }
  return s+'</div>';
}
function kvRow(e){ return (e.name?'<span class="key">'+esc(e.name)+'</span>: ':'')+rv(e.value); }
function renderInspect(m){
  if(m.missing){ inspectEl.innerHTML='<div class="imsg">This node is no longer present.</div>'; return; }
  _next={};
  let h='';
  if(m.name||m.type){ h+='<div class="ihdr">'+(m.name?'<span class="name">'+esc(m.name)+'</span>':'')+(m.type?'<span class="type">'+esc(m.type)+'</span>':'')+'</div>'; }
  // Props show values too; children/ref are name-only (we don't resolve those getters).
  h+=sect('Props', m.props, 'p:', function(e){return '<span class="key">'+esc(e.key)+'</span>'+(e.value!==undefined?': '+rv(e.value):'');});
  h+=sect('Signals', m.signals, 's:', kvRow);
  h+=sect('Memos', m.memos, 'm:', kvRow);
  h+=sect('Stores', m.stores, 'st:', kvRow);
  if(m.value){ const vh=rv(m.value); h+='<div class="isec"><div class="ititle">Value</div><div class="'+rowClass('val', vh)+'">'+vh+'</div></div>'; }
  if(m.error){ h+='<div class="isec"><div class="ititle">Error</div><div class="irow nul">'+esc(m.error)+'</div></div>'; }
  if(m.truncated){ h+='<div class="imsg" style="margin-top:6px">\\u26a0 Some values were collapsed to keep the response small (large component).</div>'; }
  const hasBody = m.props||m.signals||m.memos||m.stores||m.value;
  inspectEl.innerHTML = h + ((hasBody||m.error)?'':'<div class="imsg">No inspectable props/signals/memos on this node.</div>');
  lastInspectValues = _next; // baseline for the next refresh's change-flash
}

window.addEventListener('message', e=>{
  const m=e.data;
  if(m.type==='status'){ statusEl.textContent=m.text; }
  else if(m.type==='roots'){
    reconcile(treeEl, null, 0, m.nodes||[]);
    rootCount=(m.nodes||[]).length;
    if(m.reason==='refresh'){ cascadeRefresh('__root__'); endReq(); }
    else updateStatus();
  }
  else if(m.type==='children'){
    const r=reg[m.id];
    if(r){
      if(m.ok!==false){
        r.loaded=true; const kids=m.nodes||[]; reconcile(r.wrap, m.id, r.depth+1, kids); setTwisty(r);
        // Straight-line auto-expand: if this layer has exactly one child, open it too and
        // let the chain continue (its own children response re-triggers this). Only on a
        // user expand, not during a live refresh.
        if(m.reason!=='refresh' && kids.length===1){ const only=reg[kids[0].id]; if(only) expandNode(only); }
      }
      else if(!r.loaded){ r.expanded=false; r.wrap.style.display='none'; setTwisty(r); } // expand failed — let the user retry
    }
    if(m.reason==='refresh'){ if(r&&m.ok!==false) cascadeRefresh(m.id); endReq(); }
  }
  else if(m.type==='refreshFailed'){ refreshing=false; pendingReq=0; updateStatus(); }
  else if(m.type==='inspect'){ inspectPending=false; const d=m.data||{}; if(d.id===selectedId){ clearTimeout(inspectTimer); renderInspect(d); } }
  else if(m.type==='version'){
    if(lastVersion===null){ lastVersion=m.value; }
    else if(m.value!==lastVersion){
      lastVersion=m.value;
      if(liveEl.checked && m.value>=0){
        if(!refreshing){ refreshing=true; pendingReq=1; updateStatus(); vscode.postMessage({type:'getRoots', reason:'refresh'}); }
        if(selectedId && !inspectPending){ inspectPending=true; vscode.postMessage({type:'getInspect', id:selectedId}); } // live values, no pileup
      }
    }
  }
});

document.getElementById('refresh').addEventListener('click', ()=>{
  if(selectedId && !inspectPending){ inspectPending=true; vscode.postMessage({type:'getInspect', id:selectedId}); }
  if(refreshing) return;
  refreshing=true; pendingReq=1; updateStatus(); vscode.postMessage({type:'getRoots', reason:'refresh'});
});
liveEl.addEventListener('change', updateStatus);
setInterval(()=>{ if(liveEl.checked) vscode.postMessage({type:'getVersion'}); }, POLL_MS);
vscode.postMessage({type:'getRoots', reason:'initial'});
</script></body></html>`;
}

export function registerDevtoolsSpike(context: vscode.ExtensionContext): void {
    // Capture the BrightScript-spawned JS session(s) so the command can target the
    // CDP-connected one. We register trackers for both node + pwa-node.
    const factory: vscode.DebugAdapterTrackerFactory = {
        createDebugAdapterTracker: function createDebugAdapterTracker(session) {
            // Capture every node/pwa-node session (incl. js-debug child sessions) —
            // the resolver figures out which one actually accepts `evaluate`.
            candidateSessions.add(session);
            return undefined;
        }
    };
    context.subscriptions.push(
        vscode.debug.registerDebugAdapterTrackerFactory('node', factory),
        vscode.debug.registerDebugAdapterTrackerFactory('pwa-node', factory),
        vscode.debug.onDidTerminateDebugSession(s => {
            candidateSessions.delete(s);
            if (cachedSession === s) {
                cachedSession = undefined;
            }
        }),
        vscode.commands.registerCommand('extension.brightscript.devtoolsSpike', () => runSpike().catch(e => {
            channel?.appendLine(`SPIKE CRASHED: ${e?.stack ?? e}`);
        })),
        vscode.commands.registerCommand('extension.brightscript.devtoolsReadTree', () => runReadTree().catch(e => {
            channel?.appendLine(`READ-TREE CRASHED: ${e?.stack ?? e}`);
        })),
        vscode.commands.registerCommand('extension.brightscript.devtoolsPanel', () => runDevtoolsPanel()),
        // Restore the tree panel after a window / Ext Host reload — otherwise VS Code
        // keeps the tab but the webview comes back blank (it has no HTML until re-wired).
        vscode.window.registerWebviewPanelSerializer('sdtTree', {
            deserializeWebviewPanel: async (panel: vscode.WebviewPanel) => {
                wireTreePanel(panel);
            }
        })
    );
}
