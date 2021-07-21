<script>
    import JSONKey from './JSONKey.svelte';
    import JSONArrow from './JSONArrow.svelte';

    export let nodeValue, nodeKey;
    export let onValueChange = () => {};

    let expanded = false;

    function toggleExpand() {
        expanded = !expanded;
    }
    function expand() {
        expanded = true;
    }
</script>

<style>
    li {
        user-select: text;
        word-wrap: break-word;
        word-break: break-all;
    }

    .valueNode {
        color: #ececec;
    }

    ul {
        margin: 0;
        list-style: none;
        padding-left: 1.2rem;
        user-select: none;
    }
</style>

{#if typeof nodeValue !== 'object'}
    <li>
        <JSONKey key={nodeKey} />
        <label for="jsonNodeValue" on:blur={onValueChange} bind:textContent={nodeValue} class="valueNode" contenteditable="true" />
    </li>
{:else}
    <li>
        <JSONArrow {expanded} on:click={toggleExpand} />
        <JSONKey key={nodeKey}/>
        {#if expanded}
            <ul on:click={expand}>
                {#each Object.keys(nodeValue) as key}
                    <svelte:self onValueChange={onValueChange} nodeKey={key} bind:nodeValue={nodeValue[key]} />
                {/each}
            </ul>
        {/if}
    </li>
{/if}
