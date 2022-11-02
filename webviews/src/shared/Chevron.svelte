<script lang="ts">
    import ChevronRight from "svelte-codicons/lib/ChevronRight.svelte";
    import ChevronDown from "svelte-codicons/lib/ChevronDown.svelte";
    export let expanded: boolean;
</script>

<span style="float:left">
    {#if expanded}
        <ChevronDown />
    {:else}
        <ChevronRight />
    {/if}
</span>
