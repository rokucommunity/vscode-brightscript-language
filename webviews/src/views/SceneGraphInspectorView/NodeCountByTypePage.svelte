<script lang="ts">
    export let showNodeCountByType: boolean;
    export let nodeCountByType = {} as {
        [key: string]: number;
    };
    function close() {
        showNodeCountByType = false;
    }

    function onKeydown(event) {
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

    #closeButton {
        font-size: small;
        float: right;
        cursor: pointer;
        padding: 3px 20px 0 0;
    }

    ul {
        padding: var(--headerHeight) 0 0;
        margin: 5px;
        list-style: none;
    }

    li {
        padding: 0 5px 10px;
    }
</style>

<svelte:window on:keydown={onKeydown} />
<div id="container">
    <div id="background" />
    <div id="header">
        Node Count By Type
        <div id="closeButton" on:click={close}>X</div>
    </div>

    <ul>
        {#each Object.entries(nodeCountByType) as [key, value]}
            <li>
                <strong>{key}:</strong>
                {value}
            </li>
        {/each}
    </ul>
</div>
