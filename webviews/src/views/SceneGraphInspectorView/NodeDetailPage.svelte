<script lang="ts">
    import throttle from 'just-throttle';
    import { Refresh, Discard, ArrowLeft, Move, Key, Clippy } from 'svelte-codicons';
    import { odc } from '../../ExtensionIntermediary';
    import { utils } from '../../utils';
    import ColorField from './ColorField.svelte';
    import NumberField from '../../shared/NumberField.svelte';
    import Chevron from '../../shared/Chevron.svelte';
    import Loader from '../../shared/Loader.svelte';
    import type { AppUIResponseChild } from 'roku-test-automation';
    export let inspectNode: AppUIResponseChild | null;
    let lastInspectNode;
    $: {
        // For some reason this is getting triggered twice so we do a check to see if the value is the same and only call refresh if it is different
        if (lastInspectNode !== inspectNode) {
            lastInspectNode = inspectNode;
            refresh();
        }
    }
    export let showFullscreen: boolean;

    let loading = false;
    let error: Error | null = null;

    let inspectChildNode: AppUIResponseChild | null;
    let showKeyPathInfo = utils.getStorageBooleanValue('showKeyPathInfo');
    $: {
        utils.setStorageValue('showKeyPathInfo', showKeyPathInfo);
    }

    let expandedCollectionFields = {};


    function close() {
        if (autoRefreshInterval) {
            clearInterval(autoRefreshInterval);
        }
        inspectNode = null;
    }

    let numberInputsStep = '1';

    let nodeInfoResponse: Awaited<ReturnType<typeof odc.getNodesInfo>>['results']['']; // Last part can be anything we just need a key to get the inner typing

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
        error = null;
        if (!inspectNode) {
            return;
        }

        loading = true;

        try {
            if (inspectNode.base === 'appUI') {
                await utils.convertAppUIKeyPathToSceneKeyPath(inspectNode);
            }

            const { results } = await odc.getNodesInfo({
                requests: {
                    request: {
                        base: inspectNode.base,
                        keyPath: inspectNode.keyPath
                    }
                }
            });

            nodeInfoResponse = results.request;
            fields = nodeInfoResponse.fields;
            children = nodeInfoResponse.children;
        } catch (e) {
            if (!inspectNode.uiElementId) {
                error = e;
            } else {
                try {
                    const { results } = await odc.getNodesInfo({
                        requests: {
                            request: {
                                base: 'elementId',
                                keyPath: inspectNode.uiElementId
                            }
                        }
                    });
                    nodeInfoResponse = results.request;
                    fields = nodeInfoResponse.fields;
                    children = nodeInfoResponse.children;
                } catch (e) {
                    error = e;
                }
            }
        }

        loading = false;
    }

    function onBooleanFieldClick() {
        const value = this.checked;
        handleResetValueButtonDisplay(this, value);
        setValue(this.id, value);
    }

    function onNumberFieldChange() {
        const value = Number(this.value);
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
        handleResetValueButtonDisplay(this.self);
        setValue(this.id, this.value);
    }

    async function setValue(fieldKeyPath: string, value: any) {
        try {
            await odc.setValue({
                base: inspectNode.base,
                keyPath: `${inspectNode.keyPath}.${fieldKeyPath}`,
                value: value,
            });
        } catch (e) {
            if (!inspectNode.uiElementId) {
                throw e;
            }

            // If that fails then we fallback to using elementId if available
            odc.setValue({
                base: 'elementId',
                keyPath: inspectNode.uiElementId,
                value: value,
            });
        }
    }

    function onNodeClicked() {
        const keyPath = inspectNode.keyPath ? inspectNode.keyPath + '.' + this.id : this.id
        debugger;
        // We make our own node tree object to pass to the next NodeDetailPage
        inspectChildNode = {
            subtype: this.textContent,
            base: inspectNode.base,
            keyPath: keyPath
        }
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
        if (inspectChildNode) {
            return;
        }
        const key = event.key;

        switch (key) {
            case 'Escape':
                close();
                break;
            case 'Shift':
                numberInputsStep = '15';
                break;
        }
    }

    function onKeyup(event) {
        const key = event.key;
        switch (key) {
            case 'Shift':
                numberInputsStep = '1';
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

    function copyNodeInfoJson() {
        navigator.clipboard.writeText(JSON.stringify(nodeInfoResponse, undefined, 4))
    }
</script>

<style>
    #container {
        width: 100%;
        height: 100%;
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
        padding: 5px 3px 3px 10px;
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

    .textField {
        padding-right: 10px;
        width: 100%;
        box-sizing: border-box;
    }

    .braceOrBracket {
        cursor: pointer;
        user-select: none;
    }

    .hide {
        display: none;
    }

    #errorMessage {
        font-weight: bold;
        color: rgb(216, 71, 71);
        padding: 10px;
    }
</style>

<svelte:window
    on:keydown={onKeydown}
    on:keyup={onKeyup} />
    <div id="container" class:hide={inspectChildNode}>
    {#if loading}
        <Loader />
    {:else}
        <div id="header">
            <section style="display: flex; flex-direction:row">
                <vscode-button
                    appearance="icon"
                    title="Back"
                    on:click={close}>
                    <ArrowLeft />
                </vscode-button>

                <span id="nodeSubtype">{inspectNode.subtype}</span>
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
                {#if inspectNode?.keyPath}
                    <vscode-button
                        appearance="icon"
                        title="Show Key Path Info"
                        on:click={(e) => showKeyPathInfo = !showKeyPathInfo}>
                        <Key />
                    </vscode-button>
                {/if}

                <vscode-button
                    appearance="icon"
                    title="Copy Node Info Response JSON"
                    on:click={copyNodeInfoJson}>
                    <Clippy />
                </vscode-button>
            </section>
        </div>
    {#if showKeyPathInfo && inspectNode.keyPath}
        <div id="baseKeyPathContainer">
            "base": "{inspectNode.base}",<br>
            "keyPath": "{inspectNode.keyPath}"
        </div>
    {/if}

    {#if error}
        <div id="errorMessage">{error.message}</div>
    {:else}
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
                                step={id === 'scale' ? '0.1' : numberInputsStep}
                                value={field.value[0]}
                                on:input={onVector2dFieldChange} />
                            <NumberField
                                {id}
                                class="yValue fieldValue"
                                value={field.value[1]}
                                title="Hold down shift to increment faster"
                                step={id === 'scale' ? '0.1' : numberInputsStep}
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
                                class="fieldValue textField"
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
                                        class="textField"
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
                                        class="textField"
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
        {/if}
    {/if}
    </div>
{#if inspectChildNode}
    <svelte:self
        bind:inspectNode={inspectChildNode}
        showFullscreen={showFullscreen} />
{/if}
