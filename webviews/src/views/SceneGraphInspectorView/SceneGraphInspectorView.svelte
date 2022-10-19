<script lang="ts">
    import type { ODC } from 'roku-test-automation';
    import { odc, intermediary } from '../../ExtensionIntermediary';
    import SettingsPage from './SettingsPage.svelte';
    import Loader from '../../shared/Loader.svelte';
    import { utils } from '../../utils';
    import NodeCountByTypePage from './NodeCountByTypePage.svelte';
    import NodeBranchPage from './NodeBranchPage.svelte';
    import NodeDetailPage from './NodeDetailPage.svelte';
    import OdcSetupStepsPage from '../../shared/OdcSetupStepsPage.svelte';
    import { SettingsGear, Issues, Refresh } from 'svelte-codicons';

    window.vscode = acquireVsCodeApi();
    let loading = true;
    let error: Error | null;
    let showSettings = false;
    let inspectNodeBaseKeyPath: ODC.BaseKeyPath | null = null;
    let inspectNodeSubtype = '';
    let totalNodeCount = 0;
    let showNodeCountByType = false;
    let nodeCountByType = {} as Record<string, number>;
    let rootTree = [] as ODC.NodeTree[];

    const globalNode = {
        id: '',
        subtype: 'Global',
        /** This is the reference to the index it was stored at that we can use in later calls. If -1 we don't have one. */
        ref: -1,
        /** Same as ref but for the parent  */
        parentRef: -1,
        /** Used to determine the position of this node in its parent if applicable */
        position: 0,
        children: []
    };

    let focusedNode = -1;

    async function refresh() {
        loading = true;
        inspectNodeBaseKeyPath = null;
        rootTree = [];

        try {
            const result = await odc.storeNodeReferences({
                includeNodeCountInfo: utils.getStorageBooleanValue('includeNodeCountInfo', true),
                includeArrayGridChildren: utils.getStorageBooleanValue('includeArrayGridChildren', true)
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
        showSettings = true;
    }

    function openNodeCountByType() {
        showNodeCountByType = true;
    }

    let odcAvailable = false;

    intermediary.observeEvent('onDeviceComponentStatus', (message) => {
        odcAvailable = message.available;
        if (odcAvailable) {
            refresh();
        } else {
            loading = false;
        }
    });

    // Required by any view so we can know that the view is ready to receive messages
    intermediary.sendViewReady();

    function openNode(event: CustomEvent<ODC.NodeTree>) {
        const node = event.detail;
        //if the global node was clicked
        if (node === globalNode) {
            inspectNodeBaseKeyPath = {
                keyPath: ''
            };
            inspectNodeSubtype = 'Global';
        } else {
            inspectNodeBaseKeyPath = {
                base: 'nodeRef',
                keyPath: `${node.ref}`
            };
            inspectNodeSubtype = node.subtype;
        }
    }
</script>

<style>
    #container {
        --headerHeight: 30px;
        width: 100%;
        height: 100%;
        overflow: scroll;
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

    .codeSnippet {
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
    {#if showSettings}
        <SettingsPage bind:showSettings />
    {/if}
    {#if showNodeCountByType}
        <NodeCountByTypePage bind:showNodeCountByType bind:nodeCountByType />
    {/if}
    {#if loading}
        <Loader />
    {:else if !odcAvailable}
        <OdcSetupStepsPage />
    {:else if error}
        <div id="errorMessage">{error}</div>
        <div id="errorHelp">
            If you are seeing this, please make sure you have the on device
            component running. This requires that both the files are included in
            the build and that the component is initialized. The easiest way to
            do this is:
            <ul>
                <li
                    >Include the following comment in either your Scene or
                    main.brs file (if including in main.brs, be sure to add
                    after your roSGScreen screen.show() call)<br /><span
                        class="codeSnippet"
                        >' vscode_rdb_on_device_component_entry</span
                    ><br /></li>
                <li
                    >Make sure your launch.json configuration has<br /><span
                        class="codeSnippet"
                        >"injectRdbOnDeviceComponent": true</span> included in it</li>
            </ul>
            The extension can copy the files automatically for you so there's no
            need to handle that part. If you are still having issues even with these
            steps, check to make sure you're seeing this line in your device logs
            <span class="codeSnippet">[RTA][INFO] OnDeviceComponent init</span>
            <p><button on:click={refresh}>Retry</button></p>
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
                <NodeBranchPage
                    on:open={openNode}
                    bind:focusedNode
                    nodeTree={rootNode}
                    expanded={true} />
            {/each}
        </div>
    {/if}
    {#if inspectNodeBaseKeyPath}
        <NodeDetailPage
            bind:inspectNodeBaseKeyPath
            inspectNodeSubtype={inspectNodeSubtype} />
    {/if}
</div>
