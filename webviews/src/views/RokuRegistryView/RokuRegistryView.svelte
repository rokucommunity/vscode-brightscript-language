<script lang="ts">
    window.vscode = acquireVsCodeApi();
    import { odc, intermediary } from '../../ExtensionIntermediary';
    import JSONTreePage from './JSONTreePage/JSONTreePage.svelte';
    import { registryView } from './RokuRegistryView';
    import OdcSetupSteps from '../../shared/OdcSetupSteps.svelte';
    import Loader from '../../shared/Loader.svelte';

    let loading = true;

    let registryValues = {};
    (async () => {
        loading = true;
        const { values } = await odc.readRegistry();
        registryValues = registryView.formatValues(values);
        loading = false;
    })();

    let odcAvailable = true;

    intermediary.observeEvent('onDeviceComponentStatus', (message) => {
        odcAvailable = message.available;
    });

    intermediary.observeEvent('registryUpdated', (message) => {
        registryValues = registryView.formatValues(message.values);
    });

    // Required by any view so we can know that the view is ready to receive messages
    intermediary.sendViewReady();
</script>

{#if !odcAvailable}
    <OdcSetupSteps />
{:else if loading}
    <Loader />
{:else if Object.keys(registryValues).length > 0}
    <JSONTreePage registryValues={registryValues} />
{/if}
