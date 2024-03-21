<!-- svelte-ignore a11y-click-events-have-key-events -->
<script lang="ts">
    import throttle from 'just-throttle';
    import { odc } from '../../ExtensionIntermediary';
    import { utils } from '../../utils';
    import { Eye, EyeClosed, DebugBreakpointDataUnverified, Move } from 'svelte-codicons';
    import Chevron from '../../shared/Chevron.svelte';
    import type { TreeNodeWithBase } from '../../shared/types';
    import { createEventDispatcher } from 'svelte';
    const dispatch = createEventDispatcher();

    export let treeNode: TreeNodeWithBase;
    export let depth = 0;
    let self: HTMLDivElement;

    const expandedStorageKey = `expanded:${treeNode.keyPath}`;
    export let expanded = utils.getStorageBooleanValue(expandedStorageKey);
    $: {
        if (expanded) {
            utils.setStorageValue(expandedStorageKey, true);
        } else {
            utils.deleteStorageValue(expandedStorageKey);
        }
    }

    export let expandTreeNode: TreeNodeWithBase | undefined;
    $: {
        // Don't want to run on empty keypaths as these are at the base level and should stay expanded
        if (treeNode.keyPath) {
            // Want to collapse for everything but Scene which has an empty key path
            expanded = doTreeNodesMatch(treeNode, expandTreeNode);
        }
    }


    let selected = false;
    export let selectTreeNode: TreeNodeWithBase | undefined;
    $: {
        selected = doTreeNodesMatch(treeNode, selectTreeNode);
    }

    $: hasChildren = treeNode.children.length > 0;

    function doTreeNodesMatch(treeNodeA: TreeNodeWithBase, treeNodeB: TreeNodeWithBase | undefined) {
        if (treeNodeB) {
            if (treeNodeA.subtype === 'MainNode') {
            }
            if (treeNodeA.parentRef >= 0 && treeNodeB.parentRef >= 0) {
                // Use key path to compare if we have a parentRef
                if (treeNodeA.keyPath === treeNodeB.keyPath && treeNodeB.base === treeNodeB.base) {
                    return true;
                }
            } else {
                // Else use ref
                if (treeNodeA.ref === treeNodeB.ref) {
                    return true;
                }
            }
        }
        return false;
    }

    function toggleExpand() {
        if (!hasChildren) {
            open();
            return;
        }
        expanded = !expanded;
    }

    function getOffset(obj){
        let left = obj.offsetLeft;
        let top = obj.offsetTop;

        while (obj = obj.offsetParent) {
            left += obj.offsetLeft;
            top += obj.offsetTop;
        }

        return {left, top};
    }

    function open() {
        // Optimization since we don't need the whole tree to be sent
        dispatch('openNode', {...treeNode, children: []});
    }

    function treeNodeFocused() {
        let detail = null;
        if (treeNode.sceneRect) {
            detail = {...treeNode, children: []}
        }
        // Optimization since we don't need the whole tree to be sent
        dispatch('treeNodeFocused', detail);
    }

    function onNodeMouseEnter() {
        // Useful while debugging
        // console.log(treeNode);
        // console.log('rect:', treeNode.rect);
        // console.log('sceneRect:', treeNode.sceneRect);
        treeNodeFocused();
    }

    function onNodeMouseLeave() {
        dispatch('treeNodeFocused', null);
    }

    let lastXScreenPosition;
    let lastYScreenPosition;
    function onMoveNodePositionDown(e) {
        this.setPointerCapture(e.pointerId);

        lastXScreenPosition = e.x;
        lastYScreenPosition = e.y;
    }

    async function onMoveNodePosition(e: PointerEvent) {
        // Only do something if the mouse is actually clicked
        if (e.buttons < 1) {
            return;
        }

        const translation = treeNode.translation;
        translation[0] += Math.floor(e.x - lastXScreenPosition);
        translation[1] += Math.floor(e.y - lastYScreenPosition);

        lastXScreenPosition = e.x;
        lastYScreenPosition = e.y;

        await odc.setValue({
            base: 'nodeRef',
            keyPath: `${treeNode.ref}.translation`,
            value: translation
        }, {timeout: 300});
    }

    async function toggleNodeVisiblity() {
        await odc.setValue({
            base: 'nodeRef',
            keyPath: `${treeNode.ref}.visible`,
            value: !treeNode.visible
        });
        treeNode.visible = !treeNode.visible;
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

    .hide {
        display: none;
    }

    .children {
        position: relative;
    }

    .self:hover .actions {
        display: flex;
        background-color: var(--vscode-sideBar-background);
    }

    .actions {
        position: absolute;
        right: 0px;
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
        padding: 4px 4px 4px 0;
        width: 100%;
    }
</style>

<div
    class="self"
    bind:this={self}
    class:selected
    on:mouseenter="{onNodeMouseEnter}"
    on:mouseleave="{onNodeMouseLeave}"
    on:click|stopPropagation={toggleExpand}
    >
    {#each { length: depth ?? 0 } as _, i}
        <span class="indent-guide">&nbsp;</span>
    {/each}
    <div class="content" on:click|stopPropagation={open}>
        <span class="item-icon">
            {#if hasChildren}
                <span on:click|stopPropagation={toggleExpand}>
                    <Chevron expanded={expanded} />
                </span>
            {:else}
                <DebugBreakpointDataUnverified style="opacity: .2" />
            {/if}
        </span>
        <span class="nodeName">
            {treeNode.subtype}{#if treeNode.id.length > 0}&nbsp;id: {treeNode.id}{/if}
        </span>
    </div>
    <div class="actions">
        {#if treeNode.translation !== undefined}
            <span
                title="Move Node Position"
                class="icon-button"
                on:click|stopPropagation
                on:pointerdown={onMoveNodePositionDown}
                on:pointermove={throttle(onMoveNodePosition, 33)}>
                <Move />
            </span>
        {/if}
        {#if treeNode.visible !== undefined}
            <span title="{treeNode.visible ? 'Hide Node' : 'Show Node'}" class="icon-button" on:click|stopPropagation={toggleNodeVisiblity}>
                {#if treeNode.visible}<Eye />{:else}<EyeClosed />{/if}
            </span>
        {/if}
    </div>
</div>
<div class="children" class:hide={!expanded}>
    {#each treeNode.children as treeNodeChild}
        <svelte:self
            on:openNode
            on:treeNodeFocused
            on:childExpanded={onChildExpanded}
            depth={depth + 1}
            treeNode={treeNodeChild}
            selectTreeNode={selectTreeNode}
            expandTreeNode={expandTreeNode} />
    {/each}
</div>
