<script>
    import JSONNode from "./JSONNode.svelte";
    import {intermediary} from "../../ExtensionIntermediary";
    export let registryValues;
    const keys = Object.keys(registryValues);
    export let onValueChange = (key) => {
        // vscode.postMessage({
        //     command: 'updateRegistry',
        //     sectionKey: key,
        //     updatedValue: registryValues[key]
        // })
    };
</script>

<style>
    ul {
        margin: 0;
        list-style: none;
        padding-left: 1.2rem;
        user-select: none;
    }

    ul {
        --li-identation: var(--json-tree-li-indentation, 1em);
        --li-line-height: var(--json-tree-li-line-height, 1.3);
        --li-colon-space: 0.3em;
    }
</style>

<ul>
    {#each keys as key, index}
        <JSONNode
            onValueChange={(e) => onValueChange(key)}
            nodeKey={key}
            isParentExpanded={false}
            nodeValue={registryValues[key]} />
    {/each}
</ul>
