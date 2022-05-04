<script lang="ts">
    import type {ODC} from 'roku-test-automation';
    import {odc, intermediary} from "../ExtensionIntermediary";

    import Settings from "../components/NodeTreeView/Settings.svelte";
    import Loader from "../components/Common/Loader.svelte";
    import { utils } from '../utils';
    import NodeCountByType from '../components/NodeTreeView/NodeCountByType.svelte';
    import NodeBranchView from "../components/NodeTreeView/NodeBranchView.svelte";
    import NodeDetailView from '../components/NodeTreeView/NodeDetailView.svelte';
    import OdcSetupSteps from '../components/Common/ODCSetupSteps.svelte';


    window.vscode = acquireVsCodeApi();

    let loading = true;
    let error;
    let showSettings = false;
    let inspectNodeBaseKeyPath: ODC.BaseKeyPath | null = null;
    let inspectNodeSubtype = '';
    let totalNodeCount = 0;
    let showNodeCountByType = false;
    let nodeCountByType = {} as {
        [key: string]: number
    };
    let rootTree = [] as ODC.NodeTree[];

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
                includeNodeCountInfo: !!window.localStorage.includeNodeCountInfo,
                includeArrayGridChildren: !!window.localStorage.includeArrayGridChildren
            });
            utils.debugLog(`Store node references took ${result.timeTaken}ms`);

            rootTree = result.rootTree;
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
        const {ref} = await odc.getFocusedNode({includeRef: true});
        focusedNode = ref;
    }

    function openSettings() {
        showSettings = true;
    }

    function openNodeCountByType() {
        showNodeCountByType = true;
    }

    function globalClicked() {
        inspectNodeBaseKeyPath = {
            keyPath: ''
        }
        inspectNodeSubtype = 'Global';
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
</script>

<style>
    #container {
        --headerHeight: 18px;
    }

    #header {
        position: fixed;
        top: 0;
        right: 0;
        left: 0;
        z-index: 100;
        height: var(--headerHeight);
        background-color:  var(--vscode-sideBar-background);
    }

    #header button {
        padding: 0 5px;
        font-size: 15px;
        color: inherit;
        background-color: inherit;
        border: none;
        margin: 0;
        cursor: pointer;
        outline: none;
        float: left;
    }

    #header #refresh{
        font-size: 12px;
        margin-top:2px;
    }

    #nodeTree {
        list-style: none;
        padding: 0;
        margin: var(--headerHeight) 0 0;
        background-color: inherit;
        user-select: none;
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
        color: #FFFFFF;
        text-decoration: underline;
        cursor: pointer;
    }

    #globalNode {
        cursor: pointer;
        padding: 5px 10px;
    }

    #globalNode:hover{
        color: var(--vscode-list-hoverForeground);
        background-color: var(--vscode-list-hoverBackground);
    }
</style>

<div id="container">
    {#if showSettings}
        <Settings bind:showSettings={showSettings} />
    {/if}
    {#if showNodeCountByType}
        <NodeCountByType bind:showNodeCountByType={showNodeCountByType} bind:nodeCountByType={nodeCountByType} />
    {/if}
    {#if !odcAvailable}
        <OdcSetupSteps />
    {:else if loading}
        <Loader />
    {:else if error}
        <div id="errorMessage">{error}</div>
        <div id="errorHelp">
            If you are seeing this, please make sure you have the on device component running. This requires that both the files are included in the build and that the component is initialized. The easiest way to do this is:
            <ul>
                <li>Include the following comment in either your Scene or main.brs file<br><span class="codeSnippet">' vscode_rdb_on_device_component_entry</span></li>
                <li>Make sure your launch.json configuration has<br><span class="codeSnippet">"injectRdbOnDeviceComponent": true</span> included in it</li>
            </ul>
            The extension can copy the files automatically for you so there's no need to handle that part. If you are still having issues even with these steps, check to make sure you're seeing this line in your device logs <span class="codeSnippet">[RTA][INFO] OnDeviceComponent init</span>
            <p><button on:click={refresh}>Retry</button></p>
        </div>
    {:else}
        <div id="header">
            <button title="Show Focused Node" on:click={showFocusedNode}>{'\u2316'}</button>
            <button id="refresh" title="Refresh" on:click={refresh}>{'\u27F3'}</button>
            <button id="settings" title="Settings" on:click={openSettings}>{'\u2699'}</button>
            {#if totalNodeCount > 0}
                <div id="nodeCountDetails">
                    Nodes: <span id="nodeCountNumber" on:click={openNodeCountByType}>{totalNodeCount}</span>
                </div>
            {/if}
        </div>

        <ul id="nodeTree">
            <li id="globalNode" on:click={globalClicked}>Global Node</li>
            <NodeBranchView bind:focusedNode={focusedNode} nodeTree={rootTree[0]} bind:inspectNodeBaseKeyPath={inspectNodeBaseKeyPath} bind:inspectNodeSubtype={inspectNodeSubtype} expanded={true} />
        </ul>
    {/if}
    {#if inspectNodeBaseKeyPath}
        <NodeDetailView bind:inspectNodeBaseKeyPath={inspectNodeBaseKeyPath} inspectNodeSubtype={inspectNodeSubtype} />
    {/if}
</div>
