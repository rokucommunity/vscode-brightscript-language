<script lang="ts">
    import { Save } from 'svelte-codicons';
    import { intermediary } from '../ExtensionIntermediary';
    import { utils } from '../utils';

    let ipAddress = utils.getStorageValue('manuallySetIpAddress', '');

    function onSaveIpButtonClicked() {
        utils.setStorageValue('manuallySetIpAddress', ipAddress);
        intermediary.sendMessage('setManualIpAddress', {
            ipAddress: ipAddress
        });
    }
</script>

<style>
    #setManualIpAddress {
        padding-top: 10px;
    }
</style>

<div id="setManualIpAddress">
    If you have the on device component already running and you would like to use this tool for a Roku device not currently being debugged enter the IP address here:
    <input
        class="fieldValue"
        bind:value={ipAddress} />
    <span
        class="icon-button"
        title="Save IP Address"
        on:click={onSaveIpButtonClicked}>
        <Save />
    </span>
</div>
