<script lang="ts">
    import type { ODC } from 'roku-test-automation';
    import throttle from 'just-throttle';
    import { odc } from '../../ExtensionIntermediary';
    import { utils } from '../../utils';
    import Loader from '../../components/Common/Loader.svelte';
    import { createEventDispatcher } from 'svelte';
    import { Edit, Eye, EyeClosed, DebugBreakpointDataUnverified, Move } from 'svelte-codicons';
    import Chevron from '../Common/Chevron.svelte';
    const dispatch = createEventDispatcher();

    export let nodeTree: ODC.NodeTree;
    export let depth = 0;
    let self: HTMLDivElement;
    let nodeInfoElement: HTMLDivElement;
    let nodeFieldsCache: ODC.NodeRepresentation?;
    let showNodeInfo = false;

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

    let nodeInfoHideTimeout: ReturnType<typeof setTimeout>;
    function startNodeInfoTimeout() {
        stopNodeInfoTimeout();
        nodeInfoHideTimeout = setTimeout(async () => {
            showNodeInfo = false
        }, 100);
    }

    function stopNodeInfoTimeout() {
        clearTimeout(nodeInfoHideTimeout);
    }

    function onEditButtonMouseEnter() {
        stopNodeInfoTimeout()
        showNodeInfo = true
    }

    function onEditButtonMouseLeave() {
        // When the mouse leaves the edit button start timeout
        startNodeInfoTimeout();
    }

    function onNodeInfoMouseEnter() {
        // Prevent the node info from hiding while mouse it over itself
        stopNodeInfoTimeout();
    }

    function onNodeInfoMouseLeave() {
        // When the mouse leaves the node info start timeout
        startNodeInfoTimeout();
    }

    let requestTimeout: ReturnType<typeof setTimeout>;
    function onNodeMouseEnter() {
        if (!nodeFieldsCache) {
             // Delay timer to avoid trying to load data for every single item the user scrolls by
            requestTimeout = setTimeout(async () => {
                let args: ODC.GetValueAtKeyPathArgs = {
                    base: 'nodeRef',
                    keyPath: `${nodeTree.ref}`
                }
                if (nodeTree.subtype === 'Global') {
                    args = {
                        base: 'global',
                        keyPath: ''
                    }
                }
                const {value} = await odc.getValueAtKeyPath(args);
                nodeFieldsCache = value;
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

        await odc.setValueAtKeyPath({
            base: 'nodeRef',
            keyPath: `${nodeTree.ref}.translation`,
            value: translation
        });
    }

    async function toggleNodeVisiblity() {
        await odc.setValueAtKeyPath({
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

    function buildFieldHoverText(field) {
        if (field === null) {
            return 'invalid';
        } else if (Array.isArray(field)) {
            let result = [];
            for (const item of field) {
                result.push(buildFieldHoverText(item));
            }
            return '[' + result.join(', ') + ']';
        } else if (typeof field === 'object') {
            let result = [];
            for (const key in field) {
                result.push(`${key}: ${buildFieldHoverText(field[key])}`);
            }
            return '{' + result.join(', ') + '}';
        } else {
            return field;
        }
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

    .nodeInfo {
        background-color: var(--vscode-editorHoverWidget-background);
        color: var(--vscode-editorHoverWidget-foreground);
        position: absolute;
        top: 100%;
        left: 0;
        width: 100%;
        min-height: 70px;
        z-index: 100;
        border-bottom: 4px solid var(--vscode-tab-border);
    }

    .nodeInfo ul {
        margin: 0;
        padding: 5px 15px;
        overflow-wrap: break-word;
    }

    ul li {
        list-style: none;
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
            {#if nodeFieldsCache.visible === true || nodeFieldsCache.visible === false}
                <span title="{nodeFieldsCache.visible ? 'Hide Node' : 'Show Node'}" class="icon-button" on:click|stopPropagation={toggleNodeVisiblity}>
                    {#if nodeFieldsCache.visible}<Eye />{:else}<EyeClosed />{/if}
                </span>
            {/if}
        {/if}
        <span
            title="Edit Node"
            class="icon-button editButton"
            on:click|stopPropagation={open}
            on:mouseenter={onEditButtonMouseEnter}
            on:mouseleave={onEditButtonMouseLeave}>
            <Edit />
        </span>
    </div>
    <div
        class:hide={!showNodeInfo}
        class="nodeInfo"
        on:mouseenter={onNodeInfoMouseEnter}
        on:mouseleave={onNodeInfoMouseLeave}
        bind:this={nodeInfoElement}>
        <ul>
            {#if nodeFieldsCache}
                {#each Object.keys(nodeFieldsCache) as key}
                    <li>{key}: {buildFieldHoverText(nodeFieldsCache[key])}</li>
                {/each}
            {:else}
                <Loader />
            {/if}
        </ul>
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
