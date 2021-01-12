<script>
    import JSONObjectNode from "./JSONObjectNode.svelte";
    import JsonValueNode from "./JSONValueNode.svelte";
    export let nodeValue, nodeKey;
    let valueType = typeof nodeValue;
    export let onValueChange = () => {};

    if (valueType === "string" && isJSON(nodeValue)) {
        nodeValue = JSON.parse(nodeValue)
        valueType = "object"
    };

    let componentType = JSONObjectNode;
    if (valueType !== "object") {
        componentType = JsonValueNode;
    }

    function isJSON(str) {
        try {
            const jsonObject = JSON.parse(str);
            return jsonObject && typeof jsonObject === 'object';
        } catch (e) {
            return false;
        }
    }
</script>

<svelte:component bind:nodeValue={nodeValue} onValueChange={onValueChange} this={componentType} {nodeKey} />
