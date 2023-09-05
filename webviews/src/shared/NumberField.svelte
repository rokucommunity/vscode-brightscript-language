<!-- Using vscode-text-field directly has several limitations like not allowing passing in a value of `0`. This component helps work around those limitations -->
<svelte:options accessors={true} />

<script lang="ts">
    import { createEventDispatcher } from 'svelte';
    import type { TextField } from '@vscode/webview-ui-toolkit';
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
    $: {
        if (self) {
            self.control.step = step;
        }
    }

    export let self: TextField | null = null;
</script>

<style>
    vscode-text-field {
        width: 71px;
        vertical-align: middle;
    }
</style>

<vscode-text-field bind:this={self} {id} class={classProp} {title} {step} {value} on:input={onInputChange} type="number" />
