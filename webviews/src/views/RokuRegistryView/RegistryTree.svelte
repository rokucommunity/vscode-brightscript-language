<!-- svelte-ignore a11y-click-events-have-key-events -->
<script lang="ts">
    import RegistryNode from './RegistryNode.svelte';
    import { odc } from '../../ExtensionIntermediary';
    import { registryView } from './RokuRegistryView';

    export let registryValues: Record<string, any>;

    function sanitizeInput(values: Record<string, any>): Record<string, any> {
        const input = { ...values };
        for (const key of Object.keys(input)) {
            if (typeof input[key] === 'object') {
                input[key] = JSON.stringify(input[key]);
            }
        }
        return input;
    }

    async function onValueChanged(event: CustomEvent<{ sectionKey: string; itemKey: string; newValue: string }>) {
        const { sectionKey, itemKey, newValue } = event.detail;
        const section = registryValues[sectionKey] ?? {};
        const updatedSection = { ...section, [itemKey]: newValue };

        await odc.writeRegistry({
            values: { [sectionKey]: sanitizeInput(updatedSection) }
        });

        await refreshRegistry();
    }

    async function onDeleteSection(event: CustomEvent<{ sectionKey: string }>) {
        const { sectionKey } = event.detail;
        await odc.deleteRegistrySections({ sections: [sectionKey] });
        await refreshRegistry();
    }

    async function onDeleteItem(event: CustomEvent<{ sectionKey: string; itemKey: string }>) {
        const { sectionKey, itemKey } = event.detail;
        await odc.writeRegistry({
            values: { [sectionKey]: { [itemKey]: null } }
        });
        await refreshRegistry();
    }

    async function refreshRegistry() {
        const { values } = await odc.readRegistry();
        registryValues = registryView.formatValues(values);
    }
</script>

<style>
    .tree {
        user-select: none;
        padding: 0;
        margin: 0;
    }
</style>

<div class="tree">
    {#each Object.keys(registryValues) as key (key)}
        <RegistryNode
            on:valueChanged={onValueChanged}
            on:deleteSection={onDeleteSection}
            on:deleteItem={onDeleteItem}
            nodeKey={key}
            nodeValue={registryValues[key]}
            depth={0}
            sectionKey={key}
        />
    {/each}
</div>
