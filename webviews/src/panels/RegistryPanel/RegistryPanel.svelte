<script lang="ts">
    window.vscode = acquireVsCodeApi();
    import { odc, intermediary } from '../../ExtensionIntermediary';
    import JSONTreeView from './JSONTreeView/JSONTreeView.svelte';
    import { registryPanel } from './RegistryPanel';
    import OdcSetupSteps from '../../shared/ODCSetupSteps.svelte';
    import Loader from '../../shared/Loader.svelte';

    let loading = true;

    let registryValues = {};
    (async () => {
        loading = true;
        const result = await odc.readRegistry();
        registryValues = registryPanel.formatValues(result.values);
        loading = false;
    })();

    function exportRegistry() {
        intermediary.sendMessage('exportRegistry', {
            content: registryValues
        });
    }

    function importRegistry() {
        intermediary.sendMessage('importRegistry');
    }

    let odcAvailable = true;

    intermediary.observeEvent('onDeviceComponentStatus', (message) => {
        odcAvailable = message.available;
    });

    // Required by any view so we can know that the view is ready to receive messages
    intermediary.sendViewReady();
</script>

{#if !odcAvailable}
    <OdcSetupSteps />
{:else if loading}
    <Loader />
{:else if Object.keys(registryValues).length > 0}
    <div>
        <button on:click={exportRegistry}>Export</button>
        <button on:click={importRegistry}>Import</button>
    </div>
    <JSONTreeView registryValues={registryValues} />
{/if}
