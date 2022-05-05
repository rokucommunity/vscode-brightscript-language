<script lang="ts">
    import throttle from 'just-throttle';
    import type { ODC } from 'roku-test-automation';
    import { odc } from '../../ExtensionIntermediary';
    import { utils } from '../../utils';
    import ColorField from './ColorField.svelte';
    import Chevron from '../Common/Chevron.svelte';

    export let inspectNodeSubtype: string;
    export let inspectNodeBaseKeyPath: ODC.BaseKeyPath | null;

    let inspectChildNodeSubtype: string;
    let inspectChildNodeBaseKeyPath: ODC.BaseKeyPath | null;

    let scrollX: number;
    let scrollY: number;

    scrollX = document.documentElement.scrollLeft;
    scrollY = document.documentElement.scrollTop;
    document.documentElement.scrollTo(0, 0);

    function close() {
        if (autoRefreshInterval) {
            clearInterval(autoRefreshInterval);
        }
        document.documentElement.scrollTo(scrollX, scrollY);
        inspectNodeBaseKeyPath = null;
    }

    let numberInputsStep = 1;

    let fields = {} as {
        [key: string]: {
            fieldType: string;
            type: string;
            value: any;
        };
    };

    let children = [] as {
        subtype: string;
    }[];

    let childrenExpanded = false;

    function toggleChildrenExpanded() {
        if (children.length < 1) {
            return;
        }
        childrenExpanded = !childrenExpanded;
    }

    let autoRefreshInterval;
    function onAutoRefreshClick() {
        if (this.checked) {
            autoRefreshInterval = setInterval(refresh, 1000);
        } else {
            clearInterval(autoRefreshInterval);
        }
    }

    async function refresh() {
        const { results } = await odc.getNodesInfoAtKeyPaths({
            requests: {
                request: inspectNodeBaseKeyPath
            }
        });
        const node = results.request;
        fields = node.fields;
        children = node.children;
    }
    refresh();

    function onBooleanFieldClick() {
        odc.setValueAtKeyPath({
            base: inspectNodeBaseKeyPath.base,
            keyPath: `${inspectNodeBaseKeyPath.keyPath}.${this.id}`,
            value: this.checked
        });
    }

    function onNumberFieldChange() {
        odc.setValueAtKeyPath({
            base: inspectNodeBaseKeyPath.base,
            keyPath: `${inspectNodeBaseKeyPath.keyPath}.${this.id}`,
            value: Number(this.value)
        });
    }

    function onVector2dFieldChange() {
        const id = this.id;
        const values = [];
        for (const element of this.parentElement.children) {
            if (element.id === id) {
                values.push(Number(element.value));
            }
        }
        sendVector2d(this.id, values);
    }

    function sendVector2d(id: string, values: number[]) {
        odc.setValueAtKeyPath({
            base: inspectNodeBaseKeyPath.base,
            keyPath: `${inspectNodeBaseKeyPath.keyPath}.${id}`,
            value: values
        });
    }

    function onStringFieldChange() {
        odc.setValueAtKeyPath({
            base: inspectNodeBaseKeyPath.base,
            keyPath: `${inspectNodeBaseKeyPath.keyPath}.${this.id}`,
            value: this.value
        });
    }

    function onColorFieldChange() {
        odc.setValueAtKeyPath({
            base: inspectNodeBaseKeyPath.base,
            keyPath: `${inspectNodeBaseKeyPath.keyPath}.${this.id}`,
            value: this.value
        });
    }

    function onNodeClicked() {
        inspectChildNodeSubtype = this.textContent;
        inspectChildNodeBaseKeyPath = {
            ...inspectNodeBaseKeyPath,
            keyPath: `${inspectNodeBaseKeyPath.keyPath}.${this.id}`
        };
    }

    function handleKeydown(event) {
        // Don't handle anything if we're not the top detail view
        if (inspectChildNodeBaseKeyPath) {
            return;
        }
        const key = event.key;

        switch (key) {
            case 'Escape':
                close();
                break;
            case 'Shift':
                numberInputsStep = 15;
                break;
        }
    }

    function handleKeyup(event) {
        const key = event.key;
        switch (key) {
            case 'Shift':
                numberInputsStep = 1;
                break;
        }
    }

    function onMoveCursorMouseDown(e) {
        e.preventDefault();
        for (const child of this.parentElement.children) {
            if (child.classList.contains('xValue')) {
                currentXInput = child;
            } else if (child.classList.contains('yValue')) {
                currentYInput = child;
            }
        }
    }

    let currentXInput;
    let currentYInput;

    function onMouseMove(e) {
        if (!currentXInput || !currentXInput) {
            return;
        }

        const values = [
            Number(currentXInput.value) + e.movementX,
            Number(currentYInput.value) + e.movementY
        ];
        currentXInput.value = values[0];
        currentYInput.value = values[1];

        sendVector2d(currentXInput.id, values);
    }

    function onMouseUp() {
        currentXInput = undefined;
        currentYInput = undefined;
    }

    function onEditableCollectionItemValueChange() {
        // TODO: Disabling until we update RTA setValueAtKeyPath
        return;
        odc.setValueAtKeyPath({
            base: inspectNodeBaseKeyPath.base,
            keyPath: `${inspectNodeBaseKeyPath.keyPath}.${this.id}`,
            value: this.textContent
        });
    }

    function toggleShowingBraceOrBracketContent() {
        this.nextElementSibling.classList.toggle('hide');
    }
