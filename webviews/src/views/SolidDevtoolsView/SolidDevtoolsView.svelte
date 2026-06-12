<script lang="ts">
    window.vscode = acquireVsCodeApi();
    import { onDestroy } from 'svelte';
    import { intermediary } from '../../ExtensionIntermediary';
    import { solidDevtools } from './SolidDevtoolsView';
    import TreeNode from './TreeNode.svelte';
    import ValuePreview from './ValuePreview.svelte';
    import type { SolidDevtoolsResult, SolidEncodedValue, SolidInspectData, SolidInspectEntry, SolidTreeNode } from '../../../../src/solidDevtools/protocol';

    const POLL_MS = 1500;
    const { selectedId } = solidDevtools;

    let live = true;
    let roots: SolidTreeNode[] = [];
    let haveTree = false;
    let connected: boolean | undefined;
    /** Full-pane guidance when there's no tree to show yet. */
    let guidance = '';
    let statusLine = 'loading…';
    /** Bumping this makes every expanded TreeNode re-fetch its layer. */
    let refreshEpoch = 0;
    let refreshing = false;
    let lastVersion: number | null = null;

    function guidanceFor(result: SolidDevtoolsResult<unknown>): string {
        if (result.ok) {
            return '';
        }
        switch (result.reason) {
            case 'no-session':
                return 'No debug session — launch an RSG/TS app and wait for the (JS) session to attach to the device.';
            case 'no-bridge':
                return 'No devtools bridge on the device yet — make sure the "brightscript.solidDevtools.enabled" setting is on and the app has finished loading, then Refresh.';
            default:
                return `Error: ${result.message ?? 'unknown'}`;
        }
    }

    // No "refreshing…" churn here — a slow refresh shows the delayed spinner instead.
    function updateStatusLine() {
        statusLine = `${roots.length} root(s)` + (live ? ' · live' : '');
    }

    async function loadRoots(reason: 'initial' | 'refresh') {
        const result = await solidDevtools.sendRequest({ method: 'roots' });
        if (!result.ok) {
            if (reason === 'refresh' && haveTree) {
                // Transient (mid-navigation hiccup) — keep the current tree and let
                // the next poll retry; don't flash a scary banner.
                refreshing = false;
                updateStatusLine();
            } else {
                guidance = guidanceFor(result);
                statusLine = '';
            }
            return;
        }
        roots = result.data.nodes;
        connected = result.data.connected;
        haveTree = true;
        guidance = '';
        refreshing = false;
        updateStatusLine();
    }

    function refresh() {
        if (refreshing) {
            return;
        }
        refreshing = true;
        updateStatusLine();
        refreshEpoch += 1;
        void loadRoots(haveTree ? 'refresh' : 'initial');
        void inspectSelected(false);
    }

    // ---- live refresh: poll the bridge's change counter -------------------------
    const pollTimer = setInterval(async () => {
        if (!live) {
            return;
        }
        const result = await solidDevtools.sendRequest({ method: 'version' });
        if (!result.ok) {
            return;
        }
        if (!haveTree && !refreshing) {
            // a session appeared after we showed guidance — load the tree now
            void loadRoots('initial');
        }
        if (lastVersion === null) {
            lastVersion = result.data;
        } else if (result.data !== lastVersion) {
            lastVersion = result.data;
            if (result.data >= 0) {
                refresh();
            }
        }
    }, POLL_MS);
    onDestroy(() => clearInterval(pollTimer));

    // ---- inspector ---------------------------------------------------------------
    interface InspectRow {
        key: string;
        label: string;
        value?: SolidEncodedValue;
        changed: boolean;
        version: number;
    }
    interface InspectSection {
        title: string;
        rows: InspectRow[];
    }

    let inspectData: SolidInspectData | null = null;
    let inspectMessage = 'Select a component to inspect its props, signals & memos.';
    let sections: InspectSection[] = [];
    let inspectPending = false;
    /** Per-row value JSON from the previous inspect of the SAME node — rows whose
     * value changed get a flash animation (like the Variables view). */
    let prevRowJson: Record<string, string> = {};
    let nextRowJson: Record<string, string> = {};
    let rowVersions: Record<string, number> = {};

    const unsubscribeSelected = selectedId.subscribe((id) => {
        if (!id) {
            return;
        }
        solidDevtools.setSelected(id);
        // new node — reset the flash baseline so the first render doesn't flash everything
        prevRowJson = {};
        rowVersions = {};
        inspectData = null;
        sections = [];
        inspectMessage = 'inspecting…';
        void inspectSelected(true);
    });
    onDestroy(unsubscribeSelected);

    async function inspectSelected(force: boolean) {
        const id = $selectedId;
        if (!id) {
            return;
        }
        if (inspectPending && !force) {
            // avoid piling up inspect requests on the serialized channel during live refresh
            return;
        }
        inspectPending = true;
        const result = await solidDevtools.sendRequest({ method: 'inspect', id: id });
        inspectPending = false;
        if ($selectedId !== id) {
            return; // selection moved on while this was in flight
        }
        if (!result.ok) {
            inspectData = null;
            sections = [];
            inspectMessage = guidanceFor(result);
            return;
        }
        setInspectData(result.data);
    }

    function buildSection(title: string, prefix: string, entries: SolidInspectEntry[] | undefined): InspectSection | undefined {
        if (!entries?.length) {
            return undefined;
        }
        const rows = entries.map((entry, i) => buildRow(prefix + (entry.key ?? entry.name ?? i), entry.key ?? entry.name ?? '', entry.value));
        return { title: title, rows: rows };
    }

    function buildRow(key: string, label: string, value: SolidEncodedValue | undefined): InspectRow {
        const json = JSON.stringify(value ?? null);
        const changed = prevRowJson[key] !== undefined && prevRowJson[key] !== json;
        if (changed) {
            rowVersions[key] = (rowVersions[key] ?? 0) + 1;
        }
        nextRowJson[key] = json;
        return { key: key, label: label, value: value, changed: changed, version: rowVersions[key] ?? 0 };
    }

    function setInspectData(data: SolidInspectData) {
        if (data.missing) {
            inspectData = null;
            sections = [];
            inspectMessage = 'This node is no longer present.';
            return;
        }
        nextRowJson = {};
        const built: InspectSection[] = [];
        for (const section of [
            buildSection('Props', 'p:', data.props),
            buildSection('Signals', 's:', data.signals),
            buildSection('Memos', 'm:', data.memos),
            buildSection('Stores', 'st:', data.stores)
        ]) {
            if (section) {
                built.push(section);
            }
        }
        if (data.value) {
            built.push({ title: 'Value', rows: [buildRow('val', '', data.value)] });
        }
        prevRowJson = nextRowJson;
        inspectData = data;
        sections = built;
        inspectMessage = built.length || data.error ? '' : 'No inspectable props/signals/memos on this node.';
    }

    function onLiveChange() {
        solidDevtools.setLive(live);
        updateStatusLine();
    }

    async function init() {
        // the shared UI state must be loaded BEFORE the tree renders — TreeNodes read
        // their expansion from it synchronously at mount
        const state = await solidDevtools.loadUiState();
        live = state.live;
        updateStatusLine();
        if (typeof state.selectedId === 'string') {
            selectedId.set(state.selectedId);
        }
        await loadRoots('initial');
    }

    // Required by any view so we can know that the view is ready to receive messages
    intermediary.sendViewReady();
    void init();
