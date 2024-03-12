<!-- svelte-ignore a11y-click-events-have-key-events -->
<script lang="ts">
    import type { TreeNode } from 'roku-test-automation';
    import throttle from 'just-throttle';
    import { odc } from '../../ExtensionIntermediary';
    import { utils } from '../../utils';
    import { Edit, Eye, EyeClosed, DebugBreakpointDataUnverified, Move } from 'svelte-codicons';
    import Chevron from '../../shared/Chevron.svelte';
    import { createEventDispatcher } from 'svelte';
    const dispatch = createEventDispatcher();

    export let treeNode: TreeNode;
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

    let selected = false;
    export let focusedNode = -1;
    $: {
        // If we are the focused node then we want to scroll down to this node
        if (focusedNode !== -1 && treeNode.ref === focusedNode) {
            // We need to expand all the parents before we can calculate how far we need to scroll down
            dispatch('childExpanded');
            selected = true;

            // Go ahead and expand us as well to speed up digging into children if desired
            expanded = true

            const scrollToElement = (element) => {
                const offset = getOffset(element);

                document.getElementById('container').scrollTo({
                    left: 0,
                    top: offset.top - 90,
                    behavior: 'auto'
                });
            }

            setTimeout(() => {
                scrollToElement(self);
            }, 0);
        } else {
            selected = false;
        }
    }

    $: hasChildren = treeNode.children.length > 0;

    function toggleExpand() {
        if (!hasChildren) {
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
    on:mouseenter="{onNodeMouseEnter}"
    on:mouseleave="{onNodeMouseLeave}"
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
        <span
            title="Edit Node"
            class="icon-button editButton"
            on:click|stopPropagation={open}>
            <Edit />
        </span>
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
            focusedNode={focusedNode} />
    {/each}
</div>
