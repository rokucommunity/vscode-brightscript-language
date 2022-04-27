<script lang="ts">
    import { utils } from "../../utils";

    export let showSettings: boolean;

    let enableDebugLogging = utils.getStorageBoolean('enableDebugLogging');
    $: {
        utils.setStorageValue('enableDebugLogging', enableDebugLogging);
    }

    let includeNodeCountInfo = utils.getStorageBoolean('includeNodeCountInfo');
    $: {
        utils.setStorageValue('includeNodeCountInfo', includeNodeCountInfo);
    }

    let includeArrayGridChildren = utils.getStorageBoolean('includeArrayGridChildren');
    $: {
        if (includeArrayGridChildren) {
            includeNodeCountInfo = true;
        }
        utils.setStorageValue('includeArrayGridChildren', includeArrayGridChildren);
    }

    function close() {
        showSettings = false;
    }

    function handleKeydown(event) {
        const key = event.key;

        switch (key) {
            case 'Escape':
                close();
                break;
        }
	}
</script>

<style>
    #background {
        background-color: #1b2631;
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        width: 100%;
        height: 100%;
        z-index: 199;
    }

    #container {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        z-index: 200;
    }

    #header {
        font-weight: bold;
        font-size: large;
        color: white;
        padding: 0 10px;
        border-bottom: 2px solid rgb(190, 190, 190);
    }

    #closeButton {
        font-size: small;
        float: right;
        cursor: pointer;
        padding-top: 3px;
    }

    label {
        font-weight: bold;
        color: white;
        padding-right: 5px;
    }

    ul {
        margin: 5px;
        list-style: none;
        padding: 0;
    }

    li {
        padding: 0 5px 10px;
    }

    .hint {
        font-size: 9px;
    }
</style>
<svelte:window on:keydown={handleKeydown} />
<div id="background" />
<div id="container">
    <div id="header">
        Settings
        <div id="closeButton" on:click={close}>X</div>
    </div>
    <ul>
        <li>
            <label for="enableDebugLogging">Enable Debug Logging:</label>
            <input class="inline" type="checkbox" id="enableDebugLogging" bind:checked={enableDebugLogging} />
        </li>
        <li>
            <label for="includeNodeCountInfo">Include Node Count:</label>
            <input class="inline" type="checkbox" id="includeNodeCountInfo" bind:checked={includeNodeCountInfo} />
            <div class="hint">We can get total and type based count info but this has some overhead so is disabled by default</div>
        </li>
        <li>
            <label for="includeArrayGridChildren">Include ArrayGrid Children:</label>
            <input class="inline" type="checkbox" id="includeArrayGridChildren" bind:checked={includeArrayGridChildren} />
            <div class="hint">We can get ArrayGrid(RowList,MarkupGrid,etc) children in most cases but this has an extra overhead so is disabled by default</div>
        </li>
    </ul>
</div>
