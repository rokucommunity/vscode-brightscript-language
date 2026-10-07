<!-- svelte-ignore a11y-click-events-have-key-events -->
<!-- One row of the Solid component tree; children load lazily on expand (recursive). -->
<script lang="ts">
    import { onMount } from 'svelte';
    import ChevronOrSpinner from './ChevronOrSpinner.svelte';
    import { solidDevtools, dedupeById } from './SolidDevtoolsView';
    import type { SolidTreeNode } from '../../../../src/solidDevtools/protocol';

    export let node: SolidTreeNode;
    /** Bumped by the main view on a live refresh — every showing layer re-fetches. */
    export let refreshEpoch = 0;
    /** Set by the parent on straight-line chains (single-child layers) so a user
     * expand opens the whole chain instead of one level per click. */
    export let autoExpand = false;
    /** Nesting depth; top-level roots are 0 (no guides). */
    export let depth = 0;
    /** Id of this node's parent (undefined at the root). */
    export let parentId: string | undefined = undefined;
    /** Ids of this node's ancestors (top → parent), for active-guide subtree matching. */
    export let ancestorIds: string[] = [];

    const { selectedId, focusedId, scrollTargetId, activeGuideAncestorId, activeGuideLevel } = solidDevtools;

    // The selected node publishes which indent guide is "active": when it's expanded with
    // children, the guide its children hang off of (its own depth); when it's a leaf or
    // collapsed, the guide at its own level (its parent's depth). The guide is then bright
    // across that anchor's whole subtree (see activeIndex below) — VS Code's behavior.
    $: if ($selectedId === node.id) {
        const showsChildren = expanded && children.length > 0;
        solidDevtools.setActiveGuide(showsChildren ? node.id : (parentId ?? null), showsChildren ? depth : depth - 1);
    }

    // Which of THIS row's guide lines (indices 0..depth-1) is the bright one, or -1. A
    // row is in the active subtree when the anchor is one of its ancestors.
    $: activeIndex = ($activeGuideAncestorId !== null && ancestorIds.includes($activeGuideAncestorId))
        ? $activeGuideLevel
        : -1;

    let rowEl: HTMLElement;
    // "Reveal in tree" from a search result sets scrollTargetId; the matching row scrolls
    // itself into view once it exists (the tree cascades open to it async), then clears it.
    $: if (rowEl && $scrollTargetId === node.id) {
        rowEl.scrollIntoView({ block: 'center' });
        solidDevtools.clearScrollTarget();
    }

    // The webview is destroyed when the sidebar collapses (and pop-out is a different
    // webview entirely), so expansion lives in the shared extension-side UI state.
    // Node ids are stable for the lifetime of one app run.
    let expanded = solidDevtools.isExpanded(node.id);
    $: solidDevtools.setExpanded(node.id, expanded);
    let loaded = false;
    /** A fetch is in flight (re-entry guard — set for background refreshes too). */
    let fetching = false;
    /** Show the dimmed-chevron loading state — ONLY for the first load of a layer;
     * background refresh re-fetches must not flicker the chevron on every poll. */
    let loading = false;
    let children: SolidTreeNode[] = [];
    let appliedEpoch = refreshEpoch;
    /** True while the loaded children came from a user expand (not a live refresh) —
     * only then may a single child continue the auto-expand chain. */
    let userExpand = false;

    $: isLeaf = !!node.leaf || (loaded && children.length === 0);

    async function fetchChildren(reason: 'expand' | 'refresh') {
        if (fetching) {
            return;
        }
        fetching = true;
        loading = !loaded;
        const result = await solidDevtools.sendRequest({ method: 'children', id: node.id });
        fetching = false;
        loading = false;
        if (result.ok && !result.data.missing) {
            children = dedupeById(result.data.nodes);
            loaded = true;
            userExpand = reason === 'expand';
        } else if (!loaded) {
            // expand failed — collapse so the user can retry
            expanded = false;
        }
    }

    function toggle(event: Event) {
        event.stopPropagation();
        solidDevtools.setFocused(node.id); // expanding via the chevron focuses (not selects)
        if (node.leaf) {
            return;
        }
        expanded = !expanded;
        if (expanded && !loaded) {
            void fetchChildren('expand');
        }
    }

    function select() {
        solidDevtools.select(node);
    }

    onMount(() => {
        // expanded can already be true here when restored from webview state
        if ((autoExpand || expanded) && !node.leaf) {
            expanded = true;
            void fetchChildren('expand');
        }
    });

    // Live-refresh cascade: when the epoch bumps, re-fetch every layer that's showing.
    $: if (refreshEpoch !== appliedEpoch) {
        appliedEpoch = refreshEpoch;
        if (expanded && loaded) {
            void fetchChildren('refresh');
        }
    }
