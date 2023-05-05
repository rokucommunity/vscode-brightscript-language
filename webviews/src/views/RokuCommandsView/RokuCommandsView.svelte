<script lang="ts">
    window.vscode = acquireVsCodeApi();

    import { odc, intermediary } from '../../ExtensionIntermediary';
    import { commandsView } from './RokuCommandsView';
    import OdcSetupSteps from '../../shared/OdcSetupSteps.svelte';
    import { utils } from '../../utils';
    import { ViewProviderEvent } from '../../../../src/viewProviders/ViewProviderEvent';

    let commandArgs = [];
    let selectedCommand;

    // Where we store the info the user put in the form
    let formArgs = {};
    let commandResponse = '';

    function onCommandChange() {
        commandArgs = commandsView.convertArgs(
            selectedCommand.args,
            requestArgsSchema
        );
        utils.setStorageValue('previousCommandName', selectedCommand.name);
        const argValues = utils.getStorageValue(
            `${selectedCommand.name}ArgValues`
        );
        if (argValues) {
            formArgs = argValues;
        } else {
            formArgs = {};
        }
    }

    async function sendCommand() {
        commandResponse = 'running...';
        const processedArgs = {};
        const argValuesForCommand = {};
        for (const key in formArgs) {
            let argValue = formArgs[key];
            argValuesForCommand[key] = argValue;
            const argType = selectedCommand.args.properties[key]?.type;
            if (argType) {
                processedArgs[key] = commandsView.processArgToSendToExtension(argType, argValue);
            }
        }

        utils.setStorageValue(
            `${selectedCommand.name}ArgValues`,
            argValuesForCommand
        );

        try {
            const response = await odc.sendOdcMessage(
                selectedCommand.name,
                processedArgs
            );
            commandResponse = JSON.stringify(response, null, 2);
        } catch (error) {
            commandResponse = error.message;
        }
    }

    const commandList = [];
    for (const commandName of odcCommands) {
        let argsKey = commandName.charAt(0).toUpperCase() + commandName.slice(1) + 'Args';
        let definitionArgs = requestArgsSchema.definitions[argsKey] as any[];
        if (!definitionArgs) {
            definitionArgs = [];
        }
        commandList.push({
            name: commandName,
            args: definitionArgs
        });
    }

    let previousCommandName = utils.getStorageValue(
        'previousCommandName',
        'getFocusedNode'
    );

    // preselect the last used function
    for (const command of commandList) {
        if (command.name === previousCommandName) {
            commandArgs = commandsView.convertArgs(
                command.args,
                requestArgsSchema
            );
            selectedCommand = command;
            onCommandChange();
        }
    }

    let odcAvailable = true;

    intermediary.observeEvent(ViewProviderEvent.onDeviceAvailabilityChange, (message) => {
        odcAvailable = message.odcAvailable;
    });

    // Required by any view so we can know that the view is ready to receive messages
    intermediary.sendViewReady();
</script>

<style>
    #container {
        margin: 10px 10px;
        overflow-wrap: anywhere;
    }

    label {
        display: inline;
        padding-right: 6px;
        font-weight: bold;
    }

    .commandOption {
        margin-top: 6px;
    }

    pre {
        white-space: pre-wrap;
    }

    input {
        width: 180px;
    }
</style>

{#if !odcAvailable}
    <OdcSetupSteps />
{:else}
    <div id="container">
        <label for="command">Command:</label>
        <!-- svelte-ignore a11y-no-onchange -->
        <select
            name="command"
            bind:value={selectedCommand}
            on:change={onCommandChange}>
            {#each commandList as command}
                <option value={command}>{command.name}</option>
            {/each}
        </select>

        {#each commandArgs as args}
            <div class="commandOption">
                <label for={args.id} title={args.description}>{args.id}:</label>
                {#if args.enum}
                    <select
                        name={args.id}
                        title={args.description}
                        bind:value={formArgs[args.id]}>
                        {#each args.enum as value}
                            <option>{value}</option>
                        {/each}
                    </select>
                {:else}
                    <input
                        name={args.id}
                        placeholder={args.type}
                        title={args.description}
                        bind:value={formArgs[args.id]} />
                {/if}
            </div>
        {/each}
        <br /><button on:click={sendCommand}>Send</button>
        <hr />
        <pre>
            {commandResponse}
        </pre>
    </div>
{/if}
