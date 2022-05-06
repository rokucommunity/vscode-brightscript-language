<script lang="ts">
    import type { ODC } from 'roku-test-automation';
    import { odc, intermediary } from '../ExtensionIntermediary';
    import Settings from '../components/NodeTreeView/Settings.svelte';
    import Loader from '../components/Common/Loader.svelte';
    import { utils } from '../utils';
    import NodeCountByType from '../components/NodeTreeView/NodeCountByType.svelte';
    import NodeBranchView from '../components/NodeTreeView/NodeBranchView.svelte';
    import NodeDetailView from '../components/NodeTreeView/NodeDetailView.svelte';
    import OdcSetupSteps from '../components/Common/ODCSetupSteps.svelte';
    import SettingsGear from 'svelte-codicons/lib/SettingsGear.svelte';
    import Issues from 'svelte-codicons/lib/Issues.svelte';
    import Refresh from 'svelte-codicons/lib/Refresh.svelte';

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

    intermediary.observeEvent('applicationRedeployed', (message) => {
        if (odcAvailable) {
            refresh();
        }
    });

    async function refresh() {
        loading = true;
        rootTree = [];

        try {
            const result = await odc.storeNodeReferences({
                includeNodeCountInfo: utils.getStorageBooleanValue('includeNodeCountInfo'),
                includeArrayGridChildren: utils.getStorageBooleanValue('includeNodeCountInfo')
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
        const { ref } = await odc.getFocusedNode({ includeRef: true });
        focusedNode = ref;
    }

    function openSettings() {
        showSettings = true;
    }

    function openNodeCountByType() {
        showNodeCountByType = true;
    }

    let odcAvailable = true;
    $: {
        if (odcAvailable) {
            refresh();
        } else {
            loading = false;
        }
    }

    intermediary.observeEvent('onDeviceComponentStatus', (message) => {
        odcAvailable = message.available;
    });

    // Required by any view so we can know that the view is ready to receive messages
    intermediary.sendViewReady();

    function openNode(event: CustomEvent<ODC.NodeTree>) {
        const node = event.detail;
        console.log('Edit node: ', node);
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
        overflow: auto;
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
        color: #ffffff;
        text-decoration: underline;
        cursor: pointer;
    }
</style>

<div id="container">
    {#if showSettings}
        <Settings bind:showSettings />
    {/if}
    {#if showNodeCountByType}
        <NodeCountByType bind:showNodeCountByType bind:nodeCountByType />
    {/if}
    {#if !odcAvailable}
        <OdcSetupSteps />
    {:else if loading}
        <Loader />
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
                <NodeBranchView
                    on:open={openNode}
                    bind:focusedNode
                    nodeTree={rootNode}
                    expanded={true} />
            {/each}
        </div>
    {/if}
    {#if inspectNodeBaseKeyPath}
        <NodeDetailView
            bind:inspectNodeBaseKeyPath
            inspectNodeSubtype={inspectNodeSubtype} />
    {/if}
</div>
