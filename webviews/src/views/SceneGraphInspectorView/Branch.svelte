<!-- svelte-ignore a11y-click-events-have-key-events -->
<script lang="ts">
    import throttle from 'just-throttle';
    import { odc } from '../../ExtensionIntermediary';
    import { utils } from '../../utils';
    import { Eye, EyeClosed, DebugBreakpointDataUnverified, Move, Issues, Trash } from 'svelte-codicons';
    import Chevron from '../../shared/Chevron.svelte';
    import { createEventDispatcher } from 'svelte';
    import type { AppUIResponseChild } from 'roku-test-automation';
    const dispatch = createEventDispatcher();

    export let appUIResponseChild: AppUIResponseChild | undefined;

    export let depth = 0;
    let self: HTMLDivElement;

    const expandedStorageKey = `expanded:${appUIResponseChild.keyPath}`;
    export let expanded = utils.getStorageBooleanValue(expandedStorageKey);
    $: {
        if (expanded) {
            utils.setStorageValue(expandedStorageKey, true);
        } else {
            utils.deleteStorageValue(expandedStorageKey);
        }
    }

    export let expandNode: AppUIResponseChild | null;
    $: {
        // We we want the only variable in the reactive statement to be expandNode or else it will also trigger when expanded changes as well
        expandNodeChecks(expandNode);
    }

    function expandNodeChecks(proposedExpandNode: AppUIResponseChild | undefined) {
        if (!proposedExpandNode) {
            // Don't want to run on empty keypaths as these are at the base level and should stay expanded
            if (appUIResponseChild.keyPath) {
                expanded = false
            }
        } else {
            expanded = doNodesMatch(appUIResponseChild, proposedExpandNode);

            if (expanded) {
                // We need to expand all the parents before we can calculate how far we need to scroll down
                dispatch('childExpanded');

                const scrollToElement = (element) => {
                    const offset = getOffset(element);
                    document.getElementById('nodeTree').scrollTo({
                        left: 0,
                        top: offset.top - 90,
                        behavior: 'auto'
                    });
                }
                setTimeout(() => {
                    scrollToElement(self);
                }, 0);
            }
        }
    }

    let selected = false;
    export let selectNode: AppUIResponseChild | null;
    $: {
        selected = doNodesMatch(appUIResponseChild, selectNode);
    }

    let hasChildren = false;
    $: {
        let result = false;

        if (appUIResponseChild && appUIResponseChild.children && appUIResponseChild.children.length > 0) {
            result = true;
        }

        hasChildren = result;
    }

    function doNodesMatch(nodeA: AppUIResponseChild, nodeB: AppUIResponseChild | undefined) {
        if (nodeB) {
            if (nodeA.keyPath === nodeB.keyPath && (nodeA.base === nodeB.base || (nodeA.base === 'appUI' || nodeB.base === 'appUI'))) {
                // console.log('Nodes match', nodeA.keyPath, nodeB.keyPath, nodeB.base === nodeB.base);
                return true;
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
        dispatch('openNode', utils.getShallowCloneOfAppUIResponseChild(appUIResponseChild));
    }

    function nodeFocused() {
        let detail = null;
        if (appUIResponseChild.sceneRect) {
            // Optimization since we don't need the whole tree to be sent
            detail = utils.getShallowCloneOfAppUIResponseChild(appUIResponseChild);
        }
        dispatch('nodeFocused', detail);
    }

    function onNodeMouseEnter() {
        nodeFocused();
    }

    function onNodeMouseLeave() {
        dispatch('nodeFocused', null);
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

        const translationCopy = [...appUIResponseChild.translation]
        translationCopy[0] += Math.floor(e.x - lastXScreenPosition);
        translationCopy[1] += Math.floor(e.y - lastYScreenPosition);

        lastXScreenPosition = e.x;
        lastYScreenPosition = e.y;

        await setNodeValue('translation', translationCopy, {timeout: 300});

        appUIResponseChild.translation = translationCopy;
    }

    async function toggleNodeVisiblity() {
        await setNodeValue('visible', !appUIResponseChild.visible);
        appUIResponseChild.visible = !appUIResponseChild.visible;
    }

    async function setNodeValue(field: string, value: any, options = {}) {
        if (appUIResponseChild.base === 'appUI') {
            utils.convertAppUIKeyPathToSceneKeyPath(appUIResponseChild)
        }

        await odc.setValue({
            base: appUIResponseChild.base,
            keyPath: `${appUIResponseChild.keyPath}.${field}`,
            value
        }, options);
    }

    function onChildExpanded() {
        expanded = true;
        dispatch('childExpanded');
    }

    async function focusNode() {
        await odc.focusNode({
            base: appUIResponseChild.base,
            keyPath: appUIResponseChild.keyPath
        });
    }

    async function removeNode() {
        await odc.removeNode({
            keyPath: appUIResponseChild.keyPath
        });
        dispatch('nodeRemoved', appUIResponseChild);
    }

    function onChildNodeRemoved(event: CustomEvent<AppUIResponseChild>) {
        const removedChildNode = event.detail;
        appUIResponseChild.children = appUIResponseChild.children.filter(child => child.keyPath !== removedChildNode.keyPath);
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
            {appUIResponseChild?.subtype}{#if appUIResponseChild && appUIResponseChild.id && appUIResponseChild.id.length > 0}&nbsp;id: {appUIResponseChild.id}{/if}
        </span>
    </div>
    <div class="actions">
        {#if appUIResponseChild.keyPath}
            <span title="Remove Node" class="icon-button" on:click|stopPropagation={removeNode}>
                <Trash />
            </span>
        {/if}
        {#if appUIResponseChild.visible !== undefined}
            <span title="Focus Node" class="icon-button" on:click|stopPropagation={focusNode}>
                <Issues />
            </span>
        {/if}

        {#if appUIResponseChild.translation !== undefined}
            <span
                title="Move Node Position"
                class="icon-button"
                on:click|stopPropagation
                on:pointerdown={onMoveNodePositionDown}
                on:pointermove={throttle(onMoveNodePosition, 33)}>
                <Move />
            </span>
        {/if}
        {#if appUIResponseChild.visible !== undefined}
            <span title="{appUIResponseChild.visible ? 'Hide Node' : 'Show Node'}" class="icon-button" on:click|stopPropagation={toggleNodeVisiblity}>
                {#if appUIResponseChild.visible}<Eye />{:else}<EyeClosed />{/if}
            </span>
        {/if}
    </div>
</div>
<div class="children" class:hide={!expanded}>
    {#if hasChildren}
        {#each appUIResponseChild.children as appUIResponseChildChild}
            <svelte:self
                on:openNode
                on:nodeFocused
                on:childExpanded={onChildExpanded}
                on:nodeRemoved={onChildNodeRemoved}
                bind:selectNode
                        bind:expandNode
                depth={depth + 1}
                appUIResponseChild={appUIResponseChildChild} />
        {/each}
    {/if}
</div>
