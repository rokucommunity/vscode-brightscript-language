<script lang="ts">
    import throttle from 'just-throttle';
    import type { ODC } from 'roku-test-automation';
    import { odc } from '../../ExtensionIntermediary';
    import { utils } from '../../utils';
    import ColorField from './ColorField.svelte';
    import type { ChangedFieldEntry } from '../../ChangedFieldEntry';
    import Chevron from '../../shared/Chevron.svelte';
    import { Refresh, Discard, ChromeClose, Move } from 'svelte-codicons';

    export let inspectNodeSubtype: string;
    export let inspectNodeBaseKeyPath: ODC.BaseKeyPath | null;

    let inspectChildNodeSubtype: string;
    let inspectChildNodeBaseKeyPath: ODC.BaseKeyPath | null;

    function close() {
        if (autoRefreshInterval) {
            clearInterval(autoRefreshInterval);
        }
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
        const { results } = await odc.getNodesInfo({
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
        const value = this.checked;
        handleResetValueButtonDisplay(this, value);
        setValue(this.id, value);
    }

    function onNumberFieldChange() {
        const value = Number(this.value);
        handleResetValueButtonDisplay(this, value);
        setValue(this.id, value);
    }

    function onVector2dFieldChange() {
        const id = this.id;
        const values = [];
        for (const element of this.parentElement.children) {
            if (element.id === id) {
                values.push(Number(element.value));
            }
        }
        handleResetValueButtonDisplay(this, values);
        setValue(id, values);
    }

    function onStringFieldChange() {
        handleResetValueButtonDisplay(this);
        setValue(this.id, this.value);
    }

    function onColorFieldChange() {
        handleResetValueButtonDisplay(this);
        setValue(this.id, this.value);
    }

    function setValue(fieldKeyPath: string, value: any) {
        const args: Omit<ChangedFieldEntry, 'ts'> = {
            subtype: inspectNodeSubtype,
            id: fields.id.value,
            base: inspectNodeBaseKeyPath.base,
            keyPath: `${inspectNodeBaseKeyPath.keyPath}.${fieldKeyPath}`,
            value: value,
        }
        odc.setValue(args);
    }

    function onNodeClicked() {
        inspectChildNodeSubtype = this.textContent;
        inspectChildNodeBaseKeyPath = {
            ...inspectNodeBaseKeyPath,
            keyPath: `${inspectNodeBaseKeyPath.keyPath}.${this.id}`
        };
    }

    function handleResetValueButtonDisplay(element, newValue?) {
        if (newValue === undefined) {
            newValue = element.value;
        }

        const id = element.id;
        let valueChanged = (newValue !== fields[id].value);
        if (newValue instanceof Array) {
            valueChanged = false;
            for (const [i, item] of newValue.entries()) {
                if (fields[id].value[i] !== item) {
                    valueChanged = true;
                    break;
                }
            }
        }
        for (const child of element.parentElement.children) {
            if (child.classList.contains('resetValueButton')) {
                if (valueChanged) {
                    child.classList.remove('hide');
                } else {
                    child.classList.add('hide');
                }
                break;
            }
        }
    }

    function onResetValueButtonClicked() {
        const elements = [];
        // Find the elements we want to reset based on their relationship to the reset button
        for (const child of this.parentElement.children) {
            if (child.classList.contains('fieldValue')) {
                elements.push(child);
            };
        }

        if (elements.length === 1) {
            // If we got one then it's a standard value
            const element = elements[0]
            const id = element.id;
            let eventType = 'input';
            if (element.type === 'checkbox') {
                eventType = 'click';
                element.checked = fields[id].value;
            } else {
                element.value = fields[id].value;
            }
            // Have to manually trigger the observer
            element.dispatchEvent(new Event(eventType));
        } else if (elements.length === 2) {
            // If we got two then it's for vector2d field and so we have to update both inputs
            const xElement = elements[0];
            const yElement = elements[1];
            xElement.value = fields[xElement.id].value[0];
            yElement.value = fields[yElement.id].value[1];
            xElement.dispatchEvent(new Event('input'));
        } else {
            console.log('Reset value button was clicked but could not find value to reset')
        }
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

    let currentXInput;
    let currentYInput;
    let lastXScreenPosition;
    let lastYScreenPosition;
    function onMoveNodePositionDown(e: PointerEvent) {
        this.setPointerCapture(e.pointerId);

        for (const child of this.parentElement.children) {
            if (child.classList.contains('xValue')) {
                currentXInput = child;
            } else if (child.classList.contains('yValue')) {
                currentYInput = child;
            }
        }

        lastXScreenPosition = e.x;
        lastYScreenPosition = e.y;
    }

    function onMoveNodePosition(e: PointerEvent) {
        if (!currentXInput || !currentXInput) {
            return;
        }

        currentXInput.value = Math.floor(Number(currentXInput.value) + e.x - lastXScreenPosition);
        currentYInput.value = Math.floor(Number(currentYInput.value) + e.y - lastYScreenPosition);

        lastXScreenPosition = e.x;
        lastYScreenPosition = e.y;

        currentXInput.dispatchEvent(new Event('input'));
    }

    function onMoveNodePositionUp() {
        currentXInput = undefined;
        currentYInput = undefined;
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

    #childrenContainer {
        background-color: #00000010;
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
        float: right;
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
    on:keyup={handleKeyup} />
<div id="background" />
<div id="container" class:hide={inspectChildNodeBaseKeyPath}>
    <div id="header">
        <span id="nodeSubtype">{inspectNodeSubtype}</span>
        <input
            class="inline"
            title="Auto Refresh"
            type="checkbox"
            on:click={onAutoRefreshClick} />
        <span
            id="refresh"
            class="icon-button"
            title="Refresh"
            on:click={refresh}>
            <Refresh />
        </span>
        <span
            id="closeButton"
            class="icon-button"
            title="Close"
            on:click={close}>
            <ChromeClose />
        </span>
    </div>

    {#if children.length > 0}
        <div id="childrenContainer">
            <span on:click={toggleChildrenExpanded}>
                <Chevron
                expanded={childrenExpanded} />
            </span>
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
                            id={id}
                            class="xValue fieldValue"
                            type="number"
                            title="Hold down shift to increment faster"
                            step={id === 'scale' ? 0.1 : numberInputsStep}
                            value={field.value[0]}
                            on:input={onVector2dFieldChange} />
                        <input
                            id={id}
                            class="yValue fieldValue"
                            type="number"
                            title="Hold down shift to increment faster"
                            step={id === 'scale' ? 0.1 : numberInputsStep}
                            value={field.value[1]}
                            on:input={onVector2dFieldChange} />
                        {#if id !== 'scale'}
                            <span
                                class="icon-button moveCursor"
                                on:pointerdown={onMoveNodePositionDown}
                                on:pointermove={throttle(onMoveNodePosition, 33)}
                                on:pointerup={onMoveNodePositionUp}>
                                <Move />
                            </span>
                        {/if}
                        <span
                            class="icon-button resetValueButton hide"
                            title="Reset value"
                            on:click={onResetValueButtonClicked}>
                            <Discard />
                        </span>
                    </span>
                {:else if field.fieldType === 'color'}
                    <ColorField
                        id={id}
                        integerColor={field.value}
                        on:input={onColorFieldChange} />
                {:else if field.type === 'roBoolean'}
                    <input
                        type="checkbox"
                        id={id}
                        class="inline fieldValue"
                        checked={field.value}
                        on:click={onBooleanFieldClick} />
                {:else if field.type === 'roFloat' || field.type === 'roInt'}
                    <input
                        type="number"
                        title="Hold down shift to increment faster"
                        step={numberInputsStep}
                        id={id}
                        class="fieldValue"
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
                                -->{:else if typeof item === 'boolean'}
                                    <input
                                        type="checkbox"
                                        id="{id}.{collectionItemId}"
                                        checked={item}
                                        on:click={onBooleanFieldClick} /><!--
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
                                -->{:else}
                                    <input
                                        type="text"
                                        id="{id}.{collectionItemId}"
                                        value={item}
                                        on:input={onStringFieldChange} /><!--
                                -->{/if}{#if Object.entries(field.value).pop()[0] !== collectionItemId},{/if}
                                <span
                                    class="icon-button resetValueButton"
                                    title="Reset value">
                                    <Discard />
                                </span>
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
                                    size={item.length}
                                    on:input={onStringFieldChange} /><!--
                            -->{/if}{#if collectionItemId + 1 < field.value.length},{/if}
                            <span
                                on:click={onResetValueButtonClicked}
                                class="icon-button resetValueButton hide"
                                title="Reset value">
                                <Discard />
                            </span>
                        </div>
                    {/each}
                    <strong>]</strong>
                {:else if field.type === 'roSGNode' || field.fieldType === 'node'}
                    <button id={id} on:click={onNodeClicked}
                        >{field.value.subtype} &#x1F50D;</button>
                {:else if field.type === 'roString' || field.fieldType == 'string'}
                    <input
                        type="text"
                        class="inline fieldValue"
                        id={id}
                        value={field.value}
                        on:input={onStringFieldChange} />
                {:else}
                    <textarea id={id} class="fieldValue" value={field.value} rows="2" disabled />
                {/if}
                <span
                    on:click={onResetValueButtonClicked}
                    class="icon-button resetValueButton hide"
                    title="Reset value">
                    <Discard />
                </span>
            </li>
        {/each}
    </ul>
</div>
{#if inspectChildNodeBaseKeyPath}
    <svelte:self
        bind:inspectNodeBaseKeyPath={inspectChildNodeBaseKeyPath}
        inspectNodeSubtype={inspectChildNodeSubtype} />
{/if}
