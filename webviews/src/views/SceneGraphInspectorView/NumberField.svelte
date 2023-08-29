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
        // console.log('self.control.value', self.control.value)
        // console.log('self.value', self.value)
        // console.log('value', value)
        dispatch('input', {test: self.control});
    }

    export let value = '';
    $: {
        if (self) {
            self.value = value;
            self.control.value = value;

            // Triggers update to be sent to parent's on:input
            //
        }
    }

    export let title = '';
    export let step = 10;
    $: {
        // TODO needs to be looked into fixing
        if (self) {
            self.control.step = step.toString();
        }
    }

    let self: TextField;
</script>

<style>
    vscode-text-field[type='number'] {
        width: 71px;
    }
</style>

<vscode-text-field bind:this={self} {id} class={classProp} {title} {step} {value} on:input={onInputChange} type="number" />
