<!-- svelte-ignore a11y-click-events-have-key-events -->
<script lang="ts">
    import { intermediary } from '../../ExtensionIntermediary';
    import { Trash, Add, ArrowUp, ArrowDown } from 'svelte-codicons';
    import { ViewProviderEvent } from '../../../../src/viewProviders/ViewProviderEvent';
    import { ViewProviderCommand } from '../../../../src/viewProviders/ViewProviderCommand';
    import NumberField from '../../shared/NumberField.svelte';
    import AutoRunsEditor from './AutoRunsEditor.svelte';

    window.vscode = acquireVsCodeApi();

    type Step = { type: string, value: string };
    type Run = { name?: string, steps?: Step[] };

    let runs: Run[];
    let selectedRun: string;
    let autoRunsEditor: any;
    let loading: boolean = true;
    let currentRunningStep: number = -1;
    let showEditor: boolean = false;

    $: runs, selectedRun, updateRuns();

    function getRunIndex() {
        return (runs ?? []).findIndex((r) => r.name === selectedRun)
    };

    function updateRuns() {
        if (!runs || runs.length === 0) {
            runs = [{ }];
        }
        if (!selectedRun || getRunIndex() === -1) {
            if (!runs[0].name) {
                runs[0].name = 'DEFAULT';
            }
            selectedRun = runs[0].name;
        }
        let cfg: Run = runs.find((c) => c.name === selectedRun);
        if (!cfg.steps) {
            cfg.steps = [{ type: 'sleep', value: '8' }];
        }
        steps = cfg.steps;
        storeConfigs(steps);
    };

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

    const availableKeys: any = {
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

    function storeConfigs(updatedSteps) {
        const targetRun: Run = runs.find((r) => r.name === selectedRun);

        if(!loading && targetRun) {
            targetRun.steps = updatedSteps
            intermediary.sendCommand(ViewProviderCommand.storeRokuAutomationConfigs, {
                selectedConfig: selectedRun,
                configs: runs
            });
        }

        // Required to get it to update the UI
        steps = updatedSteps;
    }

    function onStepTypeChange() {
        const step: Step = steps[this.id];
        step.type = this.value;
        delete step.value;

        storeConfigs(steps);
    }

    function onStepValueChange() {
        const step: Step = steps[this.id];
        step.value = this.value;

        storeConfigs(steps);
    }

    function addStep() {
        steps.push({
            type: 'sendKeyPress',
            value: 'Ok'
        });

        storeConfigs(steps);
    }

    function deleteStep() {
        steps.splice(this.id, 1);

        storeConfigs(steps);
    }

    function clearConfig() {
        steps = [];
        storeConfigs(steps);
    }

    function runConfig() {
        intermediary.sendCommand(ViewProviderCommand.runRokuAutomationConfig, {
            configIndex: getRunIndex().toString()
        });
    }

    function stopConfig() {
        if (!this) return;
        intermediary.sendCommand(ViewProviderCommand.stopRokuAutomationConfig, {
            configIndex: getRunIndex().toString()
        });
    }

    function moveStepUp() {
        const step: Step = steps.splice(this.id, 1)[0];
        steps.splice(this.id - 1, 0, step);
        storeConfigs(steps);
    }

    function moveStepDown() {
        const step: Step = steps.splice(this.id, 1)[0];
        steps.splice(+this.id + 1, 0, step);
        storeConfigs(steps);
    }

    function onKeydown(event) {
        const key: any = event.key;

        switch (key) {
            case 'Escape':
                stopConfig();
                break;
        }
    }
    intermediary.observeEvent(ViewProviderEvent.onRokuAutomationConfigsLoaded, (message) => {
        runs = message.context.configs;
        selectedRun = message.context.selectedConfig;
        updateRuns();
        loading = false;
    });

    let lastStepDate: number = Date.now();
    intermediary.observeEvent(ViewProviderEvent.onRokuAutomationConfigStepChange, (message) => {
        currentRunningStep = message.context.step;
        if (currentRunningStep === -1) {
            // Once we finish running all current steps, update our last step date in case we want to add any more steps
            lastStepDate = Date.now();
        }
    });

    function addSleepStep() {
        // Figure out how long it has been since we last had a step
        let elapsedTime: number = (Date.now() - lastStepDate) / 1000;

        // Round to the nearest tenth
        elapsedTime = (Math.round(elapsedTime * 10) / 10);

        steps.push({
            type: stepTypes.sleep.type,
            value: elapsedTime.toString()
        });
    }

    intermediary.observeEvent(ViewProviderEvent.onRokuAutomationKeyPressed, (message) => {
        let {key, literalCharacter}: any = message.context;
        if (literalCharacter) {
            // Check if we were typing somethign before and if so just add on to it
            const lastStep: Step = steps.at(-1);
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
    table {
        border-spacing: 0;
        width: 100%;
        padding-top: 2.5rem;
    }

    vscode-dropdown, vscode-text-field {
        margin: 3px 0;
        vertical-align: middle;
    }

    vscode-divider {
        margin: 0px;
    }

    #container {
        padding-bottom: 50px;
    }

    #bottomFixed {
        position: fixed;
        bottom: 0;
        width: 100%;
        padding: 8px;
        background-color: var(--vscode-breadcrumb-background);
    }

    #bottomFixed vscode-button {
        margin-right: 5px;
    }

    #editor {
        position: fixed;
        width: 100%;
        z-index: 1;
    }

    .stepTypeDropdown {
        min-width: 140px;
    }
