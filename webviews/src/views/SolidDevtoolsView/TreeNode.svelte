<!-- svelte-ignore a11y-click-events-have-key-events -->
<!-- One row of the Solid component tree; children load lazily on expand (recursive). -->
<script lang="ts">
    import { onMount } from 'svelte';
    import Chevron from '../../shared/Chevron.svelte';
    import { solidDevtools, dedupeById } from './SolidDevtoolsView';
    import type { SolidTreeNode } from '../../../../src/solidDevtools/protocol';

    export let node: SolidTreeNode;
    export let depth = 0;
    /** Bumped by the main view on a live refresh — every showing layer re-fetches. */
    export let refreshEpoch = 0;
    /** Set by the parent on straight-line chains (single-child layers) so a user
     * expand opens the whole chain instead of one level per click. */
    export let autoExpand = false;

    const { selectedId } = solidDevtools;

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

<div class="row" class:sel={$selectedId === node.id} on:click={select}>
    {#each { length: depth } as _}
        <span class="indent-guide">&nbsp;</span>
    {/each}
    <span class="twisty" class:loading on:click={toggle}>
        {#if !isLeaf}
            <Chevron {expanded} />
        {/if}
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
                {refreshEpoch}
                autoExpand={userExpand && children.length === 1}
            />
        {/each}
    </div>
{/if}

<style>
    .row {
        display: flex;
        align-items: center;
        white-space: nowrap;
        padding: 2px 0 2px 4px;
        border-radius: 3px;
        cursor: pointer;
    }

    .row:hover {
        background: var(--vscode-list-hoverBackground);
    }

    .row.sel {
        background: var(--vscode-list-activeSelectionBackground);
        color: var(--vscode-list-activeSelectionForeground);
    }

    .indent-guide {
        display: inline-block;
        box-sizing: border-box;
        margin-left: 4px;
        padding-left: 7px;
        border-left: 1px solid var(--vscode-tree-indentGuidesStroke);
        opacity: 0.4;
        align-self: stretch;
    }

    /* fixed-width twisty so leaf labels align with expandable ones */
    .twisty {
        flex: 0 0 auto;
        width: 16px;
        height: 16px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        user-select: none;
    }

    .twisty.loading {
        opacity: 0.4;
    }

    .name {
        color: var(--vscode-symbolIcon-classForeground, #4ec9b0);
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