</script>

<style>
    #background {
        background-color: var(--vscode-sideBar-background);
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        z-index: 100;
    }
    #container {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        z-index: 101;
    }

    #header {
        font-weight: bold;
        font-size: large;
        padding: 3px 10px;
        border-bottom: 2px solid rgb(190, 190, 190);
    }

    button {
        padding: 2px 5px;
        font-size: 12px;
        border: none;
        margin: 0;
        cursor: pointer;
        outline: none;
        display: inline-block;
    }

    #refresh {
        padding: 0 5px 2px;
    }

    #refresh input {
        position: relative;
        top: 3px;
    }

    #childrenContainer {
        background-color: #151e27;
        padding: 3px 10px;
        border-bottom: 2px solid rgb(190, 190, 190);
    }

    #childrenTitle {
        font-weight: bold;
    }

    .childItem {
        display: inline-block;
        margin: 5px;
    }

    #nodeSubtype {
        user-select: text;
    }

    ul {
        margin: 5px;
        list-style: none;
        padding: 0;
    }

    li {
        padding: 0 5px 10px;
    }

    label {
        font-weight: bold;
        padding-right: 5px;
    }

    input[type='number'] {
        width: 50px;
    }

    input[type='checkbox'] {
        position: relative;
        top: 2px;
    }

    .inline {
        display: inline;
        width: auto;
    }

    #closeButton {
        font-size: small;
        float: right;
        cursor: pointer;
        padding-top: 3px;
    }

    .moveCursor {
        font-size: 15px;
        padding-left: 8px;
        cursor: move;
    }

    .collectionItems {
        padding: 3px 0 3px 15px;
        display: block;
    }

    .collectionItems .collectionItemId {
        font-weight: bold;
    }

    button {
        cursor: pointer;
    }

    .openingBrace,
    .openingBracket {
        cursor: pointer;
        user-select: none;
    }

    .hide {
        display: none;
    }
</style>

<svelte:window
    on:keydown={handleKeydown}
    on:keyup={handleKeyup}
    on:mousemove={throttle(onMouseMove, 33)}
    on:mouseup={onMouseUp} />
