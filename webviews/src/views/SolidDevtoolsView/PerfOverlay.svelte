<!--
    A kept-around perf overlay for refining the tool's own responsiveness. The extension
    transport streams a timed sample per bridge round-trip (onSolidDevtoolsPerfSample);
    this shows where the latency goes — per-op end-to-end ms, the last call's drain
    round-trips + payload size, and a rolling 5s channel summary so you can watch the
    refresh-cascade saturate the single serialized evaluate channel.
-->
<script lang="ts">
    import ClearAll from 'svelte-codicons/lib/ClearAll.svelte';
    import { solidDevtools } from './SolidDevtoolsView';
    import type { PerfSample } from './SolidDevtoolsView';

    const { perfSamples } = solidDevtools;

    const OPS = ['version', 'roots', 'children', 'inspect', 'value', 'search'] as const;

    interface Row {
        op: string;
        n: number;
        last: number;
        avg: number;
        max: number;
        roundTrips?: number;
        bytes?: number;
    }

    function rowsFor(samples: PerfSample[]): Row[] {
        const rows: Row[] = [];
        for (const op of OPS) {
            const ss = samples.filter((s) => s.op === op);
            if (!ss.length) {
                continue;
            }
            const last = ss[ss.length - 1];
            let sum = 0;
            let max = 0;
            for (const s of ss) {
                sum += s.totalMs;
                if (s.totalMs > max) {
                    max = s.totalMs;
                }
            }
            rows.push({
                op: op,
                n: ss.length,
                last: Math.round(last.totalMs),
                avg: Math.round(sum / ss.length),
                max: Math.round(max),
                roundTrips: last.roundTrips,
                bytes: last.bytes
            });
        }
        return rows;
    }

    function kb(bytes: number | undefined): string {
        return bytes ? (bytes / 1024).toFixed(1) : '0';
    }

    $: samples = $perfSamples;
    $: rows = rowsFor(samples);
    // window anchored on the most recent sample, so the summary reflects RECENT activity
    // rather than decaying to zero while the app sits idle
    $: ref = samples.length ? samples[samples.length - 1].t : 0;
    $: windowSamples = samples.filter((s) => ref - s.t <= 5000);
    $: windowRoundTrips = windowSamples.reduce((a, s) => a + (s.roundTrips ?? 0), 0);
    $: windowBytes = windowSamples.reduce((a, s) => a + (s.bytes ?? 0), 0);
    $: windowMs = windowSamples.reduce((a, s) => a + s.totalMs, 0);
    $: msPerRoundTrip = windowRoundTrips ? Math.round(windowMs / windowRoundTrips) : 0;
</script>

<div class="perf">
    <div class="perf-bar">
        <span class="perf-title">Perf</span>
        <span class="perf-summary">5s: {windowRoundTrips} round-trips · {kb(windowBytes)} KB · ~{msPerRoundTrip} ms/hop</span>
        <button class="perf-clear" title="Clear samples" on:click={() => solidDevtools.clearPerf()}>
            <ClearAll width="14" height="14" />
        </button>
    </div>
    {#if rows.length}
        <table class="perf-table">
            <thead>
                <tr><th class="opcol">op</th><th>n</th><th>last</th><th>avg</th><th>max</th><th>rt</th><th>KB</th></tr>
            </thead>
            <tbody>
                {#each rows as r (r.op)}
                    <tr>
                        <td class="op">{r.op}</td>
                        <td>{r.n}</td>
                        <td>{r.last}</td>
                        <td>{r.avg}</td>
                        <td>{r.max}</td>
                        <td>{r.roundTrips ?? ''}</td>
                        <td>{kb(r.bytes)}</td>
                    </tr>
                {/each}
            </tbody>
        </table>
    {:else}
        <div class="perf-empty">No samples yet — interact with the tree/inspector.</div>
    {/if}
</div>

<style>
    .perf {
        flex: 0 0 auto;
        max-height: 40%;
        overflow: auto;
        border-top: 1px solid var(--vscode-panel-border, #4444);
        background: var(--vscode-editorWidget-background, transparent);
        font-family: var(--vscode-editor-font-family, monospace);
        font-size: 11px;
    }

    .perf-bar {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 3px 6px;
        position: sticky;
        top: 0;
        background: var(--vscode-editorWidget-background, var(--vscode-editor-background));
    }

    .perf-title {
        font-weight: 600;
        opacity: 0.8;
    }

    .perf-summary {
        flex: 1 1 auto;
        min-width: 0;
        opacity: 0.7;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .perf-clear {
        flex: 0 0 auto;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        background: transparent;
        border: none;
        color: var(--vscode-icon-foreground);
        cursor: pointer;
        padding: 2px;
        border-radius: 3px;
        opacity: 0.85;
    }

    .perf-clear:hover {
        background: var(--vscode-toolbar-hoverBackground, rgba(255, 255, 255, 0.1));
        opacity: 1;
    }

    .perf-table {
        width: 100%;
        border-collapse: collapse;
    }

    .perf-table th {
        text-align: right;
        font-weight: normal;
        opacity: 0.5;
        padding: 1px 6px;
    }

    .perf-table td {
        text-align: right;
        padding: 1px 6px;
    }

    .perf-table th.opcol,
    .perf-table td.op {
        text-align: left;
    }

    .perf-table td.op {
        color: var(--vscode-debugTokenExpression-name, var(--vscode-foreground));
    }

    .perf-table tbody tr:hover {
        background: var(--vscode-list-hoverBackground);
    }

    .perf-empty {
        padding: 6px;
        opacity: 0.5;
    }
</style>
