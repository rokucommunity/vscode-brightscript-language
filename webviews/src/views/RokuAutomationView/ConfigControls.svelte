<script lang="ts">
    export let selectedConfig; // string
    export let configs; // array of configs

    let showModal;
    let inputValue = '';
    let _inputValue = inputValue;
    let dialog;

    $: if (inputValue !== '') {
        let found = configs.find((c) => c.name === inputValue);
        if (!found) configs.push({ name: inputValue, steps: [] });
        selectedConfig = inputValue;
        inputValue = '';
        configs = configs;
    }

    const pressOK = () => {
        if (typeof _inputValue === 'string' && _inputValue !== '') {
            inputValue = _inputValue;
            // @ts-ignore
            _inputValue = '';
            console.log(`***** Pressed OK and inputValue=${inputValue}`);
            showModal = false;
            dialog.close();
        }
    };

    $: if (dialog && showModal) dialog.showModal();

    function deleteConfig() {
        configs = configs.filter((c) => c.name !== selectedConfig);
        selectedConfig = configs[0].name;
    }
</script>

<style>
    .button-group {
        display: inline;
    }
    .btn {
        border: none;
        color: black;
        border: 1px solid lightgray;
        font-size: 16px;
        cursor: pointer;
    }

    .btn:hover {
        background-color: RoyalBlue;
    }
    dialog {
        max-width: 32em;
        border-radius: 0.2em;
        border: none;
        padding: 0;
    }
    dialog::backdrop {
        background: rgba(0, 0, 0, 0.3);
    }
    dialog > div {
        padding: 1em;
    }
    dialog[open] {
        animation: zoom 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
    }
    @keyframes zoom {
        from {
            transform: scale(0.95);
        }
        to {
            transform: scale(1);
        }
    }
    dialog[open]::backdrop {
        animation: fade 0.2s ease-out;
    }
    @keyframes fade {
        from {
            opacity: 0;
        }
        to {
            opacity: 1;
        }
    }
    button {
        display: inline;
    }
</style>

<link
    rel="stylesheet"
    href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/4.7.0/css/font-awesome.min.css" />
<span class="config-controls">
    <span>
        <select bind:value={selectedConfig} title="Automation configurations">
            {#each configs ?? [] as config}
                <option value={config.name}>{config.name}</option>
            {/each}
        </select>

        <span class="button-group">
            <button
                on:click={() => (showModal = true)}
                title="Create a new configuration"
                class="btn"><i class="fa fa-plus"></i></button>
            <button
                on:click={deleteConfig}
                title="Delete the current configuration"
                class="btn"><i class="fa fa-minus"></i></button>
        </span>
    </span>
</span>

<!-- svelte-ignore a11y-click-events-have-key-events a11y-no-noninteractive-element-interactions -->
<dialog
    bind:this={dialog}
    on:close={() => (showModal = false)}
    on:click|self={() => dialog.close()}>
    <!-- svelte-ignore a11y-no-static-element-interactions -->
    <div on:click|stopPropagation>
        <h2> Create a new configuration </h2>

        <!-- svelte-ignore a11y-autofocus -->
        <input
            autofocus
            type="text"
            placeholder="Enter config name"
            bind:value={_inputValue} />
        <hr />
        <ul class="definition-list">
            <li>A configuration is a named set of autorun steps</li>
            <li>Configurations are automatically saved</li>
        </ul>

        <hr />
        <!-- svelte-ignore a11y-autofocus -->
        <button autofocus on:click={() => pressOK()}>create</button>
        <button on:click={() => dialog.close()}>close</button>
    </div>
</dialog>
