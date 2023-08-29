<!-- svelte-ignore a11y-click-events-have-key-events -->
<script lang="ts">
    import { odc, intermediary } from '../../ExtensionIntermediary';
    import { Trash, Add, ArrowUp, ArrowDown } from 'svelte-codicons';
    import { ViewProviderEvent } from '../../../../src/viewProviders/ViewProviderEvent';
    import { ViewProviderCommand } from '../../../../src/viewProviders/ViewProviderCommand';

    window.vscode = acquireVsCodeApi();

    let loading = true;
    let currentRunningStep = -1;

    const stepTypes = {
        sleep: {
            type: 'sleep',
            defaultValue: 1,
            name: 'Sleep'
        },
        sendKeyPress: {
            type: 'sendKeyPress',
            name: 'Send Keypress'
        },
        sendText: {
            type: 'sendText',
            name: 'Send Text'
        }
    };

    const availableKeys = {
        Back: 'Back',
        Backspace: 'Backspace',
        Down: 'Down',
        Enter: 'Enter',
        Fwd: 'Forward',
        Home: 'Home',
        Left: 'Left',
        Select: 'Ok',
        Info: 'Option',
        Play: 'Play',
        InstantReplay: 'Replay',
        Rev: 'Rewind',
        Right: 'Right',
        Search: 'Search',
        Up: 'Up',
        PowerOff: 'PowerOff',
        PowerOn: 'PowerOn'
    }

    let steps = [] as {
        type: string;
        value: string;
    }[];

    let autorunOnDeploy = true;

    // We can't use bind so we have to update it ourselves manually because we're using vscode-checkbox
    function onAutorunOnDeployChange() {
        autorunOnDeploy = this.checked;
        storeConfigs(steps);
    }

    function storeConfigs(updatedSteps) {
        if(!loading) {
            intermediary.sendCommand(ViewProviderCommand.storeRokuAutomationConfigs, {
                configs: [{
                    name: 'DEFAULT',
                    steps: updatedSteps
                }],
                autorunOnDeploy: autorunOnDeploy
            });
        }

        // Required to get it to update the UI
        steps = updatedSteps;
    }

    function onStepTypeChange() {
        const step = steps[this.id];
        step.type = this.value;
        delete step.value;

        storeConfigs(steps);
    }

    function onStepValueChange() {
        const step = steps[this.id];
        step.value = this.value;

        storeConfigs(steps);
    }

    function addStep() {
        steps.push({
            type: 'sendKeyPress',
            value: ''
        });

        storeConfigs(steps);
    }

    function deleteStep() {
        steps.splice(this.id, 1);

        storeConfigs(steps);
    }

    function runConfig() {
        intermediary.sendCommand(ViewProviderCommand.runRokuAutomationConfig, {
            configIndex: this.id
        });
    }

    function stopConfig() {
        intermediary.sendCommand(ViewProviderCommand.stopRokuAutomationConfig, {
            configIndex: this.id
        });
    }

    function moveStepUp() {
        const step = steps.splice(this.id, 1)[0];
        steps.splice(this.id - 1, 0, step);
        storeConfigs(steps);
    }

    function moveStepDown() {
        const step = steps.splice(this.id, 1)[0];
        steps.splice(this.id + 1, 0, step);
        storeConfigs(steps);
    }

    function onKeydown(event) {
        const key = event.key;

        switch (key) {
            case 'Escape':
                stopConfig();
                break;
        }
    }

    intermediary.observeEvent(ViewProviderEvent.onRokuAutomationConfigsLoaded, (message) => {
        const configs = message.context.configs;
        if (configs) {
            const config = configs[0];
            steps = config.steps;
            autorunOnDeploy = message.context.autorunOnDeploy;
        } else {
            steps = [{
                type: 'sleep',
                value: '4'
            }];
        }
        loading = false;
    });

    let lastStepDate = Date.now();
    intermediary.observeEvent(ViewProviderEvent.onRokuAutomationConfigStepChange, (message) => {
        currentRunningStep = message.context.step;
        console.log('currentRunningStep', currentRunningStep);
        if (currentRunningStep === -1) {
            // Once we finish running all current steps, update our last step date in case we want to add any more steps
            lastStepDate = Date.now();
        }
    });

    function addSleepStep() {
        // Figure out how long it has been since we last had a step
        let elapsedTime = (Date.now() - lastStepDate) / 1000;

        // Round to the nearest tenth
        elapsedTime = (Math.round(elapsedTime * 10) / 10);

        steps.push({
            type: stepTypes.sleep.type,
            value: elapsedTime.toString()
        });
    }

    intermediary.observeEvent(ViewProviderEvent.onRokuAutomationKeyPressed, (message) => {
        let {key, literalCharacter} = message.context;
        if (literalCharacter) {
            // Check if we were typing somethign before and if so just add on to it
            const lastStep = steps.at(-1);
            if (lastStep?.type === stepTypes.sendText.type) {
                lastStep.value += key
            } else {
                addSleepStep();
                steps.push({
                    type: stepTypes.sendText.type,
                    value: key
                });
            }
        } else {
            addSleepStep();
            steps.push({
                type: stepTypes.sendKeyPress.type,
                value: key
            });
        }

        storeConfigs(steps);
        lastStepDate = Date.now();
    });

    // Required by any view so we can know that the view is ready to receive messages
    intermediary.sendViewReady();
