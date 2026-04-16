<script lang="ts">
    import { ViewProviderCommand } from '../../../src/viewProviders/ViewProviderCommand';
    import { intermediary } from '../ExtensionIntermediary';
    import { utils } from '../utils';

    let ipAddress = utils.getStorageValue('manuallySetIpAddress', '');
    let password = utils.getStorageValue('manuallySetPassword', '');

    function onIpAddressChange() {
        ipAddress = this.value
        utils.setStorageValue('manuallySetIpAddress', ipAddress);
    }

    function onPasswordChange() {
        password = this.value
        utils.setStorageValue('manuallySetPassword', password);
    }

    function onConnectClicked() {
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
                <vscode-text-field
                    id="ipAddress"
                    value={ipAddress}
                    on:input={onIpAddressChange} />
            </td>
        </tr>
        <tr>
            <td> <label for="password">Password</label></td>
            <td>
                <vscode-text-field
                    id="password"
                    value={password}
                    on:input={onPasswordChange} />
            </td>
        </tr>
        <tr>
            <td colspan="2">
                <vscode-button on:click={onConnectClicked}>Connect</vscode-button>
            </td>
        </tr>
    </table>
</div>
