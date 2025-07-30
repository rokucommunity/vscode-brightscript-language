<script lang="ts">
    import { ArrowLeft } from 'svelte-codicons';
    import Chevron from '../../shared/Chevron.svelte';
    import type { AppUIResponse, AppUIResponseChild } from 'roku-test-automation';

    export let showNodeCountByType: boolean;

    export let nodeCountByType = {} as {
        [key: string]: number;
    };

    export let appUIResponse: AppUIResponse;

    export let inspectNode: AppUIResponseChild | null;

    let nodesByType = {} as {
        [key: string]: AppUIResponseChild[];
    };

    function close() {
        showNodeCountByType = false;
    }

    function toggleShowNodes() {
        const nodeSubtype = this.id;
        if (nodesByType[nodeSubtype]) {
            nodesByType[nodeSubtype] = null;
        } else {
            nodesByType[nodeSubtype] = buildNodeListforSubtype(nodeSubtype, appUIResponse.screen.children);
        }
    }

    function buildNodeListforSubtype(nodeSubtype: string, children?: AppUIResponseChild[], nodes = []) {
        for (const node of children ?? []) {
            if (node.subtype === nodeSubtype) {
                nodes.push(node);
            }

            buildNodeListforSubtype(nodeSubtype, node.children, nodes);
        }

        return nodes;
    }

    function onNodeClicked() {
        const nodeSubTypeAndPosition = this.id.split('.');

        inspectNode = nodesByType[nodeSubTypeAndPosition[0]][+nodeSubTypeAndPosition[1]];
    }

    function onKeydown(event) {
        // Don't handle anything if we're not the top detail view
        if (inspectNode) {
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
                <Chevron expanded={!!nodesByType[key]} />
                <div>{key} ({value})</div>
                <div style="clear: both" />
            </div>

            {#each nodesByType[key] ?? [] as node, i}
                <vscode-button id="{key}.{i}" class="nodeOfType" appearance="secondary" title={node.keyPath ?? 'No key path available'} on:click={onNodeClicked}>{i}</vscode-button>
            {/each}
            <div style="clear: both" />
        {/each}
    </div>
</div>
