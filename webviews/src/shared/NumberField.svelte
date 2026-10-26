<!-- Using vscode-text-field directly has several limitations like not allowing passing in a value of `0`. This component helps work around those limitations -->
<svelte:options accessors={true} />

<script lang="ts">
    import type { TextField } from '@vscode/webview-ui-toolkit';
    import { createEventDispatcher } from 'svelte';
    const dispatch = createEventDispatcher();

    export let id: string;

    let classProp: string | null = null;
    export { classProp as class };

    function onInputChange() {
        value = self.control.value;
        // Triggers update to be sent to parent's on:input
        dispatch('input');
    }

    export let value = '';
    $: {
        if (self) {
            self.value = value;
            self.control.value = value;
        }
    }

    export let title = '';
    export let step = '1';
    export let disabled = false;
    $: {
        if (self) {
            self.control.step = step;
        }
    }

    export let self: TextField | null = null;
</script>

<style>
    vscode-text-field {
        box-sizing: border-box;
        max-width: 80px;
        min-width: 50px;
        flex: 1 1 auto;
        vertical-align: middle;
    }

    /* Let the field shrink with its row. */
    vscode-text-field::part(root) {
        box-sizing: border-box;
        width: 100%;
        min-width: 0;
    }
</style>

<vscode-text-field bind:this={self} {id} class={classProp} {title} {step} {value} {disabled} on:input={onInputChange} type="number"></vscode-text-field>
