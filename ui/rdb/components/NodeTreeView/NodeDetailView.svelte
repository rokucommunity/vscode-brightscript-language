<script lang="ts">
    import type * as rta from 'roku-test-automation';
    import { odc } from '../../ExtensionIntermediary';
    import ColorField from './ColorField.svelte';

    export let nodeTree: rta.ODC.NodeTree;
    export let inspectNode: boolean;

    let numberInputsStep = 0.1;

    let fields = {} as {
        [key: string]: {
            fieldType: string;
            type: string;
            value: any;
        };
    };

    (async () => {
        odc.getNodeReferences
        const result = await odc.getNodeReferences({
            indexes: [nodeTree.ref]
        });
        const node = result.nodes[nodeTree.ref];
        fields = node.fields;
    })();

    function close() {
        inspectNode = false;
    }

    function onBooleanFieldClick() {
        odc.setValueAtKeyPath({
            base: 'nodeRef',
            keyPath: `${nodeTree.ref}.${this.id}`,
            value: this.checked
        });
    }

    function onNumberFieldChange() {
        odc.setValueAtKeyPath({
            base: 'nodeRef',
            keyPath: `${nodeTree.ref}.${this.id}`,
            value: Number(this.value)
        });
    }

    function onVector2dFieldChange() {
        const id = this.id;
        const array = [];
        for (const element of this.parentElement.children) {
            if (element.id === id) {
                array.push(Number(element.value));
            }
        }

        odc.setValueAtKeyPath({
            base: 'nodeRef',
            keyPath: `${nodeTree.ref}.${this.id}`,
            value: array
        });
    }

    function handleKeydown(event) {
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
                numberInputsStep = 0.1;
                break;
        }
    }
</script>

<style>
    #background {
        background-color: #1b2631;
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        width: 100%;
        height: 100%;
        z-index: 99;
    }

    #container {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        z-index: 100;
    }

    #header {
        font-weight: bold;
        font-size: large;
        color: white;
        padding: 0 10px;
        border-bottom: 2px solid rgb(190, 190, 190);
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
        color: white;
        padding-right: 5px;
    }

    input, textarea {
        width: 100%;
        box-sizing: border-box;
        background-color: rgb(220, 220, 220 );
    }

    input[type=number] {
        width: 60px;
    }

    .inline {
        display: inline;
        width: auto;
    }

    #closeButton {
        font-size:small;
        float: right;
        cursor: pointer;
        padding-top: 3px;
    }
</style>
<svelte:window on:keydown={handleKeydown} on:keyup={handleKeyup}/>
<div id="background" />
<div id="container">
    <div id="header">
        {nodeTree.subtype}
        <div id="closeButton" on:click={close}>X</div>
    </div>
    <ul>
        {#each Object.entries(fields) as [id, field]}
            <li>
                <label for="{id}">{id}:</label>
                {#if field.type === 'roBoolean'}
                    <input class="inline" type="checkbox" {id} checked={field.value} on:click={onBooleanFieldClick} />
                {:else if field.fieldType === 'vector2d'}
                    <input type="number" step={numberInputsStep} {id} value={field.value[0]} on:input={onVector2dFieldChange} />
                    <input type="number" step={numberInputsStep} {id} value={field.value[1]} on:input={onVector2dFieldChange} />
                {:else if field.fieldType === 'color'}
                    <ColorField integerColor={field.value} />
                {:else if field.type === 'roFloat' || field.type === 'roInt'}
                    <input type="number" step={numberInputsStep} {id} value={field.value} on:input={onNumberFieldChange} />
                {:else if field.type === 'roAssociativeArray' || field.type === 'roArray' || field.fieldType === 'node'}
                    <textarea {id} value={JSON.stringify(field.value)} rows="2" disabled></textarea>
                {:else}
                    <textarea {id} value={field.value} rows="2"></textarea>
                {/if}
            </li>
        {/each}
    </ul>
</div>
