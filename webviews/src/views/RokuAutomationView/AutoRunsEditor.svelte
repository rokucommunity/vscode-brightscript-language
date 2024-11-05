<script lang="ts">
    import { Trash, Copy, TriangleDown } from 'svelte-codicons';
    import { dropzone, draggable } from './dnd';

    type Step = { type: string, value: string };
    type Run = { name?: string, steps?: Step[] };
    type Callback = (e: any) => void;

    export let runs: Run[];
    export let selectedRun: string;

    let runTable: any;
    let runNameInput: any;
    let runNameDialog: any;
    let runNameDialogValue: string;
    let confirmDialog: any;
    let showContent: boolean = false;

    const toggleDropDown: () => void = () => {
        showContent = !showContent;
    };

    const selectRun: Callback = (e) => {
        const run: string = getRunFromEvent(e);
        selectedRun = run;
    };

    const moveSelection: Callback = (e) => {
        if (["ArrowUp", "ArrowDown"].includes(e.key)) {
            const index: number = runs.findIndex((r) => r.name === selectedRun) + (e.key === "ArrowUp" ? -1 : 1);
            selectedRun = runs[(index + runs.length) % runs.length].name;
        }
    };

    const copyRun: Callback = (e) => {
        const run: string = getRunFromEvent(e);
        selectedRun = run;

        showRunNameDialog(`Copy of ${run}`)
            .then((runName: string) => {
                const steps: Step[] =
                    runs.find((r) => r.name === selectedRun)?.steps ?? [];
                selectedRun = runName;
                runs = [
                    { name: runName, steps: structuredClone(steps) },
                    ...runs.filter((r) => r.name !== runName)
                ];
            })
            .catch((e) => {
                // do nothing
            });
    };

    const deleteRun: Callback = (e) => {
        const run: string = getRunFromEvent(e);
        selectedRun = run;
        new Promise((resolve, reject) => {
            let confirmDialogCallback: any;
            confirmDialog.addEventListener(
                'click',
                (confirmDialogCallback = (e) => {
                    const button: string = e?.target?.id;
                    if (button === 'YES') {
                        resolve(e);
                    } else if (button === 'NO') {
                        reject();
                    } else {
                        return;
                    }
                    e.stopPropagation();
                    confirmDialog.removeEventListener(
                        'click',
                        confirmDialogCallback
                    );
                    confirmDialog.close();
                })
            );
            confirmDialog.showModal();
        })
            .then(() => {
                runs = runs.filter((r) => r.name !== run);
            })
            .catch(() => {
                // do nothing
            });
    };

    const moveRun: (runName: string, index: number) => void = (runName, index) => {
        let currIndex: number = runs.findIndex((r) => r.name === runName);
        if (currIndex < 0 || index < 0 || index > runs.length || currIndex === index) return;
        const runToMove: Run = runs[currIndex];

        const newRunList: Run[] = [
            ...runs.slice(0, index),
            runToMove,
            ...runs.slice(index)
        ];
        newRunList.splice(currIndex < index ? currIndex : ++currIndex, 1);
        runs = newRunList;
    };

    const renameRun: Callback = (e) => {
        const run: string = getRunFromEvent(e);
        selectedRun = run;

        showRunNameDialog(selectedRun)
            .then((runName: string) => {
                runs.find((r) => r.name === run).name = runName;
                runs = runs;
                selectedRun = runName;
            })
            .catch((e) => {
                // do nothing
            });
    };

    const addNewRun: () => void = () => {
        showRunNameDialog()
            .then((runName: string) => {
                selectedRun = runName;
                runs = [
                    { name: runName, steps: [] },
                    ...runs.filter((r) => r.name !== runName)
                ];
            })
            .catch((e) => {
                // do nothing
            });
    };

    const showRunNameDialog: (defaultRunName?: string) => any = (defaultRunName = null) => {
        runNameDialogValue = defaultRunName ?? '';
        setTimeout(() => {
            runNameInput.setSelectionRange(0, runNameInput.value.length);
        }); // select text
        return new Promise((resolve, reject) => {
            let cancelCallback: Callback, clickCallback: Callback, keyupCallback: Callback;
            const closeDialog: (e: any, runName?: string) => boolean = (e, runName = null) => {
                if (runName === '' || runs.find((r) => r.name === runName))
                    return false; // name already exists
                e.stopPropagation();
                runNameDialog.close();
                runNameDialog.removeEventListener('cancel', cancelCallback);
                runNameDialog.removeEventListener('click', clickCallback);
                runNameDialog.removeEventListener('keyup', keyupCallback);
                return true;
            };

            // ESC key
            runNameDialog.addEventListener(
                'cancel',
                (cancelCallback = (e) => {
                    closeDialog(e);
                    reject('');
                })
            );

            // Enter key
            runNameDialog.addEventListener(
                'keyup',
                (keyupCallback = (e) => {
                    if (
                        e.key === 'Enter' &&
                        closeDialog(e, runNameDialogValue)
                    ) {
                        resolve(runNameDialogValue);
                    } else {
                        return;
                    }
                })
            );

            // button press
            runNameDialog.addEventListener(
                'click',
                (clickCallback = (e) => {
                    const button: string = e?.target?.id;
                    if (button === 'OK' && closeDialog(e, runNameDialogValue)) {
                        resolve(runNameDialogValue);
                    } else if (button === 'Cancel') {
                        closeDialog(e);
                        reject('');
                    } else {
                        return;
                    }
                })
            );
            runNameDialog.showModal();
        });
    };

    const getRunFromEvent: (e: any) => string = (e) => {
        e.stopPropagation();
        return e.target.closest('tr').title;
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
        z-index: 1;
        width: calc(100% - 15px);
        height: calc(100% - 65px);
        display: flex;
        color: var(--vscode-editor-foreground);
        padding: 5px;
    }

    #run-list {
        position: absolute;
        width: 100%;
        height: calc(100% - 35px);
        display: flex;
        overflow-y: auto;
    }

    #run-list:global(.droppable) {
        box-shadow: inset 0 0 0 2px red;
    }

    #selected-tr {
        color: var(--vscode-editor-foreground);
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
        font-size: xx-large;
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

    #run-name:hover {
        cursor: pointer;
    }

    #button-container {
        display: flex;
        justify-content: center;
        width: 100%;
        margin-top: auto;
    }

    #button-container > * {
        margin-left: 5px;
    }

    #close-button {
        color: var(--vscode-editor-foreground);
    }

    #RunNameDialog {
        width: 100%;
    }

    .run-row *:global(.droppable) {
        border-top: 5px solid red;
    }
