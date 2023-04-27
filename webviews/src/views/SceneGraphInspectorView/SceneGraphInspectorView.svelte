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
    import type { BaseKeyPath, TreeNode } from 'roku-test-automation';

    window.vscode = acquireVsCodeApi();
    let loading = false;
    let error: Error | null;
    let showSettingsPage = false;
    let inspectNodeBaseKeyPath: BaseKeyPath | null = null;
    let inspectNodeSubtype = '';
    let inspectNodeTreeNode: TreeNode | undefined;
    let totalNodeCount = 0;
    let showNodeCountByType = false;
    let nodeCountByType = {} as Record<string, number>;
    let rootTree = [] as TreeNode[];

    const globalNode = {
        id: '',
        subtype: 'Global',
        /** This is the reference to the index it was stored at that we can use in later calls. If -1 we don't have one. */
        ref: -1,
        /** Same as ref but for the parent  */
        parentRef: -1,
        /** Used to determine the position of this node in its parent if applicable */
        position: -1,
        children: [],
        keyPath: ''
    };

    let focusedNode = -1;

    intermediary.observeEvent(ViewProviderEvent.onStoredNodeReferencesUpdated, async () => {
        loading = true;
        const result = await intermediary.getStoredNodeReferences();
        rootTree = result.rootTree;

        totalNodeCount = result.totalNodes ?? 0;
        nodeCountByType = result.nodeCountByType;
        loading = false;
    });

    async function refresh() {
        loading = true;
        inspectNodeBaseKeyPath = null;
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
            rootTree = result.rootTree;

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
        focusedNode = -1;
        const returnFocusedArrayGridChild = utils.getStorageBooleanValue('includeArrayGridChildren', true)
        const { ref } = await odc.getFocusedNode({
            includeRef: true,
            returnFocusedArrayGridChild: returnFocusedArrayGridChild
        });
        focusedNode = ref;
    }

    function openSettings() {
        showSettingsPage = true;
    }

    function openNodeCountByType() {
        showNodeCountByType = true;
    }

    let odcAvailable = false;

    intermediary.observeEvent(ViewProviderEvent.onDeviceAvailabilityChange, (message) => {
        odcAvailable = message.odcAvailable;
        if (odcAvailable) {
            refresh();
        } else {
            loading = false;
        }
    });

    function onOpenNode(event: CustomEvent<TreeNode>) {
        const treeNode = event.detail;
        inspectNodeTreeNode = treeNode;
        //if the global node was clicked
        if (treeNode.subtype === 'Global') {
            inspectNodeBaseKeyPath = {
                base: 'global'
            };
            inspectNodeSubtype = 'Global';
        } else {
            inspectNodeBaseKeyPath = {
                base: 'nodeRef',
                keyPath: `${treeNode.ref}`
            };
            inspectNodeSubtype = treeNode.subtype;
        }
    }

    intermediary.observeEvent(ViewProviderEvent.onTreeNodeFocused, (message) => {
        focusedNode = -1;
        if (message.treeNode) {
            focusedNode = message.treeNode.ref;
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
        overflow-y: scroll;
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
        padding: 0;
        position: relative;
        top: calc(var(--headerHeight) + 5px);
        left: 0;
        right: 0;
        bottom: 0;
        background-color: inherit;
        user-select: none;
        min-height: 100%;
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
</style>

<div id="container">
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
        <div id="header">
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

        <div id="nodeTree">
            {#each rootTree as rootNode}
                <Branch
                    on:openNode={onOpenNode}
                    on:treeNodeFocused={onTreeNodeFocused}
                    bind:focusedNode
                    treeNode={rootNode}
                    expanded={true} />
            {/each}
        </div>
    {/if}
    {#if inspectNodeBaseKeyPath}
        <NodeDetailPage
            bind:inspectNodeBaseKeyPath
            inspectNodeSubtype={inspectNodeSubtype}
            inspectNodeTreeNode={inspectNodeTreeNode} />
    {/if}
</div>
