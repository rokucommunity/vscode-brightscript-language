<script lang="ts">
    import type {ODC} from 'roku-test-automation';
    import {odc} from "../ExtensionIntermediary";

    import NodeBranchView from "../components/NodeTreeView/NodeBranchView.svelte";
    import Loader from "../components/Common/Loader.svelte";

    window.vscode = acquireVsCodeApi();

    import { nodeTreeView } from "./NodeTreeView";

    let loading = true;
    let rootTree = [] as ODC.NodeTree[];
    let globalNodeTree: ODC.NodeTree;
    let sceneNodeTree: ODC.NodeTree;
    let sceneNodeRef: number;
    let focusedNode = -1;

    refresh();

    async function refresh() {
        loading = true;
        rootTree = [];
        globalNodeTree = undefined;
        sceneNodeTree = undefined;

        const result = await odc.storeNodeReferences();
        // console.log(result);
        for (const nodeTree of result.flatTree) {
            if (nodeTree.global) {
                globalNodeTree = nodeTree;
                // We can get the scene node because global will always have Scene as its parent
                sceneNodeRef = nodeTree.parentRef;
                sceneNodeTree = result.flatTree[sceneNodeRef];
                break;
            }
        }

        rootTree = result.rootTree;
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

    }
</script>

<style>
    ul {
        margin: 0;
        list-style: none;
        padding: 0;
        background-color: #121a21;
        user-select: none;
    }

    #otherRoots {
        display: flex;
        align-items: center;
        text-align: center;
        font-size: 14px;
        margin: 5px 0;
        color: white;
    }

    #otherRoots::before,
    #otherRoots::after {
        content: '';
        flex: 1;
        border-bottom: 2px solid rgb(190, 190, 190);
    }

    #otherRoots:not(:empty)::before {
        margin-right: .75em;
    }

    #otherRoots:not(:empty)::after {
        margin-left: .75em;
    }

    button {
        padding: 0 5px;
        font-size: 10px;
        color: #FFFFFF;
        background-color: #121a21;
        border: none;
        margin: 0;
        cursor: pointer;
        outline: none;
    }

    button:hover {
        background-color: #143758;
    }
</style>
<div>
    <button on:click={showFocusedNode}>{'\u2316'}</button>
    <button on:click={refresh}>{'\u27F3'}</button>
    <button on:click={openSettings}>{'\u29C9'}</button>
</div>
{#if loading}
    <Loader />
{:else}
    <ul>
        {#if globalNodeTree}
            <NodeBranchView nodeTree={globalNodeTree} />
        {/if}

        {#if sceneNodeTree}
            <NodeBranchView bind:focusedNode={focusedNode} nodeTree={sceneNodeTree} expanded={true} />
        {/if}

        <div id="otherRoots">Unparented Roots</div>
        {#each rootTree as nodeTree}
            {#if nodeTree.ref !== sceneNodeRef}
                <NodeBranchView {nodeTree} />
            {/if}
        {/each}
    </ul>
{/if}
