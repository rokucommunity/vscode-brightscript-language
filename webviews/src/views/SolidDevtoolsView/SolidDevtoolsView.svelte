<script lang="ts">
    window.vscode = acquireVsCodeApi();
    import { onDestroy } from 'svelte';
    import { intermediary } from '../../ExtensionIntermediary';
    import { ViewProviderEvent } from '../../../../src/viewProviders/ViewProviderEvent';
    import ListTree from 'svelte-codicons/lib/ListTree.svelte';
    import Ellipsis from 'svelte-codicons/lib/Ellipsis.svelte';
    import ScreenFull from 'svelte-codicons/lib/ScreenFull.svelte';
    import ScreenNormal from 'svelte-codicons/lib/ScreenNormal.svelte';
    import ChevronDown from 'svelte-codicons/lib/ChevronDown.svelte';
    import ChevronRight from 'svelte-codicons/lib/ChevronRight.svelte';
    import ChevronUp from 'svelte-codicons/lib/ChevronUp.svelte';
    import ChevronLeft from 'svelte-codicons/lib/ChevronLeft.svelte';
    import Check from 'svelte-codicons/lib/Check.svelte';
    import { solidDevtools, dedupeById } from './SolidDevtoolsView';
    import TreeNode from './TreeNode.svelte';
    import ValueNode from './ValueNode.svelte';
    import PerfOverlay from './PerfOverlay.svelte';
    import Spinner from './Spinner.svelte';
    import type { SolidDevtoolsResult, SolidEncodedValue, SolidInspectData, SolidInspectEntry, SolidInspectorPosition, SolidSearchMatch, SolidTreeNode } from '../../../../src/solidDevtools/protocol';

    const POLL_MS = 1500;
    const { selectedId, selectedNode, focusedId, searchResults, searching, searchError } = solidDevtools;

    // ---- inspector layout (position / collapse / resize / full-screen) -----------
    // Persisted per-workspace AND per-context (the sidebar view and the popped-out
    // editor panel remember their own). `fullscreen` is a transient action (inspector
    // fills the whole view, tree hidden) — deliberately NOT persisted, so reopening
    // never strands the user with no tree.
    let position: SolidInspectorPosition = 'bottom';
    let collapsed = false;
    let fullscreen = false;
    let sizePct = 0.42;
    let menuOpen = false;
    let bodyEl: HTMLElement;
    let dragging = false;

    // order matches VS Code's "Panel Position" submenu (Top / Left / Right / Bottom)
    const positionOptions: Array<{ value: SolidInspectorPosition; label: string }> = [
        { value: 'top', label: 'Top' },
        { value: 'left', label: 'Left' },
        { value: 'right', label: 'Right' },
        { value: 'bottom', label: 'Bottom' }
    ];

    // The collapse chevron points the way the pane MOVES when you click it: expanded →
    // toward its dock edge, collapsed → back toward the tree. So right+open → ▶,
    // right+collapsed → ◀, bottom+open → ▼, etc.
    function chevronFor(pos: SolidInspectorPosition, isCollapsed: boolean) {
        switch (pos) {
            case 'top':
                return isCollapsed ? ChevronDown : ChevronUp;
            case 'left':
                return isCollapsed ? ChevronRight : ChevronLeft;
            case 'right':
                return isCollapsed ? ChevronLeft : ChevronRight;
            default: // bottom
                return isCollapsed ? ChevronUp : ChevronDown;
        }
    }

    $: vertical = position === 'left' || position === 'right';
    $: collapseIcon = chevronFor(position, collapsed);

    function persistLayout() {
        solidDevtools.saveLayout({ position: position, collapsed: collapsed, sizePct: sizePct });
    }

    function setPosition(value: SolidInspectorPosition) {
        position = value;
        menuOpen = false;
        persistLayout();
    }

    function toggleCollapsed() {
        collapsed = !collapsed;
        if (collapsed) {
            fullscreen = false; // can't be both minimized and maximized
        }
        menuOpen = false;
        persistLayout();
    }

    function toggleFullscreen() {
        fullscreen = !fullscreen;
        if (fullscreen) {
            collapsed = false;
        }
        // transient — don't persist
    }

    // ---- splitter drag (resize the inspector pane) ------------------------------
    function onSplitterDown(e: PointerEvent) {
        dragging = true;
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        e.preventDefault();
    }
    function onSplitterMove(e: PointerEvent) {
        if (!dragging || !bodyEl) {
            return;
        }
        const r = bodyEl.getBoundingClientRect();
        let pct: number;
        if (position === 'bottom') {
            pct = (r.bottom - e.clientY) / r.height;
        } else if (position === 'top') {
            pct = (e.clientY - r.top) / r.height;
        } else if (position === 'right') {
            pct = (r.right - e.clientX) / r.width;
        } else {
            pct = (e.clientX - r.left) / r.width; // left
        }
        sizePct = Math.min(0.85, Math.max(0.12, pct));
    }
    function onSplitterUp(e: PointerEvent) {
        if (!dragging) {
            return;
        }
        dragging = false;
        try {
            (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
        } catch {
            // pointer was already released
        }
        persistLayout();
    }

    // ---- keyboard navigation (VS Code tree parity; Enter inspects) --------------
    // The tree pane holds focus (ARIA activedescendant style); the visible rows are read
    // straight from the DOM — collapsed children aren't rendered, so the rows ARE the
    // flattened visible list, in order. Expand/collapse/select reuse the rows' existing
    // click handlers (dispatched programmatically) so there's no second source of truth.
    let treepaneEl: HTMLElement;

    function visibleRows(): HTMLElement[] {
        return treepaneEl ? Array.from(treepaneEl.querySelectorAll<HTMLElement>('[data-node-id]')) : [];
    }

    function focusRow(row: HTMLElement | undefined) {
        if (!row) {
            return;
        }
        const id = row.getAttribute('data-node-id');
        if (id) {
            solidDevtools.setFocused(id);
        }
        row.scrollIntoView({ block: 'nearest' });
    }

    function onTreeKeydown(e: KeyboardEvent) {
        if ($searchResults !== null) {
            return; // results mode shows a list, not the tree
        }
        const rows = visibleRows();
        if (!rows.length) {
            return;
        }
        const i = rows.findIndex((r) => r.getAttribute('data-node-id') === $focusedId);
        const current = i >= 0 ? rows[i] : undefined;
        const expanded = current?.getAttribute('data-expanded') === 'true';
        const leaf = current?.getAttribute('data-leaf') === 'true';
        const twisty = () => current?.querySelector<HTMLElement>('.twisty')?.click();

        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                focusRow(i < 0 ? rows[0] : rows[Math.min(i + 1, rows.length - 1)]);
                break;
            case 'ArrowUp':
                e.preventDefault();
                focusRow(i <= 0 ? rows[0] : rows[i - 1]);
                break;
            case 'ArrowRight':
                e.preventDefault();
                if (!current) {
                    focusRow(rows[0]);
                } else if (leaf) {
                    // nothing to expand
                } else if (!expanded) {
                    twisty(); // expand in place (focus stays; children load lazily)
                } else {
                    focusRow(rows[i + 1]); // already open → move to first child
                }
                break;
            case 'ArrowLeft':
                e.preventDefault();
                if (!current) {
                    focusRow(rows[0]);
                } else if (expanded) {
                    twisty(); // collapse in place
                } else {
                    // move to parent: nearest preceding row at a shallower depth
                    const depth = Number(current.getAttribute('data-depth') ?? '0');
                    for (let j = i - 1; j >= 0; j--) {
                        if (Number(rows[j].getAttribute('data-depth') ?? '0') < depth) {
                            focusRow(rows[j]);
                            break;
                        }
                    }
                }
                break;
            case 'Enter':
                e.preventDefault();
                current?.click(); // select → inspect
                break;
            case ' ':
                e.preventDefault();
                if (!leaf) {
                    twisty(); // Space toggles expand, like VS Code
                }
                break;
            case 'Home':
                e.preventDefault();
                focusRow(rows[0]);
                break;
            case 'End':
                e.preventDefault();
                focusRow(rows[rows.length - 1]);
                break;
        }
    }

    // ---- search (debounced full-tree name search → results list) ----------------
    let searchText = '';
    let searchTimer: ReturnType<typeof setTimeout> | undefined;
    function onSearchInput() {
        clearTimeout(searchTimer);
        const q = searchText;
        searchTimer = setTimeout(() => void solidDevtools.runSearch(q), 250);
    }
    function clearSearch() {
        searchText = '';
        clearTimeout(searchTimer);
        void solidDevtools.runSearch('');
    }
    function pickSearchResult(match: SolidSearchMatch) {
        solidDevtools.select({ id: match.id, name: match.name, type: match.type });
    }
    function revealResult(match: SolidSearchMatch) {
        solidDevtools.revealInTree(match); // expand ancestors + select + request scroll
        clearSearch(); // back to the tree, which remounts and cascades open to the match
    }
    onDestroy(() => clearTimeout(searchTimer));

    let live = true;
    let showPerf = false;
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
        try {
            const result = await solidDevtools.sendRequest({ method: 'roots' });
            if (!result.ok) {
                if (reason === 'refresh' && haveTree) {
                    // Transient (mid-navigation hiccup) — keep the current tree and let
                    // the next poll retry; don't flash a scary banner.
                    updateStatusLine();
                } else {
                    guidance = guidanceFor(result);
                    statusLine = '';
                }
                return;
            }
            roots = dedupeById(result.data.nodes);
            connected = result.data.connected;
            haveTree = true;
            guidance = '';
            updateStatusLine();
        } finally {
            // Every exit must release the Refresh button and the poll's auto-load gate.
            refreshing = false;
        }
    }

    function refresh() {
        if (refreshing) {
            return;
        }
        refreshing = true;
        updateStatusLine();
        refreshEpoch += 1;
        void loadRoots(haveTree ? 'refresh' : 'initial');
        // Re-inspect on every refresh — open drill-downs re-resolve themselves against
        // the fresh value refs (each ValueNode re-fetches when its ref changes).
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
            // Don't let the background refresh cascade preempt a user-initiated inspect —
            // they share the one serialized device channel, so firing the cascade here
            // would queue ahead and stall the inspect. Leave lastVersion untouched so the
            // next poll refreshes once the inspect has landed.
            if (inspectPending) {
                return;
            }
            lastVersion = result.data;
            if (result.data >= 0) {
                refresh();
            }
        }
    }, POLL_MS);
    onDestroy(() => clearInterval(pollTimer));

    // ---- inspector ---------------------------------------------------------------
    // Flash-on-change is handled per-value inside ValueNode (so an expanded store flashes
    // only the field that changed, not the whole object); rows are just data here.
    interface InspectRow {
        key: string;
        label: string;
        value?: SolidEncodedValue;
    }
    interface InspectSection {
        title: string;
        rows: InspectRow[];
    }

    let inspectData: SolidInspectData | null = null;
    let inspectMessage = 'Select a component to inspect its props, signals & memos.';
    let sections: InspectSection[] = [];
    let inspectPending = false;
    /** Monotonic token: only the LATEST inspect updates state / clears pending, so a stale
     * or superseded request can never strand the pane (the old `$selectedId !== id` compare
     * could leave inspectPending stuck → "inspecting…" forever). */
    let inspectSeq = 0;
    /** Raw inspect outcome for the selected node — shown (collapsed) when the body is
     * empty so an empty/odd payload is diagnosable instead of just looking blank. */
    let lastRaw: string | null = null;
    /** Show the "inspecting…" label whenever a node is selected but we don't yet have its
     * data OR a message to show. Deliberately NOT keyed on the async `inspectPending` flag
     * (its true/false timing has gaps — e.g. the restore-after-reload path), so the label
     * appears the instant you select and clears the moment data/a message lands. Background
     * re-inspects keep `inspectData` set, so they never re-trigger it. */
    $: inspecting = !!$selectedId && !inspectData && !inspectMessage;

    const unsubscribeSelected = selectedId.subscribe((id) => {
        if (!id) {
            return;
        }
        solidDevtools.resetDrill(); // drill paths are relative to the inspected node
        inspectData = null;
        sections = [];
        lastRaw = null;
        inspectMessage = ''; // the "inspecting…" label (+ delayed spinner) covers loading
        void inspectSelected(true, id); // pass the FRESH id so we never inspect a stale node
    });
    onDestroy(unsubscribeSelected);

    async function inspectSelected(force: boolean, forId?: string) {
        const id = forId ?? $selectedId;
        if (!id) {
            return;
        }
        if (inspectPending && !force) {
            // avoid piling up inspect requests on the serialized channel during live refresh
            return;
        }
        const seq = ++inspectSeq; // this call's token; only the latest one updates state
        inspectPending = true;
        try {
            const result = await solidDevtools.sendRequest({ method: 'inspect', id: id });
            if (seq !== inspectSeq) {
                return; // a newer inspect superseded this one
            }
            if (!result.ok) {
                inspectData = null;
                sections = [];
                lastRaw = JSON.stringify(result, null, 2);
                inspectMessage = guidanceFor(result);
                return;
            }
            setInspectData(result.data);
        } catch (e) {
            // never leave the pane stuck at "inspecting…" — surface whatever broke
            const err = e as { stack?: string; message?: string };
            if (seq === inspectSeq) {
                inspectData = null;
                sections = [];
                lastRaw = String(err?.stack ?? err?.message ?? e);
                inspectMessage = `Inspect failed: ${err?.message ?? e}`;
            }
        } finally {
            // only the LATEST inspect owns the pending flag — a superseded one resolving
            // here must not clear it (and, crucially, the latest ALWAYS clears it, so the
            // "inspecting…" indicator can never get stuck on).
            if (seq === inspectSeq) {
                inspectPending = false;
            }
        }
    }

    function buildSection(title: string, prefix: string, entries: SolidInspectEntry[] | undefined): InspectSection | undefined {
        if (!entries?.length) {
            return undefined;
        }
        // Key by index — unnamed signals/memos all come back with name '' (and a prop
        // name could in theory repeat), so a name-based key isn't unique and a dup key
        // makes Svelte's keyed {#each} throw, blanking the whole pane. Index is unique
        // within a section and position-stable across refreshes (so drill paths + flash
        // baselines stay put).
        const rows = entries.map((entry, i) => ({ key: prefix + i, label: entry.key ?? entry.name ?? '', value: entry.value }));
        return { title: title, rows: rows };
    }

    function setInspectData(data: SolidInspectData) {
        if (data.missing) {
            inspectData = null;
            sections = [];
            inspectMessage = 'This node is no longer present.';
            return;
        }
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
            built.push({ title: 'Value', rows: [{ key: 'val', label: '', value: data.value }] });
        }
        inspectData = data;
        sections = built;
        // NOTE: don't reset drill-down here — open paths re-resolve against the fresh
        // refs (that's what makes drill-down live). Reset only happens on node change.
        // keep the raw payload around for the diagnostic <details> when the body is empty
        lastRaw = built.length ? null : JSON.stringify(data, null, 2);
        inspectMessage = built.length || data.error ? '' : 'No readable props, signals, memos, or value on this node.';
    }

    function onLiveChange() {
        solidDevtools.setLive(live);
        updateStatusLine();
    }

    function onPerfChange() {
        solidDevtools.setPerf(showPerf);
    }

    async function init() {
        // sidebar vs popped-out panel — picks which context's layout we read/write
        solidDevtools.setContext((window as { webviewContext?: string }).webviewContext === 'panel' ? 'panel' : 'sidebar');
        // the shared UI state must be loaded BEFORE the tree renders — TreeNodes read
        // their expansion from it synchronously at mount
        const state = await solidDevtools.loadUiState();
        live = state.live;
        showPerf = state.perf ?? false;
        const layout = solidDevtools.getLayout();
        position = layout.position;
        collapsed = layout.collapsed;
        sizePct = layout.sizePct;
        updateStatusLine();
        if (typeof state.selectedId === 'string') {
            selectedId.set(state.selectedId);
            solidDevtools.setFocused(state.selectedId); // restore the focus outline too
        }
        await loadRoots('initial');
    }

    // A new debug session = a new owner graph; the provider already cleared the
    // persisted state — reset our in-memory copy and start over.
    intermediary.observeEvent(ViewProviderEvent.onSolidDevtoolsDebugSessionStarted, () => {
        solidDevtools.resetUiState();
        solidDevtools.resetDrill();
        selectedId.set(null);
        selectedNode.set(null);
        inspectData = null;
        sections = [];
        lastRaw = null;
        inspectMessage = 'Select a component to inspect its props, signals & memos.';
        roots = []; // unmounts every TreeNode; fresh ones re-read the (cleared) expansion
        haveTree = false;
        lastVersion = null;
        guidance = '';
        statusLine = 'waiting for app…';
        // don't loadRoots here — the app is still booting; the version poll retries
    });

    // Stream of timed bridge round-trips from the extension transport → perf overlay.
    // Always recorded (cheap, bounded buffer) so toggling the overlay on shows recent history.
    intermediary.observeEvent(ViewProviderEvent.onSolidDevtoolsPerfSample, (message) => {
        solidDevtools.recordPerf(message.context.sample);
    });

    // Required by any view so we can know that the view is ready to receive messages
    intermediary.sendViewReady();
    void init();
