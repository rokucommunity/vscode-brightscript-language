
<script lang="ts">
    window.vscode = acquireVsCodeApi();
    import {odc, intermediary} from "../ExtensionIntermediary";
    import JSONTreeView from "../components/JSONTreeView/JSONTreeView.svelte";

    function exportRegistry() {
        intermediary.sendMessage('exportRegistry', {
            content: registryValues,
        });
    }

    function importRegistry() {
        intermediary.sendMessage('importRegistry');
    }

    let registryValues = {};
    (async () => {
        const result = await odc.readRegistry();
        registryValues = result.values;
    })();
</script>
{#if Object.keys(registryValues).length > 0}
    <div>
        <button on:click={exportRegistry}>Export</button>
        <button on:click={importRegistry}>Import</button>
    </div>
    <JSONTreeView {registryValues} />
{/if}
