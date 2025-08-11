<!-- svelte-ignore a11y-click-events-have-key-events -->
<script lang="ts">
    import { intermediary } from '../../ExtensionIntermediary';
    import SettingsPage from './SettingsPage.svelte';
    import Loader from '../../shared/Loader.svelte';
    import { utils } from '../../utils';
    import NodeCountByTypePage from './NodeCountByTypePage.svelte';
    import Branch from './Branch.svelte';
    import NodeDetailPage from './NodeDetailPage.svelte';
    import OdcSetupSteps from '../../shared/OdcSetupSteps.svelte';
    import OdcSetManualIpAddress from '../../shared/OdcSetManualIpAddress.svelte';
    import { SettingsGear, Issues, Refresh, Play, DebugPause, StopCircle } from 'svelte-codicons';
    import { ViewProviderId } from '../../../../src/viewProviders/ViewProviderId';
    import { ViewProviderEvent } from '../../../../src/viewProviders/ViewProviderEvent';
    import type { AppUIResponse, AppUIResponseChild } from 'roku-test-automation';

    window.vscode = acquireVsCodeApi();
    let loading = false;
    let error: Error | null;
    let showSettingsPage = false;

    let totalNodeCount = 0;
    let showNodeCountByType = false;
    let nodeCountByType = {} as Record<string, number>;
    let appUIResponse: AppUIResponse;

    const globalNode: AppUIResponseChild = {
        subtype: 'Global',
        keyPath: '',
        base: 'global',
    };

    let inspectNode: AppUIResponseChild | null;
    let selectNode: AppUIResponseChild | null;
    let expandNode: AppUIResponseChild | null;

    let followFocusedNode = false;

    let containerWidth = -1
    let shouldDisplaySideBySide = false;
    $:{
        shouldDisplaySideBySide = (containerWidth > 600) && !showNodeCountByType;
    }

    // When device view is inspecting nodes, we let it handle updating the node tree
    let isDeviceViewInspecting = false;

    let executionTime: number;
    let nodeTreeAutoRefreshTimer;
    let enableNodeTreeAutoRefresh = utils.getStorageBooleanValue('enableNodeTreeAutoRefresh', true);
    $:{
        intermediary.setVscodeContext('brightscript.sceneGraphInspectorView.enableNodeTreeAutoRefresh', enableNodeTreeAutoRefresh);
        utils.setStorageValue('enableNodeTreeAutoRefresh', enableNodeTreeAutoRefresh);

        if (nodeTreeAutoRefreshTimer) {
            clearInterval(nodeTreeAutoRefreshTimer);
            nodeTreeAutoRefreshTimer = null;
        }

        if (enableNodeTreeAutoRefresh) {
            nodeTreeAutoRefreshTimer = setInterval(async () => {
                if (isDeviceViewInspecting) {
                    // If the device view is inspecting nodes, we don't want to refresh the node tree
                    return;
                }

                const startTime = performance.now();
                await refresh(false, true);
                const endTime = performance.now();
                executionTime = endTime - startTime;

                if (followFocusedNode) {
                    showFocusedNodeCore();
                }
            }, 1000)
        }
    }

    intermediary.observeEvent(ViewProviderEvent.onStoredAppUIUpdated, async (message) => {
        refresh(true, true)
    });

    intermediary.observeEvent(ViewProviderEvent.onVscodeContextSet, async (message) => {
        const context = message.context;
        if (context.key === 'brightscript.rokuDeviceView.isInspectingNodes') {
            isDeviceViewInspecting = context.value;
        }
    });

    function toggleNodeTreeAutoRefresh() {
        enableNodeTreeAutoRefresh = !enableNodeTreeAutoRefresh;
    }

    function userRefresh() {
        // on:click complains about refresh having wrong params so we use this wrapper
        refresh(false, false);
    }

    async function refresh(useStoredAppUI, automaticRefresh) {
        if (!automaticRefresh) {
            loading = true;

            // We store and then unset and then reset to reload the node again
            const temp = inspectNode;
            inspectNode = null;
            inspectNode = temp;
        }

        try {
            let response: AppUIResponse;
            if (useStoredAppUI) {
                response = await intermediary.getStoredAppUI();
            } else {
                response = await intermediary.getAppUI();
            }

            const children = response.screen.children;

            // Insert the global node at the top
            children.unshift(globalNode);

            response.screen.children = children;

            appUIResponse = response;

            const result = calculateTotalNodeCount(children);

            totalNodeCount = result.totalNodeCount ?? 0;
            nodeCountByType = result.nodeCountByType;
            error = null;
        } catch (e) {
            error = e;
        }

        loading = false;
    }

    function calculateTotalNodeCount(children?: AppUIResponseChild[], result = {
        totalNodeCount:0,
        nodeCountByType: {}
    }) {
        for (const child of children ?? []) {
            result.totalNodeCount++;

            if (result.nodeCountByType[child.subtype]) {
                result.nodeCountByType[child.subtype]++;
            } else {
                result.nodeCountByType[child.subtype] = 1;
            }

            calculateTotalNodeCount(child.children, result);
        }

        return result;
    }

    let showFocusedNodeSingleClickTimeout;
    async function showFocusedNode() {
        clearTimeout(showFocusedNodeSingleClickTimeout);
        showFocusedNodeSingleClickTimeout = setTimeout(async () => {
            // Won't fire again if the value didn't actually change so it won't expand the children out without this
            selectNode = undefined;
            expandNode = undefined;

            await refresh(false, false);

            showFocusedNodeCore();
        }, 500);
    }

    function showFocusedNodeCore() {
        for (const childNode of appUIResponse.screen.children) {
            let node = findFocusedNode(childNode);
            if (node) {
                node = utils.getShallowCloneOfAppUIResponseChild(node);

                if ((node.base !== 'appUI' && node.base !== selectNode?.base) || node.keyPath !== selectNode?.keyPath) {
                    // If the focused node is not the same as the currently selected node, we want to inspect it
                    selectNode = node;
                    expandNode = node;
                    inspectNode = node;
                }
            }
        }
    }

    function enableFollowFocusedNode() {
        followFocusedNode = true;
        clearTimeout(showFocusedNodeSingleClickTimeout);
    }

    function disableFollowFocusedNode() {
        followFocusedNode = false;
    }

    function findFocusedNode(parentNode: AppUIResponseChild): AppUIResponseChild | null {
        if (parentNode.focused) {
            for (const childNode of parentNode.children ?? []) {
                const focusedNode = findFocusedNode(childNode);
                if (focusedNode) {
                    return focusedNode;
                }
            }

            return parentNode;
        }

        return null;
    }

    function openSettings() {
        showSettingsPage = true;
    }

    function openNodeCountByType() {
        showNodeCountByType = true;
    }

    let odcAvailable = false;

    intermediary.observeEvent(ViewProviderEvent.onDeviceAvailabilityChange, (message) => {
        odcAvailable = message.context.odcAvailable;
        if (odcAvailable) {
            refresh(false, false);
        } else {
            loading = false;
        }
    });

    function onOpenNode(event: CustomEvent<AppUIResponseChild>) {
        const node = event.detail;
        inspectNode = node;
        selectNode = node;
    }

    intermediary.observeEvent(ViewProviderEvent.onNodeFocused, (message) => {
        const context = message.context;
        selectNode = context.node;
        expandNode = context.node;

        if (context.shouldOpen) {
            inspectNode = context.node;
        }
    });

    function onNodeFocused(event: CustomEvent<AppUIResponseChild>) {
        const message = intermediary.createEventMessage(ViewProviderEvent.onNodeFocused,
        {
            node: event.detail
        });

        intermediary.sendMessageToWebviews(ViewProviderId.rokuDeviceView, message);
    }

    // Required by any view so we can know that the view is ready to receive messages
    intermediary.sendViewReady();