</script>

<div class="node">
    <!-- The row spans the full panel width (containers don't indent), so hover/selection
         highlights are full-width; content is indented via padding (--indent). Indent
         guides are drawn ON the row (full-height absolute lines) so they sit on TOP of the
         highlight and connect continuously across adjacent rows. -->
    <div
        class="row"
        class:sel={$selectedId === node.id}
        class:focused={$focusedId === node.id}
        data-node-id={node.id}
        data-depth={depth}
        data-expanded={expanded}
        data-leaf={isLeaf}
        on:click={select}
        bind:this={rowEl}
        style="--indent: {depth * 8}px"
    >
        {#each { length: depth } as _, i}
            <span class="gline" class:active={i === activeIndex} style="left: {3 + i * 8}px"></span>
        {/each}
        <span class="twisty" on:click={toggle}>
            <ChevronOrSpinner loading={loading} expandable={!isLeaf} {expanded} />
        </span>
        {#if node.name}<span class="name">{node.name}</span>{/if}
        <span class="type">{node.type}</span>
        {#if node.childCount}<span class="count">{node.childCount}</span>{/if}
    </div>
    {#if expanded && !node.leaf}
        <div class="children">
            {#each children as child (child.id)}
                <svelte:self
                    node={child}
                    depth={depth + 1}
                    parentId={node.id}
                    ancestorIds={[...ancestorIds, node.id]}
                    {refreshEpoch}
                    autoExpand={userExpand && children.length === 1}
                />
            {/each}
        </div>
    {/if}
</div>

<style>
    .row {
        position: relative;
        display: flex;
        align-items: center;
        white-space: nowrap;
        box-sizing: border-box;
        width: 100%;
        /* EXACT integer row height so the per-row guide segments (top:0/bottom:0) stack on
           whole pixels — line-height alone left a fractional 21.98px row, so the segments
           drifted off-pixel and antialiased unevenly (some looked thicker). */
        height: 22px;
        line-height: 18px;
        padding: 0 6px 0 calc(var(--indent, 0px) + 2px);
        cursor: pointer;
    }

    .row:hover {
        background: var(--vscode-list-hoverBackground);
    }

    .row.sel {
        background: var(--vscode-list-activeSelectionBackground);
        color: var(--vscode-list-activeSelectionForeground);
    }

    /* focus OUTLINE (no fill) marks the focused row — selection or just chevron-expanded */
    .row.focused {
        outline: 1px solid var(--vscode-list-focusOutline, transparent);
        outline-offset: -1px;
    }

    /* indent guides: full-height absolute lines drawn ON the row (so they paint on top of
       the highlight and connect across adjacent rows). ~8px/level, faint by default; the
       active branch's guide is bright. */
    .gline {
        position: absolute;
        top: 0;
        bottom: 0;
        width: 1px;
        background: var(--vscode-tree-inactiveIndentGuidesStroke, rgba(128, 128, 128, 0.2));
        pointer-events: none;
    }

    .gline.active {
        background: var(--vscode-tree-indentGuidesStroke, rgba(128, 128, 128, 0.5));
    }

    /* fixed-width twisty so leaf labels align with expandable ones */
    .twisty {
        flex: 0 0 auto;
        width: 16px;
        height: 16px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        /* reset the row's line-height so the inline chevron SVG isn't pushed up */
        line-height: 0;
        user-select: none;
    }

    /* block (not baseline-aligned) so the chevron sits centered in the twisty */
    .twisty :global(svg) {
        display: block;
    }

    .name {
        /* default font colour (not an icon-symbol colour) so names stay readable on every
           theme; the dimmed type/anchor suffix carries the distinction instead */
        color: var(--vscode-foreground);
    }

    .type {
        opacity: 0.45;
        font-size: 11px;
        margin-left: 6px;
    }

    .count {
        opacity: 0.5;
        font-size: 11px;
        margin-left: 5px;
    }
</style>
