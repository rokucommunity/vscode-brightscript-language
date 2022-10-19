<script lang="ts">
    import type { ODC } from 'roku-test-automation';
    import throttle from 'just-throttle';
    import { odc } from '../../ExtensionIntermediary';
    import { utils } from '../../utils';
    import { createEventDispatcher } from 'svelte';
    import { Edit, Eye, EyeClosed, DebugBreakpointDataUnverified, Move } from 'svelte-codicons';
    import Chevron from '../../shared/Chevron.svelte';
    const dispatch = createEventDispatcher();

    export let nodeTree: ODC.NodeTree;
    export let depth = 0;
    let self: HTMLDivElement;
    let nodeFieldsCache: {
        translation?: [number, number];
        visible?: boolean;
    };

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
        if (focusedNode !== -1 && nodeTree.ref === focusedNode) {
            selected = true;

            if (self) {
                const rect = self.getBoundingClientRect()
                document.getElementById('container').scrollTo({
                    left: rect.left,
                    top: rect.top - 90,
                    behavior: 'smooth'
                });
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

    let requestTimeout: ReturnType<typeof setTimeout>;
    function onNodeMouseEnter() {
        if (nodeTree.subtype !== 'Global' && !nodeFieldsCache) {
             // Delay timer to avoid trying to load data for every single item the user scrolls by
            requestTimeout = setTimeout(async () => {
                let args: ODC.GetValuesArgs = {
                    requests: {
                        visible: {
                            base: 'nodeRef',
                            keyPath: `${nodeTree.ref}.visible`
                        },
                        translation: {
                            base: 'nodeRef',
                            keyPath: `${nodeTree.ref}.translation`
                        }
                    }
                }

                const {results} = await odc.getValues(args);
                nodeFieldsCache = {
                    visible: results.visible.value,
                    translation: results.translation.value
                };
            }, 60);
        }
    }

    function onNodeMouseLeave() {
        clearTimeout(requestTimeout);
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

        const translation = nodeFieldsCache.translation;
        translation[0] += Math.floor(e.x - lastXScreenPosition);
        translation[1] += Math.floor(e.y - lastYScreenPosition);

        lastXScreenPosition = e.x;
        lastYScreenPosition = e.y;

        await odc.setValue({
            base: 'nodeRef',
            keyPath: `${nodeTree.ref}.translation`,
            value: translation
        });
    }

    async function toggleNodeVisiblity() {
        await odc.setValue({
            base: 'nodeRef',
            keyPath: `${nodeTree.ref}.visible`,
            value: !nodeFieldsCache.visible
        });
        nodeFieldsCache.visible = !nodeFieldsCache.visible;
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
            {nodeTree.subtype}{#if nodeTree.id.length > 0}&nbsp;id: {nodeTree.id}{/if}
        </span>
    </div>
    <div class="actions">
        {#if nodeFieldsCache}
            {#if nodeFieldsCache.translation !== undefined}
                <span
                    title="Move Node Position"
                    class="icon-button"
                    on:click|stopPropagation
                    on:pointerdown={onMoveNodePositionDown}
                    on:pointermove={throttle(onMoveNodePosition, 33)}>
                    <Move />
                </span>
            {/if}
            {#if nodeFieldsCache.visible !== undefined}
                <span title="{nodeFieldsCache.visible ? 'Hide Node' : 'Show Node'}" class="icon-button" on:click|stopPropagation={toggleNodeVisiblity}>
                    {#if nodeFieldsCache.visible}<Eye />{:else}<EyeClosed />{/if}
                </span>
            {/if}
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
    {#each nodeTree.children as childNodeTree}
        <svelte:self
            on:open
            on:childExpanded={onChildExpanded}
            depth={depth + 1}
            nodeTree={childNodeTree}
            focusedNode={focusedNode} />
    {/each}
</div>
