<script lang="ts">
    import JSONTreeView from "./JSONTreeView/JSONTreeView.svelte";
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
    <JSONTreeView {registryValues} />
{/if}
