<script lang="ts">
    import TreeView from "./TreeView/TreeView.svelte";
    let registryValues = {};
    window.addEventListener('message', event => {
        const message = event.data;
        switch (message.type) {
            case 'readRegistry':
                registryValues = message.values;
                break;
        }
    });
</script>
{#if Object.keys(registryValues).length > 0}
    <TreeView {registryValues} />
{/if}
