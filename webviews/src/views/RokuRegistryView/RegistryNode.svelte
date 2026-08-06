<!-- svelte-ignore a11y-click-events-have-key-events -->
<script lang="ts">
    import { Trash, DebugBreakpointDataUnverified } from 'svelte-codicons';
    import Chevron from '../../shared/Chevron.svelte';
    import { utils } from '../../utils';
    import { createEventDispatcher, getContext, onDestroy } from 'svelte';
    import type { Readable } from 'svelte/store';
    const dispatch = createEventDispatcher();

    export let nodeKey: string;
    export let nodeValue: any;
    export let depth = 0;
    export let sectionKey: string;
    // Depth-1 ancestor key (the registry key that actually stores this subtree as a JSON string on the device).
    // Empty for depth-0 section rows; equals nodeKey for depth-1 rows; inherited from parent for deeper rows.
    export let topLevelKey: string = '';
    // Path from the parsed top-level object root to this node, INCLUSIVE of this node's key.
    // [] for depth 0 and depth 1; e.g. ['get_started'] for depth 2.
    export let pathInTopLevel: string[] = [];

    $: isSection = typeof nodeValue === 'object' && nodeValue !== null;
    $: childKeys = isSection ? Object.keys(nodeValue) : [];
    $: displayValue = String(nodeValue ?? '');
    $: keyRenamable = depth > 0;

    const expandedStorageKey = `registry:expanded:${sectionKey}:${nodeKey}`;
    let expanded = utils.getStorageBooleanValue(expandedStorageKey);
    $: {
        if (expanded) {
            utils.setStorageValue(expandedStorageKey, true);
        } else {
            utils.deleteStorageValue(expandedStorageKey);
        }
    }

    let editingValue = false;
    let editingKey = false;
    $: editing = editingValue || editingKey;

    let savedValue = '';
    let savedKey = '';
    let valueEl: HTMLSpanElement;
    let keyEl: HTMLSpanElement;

    // Listen for write-acknowledgement events from RegistryTree and flash the value or key cell
    // briefly so the user gets immediate feedback that a write succeeded or failed.
    type AckSignal = { id: string; status: 'success' | 'error'; field: 'value' | 'key' };
    const ackStore = getContext<Readable<AckSignal | null>>('registryAck');
    $: ackId = `${sectionKey}|${topLevelKey}|${(pathInTopLevel ?? []).join('/')}`;
    let valueFlash: 'success' | 'error' | null = null;
    let keyFlash: 'success' | 'error' | null = null;
    let valueFlashTimer: ReturnType<typeof setTimeout> | undefined;
    let keyFlashTimer: ReturnType<typeof setTimeout> | undefined;

    const unsubscribeAck = ackStore?.subscribe((ack) => {
        if (!ack || ack.id !== ackId) {
            return;
        }
        if (ack.field === 'value') {
            valueFlash = null;
            requestAnimationFrame(() => {
                valueFlash = ack.status;
                clearTimeout(valueFlashTimer);
                valueFlashTimer = setTimeout(() => { valueFlash = null; }, 1600);
            });
        } else {
            keyFlash = null;
            requestAnimationFrame(() => {
                keyFlash = ack.status;
                clearTimeout(keyFlashTimer);
                keyFlashTimer = setTimeout(() => { keyFlash = null; }, 1600);
            });
        }
    });
    onDestroy(() => {
        unsubscribeAck?.();
        clearTimeout(valueFlashTimer);
        clearTimeout(keyFlashTimer);
    });

    function toggleExpand() {
        if (isSection) {
            expanded = !expanded;
        }
    }

    function startValueEdit(event: MouseEvent) {
        if (isSection) {
            return;
        }
        event.stopPropagation();
        savedValue = valueEl.textContent;
        editingValue = true;
        requestAnimationFrame(() => {
            valueEl?.focus();
            const sel = window.getSelection();
            sel.selectAllChildren(valueEl);
            sel.collapseToEnd();
        });
    }

    function confirmValueEdit() {
        if (!editingValue) {
            return;
        }
        const newValue = valueEl.textContent;
        editingValue = false;
        if (newValue === savedValue) {
            return;
        }
        dispatch('valueChanged', {
            sectionKey: sectionKey,
            topLevelKey: topLevelKey,
            pathInTopLevel: pathInTopLevel,
            itemKey: nodeKey,
            newValue: newValue
        });
    }

    function cancelValueEdit() {
        if (!editingValue) {
            return;
        }
        if (valueEl) {
            valueEl.textContent = savedValue;
        }
        editingValue = false;
    }

    function onValueKeydown(event: KeyboardEvent) {
        if (event.key === 'Enter') {
            event.preventDefault();
            valueEl?.blur();
        } else if (event.key === 'Escape') {
            event.preventDefault();
            cancelValueEdit();
            valueEl?.blur();
        }
    }

    function startKeyEdit(event: MouseEvent) {
        if (!keyRenamable) {
            return;
        }
        event.stopPropagation();
        savedKey = keyEl.textContent;
        editingKey = true;
        requestAnimationFrame(() => {
            keyEl?.focus();
            const sel = window.getSelection();
            sel.selectAllChildren(keyEl);
            sel.collapseToEnd();
        });
    }

    function confirmKeyEdit() {
        if (!editingKey) {
            return;
        }
        const newKey = keyEl.textContent.trim();
        editingKey = false;
        if (!newKey || newKey === savedKey) {
            if (keyEl) {
                keyEl.textContent = savedKey;
            }
            return;
        }
        dispatch('keyRenamed', {
            sectionKey: sectionKey,
            topLevelKey: topLevelKey,
            pathInTopLevel: pathInTopLevel,
            oldItemKey: nodeKey,
            newItemKey: newKey,
            currentValue: nodeValue
        });
    }

    function cancelKeyEdit() {
        if (!editingKey) {
            return;
        }
        if (keyEl) {
            keyEl.textContent = savedKey;
        }
        editingKey = false;
    }

    function onKeyKeydown(event: KeyboardEvent) {
        if (event.key === 'Enter') {
            event.preventDefault();
            keyEl?.blur();
        } else if (event.key === 'Escape') {
            event.preventDefault();
            cancelKeyEdit();
            keyEl?.blur();
        }
    }

    function deleteNode() {
        if (depth === 0) {
            dispatch('deleteSection', { sectionKey: nodeKey });
        } else {
            dispatch('deleteItem', {
                sectionKey: sectionKey,
                topLevelKey: topLevelKey,
                pathInTopLevel: pathInTopLevel,
                itemKey: nodeKey
            });
        }
    }

    function forwardValueChanged(event) {
        dispatch('valueChanged', event.detail);
    }

    function forwardKeyRenamed(event) {
        dispatch('keyRenamed', event.detail);
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

    .row:hover .actions:not(.hide) {
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
        flex-shrink: 0;
        outline: none;
        padding: 0 2px;
        border: 1px solid transparent;
        border-radius: 2px;
    }

    .key-name.renamable {
        cursor: text;
    }

    .key-name.editing {
        border-color: var(--vscode-focusBorder);
        background: var(--vscode-input-background);
    }

    .key-colon {
        font-weight: bold;
        color: var(--vscode-symbolIcon-propertyForeground, #3faacb);
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
        cursor: text;
    }

    .value-text.editing {
        border-color: var(--vscode-focusBorder);
        background: var(--vscode-input-background);
        opacity: 1;
    }

    .flash-success {
        animation: registryFlashSuccess 1.6s ease-out;
    }

    .flash-error {
        animation: registryFlashError 1.6s ease-out;
    }

    @keyframes registryFlashSuccess {
        0% { background-color: rgba(46, 160, 67, 0.55); }
        100% { background-color: transparent; }
    }

    @keyframes registryFlashError {
        0% { background-color: rgba(248, 81, 73, 0.55); }
        100% { background-color: transparent; }
    }

    .content.editing {
        padding-right: 28px;
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
        <span
            class="key-name"
            class:renamable={keyRenamable && !editingKey}
            class:editing={editingKey}
            class:flash-success={keyFlash === 'success'}
            class:flash-error={keyFlash === 'error'}
            bind:this={keyEl}
            contenteditable={editingKey}
            title={editingKey || !keyRenamable ? '' : 'Double-click to rename'}
            on:dblclick={keyRenamable ? startKeyEdit : undefined}
            on:keydown={editingKey ? onKeyKeydown : undefined}
            on:blur={confirmKeyEdit}
            on:click|stopPropagation
        >{nodeKey}</span><span class="key-colon">:</span>
        {#if !isSection}
            <span
                class="value-text"
                class:editing={editingValue}
                class:flash-success={valueFlash === 'success'}
                class:flash-error={valueFlash === 'error'}
                bind:this={valueEl}
                contenteditable={editingValue}
                title={editingValue ? '' : 'Double-click to edit'}
                on:dblclick={startValueEdit}
                on:keydown={editingValue ? onValueKeydown : undefined}
                on:blur={confirmValueEdit}
                on:click|stopPropagation
            >{displayValue}</span>
        {/if}
    </div>
    <div class="actions" class:hide={editing}>
        <span title="{depth === 0 ? 'Delete Section' : 'Delete'}" class="icon-button" on:click|stopPropagation={deleteNode}>
            <Trash />
        </span>
    </div>
</div>
{#if isSection}
    <div class="children" class:hide={!expanded}>
        {#each childKeys as childKey}
            <svelte:self
                on:valueChanged={forwardValueChanged}
                on:keyRenamed={forwardKeyRenamed}
                on:deleteItem={forwardDeleteItem}
                on:deleteSection={forwardDeleteSection}
                nodeKey={childKey}
                nodeValue={nodeValue[childKey]}
                depth={depth + 1}
                sectionKey={depth === 0 ? nodeKey : sectionKey}
                topLevelKey={depth === 0 ? childKey : topLevelKey}
                pathInTopLevel={depth === 0 ? [] : [...pathInTopLevel, childKey]}
            />
        {/each}
    </div>
{/if}
