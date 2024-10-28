<script>
    import { Trash, Copy, TriangleDown } from 'svelte-codicons';

    export let runs;
    export let selectedRun;

    let runs1 = [
        { name: 'run1', steps: [] },
        { name: 'run2', steps: [] },
        { name: 'run3', steps: [] },
        { name: 'run4', steps: [] },
        { name: 'run5', steps: [] },
        { name: 'run6', steps: [] },
        { name: 'run7', steps: [] },
        { name: 'run8', steps: [] },
        { name: 'run9', steps: [] },
        { name: 'run10', steps: [] },
        { name: 'run11', steps: [] },
        { name: 'run12', steps: [] },
        { name: 'run13', steps: [] },
        { name: 'run14', steps: [] },
        { name: 'run15', steps: [] },
        { name: 'run16', steps: [] },
        { name: 'run17', steps: [] },
        { name: 'run18', steps: [] },
        { name: 'run19', steps: [] },
        { name: 'run20', steps: [] },
        { name: 'run21', steps: [] },
        { name: 'run22', steps: [] },
        { name: 'run23', steps: [] },
        { name: 'run24', steps: [] },
        { name: 'run25', steps: [] },
        { name: 'run26', steps: [] },
        { name: 'run27', steps: [] },
        { name: 'run28', steps: [] },
        { name: 'run29', steps: [] },
        { name: 'run30', steps: [] },
        { name: 'run31', steps: [] },
        { name: 'run32', steps: [] },
        { name: 'run33', steps: [] },
        { name: 'run34', steps: [] },
        { name: 'run35', steps: [] },
        { name: 'run36', steps: [] },
        { name: 'run37', steps: [] },
        { name: 'run38', steps: [] },
        { name: 'run39', steps: [] }
    ];
    let selectedRun1 =
        'Titlelksdjflk;asdjf;lkasdjf;lksdjf;lkjsdf;lkjsdf;lkjsdfkljdsflkdjsafsjdf;lkasdjfkldsjflkdsjfkldjfkldjfkdjfk';
    let selectedRun2 = 'run7';

    let runTable;
    let runNameInput;
    let runNameDialog;
    let runNameDialogValue;
    let confirmDialog;
    let showContent = false;

    const toggleDropDown = () => {
        showContent = !showContent;
    };

    const selectRun = (e) => {
        const run = getRunFromEvent(e);
        selectedRun = run;
        console.log(`selectRun row ${run}`);
    };

    const copyRun = (e) => {
        const run = getRunFromEvent(e);
        selectedRun = run;
        console.log(`copyRun row ${run}`);

        showRunNameDialog(`Copy of ${run}`)
            .then((runName) => {
                const steps = runs.find((r) => r.name === selectedRun)?.steps ?? [];
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

    const deleteRun = (e) => {
        const run = getRunFromEvent(e);
        selectedRun = run;
        new Promise((resolve, reject) => {
            let confirmDialogCallback;
            confirmDialog.addEventListener(
                'click',
                (confirmDialogCallback = (e) => {
                    const button = e?.target?.id;
                    if (button === 'YES') {
                        resolve();
                    } else if (button === 'NO') {
                        reject();
                    } else {
                        return;
                    }
                    e.stopPropagation();
                    confirmDialog.removeEventListener('click', confirmDialogCallback);
                    confirmDialog.close();
                })
            );
            confirmDialog.showModal();
        }).then(() => {
            runs = runs.filter((r) => r.name !== run);
        }).catch(() => {
            // do nothing
        });
    };

    const addNewRun = () => {
        showRunNameDialog()
            .then((runName) => {
                console.log(`======== addNewRun function, name=${runName}`);
                selectedRun = runName;
                runs = [
                    { name: runName, steps: [] },
                    ...runs.filter((r) => r.name !== runName)
                ];
            })
            .catch((e) => {
                console.log(`======== addNewRun function, do nothing`);
                // do nothing
            });
    };

    const showRunNameDialog = (defaultRunName = null) => {
        runNameDialogValue = defaultRunName ?? '';
        setTimeout(() => { runNameInput.setSelectionRange(0, runNameInput.value.length); }); // select text
        return new Promise((resolve, reject) => {
            let cancelCallback, clickCallback, keyupCallback;
            const closeDialog = (e, runName = null) => {
                if (runName === '' || runs.find((r) => r.name === runName)) return false; // name already exists
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
                    if (e.key === 'Enter' && closeDialog(e, runNameDialogValue)) {
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
                    const button = e?.target?.id;
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

    const getRunFromEvent = (e) => {
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
        position: absolute;
        z-index: 1;
        width: calc(100% - 15px);
        height: calc(100% - 65px);
        display: flex;
        color: var(--vscode-editor-foreground);
        background: var(--vscode-editor-background);
        background-color: var(--vscode-editor-background);
        padding: 5px;
    }

    #run-list {
        position: absolute;
        width: 100%;
        height: calc(100% - 35px);
        display: flex;
        overflow-y: auto;
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
</style>

<div id="editor">
    <div id="selection">
        <div id="selection-text">{selectedRun}</div>
        <vscode-button
            id="selection-button"
            title="Edit Runs"
            on:click={toggleDropDown}><TriangleDown /></vscode-button>
    </div>
    {#if showContent}
        <div id="content-container">
            <div id="run-list">
                <table
                    width="100%"
                    cellspacing="0"
                    style="margin-bottom: auto;"
                    bind:this={runTable}>
                    {#each runs as run}
                        <tr>
                            <td colspan="5">
                                <vscode-divider />
                            </td>
                        </tr>
                        <tr
                            on:click={selectRun}
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
                                    on:click={copyRun}
                                    appearance="icon"
                                    aria-label={run.name}>
                                    <Copy />
                                </vscode-button>
                                <vscode-button
                                    id="delete-button"
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
            bind:value={runNameDialogValue}
        />
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
