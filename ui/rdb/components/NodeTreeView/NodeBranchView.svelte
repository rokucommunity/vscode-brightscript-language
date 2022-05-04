<script lang="ts">
    import type { ODC } from 'roku-test-automation';
    import { utils } from '../../utils';
    import NodeArrow from './NodeArrow.svelte';
    import { createEventDispatcher } from 'svelte';
    const dispatch = createEventDispatcher();

    export let nodeTree: ODC.NodeTree;
    export let inspectNodeSubtype: string;
    export let inspectNodeBaseKeyPath: ODC.BaseKeyPath | null;

    let self: Element;

    const expandedStorageKey = `expanded:${nodeTree.ref}`;
    export let expanded = utils.getStorageBoolean(expandedStorageKey);
    $:{
        if (expanded) {
            utils.setStorageValue(expandedStorageKey, true);
        } else {
            utils.deleteStorageValue(expandedStorageKey);
        }
    }

    let selected = false;
    export let focusedNode = -1;
    $:{
        if (nodeTree.ref === focusedNode) {
            selected = true;
            if (self) {
                document.documentElement.scrollTo(self.getBoundingClientRect().left, self.getBoundingClientRect().top);
            }
            dispatch('childExpanded');
        } else {
            selected = false;
        }
    }

    $:hasChildren = nodeTree.children.length > 0;

    function toggleExpand() {
        if (!hasChildren) {
            return;
        }
        expanded = !expanded;
    }

    function openNode() {
        inspectNodeBaseKeyPath = {
            base: 'nodeRef',
            keyPath: `${nodeTree.ref}`
        }
        inspectNodeSubtype = nodeTree.subtype;
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
        padding: 5px 10px;
        /* color: var(--vscode-list-activeSelectionForeground); */
        /* background-color: var(--vscode-list-activeSelectionBackground); */
    }

    .nodeName {
    }
/*
    li:nth-child(odd) {
        background-color: inherit;
    }

    li:nth-child(even) {
        background-color: inherit;
    } */

    .expandable {
        padding-left: 12px;
    }

    #itemContainer {
        cursor: pointer;
        position: relative;
    }

    ul {
        margin: 0;
        list-style: none;
        padding: 0;
        padding-left: 10px;
    }

    li{
        border: 1px solid transparent;
    }

    li.selected {
        background-color: inherit;
        background-color: var(--vscode-list-activeSelection);
        color: var(--vscode-list-activeSelectionForeground);
    }

    li:hover {
        color: var(--vscode-list-hoverForeground);
        background-color: var(--vscode-list-hoverBackground);
    }

    .buttonContainer {
        position: absolute;
        right: 0;
        top: 50%;
        margin-top: -8px;
        display: none;
    }

    li:hover .buttonContainer {
        display: block;
    }

    .buttonContainer button {
        cursor: pointer;
        border-radius: 25%;
        color: #FFFFFF;
        background-color: #121a21;
        border: none;
        padding: 1px 10px;
        opacity: 0.85;
    }

    .buttonContainer button:hover {
        background-color: #143758;
    }
</style>
<li bind:this={self} class:selected on:click={toggleExpand}>
    {#if hasChildren}
        <NodeArrow {expanded} />
    {/if}
    <div class:expandable={hasChildren} id="itemContainer">
        <span class="nodeName">{nodeTree.subtype}</span>{#if nodeTree.id.length > 0}&nbsp;id: {nodeTree.id}{/if}
        <div class="buttonContainer">
            <button title="Info" class="info" on:click={openNode}>i</button>
        </div>
    </div>
</li>
<ul class:hide={!expanded}>
    {#each nodeTree.children as nodeTree}
        <svelte:self on:childExpanded={onChildExpanded} {nodeTree} {focusedNode} bind:inspectNodeBaseKeyPath={inspectNodeBaseKeyPath} bind:inspectNodeSubtype={inspectNodeSubtype} />
    {/each}
</ul>