</style>

<div id="editor" tabindex="-1" on:keydown={moveSelection}>
    <div id="selection">
        <div id="selection-text" title={selectedRun}>{selectedRun}</div>
        <vscode-button
            id="selection-button"
            title="Edit Runs"
            on:click={toggleDropDown}><TriangleDown /></vscode-button>
    </div>
    {#if showContent}
        <div id="content-container">
            <div
                id="run-list"
                use:dropzone={{
                    onDropzone(runName) {
                        moveRun(runName, runs.length);
                    }
                }}>
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
                        <tr
                            class="run-row"
                            use:dropzone={{
                                onDropzone(runName) {
                                    moveRun(runName, index);
                                }
                            }}
                            use:draggable={run.name}
                            on:click={selectRun}
                            on:dblclick={renameRun}
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
                                    <Copy />
                                </vscode-button>
                                <vscode-button
                                    id="delete-button"
                                    title={`Delete '${run.name}'`}
                                    on:click={deleteRun}
                                    appearance="icon"
                                    aria-label={run.name}>
                                    <Trash />
                                </vscode-button>
                            </td>
                        </tr>
                    {/each}
                </table>
            </div>
            <div id="button-container">
                <vscode-button id="add-button" on:click={addNewRun}
                    >Add</vscode-button>
                <vscode-button id="close-button" on:click={toggleDropDown}
                    >Close</vscode-button>
            </div>
        </div>
    {/if}
</div>

<dialog id="RunNameDialog" bind:this={runNameDialog}>
    <h3>Enter Run Name</h3>
    <div style="margin-bottom: 6px;">
        <input
            bind:this={runNameInput}
            placeholder="Enter run name"
            style="width: 100%;"
            bind:value={runNameDialogValue} />
    </div>
    <div class="button-group horizontal-container">
        <vscode-button id="OK" on:click={this.click}>OK</vscode-button>
        <vscode-button id="Cancel" on:click={this.click}>Cancel</vscode-button>
    </div>
</dialog>

<dialog id="confirmDialog" bind:this={confirmDialog}>
    <h3>Are you sure you want to delete this run?</h3>
    <div class="button-group horizontal-container">
        <vscode-button id="YES" on:click={this.click}>YES</vscode-button>
        <vscode-button id="NO" on:click={this.click}>NO</vscode-button>
    </div>
</dialog>
