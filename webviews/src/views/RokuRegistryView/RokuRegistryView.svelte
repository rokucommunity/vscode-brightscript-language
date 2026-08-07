<script lang="ts">
    window.vscode = acquireVsCodeApi();
    import { odc, intermediary } from '../../ExtensionIntermediary';
    import RegistryTree from './RegistryTree.svelte';
    import { registryView } from './RokuRegistryView';
    import OdcSetupSteps from '../../shared/OdcSetupSteps.svelte';
    import RceUnsupportedMessage from '../../shared/RceUnsupportedMessage.svelte';
    import Loader from '../../shared/Loader.svelte';
    import { ViewProviderEvent } from '../../../../src/viewProviders/ViewProviderEvent';

    let loading = true;

    let registryValues = {};

    let odcAvailable = false;

    let isRceDebugSession = false;

    intermediary.observeEvent(ViewProviderEvent.onDeviceAvailabilityChange, async (message) => {
        odcAvailable = message.context.odcAvailable;
        isRceDebugSession = message.context.isRceDebugSession;
        if (odcAvailable) {
            loading = true;
            const { values } = await odc.readRegistry();
            registryValues = registryView.formatValues(values);
            loading = false;
        } else {
            registryValues = {}
        }
    });

    intermediary.observeEvent(ViewProviderEvent.onRegistryUpdated, async (message) => {
        loading = true;
        const { values } = await odc.readRegistry();
        registryValues = registryView.formatValues(values);
        loading = false;
    });

    // Required by any view so we can know that the view is ready to receive messages
    intermediary.sendViewReady();
</script>

{#if isRceDebugSession}
    <RceUnsupportedMessage />
{:else if !odcAvailable}
    <OdcSetupSteps />
{:else if loading}
    <Loader />
{:else if Object.keys(registryValues).length > 0}
    <RegistryTree bind:registryValues />
{:else}
    <p class="empty-state">Registry is empty.</p>
{/if}

<style>
    .empty-state {
        padding: 10px;
        opacity: 0.7;
    }
</style>
