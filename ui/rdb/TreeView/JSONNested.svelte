<script>
    import JSONKey from './JSONKey.svelte';
    import JSONNode from './JSONNode.svelte';
    import JSONArrow from './JSONArrow.svelte';
    export let nodeKey, nodeValue, isParentExpanded;
    export let onValueChange = () => {};
    let objectKey = nodeKey;
    const keys = Object.keys(nodeValue);
    let expanded = false;

    $: if (!isParentExpanded) {
        expanded = false;
    }
    function toggleExpand() {
        expanded = !expanded;
    }
    function expand() {
        expanded = true;
    }

    let onNestedNodeValueChange = (e, key, updatedValue) => {
        console.log("rokudebug", "onNestedNodeValueChangeonNestedNodeValueChange", JSON.stringify(updatedValue), key, JSON.stringify(nodeValue), keys);
    };
  </script>
  <style>
    label {
    position: relative;
      display: inline-block;
    }
    .indent {
      padding-left: var(--li-identation);
    }
    .collapse {
      --li-display: inline;
      display: inline;
      font-style: italic;
    }

    ul {
		margin: 0;
		list-style: none;
		padding-left: 1.2rem; 
		user-select: none;
	}
    
  </style>
  <li class:indent={isParentExpanded}>
    <JSONArrow {expanded} on:click={toggleExpand} />
    <JSONKey key={objectKey}/>
    {#if expanded}
        <ul class:collapse={!expanded} on:click={expand}>
            {#each keys as key, index}
                <JSONNode onValueChange={onValueChange} nodeKey={key} bind:nodeValue={nodeValue[key]} />
            {/each}
        </ul>
    {/if}
  </li>