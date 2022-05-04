<script lang="ts">
    import type { ODC } from 'roku-test-automation';
    import { utils } from '../../utils';
    import { createEventDispatcher } from 'svelte';
    import Edit from "svelte-codicons/lib/Edit.svelte";
    import Chevron from '../Common/Chevron.svelte';
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
    li {
        padding: 5px 10px;
        position: relative;
        /* border: 0 solid var(--vscode-tree-indentGuidesStroke); */
        border-left-width: 1px;
    }

    .actions {
        position: absolute;
        right: 0;
        /* keep these in sync with the <li> padding above */
        top: -5px;
        bottom: -5px;
        display: none;
        padding-right: 5px;
        display: none;
        align-items: center;
        justify-content: center;
    }

    .hide {
        display: none;
    }

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

    li.selected {
        background-color: var(--vscode-list-activeSelectionBackground);
        color: var(--vscode-list-activeSelectionForeground);
    }

    li:hover {
        color: var(--vscode-list-hoverForeground);
        background-color: var(--vscode-list-hoverBackground);
    }

    li:hover .actions {
        display: flex;
    }

</style>
<li bind:this={self} class:selected on:click={toggleExpand}>
    {#if hasChildren}
        <Chevron {expanded} />
    {/if}
    <div class:expandable={hasChildren} id="itemContainer">
        <span class="nodeName">{nodeTree.subtype}</span>{#if nodeTree.id.length > 0}&nbsp;id: {nodeTree.id}{/if}
        <div class="actions">
            <span title="Edit" class="icon-button" on:click={openNode}>
                <Edit />
            </span>
        </div>
    </div>
</li>
<ul class:hide={!expanded}>
    {#each nodeTree.children as nodeTree}
        <svelte:self on:childExpanded={onChildExpanded} {nodeTree} {focusedNode} bind:inspectNodeBaseKeyPath={inspectNodeBaseKeyPath} bind:inspectNodeSubtype={inspectNodeSubtype} />
    {/each}
</ul>
