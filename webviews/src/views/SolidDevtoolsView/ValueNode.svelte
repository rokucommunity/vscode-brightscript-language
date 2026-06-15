<!-- svelte-ignore a11y-click-events-have-key-events -->
<!--
    One value row in the inspector: an inline ValuePreview, plus — for objects/arrays
    (and long strings) — an expand chevron that drills into a child tree. Recursive.

    Two child sources:
      • INLINE — the inspect already encoded this value's children (depth 2), so
        expanding just renders value.entries/value.items. No device call, and they
        update live for free (the value prop refreshes each inspect).
      • FETCHED — a collapsed value (carries a `ref`, no inline children) or a long
        string, or paging past the inline page. Expanding calls the bridge's lazyValue.
        Re-fetched whenever the value's ref changes (a live re-inspect), so fetched
        drill-downs stay live too. Keyed by a stable PATH so expansion survives re-render.
-->
<script lang="ts">
    import ChevronOrSpinner from './ChevronOrSpinner.svelte';
    import ValuePreview from './ValuePreview.svelte';
    import { solidDevtools } from './SolidDevtoolsView';
    import type { SolidEncodedValue } from '../../../../src/solidDevtools/protocol';

    export let value: SolidEncodedValue;
    /** Stable path identifying this node's expansion state, e.g. "s:0/3/1". */
    export let path: string;
    /** Optional label shown before the value (a prop/signal name, object key, or [i]). */
    export let label = '';
    export let labelClass = 'vkey';

    const { drill } = solidDevtools;

    $: ref = value?.ref;
    $: isContainer = value?.t === 'object' || value?.t === 'array';
    $: inlineItems = value?.items;
    $: inlineEntries = value?.entries;
    $: hasInline = !!(inlineItems?.length || inlineEntries?.length);
    // A fetch is needed when there's nothing inline to show but children exist behind a
    // ref (fully collapsed), or it's a long string, or there are more items than inlined.
    $: needsFetch = ref !== undefined && (value?.t === 'string' || (isContainer && (!hasInline || !!value?.more)));
    $: expandable = (isContainer && hasInline) || needsFetch;

    $: isOpen = $drill.open.has(path);
    $: fetched = $drill.children[path];
    // first-page fetch in flight (no data yet) — drives the delayed spinner on the twisty.
    // A live re-fetch keeps the old `fetched` shown, so it won't spin on every refresh.
    $: fetching = isOpen && needsFetch && !fetched;
    // What to render children from: the fetched page if we fetched, else inline.
    $: renderNode = fetched ? fetched.node : value;
    $: moreCount = fetched ? fetched.more : 0;

    // When expanded, the children below carry the detail — so the row shows a minimal
    // summary ({…}/[…], with the constructor name if any) instead of the full inline
    // preview, which would just duplicate the listed children (keeps big objects from
    // dominating the pane). Two independent ternaries — no nesting.
    $: openSummary = (value?.ctor ? value.ctor + ' ' : '') + (value?.t === 'array' ? '[…]' : '{…}');

    // (Re)fetch when open + needs fetching + the ref changed — a live re-inspect gives a
    // fresh ref, keeping the drill-down current. Inline-only expansions never fetch.
    let fetchedRef: number | undefined;
    $: if (isOpen && needsFetch && ref !== undefined && ref !== fetchedRef) {
        fetchedRef = ref;
        void solidDevtools.fetchPath(path, ref);
    }
    $: if (!isOpen && fetchedRef !== undefined) {
        fetchedRef = undefined; // reopening should re-fetch
    }
    // If a refresh changed this value's shape so it's no longer expandable, collapse.
    $: if (isOpen && !expandable) {
        solidDevtools.closePath(path);
    }

    function toggle() {
        if (!expandable) {
            return;
        }
        if (isOpen) {
            solidDevtools.closePath(path);
        } else {
            solidDevtools.openPath(path);
        }
    }

    function showMore() {
        void solidDevtools.loadMorePath(path);
    }

    // Flash this row when its value changes — but ONLY when collapsed/leaf. An expanded
    // container stays quiet and lets the specific changed child flash instead, so a
    // store whose one field changed flashes that field, not the whole object. Compares
    // without `ref` (the ephemeral drill handle is re-numbered every inspect).
    // flashId increments on each change; {#key flashId} remounts the row to replay the
    // animation (the children block is outside the key, so its state is preserved).
    let prevJson: string | undefined;
    let flashId = 0;
    function trackFlash(v: SolidEncodedValue, open: boolean) {
        const json = JSON.stringify(v ?? null, (k, val) => (k === 'ref' ? undefined : val));
        if (prevJson !== undefined && prevJson !== json && !open) {
            flashId++;
        }
        prevJson = json;
    }
    $: trackFlash(value, isOpen);
