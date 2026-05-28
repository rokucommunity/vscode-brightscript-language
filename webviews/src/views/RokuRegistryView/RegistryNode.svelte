<!-- svelte-ignore a11y-click-events-have-key-events -->
<script lang="ts">
    import { Edit, Check, Close, Trash, Clippy, DebugBreakpointDataUnverified } from 'svelte-codicons';
    import Chevron from '../../shared/Chevron.svelte';
    import { utils } from '../../utils';
    import { createEventDispatcher } from 'svelte';
    const dispatch = createEventDispatcher();

    export let nodeKey: string;
    export let nodeValue: any;
    export let depth = 0;
    export let sectionKey: string;

    $: isSection = typeof nodeValue === 'object' && nodeValue !== null;
    $: childKeys = isSection ? Object.keys(nodeValue) : [];
    $: displayValue = String(nodeValue ?? '');

    const expandedStorageKey = `registry:expanded:${sectionKey}:${nodeKey}`;
    let expanded = utils.getStorageBooleanValue(expandedStorageKey);
    $: {
        if (expanded) {
            utils.setStorageValue(expandedStorageKey, true);
        } else {
            utils.deleteStorageValue(expandedStorageKey);
        }
    }

    let editing = false;
    let savedValue = '';
    let valueEl: HTMLSpanElement;

    function toggleExpand() {
        if (isSection) {
            expanded = !expanded;
        }
    }

    function startEdit() {
        savedValue = valueEl.textContent;
        editing = true;
        requestAnimationFrame(() => {
            valueEl?.focus();
            const sel = window.getSelection();
            sel.selectAllChildren(valueEl);
            sel.collapseToEnd();
        });
    }

    function confirmEdit() {
        const newValue = valueEl.textContent;
        editing = false;
        dispatch('valueChanged', {
            sectionKey: sectionKey,
            itemKey: nodeKey,
            newValue: newValue
        });
    }

    function cancelEdit() {
        valueEl.textContent = savedValue;
        editing = false;
    }

    function onEditKeydown(event: KeyboardEvent) {
        if (event.key === 'Enter') {
            event.preventDefault();
            confirmEdit();
        } else if (event.key === 'Escape') {
            event.preventDefault();
            cancelEdit();
        }
    }

    function copyValue() {
        const text = isSection ? JSON.stringify(nodeValue, null, 2) : String(nodeValue ?? '');
        navigator.clipboard.writeText(text);
    }

    function deleteNode() {
        if (depth === 0) {
            dispatch('deleteSection', { sectionKey: nodeKey });
        } else {
            dispatch('deleteItem', { sectionKey, itemKey: nodeKey });
        }
    }

    function forwardValueChanged(event) {
        dispatch('valueChanged', event.detail);
    }

    function forwardDeleteItem(event) {
        dispatch('deleteItem', event.detail);
    }

    function forwardDeleteSection(event) {
        dispatch('deleteSection', event.detail);
    }
</script>

<style>
    .row {
        --leftGutterPadding: 15px;
        position: relative;
        padding-left: var(--leftGutterPadding);
        cursor: pointer;
        display: flex;
    }

    .row:hover {
        color: var(--vscode-list-hoverForeground);
        background-color: var(--vscode-list-hoverBackground);
    }

    .row:hover .actions {
        display: flex;
        background-color: var(--vscode-sideBar-background);
    }

    .indent-guide {
        display: inline-block;
        box-sizing: border-box;
        margin-left: 4px;
        padding-left: 3px;
        border-left: 1px solid var(--vscode-tree-indentGuidesStroke);
        opacity: 0.4;
    }

    .content {
        display: flex;
        align-items: flex-start;
        padding: 4px 4px 4px 0;
        width: 100%;
        min-width: 0;
    }

    .item-icon {
        display: inline-block;
        vertical-align: middle;
        flex-shrink: 0;
        padding-top: 1px;
    }

    .key-name {
        font-weight: bold;
        color: var(--vscode-symbolIcon-propertyForeground, #3faacb);
        white-space: nowrap;
        margin-right: 6px;
        flex-shrink: 0;
    }

    .value-text {
        color: var(--vscode-foreground);
        word-break: break-all;
        opacity: 0.85;
        min-width: 0;
        outline: none;
        padding: 0 2px;
        border: 1px solid transparent;
        border-radius: 2px;
    }

    .value-text.editing {
        border-color: var(--vscode-focusBorder);
        background: var(--vscode-input-background);
        cursor: text;
        opacity: 1;
    }

    .content.editing {
        padding-right: 56px;
    }

    .actions {
        position: absolute;
        right: 0;
        top: 0;
        display: none;
        align-items: center;
        padding-top: 3px;
        background-color: var(--vscode-sideBar-background);
    }

    .actions.editing {
        display: flex;
    }

    .children {
        position: relative;
    }

    .hide {
        display: none;
    }
</style>

<div class="row" on:click|stopPropagation={toggleExpand}>
    {#each { length: depth ?? 0 } as _}
        <span class="indent-guide">&nbsp;</span>
    {/each}
    <div class="content" class:editing>
        <span class="item-icon">
            {#if isSection}
                <span on:click|stopPropagation={toggleExpand}>
                    <Chevron {expanded} />
                </span>
            {:else}
                <DebugBreakpointDataUnverified style="opacity: .2" />
            {/if}
        </span>
        <span class="key-name">{nodeKey}:</span>
        {#if !isSection}
            <span
                class="value-text"
                class:editing
                bind:this={valueEl}
                contenteditable={editing}
                on:keydown={editing ? onEditKeydown : undefined}
                on:click|stopPropagation
            >{displayValue}</span>
        {/if}
    </div>
    <div class="actions" class:editing>
        {#if editing}
            <span title="Confirm" class="icon-button" on:click|stopPropagation={confirmEdit}>
                <Check />
            </span>
            <span title="Cancel" class="icon-button" on:click|stopPropagation={cancelEdit}>
                <Close />
            </span>
        {:else}
            <span title="Copy Value" class="icon-button" on:click|stopPropagation={copyValue}>
                <Clippy />
            </span>
            {#if !isSection}
                <span title="Edit Value" class="icon-button" on:click|stopPropagation={startEdit}>
                    <Edit />
                </span>
            {/if}
            <span title="{isSection ? 'Delete Section' : 'Delete Item'}" class="icon-button" on:click|stopPropagation={deleteNode}>
                <Trash />
            </span>
        {/if}
    </div>
</div>
{#if isSection}
    <div class="children" class:hide={!expanded}>
        {#each childKeys as childKey}
            <svelte:self
                on:valueChanged={forwardValueChanged}
                on:deleteItem={forwardDeleteItem}
                on:deleteSection={forwardDeleteSection}
                nodeKey={childKey}
                nodeValue={nodeValue[childKey]}
                depth={depth + 1}
                sectionKey={depth === 0 ? nodeKey : sectionKey}
            />
        {/each}
    </div>
{/if}