</script>

<div id="container">
    <div id="bar">
        <vscode-button appearance="secondary" on:click={refresh}>Refresh</vscode-button>
        <label class="live"><input type="checkbox" bind:checked={live} on:change={onLiveChange} /> Live</label>
        <span id="status">{statusLine}</span>
        {#if refreshing}
            <!-- fades in only after 400ms, so quick refreshes show nothing at all -->
            <vscode-progress-ring class="spinner" />
        {/if}
    </div>

    {#if guidance}
        <div class="guidance">{guidance}</div>
    {:else}
        {#if connected === false}
            <div class="notice">
                Bridge is on the device but solid DEV never connected — this doesn't look
                like a dev build. Enable <code>solidDevMode</code> in the app's roku-config
                and rebuild.
            </div>
        {/if}
        <div id="tree">
            {#each roots as node (node.id)}
                <TreeNode {node} depth={0} {refreshEpoch} />
            {/each}
        </div>
        <div id="inspect">
            {#if inspectMessage}
                <div class="imsg">{inspectMessage}</div>
            {/if}
            {#if inspectData}
                {#if inspectData.name || inspectData.type}
                    <div class="ihdr">
                        {#if inspectData.name}<span class="iname">{inspectData.name}</span>{/if}
                        {#if inspectData.type}<span class="itype">{inspectData.type}</span>{/if}
                    </div>
                {/if}
                {#each sections as section (section.title)}
                    <div class="isec">
                        <div class="ititle">{section.title}</div>
                        {#each section.rows as row (row.key)}
                            {#key row.version}
                                <div class="irow" class:flash={row.changed}>
                                    {#if row.label}<span class="ikey">{row.label}</span>{#if row.value !== undefined}<span class="ipunc">: </span>{/if}{/if}
                                    {#if row.value !== undefined}<ValuePreview value={row.value} />{/if}
                                </div>
                            {/key}
                        {/each}
                    </div>
                {/each}
                {#if inspectData.error}
                    <div class="isec">
                        <div class="ititle">Error</div>
                        <div class="irow nul">{inspectData.error}</div>
                    </div>
                {/if}
                {#if inspectData.truncated}
                    <div class="imsg">⚠ Some values were collapsed to keep the response small (large component).</div>
                {/if}
            {/if}
        </div>
    {/if}
</div>

<style>
    #container {
        display: flex;
        flex-direction: column;
        height: 100vh;
        font-size: 13px;
    }

    #bar {
        flex: 0 0 auto;
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 6px;
    }

    #status {
        opacity: 0.65;
    }

    .spinner {
        width: 14px;
        height: 14px;
        opacity: 0;
        animation: sdtappear 0.15s ease 0.4s forwards;
    }

    @keyframes sdtappear {
        to {
            opacity: 0.8;
        }
    }

    label.live {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        opacity: 0.8;
        cursor: pointer;
        user-select: none;
    }

    .guidance,
    .notice {
        padding: 10px;
        opacity: 0.8;
    }

    .notice {
        flex: 0 0 auto;
        border-left: 3px solid var(--vscode-editorWarning-foreground, #cca700);
        margin: 0 6px 6px;
    }

    #tree {
        flex: 1 1 auto;
        overflow: auto;
        padding: 2px 4px 8px;
    }

    #inspect {
        flex: 0 0 42%;
        overflow: auto;
        border-top: 1px solid var(--vscode-panel-border, #4444);
        padding: 6px 8px;
    }

    .imsg {
        opacity: 0.5;
        margin-top: 4px;
    }

    .ihdr {
        margin-bottom: 6px;
        padding-bottom: 4px;
        border-bottom: 1px solid var(--vscode-panel-border, #4444);
    }

    .iname {
        color: var(--vscode-symbolIcon-classForeground, #4ec9b0);
    }

    .itype {
        opacity: 0.45;
        font-size: 11px;
        margin-left: 6px;
    }

    .isec {
        margin: 6px 0;
    }

    .ititle {
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        opacity: 0.55;
        margin-bottom: 2px;
    }

    .irow {
        white-space: pre-wrap;
        word-break: break-word;
        padding: 1px 0 1px 8px;
        font-family: var(--vscode-editor-font-family, monospace);
        font-size: 12px;
    }

    .ikey {
        color: var(--vscode-symbolIcon-propertyForeground, #9cdcfe);
    }

    .ipunc {
        opacity: 0.6;
    }

    .nul {
        opacity: 0.5;
    }

    /* flash a row when its value changes, then fade out (like the Variables view) */
    @keyframes sdtflash {
        0% {
            background: var(--vscode-debugView-valueChangedHighlight, #648589);
        }

        100% {
            background: transparent;
        }
    }

    .irow.flash {
        animation: sdtflash 1s ease-out;
        border-radius: 3px;
    }
</style>