<div id="background" />
<div id="container" class:hide={inspectChildNodeBaseKeyPath}>
    <div id="header">
        <span id="nodeSubtype">{inspectNodeSubtype}</span>
        <button id="refresh" title="Refresh" on:click={refresh}>
            <input
                class="inline"
                title="Auto Refresh"
                type="checkbox"
                on:click={onAutoRefreshClick} />{'\u27F3'}</button>
        <div id="closeButton" on:click={close}>X</div>
    </div>

    {#if children.length > 0}
        <div id="childrenContainer">
            <Chevron
                expanded={childrenExpanded}
                on:click={toggleChildrenExpanded} />
            <div id="childrenTitle">children ({children.length})</div>
            <div style="clear: both" />
            <div class:hide={!childrenExpanded}>
                {#each children as child, i}
                    <div class="childItem"
                        >{i}:
                        <button id={String(i)} on:click={onNodeClicked}
                            >{child.subtype} &#x1F50D;</button
                        ></div>
                {/each}
            </div>
        </div>
    {/if}

    <ul>
        {#each Object.entries(fields) as [id, field]}
            <li>
                <label for={id}>{id}:</label>
                <!-- {field.type} {field.fieldType} {field.value} -->
                {#if field.value === null}
                    Invalid
                {:else if field.fieldType === 'vector2d'}
                    <span style="display: inline-block;">
                        <input
                            class="xValue"
                            type="number"
                            title="Hold down shift to increment faster"
                            step={id === 'scale' ? 0.1 : numberInputsStep}
                            id={id}
                            value={field.value[0]}
                            on:input={onVector2dFieldChange} />
                        <input
                            class="yValue"
                            type="number"
                            title="Hold down shift to increment faster"
                            step={id === 'scale' ? 0.1 : numberInputsStep}
                            id={id}
                            value={field.value[1]}
                            on:input={onVector2dFieldChange} />
                        {#if id !== 'scale'}
                            <span
                                class="moveCursor"
                                on:mousedown={onMoveCursorMouseDown}
                                >&#10021;</span>
                        {/if}
                    </span>
                {:else if field.fieldType === 'color'}
                    <ColorField
                        id={id}
                        integerColor={field.value}
                        on:input={onColorFieldChange} />
                {:else if field.type === 'roBoolean'}
                    <input
                        class="inline"
                        type="checkbox"
                        id={id}
                        checked={field.value}
                        on:click={onBooleanFieldClick} />
                {:else if field.type === 'roFloat' || field.type === 'roInt'}
                    <input
                        type="number"
                        title="Hold down shift to increment faster"
                        step={numberInputsStep}
                        id={id}
                        value={field.value}
                        on:input={onNumberFieldChange} />
                {:else if field.type === 'roAssociativeArray'}
                    <strong
                        class="openingBrace"
                        on:click={toggleShowingBraceOrBracketContent}
                        >&lbrace;</strong>
                    <div class="collectionItems hide">
                        {#each Object.entries(field.value) as [collectionItemId, item]}
                            <div>
                                <span class="collectionItemId"
                                    >{collectionItemId}:</span>
                                {#if utils.isObjectWithProperty(item, 'subtype')}
                                    <button
                                        id="{id}.{collectionItemId}"
                                        on:click={onNodeClicked}
                                        >{item.subtype} &#x1F50D;</button
                                    ><!--
                                -->{:else if typeof item === 'object'}
                                    {JSON.stringify(
                                        item
                                    )}<!--
                                -->{:else}
                                    <input
                                        type="text"
                                        id={id}
                                        value={item} /><!--
                                -->{/if}{#if Object.entries(field.value).pop()[0] !== collectionItemId},&nbsp;{/if}
                            </div>
                        {/each}
                    </div>
                    <strong>&rbrace;</strong>
                {:else if field.type === 'roArray'}
                    <strong
                        class="openingBracket"
                        on:click={toggleShowingBraceOrBracketContent}>[</strong>
                    {#each field.value as item, collectionItemId}
                        <div class="collectionItems hide">
                            <span class="collectionItemId"
                                >{collectionItemId}:</span>
                            {#if utils.isObjectWithProperty(item, 'subtype')}
                                <button
                                    id="{id}.{collectionItemId}"
                                    on:click={onNodeClicked}
                                    >{item.subtype} &#x1F50D;</button
                                ><!--
                                -->{:else if typeof item === 'object'}
                                {JSON.stringify(
                                    item
                                )}<!--
                                -->{:else if typeof item === 'number'}
                                <input
                                    type="number"
                                    class="inline"
                                    id="{id}.{collectionItemId}"
                                    value={item} /><!--
                                -->{:else if typeof item === 'boolean'}
                                <input
                                    type="checkbox"
                                    id="{id}.{collectionItemId}"
                                    checked={item}
                                    on:click={onBooleanFieldClick} /><!--
                                -->{:else}
                                <input
                                    type="text"
                                    id="{id}.{collectionItemId}"
                                    value={item}
                                    size={item.length} /><!--
                            -->{/if}{#if collectionItemId + 1 < field.value.length},&nbsp;{/if}
                        </div>
                    {/each}
                    <strong>]</strong>
                {:else if field.fieldType === 'node'}
                    <button id={id} on:click={onNodeClicked}
                        >{field.value.subtype} &#x1F50D;</button>
                {:else if field.type === 'roString' || field.fieldType == 'string'}
                    <input
                        type="text"
                        class="inline"
                        id={id}
                        value={field.value}
                        on:input={onStringFieldChange} />
                {:else}
                    <textarea id={id} value={field.value} rows="2" disabled />
                {/if}
            </li>
        {/each}
    </ul>
</div>
{#if inspectChildNodeBaseKeyPath}
    <svelte:self
        bind:inspectNodeBaseKeyPath={inspectChildNodeBaseKeyPath}
        inspectNodeSubtype={inspectChildNodeSubtype} />
{/if}
