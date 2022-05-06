<script lang="ts">
    import { utils } from '../../utils';
    import VscodeCheckbox from '../vscode-ui-toolkit/VscodeCheckbox.svelte';
    export let showSettings: boolean;

    let enableDebugLogging = true; //utils.getStorageBoolean('enableDebugLogging');
    $: {
        utils.setStorageValue('enableDebugLogging', enableDebugLogging);
    }

    let includeNodeCountInfo = utils.getStorageBoolean('includeNodeCountInfo');
    $: {
        utils.setStorageValue('includeNodeCountInfo', includeNodeCountInfo);
    }

    let includeArrayGridChildren = utils.getStorageBoolean(
        'includeArrayGridChildren'
    );
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
            <div class="title">Include Node Count</div>
            <VscodeCheckbox bind:value={includeNodeCountInfo}>
                We can get total and type based count info but this has some
                overhead so is disabled by default</VscodeCheckbox>
        </li>
        <li>
            <div class="title">Include ArrayGrid Children</div>
            <VscodeCheckbox bind:value={includeArrayGridChildren}>
                Load ArrayGrid (RowList, MarkupGrid, etc) children when
                possible. This has a performance impact so it's disabled by
                default.
            </VscodeCheckbox>
        </li>
    </ul>
</div>