</script>

{#key flashId}
    <div class="vrow" class:flash={flashId > 0}>
        <span class="twisty" class:clickable={expandable} on:click={toggle}>
            <ChevronOrSpinner loading={fetching} {expandable} expanded={isOpen} />
        </span>
        <span class="vcontent">
            {#if label}<span class={labelClass}>{label}</span><span class="vpunc">{' = '}</span>{/if}{#if isOpen && isContainer}<span class="vsummary">{openSummary}</span>{:else}<span class:vmuted={isContainer}><ValuePreview {value} /></span>{/if}
        </span>
    </div>
{/key}

{#if isOpen && expandable}
    <div class="vchildren">
        {#if renderNode?.t === 'string'}
            <div class="vstring">{renderNode.v}</div>
        {:else if renderNode?.items}
            {#each renderNode.items as item, i (i)}
                <svelte:self value={item} path={path + '/' + i} label={'[' + i + ']'} labelClass="vindex" />
            {/each}
        {:else if renderNode?.entries}
            {#each renderNode.entries as entry, i (i)}
                <svelte:self value={entry.value} path={path + '/' + i} label={entry.k} />
            {/each}
        {/if}
        {#if moreCount}
            <button class="vmore" on:click={showMore}>
                show {moreCount} more{renderNode?.t === 'string' ? ' chars' : ''}…
            </button>
        {/if}
    </div>
{/if}

<style>
    .vrow {
        display: flex;
        align-items: center;
        border-radius: 3px;
    }

    /* flash when this value changes, then fade out (like the Variables view) */
    @keyframes sdtvflash {
        0% {
            background: var(--vscode-debugView-valueChangedHighlight, #648589);
        }

        100% {
            background: transparent;
        }
    }

    .vrow.flash {
        animation: sdtvflash 1s ease-out;
    }

    /* fixed-width twisty so values without one still align */
    .twisty {
        flex: 0 0 auto;
        width: 16px;
        height: 16px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        cursor: default;
        user-select: none;
    }

    /* only show the hand pointer when there's actually something to expand */
    .twisty.clickable {
        cursor: pointer;
    }

    /* the inline value (label + ValuePreview tokens) as ONE flex item, kept to a SINGLE
       truncated line like VS Code's Variables view — drill in with the twisty to see more
       rather than letting a big object preview wrap across many lines. min-width:0 lets
       the flex item shrink so text-overflow can ellipsize. */
    .vcontent {
        flex: 1 1 auto;
        min-width: 0;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    /* the variable/property name — the same neutral token VS Code's Variables view uses */
    .vkey {
        color: var(--vscode-debugTokenExpression-name, var(--vscode-foreground));
    }

    .vindex {
        opacity: 0.5;
    }

    .vpunc {
        opacity: 0.6;
    }

    /* Objects/arrays render in ONE flat colour (VS Code's Variables view does the same —
       the value isn't syntax-highlighted), so a container reads as a single muted blob and
       scalar values stand out. Covers the collapsed preview's per-token spans and the
       expanded {…} summary. The descendant override beats ValuePreview's :global(.sdtv-*). */
    .vsummary,
    .vmuted :global([class^='sdtv-']) {
        color: var(--vscode-debugTokenExpression-value, var(--vscode-descriptionForeground));
        opacity: 1;
    }

    /* children indent: a guide line one level in, matching the tree (~8px/level) */
    .vchildren {
        margin-left: 3px;
        padding-left: 5px;
        border-left: 1px solid var(--vscode-tree-inactiveIndentGuidesStroke, rgba(128, 128, 128, 0.2));
    }

    .vstring {
        white-space: pre-wrap;
        word-break: break-word;
        color: var(--vscode-debugTokenExpression-string, #ce9178);
    }

    .vmore {
        font: inherit;
        font-size: 11px;
        margin: 2px 0 2px 16px;
        padding: 1px 6px;
        cursor: pointer;
        color: var(--vscode-textLink-foreground);
        background: transparent;
        border: 1px solid var(--vscode-panel-border, #4444);
        border-radius: 3px;
    }
</style>
