<script lang="ts">
    import { ViewProviderCommand } from '../../../src/viewProviders/ViewProviderCommand';
    import { intermediary } from '../ExtensionIntermediary';

    export let caption = 'Connect to an active session (the on-device component needs to already be installed and running)';

    let connecting = false;
    let errorMessage: string | undefined;

    async function onConnectClicked() {
        connecting = true;
        errorMessage = undefined;
        try {
            const { status, message } = await intermediary.sendCommand(ViewProviderCommand.connectToDevice, {});
            if (status === 'error') {
                errorMessage = message ?? 'Could not connect to the device.';
            }
        } finally {
            connecting = false;
        }
    }
</script>

<style>
    #connectToDevice {
        padding-top: 10px;
    }

    #connectToDeviceError {
        font-weight: bold;
        color: rgb(216, 71, 71);
        padding-top: 5px;
    }
</style>

<div id="connectToDevice">
    {caption}<br />
    <vscode-button disabled={connecting} on:click={onConnectClicked}>Connect to a Device</vscode-button>
    {#if errorMessage}
        <div id="connectToDeviceError">{errorMessage}</div>
    {/if}
</div>
