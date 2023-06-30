<script lang="ts">
    export let value = false;
</script>

<style>
    label {
        display: flex;
        align-items: flex-start;
        cursor: pointer;
    }
    vscode-checkbox {
        margin-right: 5px;
    }
    div {
        margin-top: 4px;
    }
</style>

<label>
    <vscode-checkbox
        checked={value}
        onChange={(e) => (value = e.srcElement.checked)} />
    <div><slot /></div>
</label>
