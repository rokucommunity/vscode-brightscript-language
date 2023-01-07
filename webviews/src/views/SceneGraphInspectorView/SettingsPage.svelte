<script lang="ts">
    import { utils } from '../../utils';
    import VscodeCheckbox from '../../shared/vscode-ui-toolkit/VscodeCheckbox.svelte';
    export let showSettingsPage: boolean;

    let enableDebugLogging = utils.getStorageBooleanValue('enableDebugLogging');
    $: {
        utils.setStorageValue('enableDebugLogging', enableDebugLogging);
    }

    let includeNodeCountInfo = utils.getStorageBooleanValue('includeNodeCountInfo', true);
    $: {
        utils.setStorageValue('includeNodeCountInfo', includeNodeCountInfo);
    }

    let includeArrayGridChildren = utils.getStorageBooleanValue('includeArrayGridChildren', true);
    $: {
        if (includeArrayGridChildren) {
            includeNodeCountInfo = true;
        }
        utils.setStorageValue(
            'includeArrayGridChildren',
            includeArrayGridChildren
        );
    }

    function close() {
        showSettingsPage = false;
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
        background-color: var(--vscode-sideBar-background);
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
        padding: 0 10px;
        border-bottom: 2px solid rgb(190, 190, 190);
    }

    #closeButton {
        font-size: small;
        float: right;
        cursor: pointer;
        padding-top: 3px;
    }

    ul {
        margin: 5px;
        list-style: none;
        padding: 0;
    }

    li {
        padding: 0 5px 10px;
    }

    .title {
        font-weight: bold;
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
            <div class="title">Debug Logging</div>
            <VscodeCheckbox bind:value={enableDebugLogging}>
                Enable debug logging
            </VscodeCheckbox>
        </li>
        <li>
            <div class="title">Include Node Counts</div>
            <VscodeCheckbox bind:value={includeNodeCountInfo}>
                Load the total and type-based node counts. (Disabled by default to improve performance)</VscodeCheckbox>
        </li>
        <li>
            <div class="title">Include ArrayGrid Children</div>
            <VscodeCheckbox bind:value={includeArrayGridChildren}>
                Load ArrayGrid (RowList, MarkupGrid, etc) children when
                possible. (Disabled by default to improve performance)
            </VscodeCheckbox>
        </li>
    </ul>
</div>