</script>

<div id="container">
    <div id="bar">
        <vscode-button appearance="secondary" title="Re-fetch the component tree and re-inspect the selected node" on:click={refresh}>Refresh</vscode-button>
        <label class="live" title="Auto-refresh the tree and inspector as the app's reactive graph changes"><input type="checkbox" bind:checked={live} on:change={onLiveChange} /> Live</label>
        <label class="live" title="Round-trip timing between the Solid Devtools and the device"><input type="checkbox" bind:checked={showPerf} on:change={onPerfChange} /> Perf</label>
        <span id="status">{statusLine}</span>
        {#if refreshing}
            <!-- fades in only after 400ms, so quick refreshes show nothing at all -->
            <Spinner />
        {/if}
    </div>

    <div id="searchbar">
        <input
            type="search"
            placeholder="Search components by name…"
            bind:value={searchText}
            on:input={onSearchInput}
        />
        {#if searchText}<button class="clearsearch" title="Clear" on:click={clearSearch}>✕</button>{/if}
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
        <div
            id="body"
            bind:this={bodyEl}
            data-pos={position}
            class:collapsed
            class:fullscreen
            class:dragging
            style="--isize: {(sizePct * 100).toFixed(2)}%"
        >
            <div
                id="treepane"
                bind:this={treepaneEl}
                role="tree"
                tabindex="0"
                on:keydown={onTreeKeydown}
                on:pointerdown={() => treepaneEl?.focus({ preventScroll: true })}
            >
                {#if $searchResults !== null}
                    <!-- search active: a results list replaces the tree; click to inspect -->
                    {#if $searching}
                        <div class="searchmsg">searching…</div>
                    {:else if $searchError}
                        <div class="searchmsg">{$searchError}</div>
                    {:else if $searchResults.length === 0}
                        <div class="searchmsg">No components match “{searchText}”.</div>
                    {:else}
                        <div class="searchmsg">{$searchResults.length} match{$searchResults.length === 1 ? '' : 'es'}</div>
                        {#each $searchResults as match (match.id)}
                            <div class="result" class:sel={$selectedId === match.id} on:click={() => pickSearchResult(match)}>
                                <div class="result-main">
                                    <div class="result-head">
                                        <span class="name">{match.name}</span>
                                        <span class="type">{match.type}</span>
                                    </div>
                                    {#if match.path}<div class="result-path">{match.path}</div>{/if}
                                </div>
                                <button class="reveal" title="Reveal in tree" on:click|stopPropagation={() => revealResult(match)}>
                                    <ListTree />
                                </button>
                            </div>
                        {/each}
                    {/if}
                {:else}
                    {#each roots as node (node.id)}
                        <TreeNode {node} {refreshEpoch} />
                    {/each}
                {/if}
            </div>

            {#if !collapsed && !fullscreen}
                <!-- drag to resize the inspector pane; pointer-captured so it tracks
                     even when the pointer leaves the thin splitter -->
                <div
                    id="splitter"
                    class:dragging
                    on:pointerdown={onSplitterDown}
                    on:pointermove={onSplitterMove}
                    on:pointerup={onSplitterUp}
                ></div>
            {/if}

            <div id="inspect">
                <!-- header is ALWAYS present so the layout controls stay reachable even
                     when the body is collapsed or nothing is selected yet -->
                <div class="ihdr" class:strip={collapsed && vertical}>
                    <button
                        class="collapse-twisty"
                        title={collapsed ? 'Show inspector' : 'Hide inspector'}
                        on:click={toggleCollapsed}
                    >
                        <svelte:component this={collapseIcon} width="16" height="16" />
                    </button>
                    {#if !(collapsed && vertical)}
                        <!-- title hidden only when collapsed into a thin vertical strip -->
                        <span class="ititle-label">
                            {#if ($selectedNode?.name ?? inspectData?.name)}<span class="iname">{$selectedNode?.name ?? inspectData?.name}</span>{/if}
                            {#if ($selectedNode?.type ?? inspectData?.type)}<span class="itype">{$selectedNode?.type ?? inspectData?.type}</span>{/if}
                            {#if !($selectedNode || inspectData)}<span class="iplaceholder">Inspector</span>{/if}
                        </span>
                    {/if}
                    {#if !collapsed}
                        <!-- layout controls hidden while collapsed; expand to reach them -->
                        <div class="ihdr-controls">
                            <div class="menu-anchor">
                                <button class="ctl" title="Position" aria-label="Position" on:click|stopPropagation={() => (menuOpen = !menuOpen)}>
                                    <Ellipsis width="16" height="16" />
                                </button>
                                {#if menuOpen}
                                    <div class="menu-backdrop" on:click={() => (menuOpen = false)}></div>
                                    <!-- open upward when docked at the bottom so it doesn't fall off the view -->
                                    <div class="menu" class:up={position === 'bottom'}>
                                        <div class="menu-group-label">Position</div>
                                        {#each positionOptions as option (option.value)}
                                            <button class="menu-item" on:click={() => setPosition(option.value)}>
                                                {#if position === option.value}<span class="menu-check"><Check width="14" height="14" /></span>{/if}
                                                {option.label}
                                            </button>
                                        {/each}
                                    </div>
                                {/if}
                            </div>
                            <div class="ctl-sep"></div>
                            <button class="ctl" title={fullscreen ? 'Restore' : 'Maximize inspector'} on:click={toggleFullscreen}>
                                {#if fullscreen}<ScreenNormal width="16" height="16" />{:else}<ScreenFull width="16" height="16" />{/if}
                            </button>
                        </div>
                    {/if}
                </div>

                {#if !collapsed}
                    <div class="ibody">
                        {#if inspecting}
                            <!-- immediate label so the pane isn't blank; the spinner joins it
                                 only once the inspect crosses the slow threshold -->
                            <div class="inspecting"><span>inspecting…</span><Spinner size={14} /></div>
                        {/if}
                        {#if inspectMessage}
                            <div class="imsg">{inspectMessage}</div>
                        {/if}
                        <!-- key on the selected node so switching nodes remounts the rows, resetting
                             each ValueNode's flash baseline (row keys like "s:0" repeat across nodes) -->
                        {#key $selectedId}
                            {#each sections as section (section.title)}
                                <div class="isec">
                                    <div class="ititle">{section.title}</div>
                                    {#each section.rows as row (row.key)}
                                        <div class="irow">
                                            {#if row.value !== undefined}
                                                <ValueNode value={row.value} label={row.label} path={row.key} />
                                            {:else if row.label}
                                                <span class="ikey">{row.label}</span>
                                            {/if}
                                        </div>
                                    {/each}
                                </div>
                            {/each}
                        {/key}
                        {#if inspectData?.error}
                            <div class="isec">
                                <div class="ititle">Error</div>
                                <div class="irow nul">{inspectData.error}</div>
                            </div>
                        {/if}
                        {#if inspectData?.truncated}
                            <div class="imsg">⚠ Some values were collapsed to keep the response small (large component).</div>
                        {/if}
                        {#if lastRaw}
                            <details class="raw">
                                <summary>raw response</summary>
                                <pre>{lastRaw}</pre>
                            </details>
                        {/if}
                    </div>
                {/if}
            </div>
        </div>
    {/if}

    {#if showPerf}
        <PerfOverlay />
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

    #searchbar {
        flex: 0 0 auto;
        display: flex;
        align-items: center;
        gap: 4px;
        padding: 0 6px 6px;
    }

    #searchbar input {
        flex: 1 1 auto;
        min-width: 0;
        font: inherit;
        padding: 3px 6px;
        color: var(--vscode-input-foreground);
        background: var(--vscode-input-background);
        border: 1px solid var(--vscode-input-border, transparent);
        border-radius: 3px;
    }

    #searchbar input:focus {
        outline: 1px solid var(--vscode-focusBorder);
        outline-offset: -1px;
    }

    .clearsearch {
        flex: 0 0 auto;
        font: inherit;
        cursor: pointer;
        color: var(--vscode-foreground);
        background: transparent;
        border: none;
        opacity: 0.6;
        padding: 2px 4px;
    }

    .clearsearch:hover {
        opacity: 1;
    }

    .searchmsg {
        opacity: 0.55;
        padding: 4px 4px 6px;
        font-size: 11px;
    }

    .result {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 3px 6px;
        border-radius: 3px;
        cursor: pointer;
    }

    .result-main {
        flex: 1 1 auto;
        min-width: 0;
    }

    .result:hover {
        background: var(--vscode-list-hoverBackground);
    }

    .result.sel {
        background: var(--vscode-list-activeSelectionBackground);
        color: var(--vscode-list-activeSelectionForeground);
    }

    .reveal {
        flex: 0 0 auto;
        display: none;
        align-items: center;
        cursor: pointer;
        color: inherit;
        background: transparent;
        border: none;
        padding: 2px;
        opacity: 0.7;
    }

    .result:hover .reveal,
    .result.sel .reveal {
        display: inline-flex;
    }

    .reveal:hover {
        opacity: 1;
    }

    .result-head .name {
        color: var(--vscode-foreground);
    }

    .result-head .type {
        opacity: 0.45;
        font-size: 11px;
        margin-left: 6px;
    }

    .result-path {
        opacity: 0.5;
        font-size: 11px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .result.sel .result-path {
        opacity: 0.75;
    }

    .inspecting {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 6px 0;
    }

    .inspecting span {
        opacity: 0.55;
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

    /* ---- body: tree + splitter + inspector, docked per `position` ----------- */
    #body {
        flex: 1 1 auto;
        display: flex;
        min-height: 0;
        overflow: hidden;
    }

    #body[data-pos='bottom'] {
        flex-direction: column;
    }
    #body[data-pos='top'] {
        flex-direction: column-reverse;
    }
    #body[data-pos='right'] {
        flex-direction: row;
    }
    #body[data-pos='left'] {
        flex-direction: row-reverse;
    }

    /* While dragging the splitter, hold the resize cursor across the WHOLE body — pointer
       capture routes events but not the cursor, so without this it would flicker to each
       element's own cursor (pointer over rows, text over labels) as the pointer moves. */
    #body.dragging {
        user-select: none;
    }
    #body.dragging[data-pos='bottom'],
    #body.dragging[data-pos='top'] {
        cursor: row-resize;
    }
    #body.dragging[data-pos='left'],
    #body.dragging[data-pos='right'] {
        cursor: col-resize;
    }
    #body.dragging * {
        cursor: inherit;
    }

    #treepane {
        flex: 1 1 auto;
        min-height: 0;
        min-width: 0;
        overflow: auto;
        padding: 2px 4px 8px;
    }

    /* the focused ROW is the keyboard-focus indicator (VS Code-style), so the tree pane
       container itself doesn't need a focus ring */
    #treepane:focus {
        outline: none;
    }

    #inspect {
        flex: 0 0 var(--isize, 42%);
        min-height: 0;
        min-width: 0;
        display: flex;
        flex-direction: column;
        overflow: hidden;
    }

    /* collapsed = just the header strip; full-screen = inspector fills, tree hidden */
    #body.collapsed #inspect {
        flex: 0 0 auto;
    }
    #body.fullscreen #inspect {
        flex: 1 1 auto;
    }
    #body.fullscreen #treepane {
        display: none;
    }

    .ibody {
        flex: 1 1 auto;
        min-height: 0;
        overflow: auto;
        padding: 6px 8px;
    }

    /* ---- splitter (drag to resize the inspector) ---------------------------- */
    #splitter {
        flex: 0 0 6px;
        position: relative;
        z-index: 2;
    }

    #body[data-pos='bottom'] #splitter,
    #body[data-pos='top'] #splitter {
        cursor: row-resize;
    }
    #body[data-pos='left'] #splitter,
    #body[data-pos='right'] #splitter {
        cursor: col-resize;
    }

    /* a 1px hairline centered in the 6px grab band */
    #splitter::before {
        content: '';
        position: absolute;
        background: var(--vscode-panel-border, #4444);
        transition: background 0.1s;
    }
    #body[data-pos='bottom'] #splitter::before,
    #body[data-pos='top'] #splitter::before {
        left: 0;
        right: 0;
        top: 50%;
        height: 1px;
        transform: translateY(-50%);
    }
    #body[data-pos='left'] #splitter::before,
    #body[data-pos='right'] #splitter::before {
        top: 0;
        bottom: 0;
        left: 50%;
        width: 1px;
        transform: translateX(-50%);
    }
    #splitter:hover::before,
    #splitter.dragging::before {
        background: var(--vscode-sash-hoverBorder, var(--vscode-focusBorder));
    }

    .imsg {
        opacity: 0.5;
        margin-top: 4px;
    }

    .ihdr {
        flex: 0 0 auto;
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 3px 4px 3px 2px;
        border-bottom: 1px solid var(--vscode-panel-border, #4444);
    }

    /* collapsed into a thin vertical strip (left/right dock) — just the twisty */
    .ihdr.strip {
        padding: 3px 2px;
        border-bottom: none;
    }

    .ititle-label {
        flex: 1 1 auto;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .iplaceholder {
        opacity: 0.5;
    }

    .ihdr-controls {
        flex: 0 0 auto;
        display: flex;
        align-items: center;
        gap: 2px;
    }

    .ctl,
    .collapse-twisty {
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

    .ctl:hover,
    .collapse-twisty:hover {
        background: var(--vscode-toolbar-hoverBackground, rgba(255, 255, 255, 0.1));
        opacity: 1;
    }

    .ctl :global(svg),
    .collapse-twisty :global(svg) {
        display: block;
    }

    .ctl-sep {
        width: 1px;
        align-self: stretch;
        margin: 3px;
        background: var(--vscode-panel-border, #4444);
    }

    /* ---- position popup menu ------------------------------------------------ */
    .menu-anchor {
        position: relative;
        display: inline-flex;
    }

    .menu-backdrop {
        position: fixed;
        inset: 0;
        z-index: 10;
    }

    .menu {
        position: absolute;
        top: 100%;
        right: 0;
        margin-top: 3px;
        z-index: 11;
        /* size to content (the short Bottom/Right/Left/Top labels) — a fixed min-width
           left a lot of dead space to the right of the labels */
        white-space: nowrap;
        padding: 4px 0;
        background: var(--vscode-menu-background, var(--vscode-editorWidget-background, #252526));
        color: var(--vscode-menu-foreground, var(--vscode-foreground));
        border: 1px solid var(--vscode-menu-border, var(--vscode-widget-border, #454545));
        border-radius: 4px;
        box-shadow: 0 2px 8px var(--vscode-widget-shadow, rgba(0, 0, 0, 0.36));
    }

    .menu-group-label {
        font-size: 10px;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        opacity: 0.5;
        /* left-align the header with the item labels (past the check gutter) */
        padding: 3px 14px 5px 26px;
    }

    /* block item with a left gutter for the check — labels are left-aligned text, the
       check is absolutely positioned in the gutter (like a native menu). Avoids any flex
       packing that could push the labels off the left edge. */
    .menu-item {
        position: relative;
        display: block;
        width: 100%;
        background: transparent;
        border: none;
        color: inherit;
        cursor: pointer;
        font: inherit;
        text-align: left;
        white-space: nowrap;
        padding: 4px 14px 4px 26px;
    }

    .menu-item:hover {
        background: var(--vscode-menu-selectionBackground, var(--vscode-list-activeSelectionBackground));
        color: var(--vscode-menu-selectionForeground, var(--vscode-list-activeSelectionForeground));
    }

    .menu-check {
        position: absolute;
        left: 7px;
        top: 50%;
        transform: translateY(-50%);
        display: inline-flex;
    }

    .iname {
        color: var(--vscode-foreground);
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
        padding: 1px 0 1px 8px;
        font-family: var(--vscode-editor-font-family, monospace);
        font-size: 12px;
    }

    .ikey {
        color: var(--vscode-debugTokenExpression-name, var(--vscode-foreground));
    }

    .nul {
        opacity: 0.5;
    }

    .raw {
        margin-top: 10px;
        opacity: 0.7;
        font-size: 11px;
    }

    .raw summary {
        cursor: pointer;
        user-select: none;
    }

    .raw pre {
        white-space: pre-wrap;
        word-break: break-word;
        font-family: var(--vscode-editor-font-family, monospace);
        margin: 4px 0 0;
    }
</style>
