<script lang="ts">
    import type { DeviceType } from 'roku-deploy';
    import tvIconSvgText from '../../../../images/icons/tv-light.svg?raw';
    import setTopBoxIconSvgText from '../../../../images/icons/set-top-box-light.svg?raw';

    export let deviceType: DeviceType;

    //the -light assets hardcode black; currentColor makes the glyph follow any theme
    function themeIconMarkup(rawSvgText: string): string {
        return rawSvgText.replaceAll('#000000', 'currentColor');
    }

    //set-top-box doubles as the fallback for unknown types, matching the tree view's icons.getDeviceType
    $: iconMarkup = themeIconMarkup(deviceType === 'tv' ? tvIconSvgText : setTopBoxIconSvgText);
</script>

<span class="deviceTypeIcon">{@html iconMarkup}</span>

<style>
    .deviceTypeIcon {
        display: inline-flex;
        align-items: center;
        flex-shrink: 0;
    }

    /* :global because the svg arrives via @html; CSS sizing overrides the asset's 100mm attributes */
    .deviceTypeIcon :global(svg) {
        width: 14px;
        height: 14px;
    }
</style>
