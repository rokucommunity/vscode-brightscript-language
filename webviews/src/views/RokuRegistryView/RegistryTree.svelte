<!-- svelte-ignore a11y-click-events-have-key-events -->
<script lang="ts">
    import RegistryNode from './RegistryNode.svelte';
    import { odc, intermediary } from '../../ExtensionIntermediary';
    import { registryView } from './RokuRegistryView';
    import { setContext, tick } from 'svelte';
    import { writable } from 'svelte/store';

    export let registryValues: Record<string, any>;

    // Ack store: RegistryNode subscribes via context. We push an entry after each write so the
    // matching cell flashes green (success) or red (failure) for ~1.6s.
    type AckSignal = { id: string; status: 'success' | 'error'; field: 'value' | 'key' };
    const ackStore = writable<AckSignal | null>(null);
    setContext('registryAck', ackStore);

    function ackId(sectionKey: string, topLevelKey: string, pathInTopLevel: string[]): string {
        return `${sectionKey}|${topLevelKey}|${(pathInTopLevel ?? []).join('/')}`;
    }

    function sanitizeInput(values: Record<string, any>): Record<string, any> {
        const input = { ...values };
        for (const key of Object.keys(input)) {
            if (typeof input[key] === 'object' && input[key] !== null) {
                input[key] = JSON.stringify(input[key]);
            }
        }
        return input;
    }

    // For nested edits, try to preserve the value's original primitive shape so the re-stringified
    // JSON blob round-trips cleanly. Strings that parse to number/boolean/null get the primitive type;
    // everything else stays a string.
    function coerceNestedValue(text: string): any {
        try {
            const parsed = JSON.parse(text);
            const t = typeof parsed;
            if (t === 'number' || t === 'boolean' || parsed === null) {
                return parsed;
            }
        } catch {
            // not parseable; fall through
        }
        return text;
    }

    function reportError(action: string, err: unknown) {
        const detail = (err as any)?.message ?? String(err);
        intermediary.showErrorMessage(`Failed to ${action}: ${detail}`);
    }

    // Clone the parsed object stored under `topLevelKey` so we can mutate it without affecting the
    // local view state until refreshRegistry() reads the device's authoritative copy back.
    function cloneTopLevel(sectionKey: string, topLevelKey: string): Record<string, any> {
        const section = registryValues[sectionKey] ?? {};
        const original = section[topLevelKey];
        return (typeof original === 'object' && original !== null)
            ? JSON.parse(JSON.stringify(original))
            : {};
    }

    function navigateToParent(root: Record<string, any>, pathInTopLevel: string[]): Record<string, any> {
        let parent = root;
        for (let i = 0; i < pathInTopLevel.length - 1; i++) {
            const key = pathInTopLevel[i];
            if (typeof parent[key] !== 'object' || parent[key] === null) {
                parent[key] = {};
            }
            parent = parent[key];
        }
        return parent;
    }

    // Fire after the tree has re-rendered with the post-write data so the just-rendered cell
    // receives the ack and runs its animation.
    async function fireAck(id: string, status: 'success' | 'error', field: 'value' | 'key') {
        await tick();
        ackStore.set({ id, status, field });
    }

    async function onValueChanged(event: CustomEvent<{
        sectionKey: string;
        topLevelKey: string;
        pathInTopLevel: string[];
        itemKey: string;
        newValue: string;
    }>) {
        const { sectionKey, topLevelKey, pathInTopLevel, itemKey, newValue } = event.detail;
        const isNested = pathInTopLevel?.length > 0;

        let sectionUpdate: Record<string, any>;
        if (isNested) {
            const clone = cloneTopLevel(sectionKey, topLevelKey);
            const parent = navigateToParent(clone, pathInTopLevel);
            const leafKey = pathInTopLevel[pathInTopLevel.length - 1];
            parent[leafKey] = coerceNestedValue(newValue);
            sectionUpdate = { [topLevelKey]: JSON.stringify(clone) };
        } else {
            sectionUpdate = { [itemKey]: newValue };
        }

        let status: 'success' | 'error' = 'success';
        try {
            await odc.writeRegistry({
                values: { [sectionKey]: sectionUpdate }
            });
        } catch (err) {
            status = 'error';
            reportError('update registry value', err);
        }
        await refreshRegistry();
        await fireAck(ackId(sectionKey, topLevelKey, pathInTopLevel), status, 'value');
    }

    async function onKeyRenamed(event: CustomEvent<{
        sectionKey: string;
        topLevelKey: string;
        pathInTopLevel: string[];
        oldItemKey: string;
        newItemKey: string;
        currentValue: any;
    }>) {
        const { sectionKey, topLevelKey, pathInTopLevel, oldItemKey, newItemKey, currentValue } = event.detail;
        const isNested = pathInTopLevel?.length > 0;

        let sectionUpdate: Record<string, any>;
        if (isNested) {
            const clone = cloneTopLevel(sectionKey, topLevelKey);
            const parent = navigateToParent(clone, pathInTopLevel);
            const leafKey = pathInTopLevel[pathInTopLevel.length - 1];
            const value = parent[leafKey];
            delete parent[leafKey];
            parent[newItemKey] = value;
            sectionUpdate = { [topLevelKey]: JSON.stringify(clone) };
        } else {
            sectionUpdate = sanitizeInput({
                [oldItemKey]: null,
                [newItemKey]: currentValue
            });
        }

        let status: 'success' | 'error' = 'success';
        try {
            await odc.writeRegistry({
                values: { [sectionKey]: sectionUpdate }
            });
        } catch (err) {
            status = 'error';
            reportError('rename registry key', err);
        }
        await refreshRegistry();

        // On success, the new key now exists at the renamed location; flash that row.
        // On failure, the old key still exists; flash the original location red.
        const ackPath = (status === 'success' && isNested)
            ? [...pathInTopLevel.slice(0, -1), newItemKey]
            : (pathInTopLevel ?? []);
        const ackTopLevel = (status === 'success' && !isNested) ? newItemKey : topLevelKey;
        await fireAck(ackId(sectionKey, ackTopLevel, ackPath), status, 'key');
    }

    async function onDeleteSection(event: CustomEvent<{ sectionKey: string }>) {
        const { sectionKey } = event.detail;
        let status: 'success' | 'error' = 'success';
        try {
            await odc.deleteRegistrySections({ sections: [sectionKey] });
        } catch (err) {
            status = 'error';
            reportError('delete registry section', err);
        }
        await refreshRegistry();
        // On error, the section still exists; flash its row red. On success, the row is gone.
        if (status === 'error') {
            await fireAck(ackId(sectionKey, '', []), status, 'key');
        }
    }

    async function onDeleteItem(event: CustomEvent<{
        sectionKey: string;
        topLevelKey: string;
        pathInTopLevel: string[];
        itemKey: string;
    }>) {
        const { sectionKey, topLevelKey, pathInTopLevel, itemKey } = event.detail;
        const isNested = pathInTopLevel?.length > 0;

        let sectionUpdate: Record<string, any>;
        if (isNested) {
            const clone = cloneTopLevel(sectionKey, topLevelKey);
            const parent = navigateToParent(clone, pathInTopLevel);
            delete parent[pathInTopLevel[pathInTopLevel.length - 1]];
            sectionUpdate = { [topLevelKey]: JSON.stringify(clone) };
        } else {
            sectionUpdate = { [itemKey]: null };
        }

        let status: 'success' | 'error' = 'success';
        try {
            await odc.writeRegistry({
                values: { [sectionKey]: sectionUpdate }
            });
        } catch (err) {
            status = 'error';
            reportError('delete registry key', err);
        }
        await refreshRegistry();
        // On error, the row still exists; flash it red. On success, the row is gone so the
        // disappearance is its own feedback.
        if (status === 'error') {
            await fireAck(ackId(sectionKey, topLevelKey, pathInTopLevel), status, 'key');
        }
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
            on:keyRenamed={onKeyRenamed}
            on:deleteItem={onDeleteItem}
            on:deleteSection={onDeleteSection}
            nodeKey={key}
            nodeValue={registryValues[key]}
            depth={0}
            sectionKey={key}
        />
    {/each}
</div>
