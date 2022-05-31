<script lang="ts">
    import type { ODC } from 'roku-test-automation';
    import { utils } from '../../utils';
    import { createEventDispatcher } from 'svelte';
    import Edit from 'svelte-codicons/lib/Edit.svelte';
    import Chevron from '../Common/Chevron.svelte';
    import DebugBreakpointDataUnverified from 'svelte-codicons/lib/DebugBreakpointDataUnverified.svelte';
    const dispatch = createEventDispatcher();

    export let nodeTree: ODC.NodeTree;
    export let depth = 0;
    let self: HTMLDivElement;

    const expandedStorageKey = `expanded:${nodeTree.ref}`;
    export let expanded = utils.getStorageBooleanValue(expandedStorageKey);
    $: {
        if (expanded) {
            utils.setStorageValue(expandedStorageKey, true);
        } else {
            utils.deleteStorageValue(expandedStorageKey);
        }
    }

    let selected = false;
    export let focusedNode = -1;
    $: {
        if (nodeTree.ref === focusedNode) {
            selected = true;
            if (self) {
                document.documentElement.scrollTo(
                    self.getBoundingClientRect().left,
                    self.getBoundingClientRect().top
                );
            }
            dispatch('childExpanded');
        } else {
            selected = false;
        }
    }

    $: hasChildren = nodeTree.children.length > 0;

    function toggleExpand() {
        if (!hasChildren) {
            return;
        }
        expanded = !expanded;
    }

    function open() {
        dispatch('open', nodeTree);
    }

    function onChildExpanded() {
        expanded = true;
        dispatch('childExpanded');
    }
</script>

<style>
    .self {
        --leftGutterPadding: 15px;
        position: relative;
        padding-left: var(--leftGutterPadding);
        cursor: pointer;
        height: 100%;
        display: flex;
    }

    .self.selected {
        background-color: var(--vscode-list-activeSelectionBackground);
        color: var(--vscode-list-activeSelectionForeground);
    }

    .self:hover {
        color: var(--vscode-list-hoverForeground);
        background-color: var(--vscode-list-hoverBackground);
    }

    .children {
        position: relative;
    }

    .self:hover .actions {
        display: flex;
    }

    .actions {
        position: absolute;
        right: 5px;
        display: none;
        height: 100%;
        align-items: center;
    }

    .item-icon {
        display: inline-block;
        vertical-align: middle;
    }

    .nodeName {
        display: inline-block;
        vertical-align: middle;
    }

    .indent-guide {
        display: inline-block;
        box-sizing: border-box;
        margin-left: 4px;
        padding-left: 3px;
        border-left: 1px solid var(--vscode-tree-indentGuidesStroke);
        opacity: 0.4;
    }
    .content {
        display: flex;
        padding: 4px 0px;
    }
</style>

<div
    class="self"
    bind:this={self}
    class:selected
    on:click|stopPropagation={toggleExpand}>
    {#each { length: depth ?? 0 } as _, i}
        <span class="indent-guide">&nbsp;</span>
    {/each}
    <div class="content">
        <span class="item-icon">
            {#if hasChildren}
                <Chevron expanded={expanded} />
            {:else}
                <DebugBreakpointDataUnverified style="opacity: .2" />
            {/if}
        </span>
        <span class="nodeName">
            {nodeTree.subtype}
        </span>
        {#if nodeTree.id.length > 0}&nbsp;id: {nodeTree.id}{/if}
    </div>
    <div class="actions">
        <span title="Edit" class="icon-button" on:click={open}>
            <Edit />
        </span>
    </div>
</div>
<div class="children" class:hide={!expanded}>
    {#each nodeTree.children as nodeTree}
        <svelte:self
            on:open
            on:childExpanded={onChildExpanded}
            depth={depth + 1}
            nodeTree={nodeTree}
            focusedNode={focusedNode} />
    {/each}
</div>
