<svelte:options accessors={true} />
<script lang="ts">
    import { ChevronUp, ChevronDown } from 'svelte-codicons';
    import { createEventDispatcher } from 'svelte';
    const dispatch = createEventDispatcher();

    export let title: string;
    export let sortDirection: 'none' | 'asc' | 'desc' = 'none';
    export let column: number;

    function onClick() {
        dispatch('click');
    }
</script>

<style>
    vscode-data-grid-cell {
        padding: 5px;
    }

    #iconContainer {
        position: relative;
        top: 3px;
    }
</style>

<vscode-data-grid-cell cell-type="columnheader" grid-column={column} on:click={onClick}>{title}
    {#if sortDirection !== 'none'}
        <span id="iconContainer">
            {#if sortDirection === 'asc'}
                <ChevronUp />
            {:else}
                <ChevronDown />
            {/if}
        </span>
    {/if}
</vscode-data-grid-cell>