</script>

<style>
    #container {
        --headerHeight: 30px;
        width: 100%;
        height: 100%;
        overflow-wrap: anywhere;
    }

    #header {
        position: fixed;
        top: 0;
        right: 0;
        left: 0;
        z-index: 1;
        height: var(--headerHeight);
        display: flex;
        align-items: center;
        background-color: var(--vscode-sideBar-background);
        box-shadow: rgb(0 0 0 / 36%) 0px 0px 8px 2px;
    }

    #nodeTree {
        padding: var(--headerHeight) 0 0;
        user-select: none;
        box-sizing: border-box;
        width: 100%;
        height: 100%;
        overflow-y: scroll;
        box-sizing: border-box;
    }

    #nodeTree::-webkit-scrollbar {
        /* We don't want to show since it looks bad with the 200% height */
        display: none;
    }

    #nodeTreeContent {
        /* used to help avoid things moving when expanded or collapsed */
        height: 200%;
    }

    #nodeTree.fullscreen {
        width: 100%;
    }

    #nodeTree.sideBySide {
        width: 45%;
        float: left;
    }

    #detailContainer {
        position: relative;
        height: 100%;
        overflow-y: auto;
        box-sizing: border-box;
        z-index: 101;
    }

    #detailContainer.fullscreen {
        width: 100%;
        position: absolute;
        top: 0;
    }

    #detailContainer.sideBySide {
        width: 55%;
        float: left;
        border-left: 3px solid var(--vscode-panel-border);
    }

    #errorMessage {
        font-weight: bold;
        color: rgb(216, 71, 71);
        padding: 10px;
    }

    #errorHelp {
        padding: 0 10px 10px;
    }

    code {
        color: orange;
        font-weight: bold;
    }

    #nodeCountDetails {
        display: inline-block;
        padding-left: 10px;
    }

    #nodeCountNumber {
        text-decoration: underline;
        cursor: pointer;
    }

    .hide {
        display: none !important;
    }
