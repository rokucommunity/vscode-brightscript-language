<!-- svelte-ignore a11y-click-events-have-key-events -->
<script lang="ts">
    import { ViewProviderCommand } from '../../../../src/viewProviders/ViewProviderCommand';
    import { ViewProviderEvent } from '../../../../src/viewProviders/ViewProviderEvent';
    import { intermediary } from '../../ExtensionIntermediary';
    import OdcSetupSteps from '../../shared/OdcSetupSteps.svelte';
    import { utils } from '../../utils';

    window.vscode = acquireVsCodeApi();

    let loading = false;
    let replResponse: any = '';
    let replError = '';
    let replTimeTaken = -1;
    let odcAvailable = false;
    let replCode = utils.getStorageValue('replCode') ?? '';
    intermediary.observeEvent(ViewProviderEvent.onDeviceAvailabilityChange, async (message) => {
        loading = false;
        odcAvailable = message.context.odcAvailable;
    });

    function onReplCodeChange() {
        replCode = this.value;
        utils.setStorageValue('replCode', replCode);
    }

    async function sendReplRequest() {
        loading = true;
        replResponse = '';
        replError = '';
        const {replOutput} = await intermediary.sendCommand(ViewProviderCommand.sendReplRequest, {
            replCode: replCode
        });
        loading = false;
        const response = replOutput?.response;

        if (replOutput?.error) {
            replError = replOutput.error.message;
            replTimeTaken = -1
        } else if (response !== undefined) {
            replTimeTaken = replOutput.timeTaken;
            if (typeof response === 'object' || Array.isArray(response)) {
                replResponse = JSON.stringify(response, undefined, 4);
            } else {
                replResponse = response;
            }
        }
    }

    // Required by any view so we can know that the view is ready to receive messages
    intermediary.sendViewReady();
</script>
<style>
    #container {
        padding: 10px;
    }

    #replCode {
        box-sizing: border-box;
        width: 100%;
    }

    #replCode {
        margin-bottom: 10px;
    }

    #runButton {
        margin-bottom: 10px;
    }

    #replOutput, #replError {
        margin-top: 10px;
    }

    #replError {
        color: var(--vscode-debugConsole-errorForeground);
    }
</style>
<div id="container">
    {#if odcAvailable}
        <vscode-text-area id="replCode" placeholder="Enter your brightscript code here to run on your device" rows="10" resize="both" on:input={onReplCodeChange} value={replCode} />

        <table>
            <tr>
                <td>
                    <vscode-button id="runButton" on:click={sendReplRequest}>Run</vscode-button>
                </td>
                <td>&nbsp;&nbsp;&nbsp;</td>
                <td>
                    {#if loading}
                        <vscode-progress-ring />
                    {:else}
                        {replTimeTaken >= 0 ? `Last run took ${replTimeTaken}ms` : ''}
                    {/if}
                </td>
            </tr>
        </table>

        <vscode-divider />

        {#if !loading}
            <pre id="replOutput">{replResponse}</pre>
            <div id="replError">{replError}</div>
        {/if}
    {:else}
        <OdcSetupSteps />
    {/if}
</div>
