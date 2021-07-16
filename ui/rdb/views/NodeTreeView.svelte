<script lang="ts">
    import type {ODC} from 'roku-test-automation';
    import {odc} from "../ExtensionIntermediary";

    import NodeBranchView from "../components/NodeTreeView/NodeBranchView.svelte";

    window.vscode = acquireVsCodeApi();

    import { nodeTreeView } from "./NodeTreeView";

    const storage = window.localStorage;

    let rootTree = [] as ODC.NodeTree[];
    let globalNodeTree: ODC.NodeTree;
    let sceneNodeTree: ODC.NodeTree;
    let sceneNodeRef: number;
    (async () => {
        const result = await odc.storeNodeReferences();
        console.log(result);
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
    })();
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
</style>
<ul>
    {#if globalNodeTree}
        <NodeBranchView nodeTree={globalNodeTree} />
    {/if}

    {#if sceneNodeTree}
        <NodeBranchView nodeTree={sceneNodeTree} expanded={true} />
    {/if}

    <div id="otherRoots">Unparented Roots</div>
    {#each rootTree as nodeTree}
        {#if nodeTree.ref !== sceneNodeRef}
            <NodeBranchView {nodeTree} />
        {/if}
    {/each}
</ul>