</script>

<style>
</style>

<svelte:window on:keydown={onKeydown} />

<div>
    <table>
    {#each steps as step, index}
        <tr>
            <td>
                {#if index > 0}
                    <vscode-button id="{index}" appearance="icon" title="Move step up" aria-label="Move step up" on:click={moveStepUp}>
                        <ArrowUp />
                    </vscode-button>
                {/if}
            </td>
            <td>
                <vscode-dropdown id="{index}" on:change={onStepTypeChange} value="{step.type}">
                {#each Object.entries(stepTypes) as [stepType, stepTypeParams]}
                    <vscode-option value="{stepType}">{stepTypeParams.name}</vscode-option>
                {/each}
                </vscode-dropdown>
            </td>
            <td>
                {#if currentRunningStep === -1}
                    <vscode-button id="{index}" appearance="icon" title="Delete step" aria-label="Delete step" on:click={deleteStep}><Trash /></vscode-button>
                {:else if currentRunningStep === index}
                    <vscode-progress-ring />
                {/if}
            </td>
        </tr>
        <tr>
            <td>
                {#if index < steps.length - 1}
                    <vscode-button id="{index}" appearance="icon" aria-label="Trash" on:click={moveStepDown}><ArrowDown /></vscode-button>
                {/if}
            </td>
            <td>
            {#if step.type === stepTypes.sleep.type}
                <vscode-text-field id="{index}" on:change={onStepValueChange} value="{step.value ?? stepTypes.sleep.defaultValue}" type="number" />
            {:else if step.type === stepTypes.sendKeyPress.type}
                <vscode-dropdown id="{index}" on:change={onStepValueChange} value="{step.value}">
                {#each Object.entries(availableKeys) as [key, text]}
                    <vscode-option value={key}>{text}</vscode-option>
                {/each}
                </vscode-dropdown>
            {:else if step.type === stepTypes.sendText.type}
                <vscode-text-field id="{index}" on:change={onStepValueChange} value="{step.value}" />
            {/if}
            </td>
        </tr>
        <tr>
            <td colspan="3">
                <vscode-divider />
            </td>
        </tr>
    {/each}
        <tr>
            <td>
                <vscode-button appearance="icon" title="Add Step" aria-label="Add Step" on:click={addStep}><Add /></vscode-button>
            </td>
            <td>
                <vscode-checkbox on:change={onAutorunOnDeployChange} checked={autorunOnDeploy}>Autorun on deploy</vscode-checkbox>
            </td>
        </tr>
        <tr>
            <td colspan="2">
                {#if currentRunningStep >= 0}
                    <vscode-button id={0} on:click={stopConfig}>Stop</vscode-button>
                {:else}
                    <vscode-button id={0} on:click={runConfig}>Run</vscode-button>
                {/if}
            </td>
        </tr>
    </table>
</div>
