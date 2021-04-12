<script lang="ts">
    window.vscode = acquireVsCodeApi();
    import {odc} from "../ExtensionIntermediary";
    const storage = window.localStorage;

    let commandArgs: any[];
    let selected;
    let formArgs = {};
    let commandResponse = '';

    function onCommandChange() {
        commandArgs = convertArgs(selected.args);
        storage.previousCommandName = selected.name
        const argValues = storage[`${selected.name}ArgValues`];
        if(argValues) {
            formArgs = JSON.parse(argValues);
        } else {
            formArgs = {}
        }
    }

    function convertArgs(inputArgs) {
        const args = [];
        for (const key of inputArgs.propertyOrder) {
            let rawArg = inputArgs.properties[key];
            // Handles references to other definitions in schema
            if (rawArg['$ref']) {
                const refParts = rawArg['$ref'].split("/");
                let rawArgRef = requestArgsSchema;

                for (const key of refParts) {
                    // Skip first entry
                    if (key === '#') continue;
                    rawArgRef = rawArgRef[key];
                }
                for (const key in rawArgRef) {
                    rawArg[key] = rawArgRef[key];
                }
            }
            args.push({
                ...rawArg,
                id: key
            });
        }
        return args;
    }

    async function sendCommand() {
        commandResponse = 'running...';
        const processedArgs = {}
        const argValuesForCommand = {}
        for (const key in formArgs) {
            let argValue = formArgs[key];
            argValuesForCommand[key] = argValue
            const argType = selected.args.properties[key].type
            if (argType == 'boolean') {
                if (argValue == 'true') {
                    processedArgs[key] = true;
                } else {
                    processedArgs[key] = false;
                }
            } else if (argType == 'array' || argType == 'object') {
                processedArgs[key] = JSON.parse(argValue);
            } else if (argType == 'number') {
                processedArgs[key] = Number(argValue);
            } else {
                processedArgs[key] = argValue;
            }
        }

        storage[`${selected.name}ArgValues`] = JSON.stringify(argValuesForCommand);

        try {
            const response = await odc.sendOdcMessage(selected.name, processedArgs);
            commandResponse = JSON.stringify(response, null, 2);
        } catch(error) {
            commandResponse = error;
        }
    }

    const commandList = []
    for (const commandName of odcCommands) {
        let argsKey = 'ODC.' + commandName.charAt(0).toUpperCase() + commandName.slice(1) + 'Args';
        commandList.push({
            name: commandName,
            args: requestArgsSchema.definitions[argsKey]
        })
    }

    if (!storage.previousCommandName) {
        storage.previousCommandName = 'getFocusedNode'
    }

    // preselect the last used function
    for (const command of commandList) {
        if (command.name === storage.previousCommandName) {
            commandArgs = convertArgs(command.args);
            selected = command;
            onCommandChange();
        }
    }
</script>

<style>
    #container {
        margin: 10px 0px;
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
<div id="container">
    <label for="command">Command:</label>
    <!-- svelte-ignore a11y-no-onchange -->
    <select name="command" bind:value={selected} on:change={onCommandChange}>
    {#each commandList as command}
        <option value="{command}">{command.name}</option>
    {/each}
    </select>

    {#each commandArgs as args}
        <div class="commandOption">
            <label for="{args.id}" title="{args.description}">{args.id}:</label>
        {#if args.enum}
            <select name="{args.id}" title="{args.description}" bind:value={formArgs[args.id]}>
            {#each args.enum as value}
                <option>{value}</option>
            {/each}
            </select>
        {:else}
            <input name="{args.id}" placeholder="{args.type}" title="{args.description}" bind:value={formArgs[args.id]} />
        {/if}
        </div>
    {/each}
    <br><button on:click={sendCommand}>Send</button>
    <hr />
    <pre>
        {commandResponse}
    </pre>
</div>
