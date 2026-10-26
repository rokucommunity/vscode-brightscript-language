<script lang="ts">
    window.vscode = acquireVsCodeApi();

    import { odc, intermediary } from '../../ExtensionIntermediary';
    import { commandsView } from './RokuCommandsView';
    import NumberField from '../../shared/NumberField.svelte';
    import OdcSetupSteps from '../../shared/OdcSetupSteps.svelte';
    import { utils } from '../../utils';
    import { ViewProviderCommand } from '../../../../src/viewProviders/ViewProviderCommand';
    import { ViewProviderEvent } from '../../../../src/viewProviders/ViewProviderEvent';

    let commandArgs = [];
    let selectedCommand;
    let selectedTab = 'command';

    // Where we store the info the user put in the form
    let formArgs = {};
    let commandResponse = '';
    let applying = false;
    let appliedMegabytes = 0;
    let progressTarget = 0;
    let targetMegabytes = '0';
    let errorMessage = '';

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

    intermediary.observeEvent(ViewProviderEvent.onDeviceAvailabilityChange, async (message) => {
        odcAvailable = message.context.odcAvailable;
        if (odcAvailable) {
            await refreshApplied();
        } else {
            applying = false;
            appliedMegabytes = 0;
        }
    });

    intermediary.observeEvent(ViewProviderEvent.onMemoryPressureProgress, (message) => {
        appliedMegabytes = message.context.appliedMegabytes;
        progressTarget = message.context.targetMegabytes;
    });

    function selectTab(tab: string) {
        selectedTab = tab;
        if (tab === 'memory' && odcAvailable) {
            void refreshApplied();
        }
    }

    async function refreshApplied() {
        try {
            const response = await intermediary.sendCommand(ViewProviderCommand.getMemoryPressure);
            if (!odcAvailable || applying) {
                return;
            }
            appliedMegabytes = response.appliedMegabytes ?? 0;
            targetMegabytes = String(appliedMegabytes);
        } catch (e) {
            if (!odcAvailable || applying) {
                return;
            }
            errorMessage = e?.message ?? String(e);
        }
    }

    function readMegabytes(value: string) {
        const megabytes = Number(value);
        if (!Number.isFinite(megabytes) || megabytes < 0) {
            return undefined;
        }
        return megabytes;
    }

    async function applyMegabytes(megabytes: number) {
        applying = true;
        errorMessage = '';
        progressTarget = megabytes;
        try {
            const response = await intermediary.sendCommand(ViewProviderCommand.applyMemoryPressure, {
                megabytes: megabytes
            });
            appliedMegabytes = response.appliedMegabytes;
            errorMessage = response.error ?? '';
            if (!response.error) {
                targetMegabytes = String(response.appliedMegabytes);
            }
        } catch (e) {
            errorMessage = e?.message ?? String(e);
        } finally {
            applying = false;
        }
    }

    function applyMemoryPressure() {
        const megabytes = readMegabytes(targetMegabytes);
        if (megabytes === undefined) {
            errorMessage = 'Enter a number of megabytes';
            return;
        }
        void applyMegabytes(megabytes);
    }

    function releaseMemoryPressure() {
        void applyMegabytes(0);
    }

    // Required by any view so we can know that the view is ready to receive messages
    intermediary.sendViewReady();
</script>

<style>
    #container {
        display: flex;
        flex-direction: column;
        box-sizing: border-box;
        height: 100%;
        overflow: hidden;
        overflow-wrap: anywhere;
    }

    .tabs {
        display: flex;
        flex: 0 0 auto;
        gap: 4px;
        padding: 10px 10px 0;
        border-bottom: 1px solid var(--vscode-panel-border);
        background: var(--vscode-sideBar-background);
    }

    .tabContent {
        flex: 1 1 auto;
        min-height: 0;
        overflow: auto;
        padding: 12px 10px 10px;
    }

    .tabs button {
        background: transparent;
        color: var(--vscode-foreground);
        border: none;
        border-bottom: 2px solid transparent;
        padding: 6px 10px;
        cursor: pointer;
    }

    .tabs button.active {
        border-bottom-color: var(--vscode-focusBorder);
    }

    .description {
        margin: 0 0 10px;
        color: var(--vscode-descriptionForeground);
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

    .row {
        display: flex;
        flex-wrap: nowrap;
        align-items: center;
        gap: 8px;
    }

    #status {
        margin: 6px 0 0;
    }

    #error {
        color: var(--vscode-debugConsole-errorForeground);
        margin-top: 8px;
    }
</style>

{#if !odcAvailable}
    <OdcSetupSteps />
{:else}
    <div id="container">
        <div class="tabs">
            <button class:active={selectedTab === 'command'} on:click={() => selectTab('command')}>Run RTA Command</button>
            <button class:active={selectedTab === 'memory'} on:click={() => selectTab('memory')}>Apply Memory Pressure</button>
        </div>
        <div class="tabContent">
        {#if selectedTab === 'command'}
            <p class="description">Send any command to the connected Roku that Roku Test Automation (RTA) supports.</p>
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
        {:else}
            <p class="description">Tool to see how the channel behaves when memory is tight.</p>
            <div class="row">
                <NumberField id="memoryPressureMegabytes" bind:value={targetMegabytes} disabled={applying} step="any" />
                <span>MB</span>
                <button disabled={applying} on:click={applyMemoryPressure}>Apply</button>
                <button disabled={applying} on:click={releaseMemoryPressure}>Release</button>
            </div>
            <p id="status">
                {#if applying}
                    Applying {appliedMegabytes} / {progressTarget} MB
                {:else}
                    Applied: {appliedMegabytes} MB
                {/if}
            </p>
            {#if errorMessage}
                <div id="error">{errorMessage}</div>
            {/if}
        {/if}
        </div>
    </div>
{/if}
