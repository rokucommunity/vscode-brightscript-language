<script lang="ts">
    import { ArrowLeft } from 'svelte-codicons';
    import Chevron from '../../shared/Chevron.svelte';
    import type { TreeNodeWithBase } from '../../shared/types';

    export let showNodeCountByType: boolean;
    export let nodeCountByType = {} as {
        [key: string]: number;
    };
    export let flatTree = [] as TreeNodeWithBase[];
    export let inspectNodeTreeNode: TreeNodeWithBase | null;

    let nodesByType = {} as {
        [key: string]: TreeNodeWithBase[];
    };

    let nodeCountByTypeNotInTree = {} as {
        [key: string]: number;
    };

    function close() {
        showNodeCountByType = false;
    }

    function toggleShowNodes() {
        const nodeSubtype = this.id;
        if (nodesByType[nodeSubtype]) {
            nodesByType[nodeSubtype] = null;
            nodeCountByTypeNotInTree[nodeSubtype] = 0;
        } else {
            const nodes = [];
            for (const treeNode of flatTree) {
                // debugger;
                if (treeNode.subtype === nodeSubtype) {
                    nodes.push(treeNode);
                }
            }
            nodeCountByTypeNotInTree[nodeSubtype] = nodeCountByType[nodeSubtype] - nodes.length;;
            nodesByType[nodeSubtype] = nodes;
        }
    }

    function onNodeClicked() {
        const nodeRef = this.id;
        inspectNodeTreeNode = flatTree[nodeRef];
    }

    function onKeydown(event) {
        // Don't handle anything if we're not the top detail view
        if (inspectNodeTreeNode) {
            return;
        }

        const key = event.key;

        switch (key) {
            case 'Escape':
                close();
                break;
        }
    }
</script>

<style>
    #container {
        --headerHeight: 24px;
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        z-index: 200;
    }

    #header {
        position: fixed;
        width: 100%;
        height: var(--headerHeight);
        background-color: var(--vscode-sideBar-background);
        font-weight: bold;
        font-size: large;
        padding: 0 10px;
        border-bottom: 2px solid rgb(190, 190, 190);
    }

    #background {
        background-color: var(--vscode-sideBar-background);
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        z-index: -1;
    }

    #nodesOfTypeContainer {
        padding: var(--headerHeight) 0 0;
        margin: 5px;
    }

    .nodeOfType {
        display: inline-block;
        margin: 2px 5px 10px;
    }

    .nodesOfTypeItem {
        cursor: pointer;
        padding: 5px;
    }
</style>

<svelte:window on:keydown={onKeydown} />
<div id="container">
    <div id="background" />
    <div id="header">
        <section style="display: flex; flex-direction:row">
            <vscode-button appearance="icon" title="Back" on:click={close}>
                <ArrowLeft />
            </vscode-button>

            Node Count By Type
        </section>
    </div>

    <div id="nodesOfTypeContainer">
        {#each Object.entries(nodeCountByType) as [key, value]}
            <div id={key} class="nodesOfTypeItem" on:click={toggleShowNodes}>
                <Chevron expanded={!!nodesByType[key] || !!nodeCountByTypeNotInTree[key]} />
                <div>{key} ({value})</div>
                <div style="clear: both" />
            </div>

            {#each nodesByType[key] ?? [] as node, i}
                <vscode-button id={node.ref} class="nodeOfType" appearance="secondary" title={node.keyPath} on:click={onNodeClicked}>{node.id ? `#${node.id}` : `${i}`}</vscode-button>
            {/each}

            {#if nodeCountByTypeNotInTree[key] > 0}
                <div class="nodeOfType">{`${nodeCountByTypeNotInTree[key]} node(s) not in scene tree`}</div>
            {/if}
            <div style="clear: both" />
        {/each}
    </div>
</div>
