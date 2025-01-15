<script lang="ts">
    import { Copy, DebugStart, DebugStop, Menu, Trash } from 'svelte-codicons';
    import { dropzone, draggable } from './dnd';
    import { intermediary } from '../../ExtensionIntermediary';
    import { ViewProviderCommand } from '../../../../src/viewProviders/ViewProviderCommand';
    import { ViewProviderEvent } from '../../../../src/viewProviders/ViewProviderEvent';

    type Step = { type: string; value: string };
    type Run = { name?: string; steps?: Step[] };
    type Callback = (e: any) => void;

    export let runs: Run[];
    export let selectedRun: string;
    export let showContent: boolean = false;

    let runTable: HTMLTableElement;
    let nameInput: HTMLInputElement;
    let nameInputDialog: HTMLDialogElement;
    let nameInputDone: Callback;
    let alertDialog: HTMLDialogElement;
    let alertMessage: string;
    let confirmDialog: HTMLDialogElement;
    let confirmMessage: string;
    let confirmDone: Callback;
    let activeRun: string = null;
    let isSingleClick: boolean = true;
    let dropTargetIndex: number = -1;

    intermediary.observeEvent(ViewProviderEvent.onRokuAutomationConfigStepChange, (message) => {
        if (message.context.step === -1) {
            activeRun = null;
        }
    });

    function toggleDropDown() {
        showContent = !showContent;
    }

    function selectRun(e: MouseEvent) {
        const run: string = getRunFromEvent(e);
        selectedRun = run;
    }

    function startRun(e: MouseEvent) {
        if (!activeRun) {
            selectedRun = getRunFromEvent(e);
            activeRun = selectedRun;
            intermediary.sendCommand(ViewProviderCommand.runRokuAutomationConfig, {
                configIndex: getRunIndex().toString()
            });
        }
    }

    function stopRun(e: MouseEvent) {
        const run = getRunFromEvent(e);
        if (activeRun === run) {
            selectedRun = run;
            intermediary.sendCommand(ViewProviderCommand.stopRokuAutomationConfig, {
                configIndex: getRunIndex().toString()
            });
        }
    }

    function moveSelection(e: KeyboardEvent) {
        if (['ArrowUp', 'ArrowDown'].includes(e.key)) {
            const index: number =
                runs.findIndex((r) => r.name === selectedRun) +
                (e.key === 'ArrowUp' ? -1 : 1);
            selectedRun = runs[(index + runs.length) % runs.length].name;
        }
    }

    async function copyRun(e: MouseEvent) {
        const run: string = getRunFromEvent(e);
        const runName: string = await showNameInputDialog(
            run,
            `Copy of ${run}`
        );
        if (runName) {
            const steps: Step[] = runs.find((r) => r.name === run)?.steps ?? [];
            selectedRun = runName;
            runs = [
                { name: runName, steps: structuredClone(steps) },
                ...runs.filter((r) => r.name !== runName)
            ];
        }
    }

    async function deleteRun(e: MouseEvent) {
        const run: string = getRunFromEvent(e);
        if (await showConfirmDeleteDialog(run)) {
            runs = runs.filter((r) => r.name !== run);
        }
        confirmDialog.close();
    }

    function moveRun(runName: string, index: number) {
        let currIndex: number = runs.findIndex((r) => r.name === runName);
        if (
            currIndex < 0 ||
            index < 0 ||
            index > runs.length ||
            currIndex === index
        )
            return;

        if (currIndex > index) {
            runs = [
                ...runs.slice(0, index),
                runs[currIndex],
                ...runs.slice(index, currIndex),
                ...runs.slice(currIndex + 1)
            ];
        } else {
            runs = [
                ...runs.slice(0, currIndex),
                ...runs.slice(currIndex + 1, index + 1),
                runs[currIndex],
                ...runs.slice(index + 1)
            ];
        }
    }

    async function renameRun(e: Event) {
        const run: string = getRunFromEvent(e);
        const runName = await showNameInputDialog(run, run);
        if (runName) {
            runs.find((r) => r.name === run).name = runName;
            runs = runs;
            selectedRun = runName;
        }
    }

    async function addNewRun() {
        const runName = await showNameInputDialog();
        if (runName) {
            runs = [
                { name: runName, steps: [] },
                ...runs.filter((r) => r.name !== runName)
            ];
            selectedRun = runName;
        }
    }

    async function showConfirmDeleteDialog(targetRun: string = ''): Promise<string> {
        return new Promise((resolve) => {
            selectedRun = targetRun;
            confirmMessage = `Are you sure you want to delete '${targetRun}'?`;
            confirmDialog.showModal();
            confirmDone = resolve;
        });
    }

    async function showNameInputDialog(
        targetRun: string = '',
        defaultText: string = ''
    ): Promise<string> {
        return new Promise((resolve) => {
            selectedRun = targetRun;
            nameInput.value = defaultText;
            nameInputDialog.showModal();
            nameInputDone = resolve;
        });
    }

    function onNameChange(e: any) {
        const name: string = nameInput.value;
        const isValidName: boolean = name && !runs.find((r) => r.name === name);
        const source: string = e.target.tagName;
        let retval: string = null;

        if (
            (/BUTTON/i.test(source) && e.target.id === 'OK') ||
            /INPUT/i.test(source)
        ) {
            if (!isValidName) {
                alertMessage = `Sorry, cannot use '${name}', please choose another name`;
                setTimeout(() => alertDialog.showModal()); // add to task queue
                nameInput.focus();
                return;
            }
            retval = name;
        }

        setTimeout(() => nameInputDialog.close()); // add to task queue
        nameInputDone(retval);
    }

    function getRunFromEvent(e: any) {
        e.stopPropagation();
        return e.target.closest('tr').title;
    }

    function getRunIndex() {
        return (runs ?? []).findIndex((r) => r.name === selectedRun)
    };
