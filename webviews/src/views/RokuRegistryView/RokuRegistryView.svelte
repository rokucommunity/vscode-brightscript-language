<script lang="ts">
    window.vscode = acquireVsCodeApi();
    import { odc, intermediary } from '../../ExtensionIntermediary';
    import JSONTreePage from './JSONTreePage/JSONTreePage.svelte';
    import { registryView } from './RokuRegistryView';
    import OdcSetupStepsPage from '../../shared/OdcSetupStepsPage.svelte';
    import Loader from '../../shared/Loader.svelte';

    let loading = true;

    let registryValues = {};
    (async () => {
        loading = true;
        const result = await odc.readRegistry();
        registryValues = registryView.formatValues(result.values);
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
    <OdcSetupStepsPage />
{:else if loading}
    <Loader />
{:else if Object.keys(registryValues).length > 0}
    <div>
        <button on:click={exportRegistry}>Export</button>
        <button on:click={importRegistry}>Import</button>
    </div>
    <JSONTreePage registryValues={registryValues} />
{/if}
