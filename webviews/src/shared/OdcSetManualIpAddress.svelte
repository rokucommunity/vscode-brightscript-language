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
    Use the form below to connect to an active session (the on-device component needs to already be installed and running)<br />
    <table>
        <tr>
            <td>
                <label for="ipAddress">IP Address</label>
            </td>
            <td>
                <input
                    id="ipAddress"
                    class="fieldValue"
                    bind:value={ipAddress} />
            </td>
            <td rowspan="2">
                <button on:click={onSaveIpButtonClicked}><Save />&nbsp;<b>Apply</b></button>
            </td>
        </tr>
        <tr>
            <td> <label for="password">Password</label></td>
            <td>
                <input id="password" class="fieldValue" bind:value={password} />
            </td>
        </tr>
    </table>
</div>
