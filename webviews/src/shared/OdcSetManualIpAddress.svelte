<script lang="ts">
    import { Save } from 'svelte-codicons';
    import { ViewProviderCommand } from '../../../src/viewProviders/ViewProviderCommand';
    import { intermediary } from '../ExtensionIntermediary';
    import { utils } from '../utils';

    let ipAddress = utils.getStorageValue('manuallySetIpAddress', '');
    let password = utils.getStorageValue('manuallySetPassword', '');

    function onSaveIpButtonClicked() {
        utils.setStorageValue('manuallySetIpAddress', ipAddress);
        utils.setStorageValue('manuallySetPassword', password);
        intermediary.sendCommand(ViewProviderCommand.setManualIpAddress, {
            host: ipAddress,
            password: password
        });
    }
</script>

<style>
    #setManualIpAddress {
        padding-top: 10px;
    }
</style>

<div id="setManualIpAddress">
    If you have the on device component already running and you would like to use this tool for a Roku device not currently being debugged enter it here:<br>
    <label for="ipAddress">IP Address</label>
    <input
        id="ipAddress"
        class="fieldValue"
        bind:value={ipAddress} /><br>
    <label for="password">Password</label>
    <input
        id="password"
        class="fieldValue"
        bind:value={password} />
    <span
        class="icon-button"
        title="Save"
        on:click={onSaveIpButtonClicked}>
        <Save />
    </span>
</div>
