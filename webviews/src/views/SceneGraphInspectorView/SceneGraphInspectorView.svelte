<!-- svelte-ignore a11y-click-events-have-key-events -->
<script lang="ts">
    import { odc, intermediary } from '../../ExtensionIntermediary';
    import SettingsPage from './SettingsPage.svelte';
    import Loader from '../../shared/Loader.svelte';
    import { utils } from '../../utils';
    import NodeCountByTypePage from './NodeCountByTypePage.svelte';
    import Branch from './Branch.svelte';
    import NodeDetailPage from './NodeDetailPage.svelte';
    import OdcSetupSteps from '../../shared/OdcSetupSteps.svelte';
    import OdcSetManualIpAddress from '../../shared/OdcSetManualIpAddress.svelte';
    import { SettingsGear, Issues, Refresh } from 'svelte-codicons';
    import { ViewProviderId } from '../../../../src/viewProviders/ViewProviderId';
    import { ViewProviderEvent } from '../../../../src/viewProviders/ViewProviderEvent';
    import type { TreeNode } from 'roku-test-automation';
    import type { TreeNodeWithBase } from '../../shared/types';

    window.vscode = acquireVsCodeApi();
    let loading = false;
    let error: Error | null;
    let showSettingsPage = false;
    let inspectNodeTreeNode: TreeNodeWithBase | null;
    let totalNodeCount = 0;
    let showNodeCountByType = false;
    let nodeCountByType = {} as Record<string, number>;
    let rootTree = [] as TreeNodeWithBase[];

    const globalNode: TreeNodeWithBase = {
        id: '',
        subtype: 'Global',
        /** This is the reference to the index it was stored at that we can use in later calls. If -1 we don't have one. */
        ref: -1,
        /** Same as ref but for the parent  */
        parentRef: -1,
        /** Used to determine the position of this node in its parent if applicable */
        position: -1,
        children: [],
        keyPath: '',
        base: 'global'
    };

    let selectTreeNode: TreeNodeWithBase | undefined;
    let expandTreeNode: TreeNodeWithBase | undefined;

    let containerWidth = -1
    let shouldDisplaySideBySide = false;
    $:{
        shouldDisplaySideBySide = (containerWidth > 600);
    }

    intermediary.observeEvent(ViewProviderEvent.onStoredNodeReferencesUpdated, async () => {
        loading = true;
        const result = await intermediary.getStoredNodeReferences();
        rootTree = result.rootTree as TreeNodeWithBase[];

        //insert the global node to the top of the rootNodes list
        rootTree.unshift(globalNode);

        totalNodeCount = result.totalNodes ?? 0;
        nodeCountByType = result.nodeCountByType;
        loading = false;
    });

    async function refresh() {
        loading = true;
        // We store and then unset and then reset to reload the node again
        const temp = inspectNodeTreeNode;
        inspectNodeTreeNode = null;
        inspectNodeTreeNode = temp;

        rootTree = [];

        try {
            const result = await odc.storeNodeReferences({
                includeNodeCountInfo: utils.getStorageBooleanValue('includeNodeCountInfo', true),
                includeArrayGridChildren: utils.getStorageBooleanValue('includeArrayGridChildren', true),
                includeBoundingRectInfo: true
            }, {
                timeout: 15000
            });
            utils.debugLog(`Store node references took ${result.timeTaken}ms`);
            rootTree = result.rootTree as TreeNodeWithBase[];

            //insert the global node to the top of the rootNodes list
            rootTree.unshift(globalNode);

            totalNodeCount = result.totalNodes ?? 0;
            nodeCountByType = result.nodeCountByType;
            error = null;
        } catch (e) {
            error = e;
        }

        loading = false;
    }

    async function showFocusedNode() {
        await refresh();
        // Won't fire again if the value didn't actually change so it won't expand the children out without this
        selectTreeNode = undefined;
        expandTreeNode = undefined;
        const returnFocusedArrayGridChild = utils.getStorageBooleanValue('includeArrayGridChildren', true)
        const {keyPath} = await odc.getFocusedNode({
            includeRef: returnFocusedArrayGridChild, // Currently returnFocusedArrayGridChild also relies on includeRef being enabled in RTA. Will update in future version to not require this at the call site
            returnFocusedArrayGridChild: returnFocusedArrayGridChild,
            includeNode: false
        });

        selectTreeNode = {
            keyPath: keyPath
        };

        expandTreeNode = {
            keyPath: keyPath
        };
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
            refresh();
        } else {
            loading = false;
        }
    });

    function onOpenNode(event: CustomEvent<TreeNode>) {
        const treeNode = event.detail;
        inspectNodeTreeNode = treeNode;
        selectTreeNode = treeNode;
    }

    intermediary.observeEvent(ViewProviderEvent.onTreeNodeFocused, (message) => {
        const context = message.context;
        selectTreeNode = context.treeNode;
        expandTreeNode = context.treeNode;

        if (context.shouldOpen) {
            debugger;
            inspectNodeTreeNode = context.treeNode;
        }
    });

    function onTreeNodeFocused(event: CustomEvent<TreeNode>) {
        const message = intermediary.createEventMessage(ViewProviderEvent.onTreeNodeFocused, {
            treeNode: event.detail
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
        <NodeCountByTypePage bind:showNodeCountByType bind:nodeCountByType />
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
            <p><button on:click={refresh}>Retry</button></p>
            <OdcSetManualIpAddress />
        </div>
    {:else}
        <div id="header" class={inspectNodeTreeNode && !shouldDisplaySideBySide ? 'hide' : ''}>
            <div id="drop-shadow-blocker" />
            <span
                class="icon-button"
                title="Show Focused Node"
                on:click={showFocusedNode}>
                <Issues />
            </span>
            <span class="icon-button" title="Refresh" on:click={refresh}>
                <Refresh />
            </span>
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
        </div>

        <div id="nodeTree" class="{shouldDisplaySideBySide ? 'sideBySide' : 'fullscreen'} {inspectNodeTreeNode && !shouldDisplaySideBySide ? 'hide' : ''}" >
            <div id="nodeTreeContent">
                {#each rootTree as rootNode}
                    <Branch
                        on:openNode={onOpenNode}
                        on:treeNodeFocused={onTreeNodeFocused}
                        bind:selectTreeNode
                        bind:expandTreeNode
                        treeNode={rootNode}
                        expanded={true} />
                {/each}
            </div>
        </div>
        <div id="detailContainer" class="{shouldDisplaySideBySide ? 'sideBySide' : 'fullscreen'} {!inspectNodeTreeNode && !shouldDisplaySideBySide ? 'hide' : ''}">
            {#if inspectNodeTreeNode}
                <NodeDetailPage
                    bind:inspectNodeTreeNode
                    showFullscreen={!shouldDisplaySideBySide} />
            {:else if shouldDisplaySideBySide}
                <div style="margin-top: var(--headerHeight); padding: 10px;">Select a node to inspect it</div>
            {/if}
        </div>
    {/if}
</div>