</script>

<style>
    #editor {
        width: auto;
        height: auto;
        margin: 0px;
        background-color: var(--vscode-editor-background);
    }

    #content-container {
        background-color: var(--vscode-editor-background);
        position: absolute;
        width: 100vw;
        height: 100vh;
        display: flex;
        flex-direction: column;
        color: var(--vscode-editor-foreground);
        overflow-y: auto;
    }

    #run-list {
        display: flex;
        position: absolute;
        width: 100%;
        max-height: calc(100% - 75px);
        overflow-y: auto;
    }

    #selected-tr {
        color: var(--vscode-button-foreground);
        background-color: var(--vscode-button-background);
    }

    vscode-divider {
        margin: 0px;
    }

    #selection {
        display: flex;
        width: auto;
        height: 100%;
        align-items: center;
        padding: 5px;
    }

    #selection-text {
        font-size: large;
        white-space: nowrap;
        width: 100%;
        text-overflow: ellipsis;
        display: inline-block;
        overflow: hidden;
        color: var(--vscode-editor-foreground);
    }

    #selection-button {
        align-content: center;
        font-size: xx-large;
        height: 100%;
        margin-bottom: auto;
        margin-left: auto;
        background-color: transparent;
        border: none;
        cursor: pointer;
        color: var(--vscode-editor-foreground);
        margin-top: auto;
    }

    #selection-button:hover {
        color: lightslategray;
    }

    #run-name {
        padding-left: 5px;
        text-overflow: ellipsis;
        overflow: hidden;
        max-width: 250px;
        white-space: nowrap;
        display: block;
    }

    #run-name:hover {
        cursor: pointer;
    }

    #button-container {
        position: fixed;
        bottom: 0;
        display: flex;
        justify-content: left;
        width: 100%;
        height: auto;
        margin-top: auto;
        background-color: var(--vscode-editor-background);
    }

    #button-container > * {
        margin: 6px;
    }

    #NameInput {
        color: var(--vscode-editor-foreground);
        background-color: var(--vscode-editor-background);
        border-color: var(--vscode-button-background);
        outline-color: var(--vscode-button-background);
    }

    #NameInputDialog {
        color: var(--vscode-editor-foreground);
        background-color: var(--vscode-editor-background);
    }

    .run-row :global(.droppable) {
        background-color: rgb(0 0 0 / 0.01);
    }

    .run-row-dropzone {
        box-shadow: inset 0 0 0 3px white;
    }
</style>

