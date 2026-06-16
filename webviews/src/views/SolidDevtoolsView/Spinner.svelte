<!--
    A progress ring that only fades in after a delay (default 400ms), so quick operations
    show nothing at all and only genuinely-slow ones surface a spinner. Same pattern the
    toolbar refresh spinner used inline — reused for slow inspect + chevron fetches so the
    loading feedback is consistent everywhere.
-->
<script lang="ts">
    export let size = 14;
    /** ms to wait before fading in — anything faster than this never shows a spinner. */
    export let delay = 400;
</script>

<vscode-progress-ring class="spinner" style="width: {size}px; height: {size}px; animation-delay: {delay}ms"></vscode-progress-ring>

<style>
    .spinner {
        opacity: 0;
        animation: sdt-spinner-appear 0.15s ease forwards;
    }

    @keyframes sdt-spinner-appear {
        to {
            opacity: 0.8;
        }
    }
</style>
