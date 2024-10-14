<script lang="ts">
    import { allowedNodeEnvironmentFlags } from 'process';
import { Trash, Copy, Edit } from 'svelte-codicons';
    let runs;
    let selectedRun;
    let dialog;
    let getNameDialog;
    let defaultName;
    let callback;

    $: {
        if (!runs) runs = [];
        if (runs.findIndex((r) => r.name === selectedRun) === -1)
            selectedRun = runs[0]?.name;

        // force reactivity to work around vscode-dropdown limitation
        const temp = selectedRun;
        selectedRun = null;
        selectedRun = temp;
    }

    // entry point for the editor
    export const show = async (params) => {
        return new Promise((resolve, reject) => {
            try {
                dialog.addEventListener('close', (e) => {
                    const ok = e.target.returnValue === 'ok';
                    resolve({
                        ok: ok,
                        runs: ok ? runs : undefined,
                        selectedRun: ok ? (selectedRun ?? '') : undefined
                    });
                });
                runs = params?.runs ?? [];
                selectedRun = params?.selectedRun ?? '';
                dialog.showModal();
            } catch (e) {
                reject(e);
            }
        });
    };

    function createRun() {
        defaultName = 'DEFAULT';
        callback = (e) => {
            const name = e.target.returnValue;
            getNameDialog.removeEventListener('close', callback);
            if (name) {
                selectedRun = name;
                runs = [
                    { name: name, steps: [] },
                    ...runs.filter((r) => r.name !== name)
                ];
            }
        };
        getNameDialog.addEventListener('close', callback);
        getNameDialog.showModal();
    }

    function copyRun() {
        if (!selectedRun || !runs || runs.length === 0) return;
        defaultName = `Copy of ${selectedRun}`;
        callback = (e) => {
            const name = e.target.returnValue;
            getNameDialog.removeEventListener('close', callback);
            if (name) {
                const steps = runs.find((r) => r.name === selectedRun)?.steps ?? [];
                selectedRun = name;
                runs = [
                    { name: name, steps: structuredClone(steps) },
                    ...runs.filter((r) => r.name !== name)
                ];
            }
        };
        getNameDialog.addEventListener('close', callback);
        getNameDialog.showModal();
    }

    function deleteRun() {
        if (!selectedRun || !runs || runs.length === 0) return;
        if(confirm("Are you sure you want to delete this?")){
            runs = runs.filter((r) => r.name !== selectedRun);
        }
    }

    function moveUp() {
        if (!selectedRun || !runs || runs.length === 0) return;
        const index = runs.findIndex((r) => r.name === selectedRun);
        if (index > 0) {
            const temp = runs[index - 1];
            runs[index - 1] = runs[index];
            runs[index] = temp;
        }
    }

    function moveDown() {
        if (!selectedRun || !runs || runs.length === 0) return;
        const index = runs.findIndex((r) => r.name === selectedRun);
        if (index < runs.length - 1) {
            const temp = runs[index + 1];
            runs[index + 1] = runs[index];
            runs[index] = temp;
        }
    }

    const commitName = () => {
        const name = (document.getElementById('run-name') as HTMLInputElement)
            .value;
        getNameDialog.close(name);
    };

    function closeDialog(){
       console.log('closing dialog');
    }

    const discardName = () => getNameDialog.close('');

    const selectText = e => e.target.select();
</script>

<style>
    .horizontal-container {
        display: flex;
        flex-flow: row;
    }
    .vertical-container {
        display: flex;
        flex-flow: column;
    }
    #dialog {
        color: var(--panel-view-foreground);
        background-color: var(--panel-view-background);
        border-color: var(--focus-border);
        box-shadow: #00000052 7px 7px 5px;

    }
    #getNameDialog {
        background-color: red;
        border-style: solid;
        border-color: skyblue;
    }
    .page {
        border: none;
    }
    .header {
        padding: 5px;
        align-items: center;
        justify-content: center;
    }
    .body {
        padding: 5px;
    }
    .footer {
        margin-top: auto;
        padding: 5px;
    }
    .vertical-container.long-panel {
        margin-right: 25px;
    }
    .button-group {
        gap: 12px;
    }
    vscode-button {
        margin-top: 5px;
    }
    hr {
        width: 100%;
        height: 2px;
        border-width: 0;
        color: gray;
        background-color: gray;
    }
    h2 {
        color: white;
    }
    h3 {
        color: white;
        margin-top: -5px;
    }
</style>

<dialog id="dialog" bind:this={dialog} on:close={closeDialog}>
    <div class="page vertical-container">
        <div class="header vertical-container">
            <h2>Manage Autoruns</h2>
        </div>
        <div class="body vertical-container">
            <table>
                {#each runs as run}
                <tr>
                    <td>{run.name}</td>
                    <td>
                        <vscode-button appearance="icon" title="Add Step" aria-label="Add Step">
                            <Edit />
                        </vscode-button>
                    </td>
                    <td>
                        <vscode-button appearance="icon" title="Add Step" aria-label="Add Step">
                            <Copy />
                        </vscode-button>
                    </td>
                    <td>
                        <vscode-button appearance="icon" title="Add Step" aria-label="Add Step">
                            <Trash />
                        </vscode-button>
                    </td>
                </tr>
                <tr>
                    <td colspan="4">
                        <vscode-divider />
                    </td>
                </tr>
                {/each}
            </table>
            <div class="panels horizontal-container">
                <div class="long-panel vertical-container">
                    <vscode-dropdown size="10" value={selectedRun} on:change={(e) => selectedRun = e.target.value}>
                        {#each runs as run}
                            <vscode-option title={run.name} value={run.name}
                                >{run.name}</vscode-option>
                        {/each}
                    </vscode-dropdown>
                </div>
                <div class="long-panel vertical-container">
                    <div class="vertical-container">
                        <vscode-button on:click={createRun}
                            >Create</vscode-button>
                        <vscode-button on:click={copyRun}>Copy</vscode-button>
                        <vscode-button on:click={deleteRun}
                            >Delete</vscode-button>
                        <vscode-button on:click={moveUp}>Move up</vscode-button>
                        <vscode-button on:click={moveDown}
                            >Move down</vscode-button>
                    </div>
                </div>
            </div>
        </div>
        <div class="footer vertical-container">
            <hr />
            <div class="button-group horizontal-container">
                <button style="margin-left: auto;"
                    on:click={() => dialog.close('ok')}
                    value="cancel-button">OK</button>
                <button
                    on:click={() => dialog.close('cancel')}
                    value="cancel-button">Cancel</button>
            </div>
        </div>
    </div>
</dialog>

<dialog id="getNameDialog" bind:this={getNameDialog}>
    <h3>Enter Run Name</h3>
    <div style="margin-bottom: 6px;">
        <input id="run-name" placeholder="Enter run name" bind:value={defaultName} on:focus={selectText} autofocus/>
    </div>
    <div class="button-group horizontal-container">
        <button on:click={commitName}>OK</button>
        <button on:click={discardName}>Cancel</button>
    </div>
</dialog>