</style>

<svelte:window on:keydown={onKeydown} />

<div id="container">
    <div id="editor">
        <AutoRunsEditor
            bind:this={autoRunsEditor}
            bind:runs={runs}
            bind:selectedRun={selectedRun}
            bind:showContent={showEditor}/>
    </div>

    {#if !showEditor}
    <table>
    {#each steps as step, index}
        <tr>
            <td>
                {#if index > 0}
                    <vscode-button id="{index}" appearance="icon" title="Move step up" aria-label="Move step up" on:click={moveStepUp}>
                        <ArrowUp />
                    </vscode-button>
                {/if}
                {#if index < steps.length - 1}
                    <vscode-button id="{index}" appearance="icon" aria-label="Trash" on:click={moveStepDown}>
                        <ArrowDown />
                    </vscode-button>
                {/if}
            </td>
            <td>
                <vscode-dropdown class="stepTypeDropdown" id="{index}" on:change={onStepTypeChange} value="{step.type}">
                {#each Object.entries(stepTypes) as [stepType, stepTypeParams]}
                    <vscode-option value="{stepType}">{stepTypeParams.name}</vscode-option>
                {/each}
                </vscode-dropdown>

                {#if step.type === stepTypes.sleep.type}
                    <NumberField id="{index.toString()}" on:input={onStepValueChange} step="0.1" value="{step?.value?.toString() ?? stepTypes.sleep.defaultValue.toString()}" />
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
            <td>
                {#if currentRunningStep === -1}
                    <vscode-button id="{index}" appearance="icon" title="Delete step" aria-label="Delete step" on:click={deleteStep}><Trash /></vscode-button>
                {:else if currentRunningStep === index}
                    <vscode-progress-ring />
                {/if}
            </td>
        </tr>
        <tr>
            <td colspan="4">
                <vscode-divider />
            </td>
        </tr>
    {/each}
        <tr>
            <td colspan="2">
                <vscode-button appearance="icon" title="Add Step" aria-label="Add Step" on:click={addStep}><Add /></vscode-button>
            </td>
        </tr>
    </table>
    {/if}
</div>

{#if !showEditor}
<div id="bottomFixed">
    {#if currentRunningStep >= 0}
        <vscode-button id={0} on:click={stopConfig}>Stop</vscode-button>
    {:else}
        <vscode-button id={0} on:click={runConfig}>Run</vscode-button>
        <vscode-button id={0} on:click={clearConfig} appearance="secondary">Clear</vscode-button>
    {/if}
</div>
{/if}
