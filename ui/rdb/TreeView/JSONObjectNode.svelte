<script>
    import JSONNested from "./JSONNested.svelte";
    export let nodeKey, nodeValue;
</script>

<JSONNested {nodeKey} {nodeValue} />
