<script lang="ts">
    import throttle from 'just-throttle';
    import type { TreeNode, BaseKeyPath } from 'roku-test-automation';
    import { odc } from '../../ExtensionIntermediary';
    import { utils } from '../../utils';
    import ColorField from './ColorField.svelte';
    import NumberField from '../../shared/NumberField.svelte';
    import Chevron from '../../shared/Chevron.svelte';
    import { Refresh, Discard, ArrowLeft, Move, Key } from 'svelte-codicons';

    export let inspectNodeSubtype: string;
    // Key path for pulling info
    export let inspectNodeBaseKeyPath: BaseKeyPath | null;
    export let inspectNodeTreeNode: TreeNode | null;
    $: {
        // Updated persistentBaseKeyPath whenever inspectNodeTreeNode changes
        if (inspectNodeTreeNode) {
            persistentBaseKeyPath = {
                keyPath: inspectNodeTreeNode.keyPath
            };
        }
    }
    // Key path for use in automated tests where it must persist across runs
    export let persistentBaseKeyPath: BaseKeyPath | null;

    let inspectChildNodeSubtype: string;
    let inspectChildNodeBaseKeyPath: BaseKeyPath | null;
    let persistentChildBaseKeyPath: BaseKeyPath | null;
    let showKeyPathInfo = utils.getStorageBooleanValue('showKeyPathInfo');
    $: {
        utils.setStorageValue('showKeyPathInfo', showKeyPathInfo);
    }

    let expandedCollectionFields = {};


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
        debugger;
        handleResetValueButtonDisplay(this.self, value);
        setValue(this.id, value);
    }

    function onVector2dFieldChange() {
        const id = this.id;
        const values = [];
        for (const element of this.self.parentElement.children) {
            if (element.id === id) {
                values.push(Number(element.value));
            }
        }
        handleResetValueButtonDisplay(this.self, values);
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
        odc.setValue({
            base: inspectNodeBaseKeyPath.base,
            keyPath: `${inspectNodeBaseKeyPath.keyPath}.${fieldKeyPath}`,
            value: value,
        });
    }

    function onNodeClicked() {
        inspectChildNodeSubtype = this.textContent;

        persistentChildBaseKeyPath = {
            keyPath: persistentBaseKeyPath.keyPath ? persistentBaseKeyPath.keyPath + '.' + this.id : this.id
        }
        inspectChildNodeBaseKeyPath = {
            ...inspectNodeBaseKeyPath,
            keyPath: inspectNodeBaseKeyPath.keyPath ? inspectNodeBaseKeyPath.keyPath + '.' + this.id : this.id
        };
    }

    function handleResetValueButtonDisplay(element, newValue?) {
        if (newValue === undefined) {
            newValue = element.value;
        }

        const id = element.id;
        let valueChanged = (newValue !== fields[id]?.value);
        if (newValue instanceof Array) {
            valueChanged = false;
            for (const [i, item] of newValue.entries()) {
                if (fields[id].value[i] !== item) {
                    valueChanged = true;
                    break;
                }
            }
        }

        for (const child of element.parentElement.previousElementSibling.children) {
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
        for (const child of this.parentElement.nextElementSibling.children) {
            if (child.classList.contains('fieldValue')) {
                elements.push(child);
            };
        }

        if (elements.length === 1) {
            // If we got one then it's a standard value
            const element = elements[0]
            const id = element.id;
            if (element.checked === true || element.checked === false) {
                element.checked = fields[id].value;
                // If we dispatch the event like before the new value gets overwritten
                onBooleanFieldClick.call(element);
            } else {
                element.value = fields[id].value;
                // Have to manually trigger the observer
                element.dispatchEvent(new Event('input'));
            }


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

    function onKeydown(event) {
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

    function onKeyup(event) {
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
        expandedCollectionFields[this.id] = !expandedCollectionFields[this.id];
    }


    function formatFieldTitle(input) {
        let output = "";
        let word = "";

        for (let i = 0; i < input.length; i++) {
            if (i > 0 && input[i] === input[i].toUpperCase() && input[i - 1] !== " ") {
            output += `<span>${word}</span>`;
            word = "";
            }
            word += input[i];
        }

        if (word !== "") {
            output += `<span>${word}:</span>`;
        }

        return output;
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

    #baseKeyPathContainer {
        padding: 3px 10px;
        border-bottom: 2px solid rgb(190, 190, 190);
        word-break: break-all;
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
        padding: 0 10px 0 5px;
    }

    table {
        border-spacing: 0;
        width: 100%;
    }

    td {
        --input-min-width: 30px;
        padding: 5px 3px 3px 5px;
    }

    tr:nth-child(even) {
        background-color: var(--vscode-editorInlayHint-parameterBackground);
    }

    label {
        font-weight: bold;
    }

    .collectionItem {
        background-color: var(--vscode-editor-background);
    }

    vscode-button, vscode-text-field {
        vertical-align: middle;
    }

    /* .inline {
        display: inline;
        width: auto;
    } */

    /* .collectionItems {
        padding: 3px 0 3px 15px;
        display: block;
    }

    .collectionItem .collectionItemId {
        font-weight: bold;
    } */

    .braceOrBracket {
        cursor: pointer;
        user-select: none;
    }

    .hide {
        display: none;
    }
</style>

<svelte:window
    on:keydown={onKeydown}
    on:keyup={onKeyup} />
<div id="background" />
<div id="container" class:hide={inspectChildNodeBaseKeyPath}>
    <div id="header">
        <section style="display: flex; flex-direction:row">
            <vscode-button
                appearance="icon"
                title="Back"
                on:click={close}>
                <ArrowLeft />
            </vscode-button>
            <span id="nodeSubtype">{inspectNodeSubtype}</span>
            <vscode-checkbox
                appearance="icon"
                class="inline"
                title="Auto Refresh"
                on:click={onAutoRefreshClick} />
            <vscode-button
                appearance="icon"
                title="Refresh"
                on:click={refresh}>
                <Refresh />
            </vscode-button>
            {#if persistentBaseKeyPath?.keyPath}
                <vscode-button
                    appearance="icon"
                    title="Show Key Path Info"
                    on:click={(e) => showKeyPathInfo = !showKeyPathInfo}>
                    <Key />
                </vscode-button>
            {/if}
        </section>
    </div>
{#if showKeyPathInfo && persistentBaseKeyPath}
    <div id="baseKeyPathContainer">
        "base": "scene",<br>
        "keyPath": "{persistentBaseKeyPath.keyPath}"
    </div>
{/if}
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
                <div class="childItem">
                    <span class="index">{i}:</span>
                    <vscode-button id={String(i)} on:click={onNodeClicked} appearance="secondary">{child.subtype}</vscode-button>
                </div>
            {/each}
        </div>
    </div>
{/if}

    <table>
        {#each Object.entries(fields) as [id, field]}
            <tr>
                <td>
                    <label for={id}>{@html formatFieldTitle(id)}</label>
                    <!-- {field.type} {field.fieldType} {field.value} -->
                </td>
                <td>
                    <vscode-button
                        appearance="icon"
                        class="resetValueButton hide"
                        title="Reset value"
                        on:click={onResetValueButtonClicked}>
                        <Discard />
                    </vscode-button>
                </td>
                <td>
                {#if field.value === null}
                    Invalid
                {:else if field.fieldType === 'vector2d'}
                    <NumberField
                        {id}
                        class="xValue fieldValue"
                        title="Hold down shift to increment faster"
                        step={id === 'scale' ? 0.1 : numberInputsStep}
                        value={field.value[0]}
                        on:input={onVector2dFieldChange} />
                    <NumberField
                        {id}
                        class="yValue fieldValue"
                        value={field.value[1]}
                        title="Hold down shift to increment faster"
                        step={id === 'scale' ? 0.1 : numberInputsStep}
                        on:input={onVector2dFieldChange} />
                    {#if id !== 'scale'}
                        <vscode-button
                            appearance="icon"
                            on:pointerdown={onMoveNodePositionDown}
                            on:pointermove={throttle(onMoveNodePosition, 33)}
                            on:pointerup={onMoveNodePositionUp}>
                            <Move />
                        </vscode-button>
                    {/if}
                {:else if field.fieldType === 'color'}
                    <ColorField
                        {id}
                        integerColor={field.value}
                        on:input={onColorFieldChange} />
                {:else if field.type === 'roBoolean'}
                    <vscode-checkbox
                        id={id}
                        class="fieldValue"
                        checked={field.value}
                        on:click={onBooleanFieldClick} />
                {:else if field.type === 'roFloat' || field.type === 'roInt'}
                    <NumberField
                        title="Hold down shift to increment faster"
                        step={numberInputsStep}
                        id={id}
                        class="fieldValue"
                        value="{field.value}"
                        on:input={onNumberFieldChange} />
                {:else if field.type === 'roAssociativeArray'}
                    <strong
                        {id}
                        class="braceOrBracket"
                        on:click={toggleShowingBraceOrBracketContent}>
                        &lbrace;
                        {#if !expandedCollectionFields[id]}&rbrace;{/if}
                    </strong>
                {:else if field.type === 'roArray'}
                    <strong
                        {id}
                        class="braceOrBracket"
                        on:click={toggleShowingBraceOrBracketContent}>
                        [
                        {#if !expandedCollectionFields[id]}]{/if}
                    </strong>
                {:else if field.type === 'roSGNode' || field.fieldType === 'node'}
                    <vscode-button id={id} on:click={onNodeClicked} appearance="secondary">{field.value.subtype}</vscode-button>
                {:else if field.type === 'roString' || field.fieldType == 'string'}
                    <vscode-text-field
                        rows="1"
                        class="fieldValue"
                        id={id}
                        value={field.value}
                        on:input={onStringFieldChange} />
                {:else}
                    <vscode-text-field id={id} class="fieldValue" value={field.value} rows="1" disabled />
                {/if}
                </td>
            </tr>

            {#if field.fieldType === 'vector2d' || !expandedCollectionFields[id]}
                <!--- Do not show in this case-->
            {:else if field.type === 'roArray'}
                {#each field.value as item, collectionItemId}
                    <tr class="collectionItem">
                        <td class="collectionItemId">{@html formatFieldTitle(collectionItemId)}</td>
                        <td>
                            <vscode-button
                                appearance="icon"
                                class="resetValueButton hide"
                                title="Reset value"
                                on:click={onResetValueButtonClicked}>
                                <Discard />
                            </vscode-button>
                        </td>
                        <td>
                        {#if utils.isObjectWithProperty(item, 'subtype')}
                            <vscode-button
                                id="{id}.{collectionItemId}"
                                appearance="secondary"
                                on:click={onNodeClicked}>
                                {item.subtype}
                            </vscode-button>
                        {:else if typeof item === 'object'}
                            <vscode-text-area readonly cols="30" resize="both" value="{JSON.stringify(item)}" />
                        {:else if typeof item === 'number'}
                            <NumberField
                                id="{id}.{collectionItemId}"
                                value={item.toString()} />
                        {:else if typeof item === 'boolean'}
                            <vscode-checkbox
                                id="{id}.{collectionItemId}"
                                checked={item}
                                on:click={onBooleanFieldClick} />
                        {:else}
                            <vscode-text-field
                                id="{id}.{collectionItemId}"
                                value={item}
                                on:input={onStringFieldChange} />
                        {/if}
                        </td>
                    </tr>
                {/each}
                <tr>
                    <td></td>
                    <td></td>
                    <td>
                        <strong
                            {id}
                            class="braceOrBracket"
                            on:click={toggleShowingBraceOrBracketContent}>
                            ]
                        </strong>
                    </td>
                </tr>
            {:else if field.type === 'roAssociativeArray'}
                {#each Object.entries(field.value) as [collectionItemId, item]}
                    <tr class="collectionItem">
                        <td class="collectionItemId">{@html formatFieldTitle(collectionItemId)}</td>
                        <td>
                            <vscode-button
                                appearance="icon"
                                class="resetValueButton hide"
                                title="Reset value"
                                on:click={onResetValueButtonClicked}>
                                <Discard />
                            </vscode-button>
                        </td>
                        <td>
                        {#if utils.isObjectWithProperty(item, 'subtype')}
                            <vscode-button
                                appearance="secondary"
                                id="{id}.{collectionItemId}"
                                on:click={onNodeClicked}
                                >{item.subtype}</vscode-button>
                        {:else if typeof item === 'boolean'}
                            <vscode-checkbox
                                id="{id}.{collectionItemId}"
                                checked={item}
                                on:click={onBooleanFieldClick} />
                        {:else if typeof item === 'object'}
                            <vscode-text-area readonly cols="30" resize="both" value="{JSON.stringify(item)}" />
                        {:else if typeof item === 'number'}
                            <NumberField
                                class="inline"
                                id="{id}.{collectionItemId}"
                                value={item.toString()} />
                        {:else}
                            <vscode-text-field
                                id="{id}.{collectionItemId}"
                                value={item}
                                on:input={onStringFieldChange} />
                        {/if}
                        </td>
                    </tr>
                    {/each}
                    <tr>
                        <td></td>
                        <td></td>
                        <td>
                            <strong
                                {id}
                                class="braceOrBracket"
                                on:click={toggleShowingBraceOrBracketContent}>
                                &rbrace;
                            </strong>
                        </td>
                    </tr>
            {/if}
        {/each}
    </table>
</div>
{#if inspectChildNodeBaseKeyPath}
    <svelte:self
        bind:inspectNodeBaseKeyPath={inspectChildNodeBaseKeyPath}
        inspectNodeSubtype={inspectChildNodeSubtype}
        persistentBaseKeyPath={persistentChildBaseKeyPath} />
{/if}
