<svelte:options accessors={true}/>

<script lang="ts">
    import hexRgb from 'hex-rgb';
    import { createEventDispatcher } from 'svelte';
    const dispatch = createEventDispatcher();

    export let id: string; id; // Used to silence the warning that we're not using it
    export let integerColor: number;
    $: {
        hexColor = convertRgbToHex(convertIntegerColorToRgb(integerColor));
    }

    export let value = '';

    let hexColor;
    $: {
        try {
            const rgb = hexRgb(hexColor)
            textColor = rgb.red * 0.299 + rgb.green * 0.587 + rgb.blue * 0.114 * rgb.alpha > 186 ? '#000000' : '#FFFFFF';
            value = hexColor;
            dispatch('input');
        } catch {}
    }

    let textColor: string;

    function convertIntegerColorToRgb(integerColor: number) {
        // Have to convert from signed to unsigned and then convert to binary representation
        const binary = (integerColor >>> 0).toString(2).padStart(32, '0');

        // Slice out each 8 bits for each rgba part value
        const rgb = {
            red: parseInt(binary.slice(0, 8), 2),
            green: parseInt(binary.slice(8, 16), 2),
            blue: parseInt(binary.slice(16, 24), 2),
            alpha: parseInt(binary.slice(24, 32), 2),
        }
        return rgb
    }

    function convertHexPart(byte: number) {
        return byte.toString(16).padStart(2, '0').toUpperCase();
    }

    function convertRgbToHex(rgb: ReturnType<typeof convertIntegerColorToRgb>) {
        return `#${convertHexPart(rgb.red)}${convertHexPart(rgb.green)}${convertHexPart(rgb.blue)}${convertHexPart(rgb.alpha)}`;
    }
</script>
<style>
    div {
        display: inline-block;
        padding: 3px 6px;
    }
</style>

<div style="background-color: {hexColor}; color: {textColor};" contenteditable="true" bind:innerHTML={hexColor} />
