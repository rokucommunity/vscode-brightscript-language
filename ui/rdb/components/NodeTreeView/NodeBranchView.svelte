<script lang="ts">
    import type {ODC} from 'roku-test-automation';
    import { createEventDispatcher } from 'svelte';
    const dispatch = createEventDispatcher();

    import NodeArrow from './NodeArrow.svelte';
    import NodeDetailView from './NodeDetailView.svelte';

    const storage = window.localStorage;

    export let nodeTree: ODC.NodeTree;

    const expandedStorageKey = `expanded:${nodeTree.ref}`;
    export let expanded = !!storage[expandedStorageKey];
    $:{
        if (expanded) {
            storage[expandedStorageKey] = '1';
        } else {
            storage.removeItem(expandedStorageKey);
        }
    }

    export let focusedNode = -1;
    $:{
        if (nodeTree.ref === focusedNode) {
            selected = true;
            dispatch('childExpanded');
        }
    }

    $:hasChildren = nodeTree.children.length > 0;

    let selected = false;
    let inspectNode = false;

    function toggleExpand() {
        if (!hasChildren) {
            return;
        }
        expanded = !expanded;
    }

    function openNode() {
        inspectNode = true;
    }

    function onChildExpanded() {
        expanded = true
        dispatch('childExpanded');
    }
</script>

<style>
    .hide {
        display: none;
    }

    li {
        color: rgb(190, 190, 190);
        padding: 5px 10px;
    }

    .nodeName {
        color: white;
    }

    li:nth-child(odd) {
        background-color: #1b2631;
    }

    li:nth-child(even) {
        background-color: #151e27;
    }

    .expandable {
        padding-left: 12px;
    }

    #itemContainer {
        cursor: pointer;
    }

    ul {
        margin: 0;
        list-style: none;
        padding: 0;
        /* margin-left: 10px; */
        padding-left: 10px;
    }

    li.selected {
        background-color: #194470;

    }

    li:hover {
        background-color: #00509f;
    }
</style>
<li class:selected>
    {#if hasChildren}
        <NodeArrow {expanded} on:click={toggleExpand} />
    {/if}
    <div class:expandable={hasChildren} id="itemContainer" on:click={openNode} >
        <span class="nodeName">{nodeTree.global ? 'Global' : nodeTree.subtype}</span>{#if nodeTree.id.length > 0}&nbsp;id: {nodeTree.id}{/if}
    </div>
</li>
<ul class:hide={!expanded}>
    {#each nodeTree.children as nodeTree}
        <!-- Want to prevent global from showing up under scene -->
        {#if !nodeTree.global}
            <svelte:self on:childExpanded={onChildExpanded} {nodeTree} {focusedNode} />
        {/if}
    {/each}
</ul>

{#if inspectNode}
    <NodeDetailView {nodeTree} bind:inspectNode={inspectNode} />
{/if}
