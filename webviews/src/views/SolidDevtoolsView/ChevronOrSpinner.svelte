<!--
    The tree/value-row twisty. Normally shows the (open/closed) chevron; while a fetch is
    in flight it KEEPS showing the chevron (open) until the loading threshold (default
    400ms) and only THEN swaps to a spinner — so a fast expand never flickers and only a
    genuinely-slow one surfaces a spinner. A leaf (not expandable, not loading) shows
    nothing, keeping labels aligned via the fixed-width twisty.
-->
<script lang="ts">
    import { onDestroy } from 'svelte';
    import Chevron from '../../shared/Chevron.svelte';
    import Spinner from './Spinner.svelte';

    export let loading = false;
    export let expandable = false;
    export let expanded = false;
    export let delay = 400;

    let slow = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    // one-shot timer started when loading begins; cleared + reset when it ends, so the
    // spinner only takes over once a fetch has actually been slow for `delay` ms
    $: track(loading);
    function track(isLoading: boolean) {
        if (isLoading) {
            if (timer === undefined && !slow) {
                timer = setTimeout(() => {
                    slow = true;
                    timer = undefined;
                }, delay);
            }
        } else {
            if (timer !== undefined) {
                clearTimeout(timer);
                timer = undefined;
            }
            slow = false;
        }
    }

    onDestroy(() => {
        if (timer !== undefined) {
            clearTimeout(timer);
        }
    });
</script>

{#if loading && slow}
    <Spinner size={12} delay={0} />
{:else if expandable}
    <Chevron {expanded} />
{/if}