</style>

<div id="container" bind:clientWidth={containerWidth}>
    {#if showSettingsPage}
        <SettingsPage bind:showSettingsPage />
    {/if}

    {#if showNodeCountByType}
        <span class:hide={inspectNode}>
            <NodeCountByTypePage bind:showNodeCountByType bind:nodeCountByType bind:appUIResponse bind:inspectNode />
        </span>
    {/if}

    {#if loading}
        <Loader />
    {:else if !odcAvailable}
        <OdcSetupSteps />
    {:else if error}
        <div id="errorMessage">{error.message}</div>
        <div id="errorHelp">
            If you are seeing this, please make sure you have the on device
            component running. This requires that both the files are included in
            the build and that the component is initialized. The easiest way to
            do this is:
            <ol>
                <li>
                    Set <code>"injectRdbOnDeviceComponent": true</code> in `.vscode/launch.json`
                </li>
                <li>
                    Add the following comment in <code>main.brs</code> after calling <code>screen.show()</code>:

                    <code>' vscode_rdb_on_device_component_entry</code>
                </li>
            </ol>
            The extension can copy the files automatically for you so there's no
            need to handle that part. If you are still having issues even with these
            steps, check to make sure you're seeing this line in your device logs
            <span class="codeSnippet">[RTA][INFO] OnDeviceComponent init</span>
            <p><button on:click={userRefresh}>Retry</button></p>
            <OdcSetManualIpAddress />
        </div>
    {:else}
        <div id="header" class:hide={inspectNode && !shouldDisplaySideBySide}>
            <div id="drop-shadow-blocker" />

            {#if followFocusedNode}
                <span
                    class="icon-button"
                    title="Stop following focused node"
                    on:click={disableFollowFocusedNode}>
                    <StopCircle />
                </span>
            {:else}
                <span
                    class="icon-button"
                    title="Show Focused Node"
                    on:click={showFocusedNode}
                    on:dblclick={enableFollowFocusedNode}>
                    <Issues />
                </span>
            {/if}

            {#if enableNodeTreeAutoRefresh}
                <span class="icon-button" title="Disable automatically updating the node tree" on:click={toggleNodeTreeAutoRefresh}>
                    <DebugPause />
                </span>
            {:else}
                <span class="icon-button" title="Refresh" on:click={userRefresh}>
                    <Refresh />
                </span>

                {#if !isDeviceViewInspecting}
                    <span class="icon-button" title="Enable automatically updating the node tree" on:click={toggleNodeTreeAutoRefresh}>
                        <Play />
                    </span>
                {/if}
            {/if}

            <span class="icon-button" title="Settings" on:click={openSettings}>
                <SettingsGear />
            </span>

            {#if totalNodeCount > 0}
                <div id="nodeCountDetails">
                    Nodes: <span
                        id="nodeCountNumber"
                        on:click={openNodeCountByType}>{totalNodeCount}</span>
                </div>
            {/if}

            <!-- Useful for debugging leaving around for now. May eventually give an option to toggle this -->
            <!-- &nbsp; Refresh took {executionTime?.toFixed(2)} ms -->
        </div>

        <div id="nodeTree" class="{shouldDisplaySideBySide ? 'sideBySide' : 'fullscreen'} {inspectNode && !shouldDisplaySideBySide ? 'hide' : ''}" >
            <div id="nodeTreeContent">
                {#if appUIResponse?.screen?.children}
                    {#each appUIResponse.screen.children as appUIResponseChild}
                        <Branch
                            on:openNode={onOpenNode}
                            on:nodeFocused={onNodeFocused}
                            bind:selectNode
                            bind:expandNode
                            appUIResponseChild={appUIResponseChild}
                            expanded={true} />
                    {/each}
                {/if}
            </div>
        </div>
        <div id="detailContainer" class="{shouldDisplaySideBySide ? 'sideBySide' : 'fullscreen'} {!inspectNode && !shouldDisplaySideBySide ? 'hide' : ''}">
            {#if inspectNode}
                <NodeDetailPage
                    bind:inspectNode
                    showFullscreen={!shouldDisplaySideBySide} />
            {:else if shouldDisplaySideBySide}
                <div style="margin-top: var(--headerHeight); padding: 10px;">Select a node to inspect it</div>
            {/if}
        </div>
    {/if}
</div>