<div id="editor"
    use:dropzone={{
        onDropzone(data, e) {
            let moveToEnd = e.target.id === 'content-container';
            moveRun(data, moveToEnd ? runs.length - 1 : 0);
            dropTargetIndex = -1;
        },
        onDragenter(e) {
            let dragOverElement = e?.target?.id;
            if (dragOverElement) {
                dropTargetIndex = dragOverElement === 'content-container' ? runs.length - 1 : 0;
            }
        },
        onDragend(e) {
            if (dropTargetIndex < 0) return;
            moveRun(e.target.title, dropTargetIndex);
            dropTargetIndex = -1;
        }
    }}
    tabindex="-1" on:keydown={moveSelection}>
    <div id="selection">
        <div id="selection-text" title={selectedRun}>{selectedRun}</div>
        <vscode-button
            id="selection-button"
            title="Edit Runs"
            on:click={toggleDropDown}><Menu /></vscode-button>
    </div>
    {#if showContent}
        <div id="content-container">
            <div id="run-list">
                <table
                    width="100%"
                    cellspacing="0"
                    style="margin-bottom: auto;"
                    bind:this={runTable}>
                    {#each runs as run, index}
                        <tr>
                            <td colspan="5">
                                <vscode-divider />
                            </td>
                        </tr>
                        <tr class="run-row {dropTargetIndex === index ? 'run-row-dropzone' : ''}"
                            use:dropzone={{
                                onDropzone(runName) {
                                    moveRun(runName, index);
                                    dropTargetIndex = -1;
                                },
                                onDragenter(e) {
                                    if (e) {
                                        dropTargetIndex = index;
                                    }
                                },
                                onDragend() {}
                            }}
                            use:draggable={[() => { selectedRun = run.name }, run.name]}
                            on:click={(e) => {
                                isSingleClick = true;
                                setTimeout(() => {
                                    if (isSingleClick) {
                                        selectRun(e);
                                        toggleDropDown();
                                    }
                                }, 250);
                            }}
                            on:dblclick={(e) => {isSingleClick = false; renameRun(e);}}
                            title={run.name}
                            id={run.name === selectedRun ? 'selected-tr' : ''}>
                            <td>
                                <span id="run-name">
                                    {run.name}
                                </span>
                            </td>
                            <td style="text-align: end;">
                                <vscode-button
                                    id="copy-button"
                                    title={`Copy '${run.name}'`}
                                    on:click={copyRun}
                                    appearance="icon"
                                    aria-label={run.name}>
                                    <Copy fill={run.name === selectedRun ? "white" : ""} />
                                </vscode-button>
                                <vscode-button
                                    id="delete-button"
                                    title={`Delete '${run.name}'`}
                                    on:click={deleteRun}
                                    appearance="icon"
                                    aria-label={run.name}>
                                    <Trash fill={run.name === selectedRun ? "white" : ""} />
                                </vscode-button>
                            {#if !activeRun || activeRun !== run.name}
                                <vscode-button
                                    id="play-start-button"
                                    title={`Start '${run.name}'`}
                                    on:click={startRun}
                                    appearance="icon"
                                    disabled={activeRun && activeRun !== run.name}
                                    aria-label={run.name}>
                                    <DebugStart fill={run.name === selectedRun ? "white" : ""} />
                                </vscode-button>
                            {:else}
                                <vscode-button
                                    id="play-stop-button"
                                    title={`Stop '${run.name}'`}
                                    on:click={stopRun}
                                    appearance="icon"
                                    aria-label={run.name}>
                                    <DebugStop fill={run.name === selectedRun ? "white" : ""} />
                                </vscode-button>
                            {/if}
                            </td>
                        </tr>
                    {/each}
                </table>
            </div>
            <div id="button-container">
                <vscode-button id="add-button" on:click={addNewRun}>Add</vscode-button>
                <vscode-button id="close-button" on:click={toggleDropDown}>Close</vscode-button>
            </div>
        </div>
    {/if}
</div>

<dialog
    id="NameInputDialog"
    bind:this={nameInputDialog}
    on:cancel={onNameChange}>
    <h3 style="margin-top: -10px;">Enter Run Name</h3>
    <div style="margin-bottom: 10px">
        <input
            id="NameInput"
            bind:this={nameInput}
            placeholder="Enter run name"
            style="width: 100%;"
            on:focus={() => nameInput.select()}
            on:keydown={(e) => e.key === 'Enter' && onNameChange(e)} />
    </div>
    <div class="button-group horizontal-container">
        <vscode-button id="OK" on:click={onNameChange}>OK</vscode-button>
        <vscode-button id="Cancel" on:click={onNameChange}
            >Cancel</vscode-button>
    </div>
</dialog>

<dialog id="confirmDialog" bind:this={confirmDialog}>
    <h3>{confirmMessage}</h3>
    <div class="button-group horizontal-container">
        <vscode-button id="YES" on:click={() => confirmDone(true)}>YES</vscode-button>
        <vscode-button id="NO" on:click={() => confirmDone(false)}>NO</vscode-button>
    </div>
</dialog>

<dialog id="alertDialog" bind:this={alertDialog}>
    <h3>{alertMessage}</h3>
    <div class="button-group horizontal-container">
        <vscode-button id="OK" on:click={alertDialog.close()}>OK</vscode-button>
    </div>
</dialog>
