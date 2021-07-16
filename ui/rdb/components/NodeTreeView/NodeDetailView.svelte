<script lang="ts">
    import type * as rta from 'roku-test-automation';
    import { odc } from '../../ExtensionIntermediary';

    export let nodeTree: rta.ODC.NodeTree;
    export let inspectNode: boolean;

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
        })
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
                    <input class="inline" {id} value={field.value[0]} size="2" /> <input class="inline" {id} value={field.value[1]} size="2" />
                {:else if field.type === 'roFloat' || field.type === 'roInt'}
                    <input class="inline" {id} value={field.value} size="2" />
                {:else if field.type === 'roAssociativeArray' || field.type === 'roArray' || field.fieldType === 'node'}
                    <textarea {id} value={JSON.stringify(field.value)} rows="2" disabled></textarea>
                {:else}
                    <textarea {id} value={field.value} rows="2"></textarea>
                {/if}
            </li>
        {/each}
    </ul>
</div>
