<script lang="ts">
    import type {ODC} from 'roku-test-automation';

    import NodeArrow from './NodeArrow.svelte';
    import NodeDetailView from './NodeDetailView.svelte';

    export let nodeTree: ODC.NodeTree;
    export let expanded = false;

    $:hasChildren = nodeTree.children.length > 0;

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
</script>

<style>
    li {
        color: rgb(190, 190, 190);
        padding: 5px 10px;
    }

    #nodeName {
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
</style>
<li>
    {#if hasChildren}
        <NodeArrow {expanded} on:click={toggleExpand} />
    {/if}
    <div class:expandable={hasChildren} id="itemContainer" on:click={openNode} >
        <span id="nodeName">{nodeTree.global ? 'Global' : nodeTree.subtype}</span>{#if nodeTree.id.length > 0}&nbsp;id: {nodeTree.id}{/if}
    </div>
</li>
{#if expanded}
<ul>
    {#each nodeTree.children as nodeTree}
        <!-- Want to prevent global from showing up under scene -->
        {#if !nodeTree.global}
            <svelte:self {nodeTree} />
        {/if}
    {/each}
</ul>
{/if}

{#if inspectNode}
    <NodeDetailView {nodeTree} bind:inspectNode={inspectNode} />
{/if}
