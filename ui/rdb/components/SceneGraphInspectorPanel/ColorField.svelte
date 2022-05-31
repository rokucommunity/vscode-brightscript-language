<svelte:options accessors={true} />

<script lang="ts">
    import hexRgb from 'hex-rgb';
    import { createEventDispatcher } from 'svelte';
    import { colorField } from './ColorField';
    const dispatch = createEventDispatcher();

    export let id: string;
    id; // Used to silence the warning that we're not using it
    export let integerColor: number;
    $: {
        hexColor = colorField.convertRgbToHex(
            colorField.convertIntegerColorToRgb(integerColor)
        );
    }

    export let value = '';

    let hexColor;
    $: {
        try {
            const rgb = hexRgb(hexColor);
            textColor =
                rgb.red * 0.299 +
                    rgb.green * 0.587 +
                    rgb.blue * 0.114 * rgb.alpha >
                186
                    ? '#000000'
                    : '#FFFFFF';
            value = hexColor;
            // Triggers update to be sent to parent's on:input
            dispatch('input');
        } catch {}
    }

    let textColor: string;
</script>

<style>
    div {
        display: inline-block;
        padding: 3px 6px;
    }
</style>

<div
    style="background-color: {hexColor}; color: {textColor};"
    contenteditable="true"
    bind:innerHTML={hexColor} />
