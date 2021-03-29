<script>
    import JSONTreeView from "../components/JSONTreeView/JSONTreeView.svelte";
    let registryValues = {};
    const vscode = acquireVsCodeApi();
    window.addEventListener("message", (event) => {
        const message = event.data;
        switch (message.type) {
            case "readRegistry":
                registryValues = formatValues(message.values);
                break;
        }
    });

    function exportRegistry() {
        vscode.postMessage({
            command: "showSaveDialog",
            content: registryValues,
        });
    }

    function importRegistry() {
        vscode.postMessage({
            command: "showChooseFileDialog",
            type: "importRegistry",
        });
    }

    function formatValues(values) {
        let input = values;
        Object.keys(values).map((key) => {
            if (typeof values[key] == 'object') {
                input[key] = formatValues(values[key]);
            } else if (typeof values[key] == 'string' && isJSON(values[key])) {
                values[key] = JSON.parse(values[key]);
            }
        });

        return input;
    }

    function isJSON(str) {
        try {
            const jsonObject = JSON.parse(str);
            return jsonObject && typeof jsonObject === 'object';
        } catch (e) {
            return false;
        }
    }
</script>
{#if Object.keys(registryValues).length > 0}
    <div>
        <button on:click={exportRegistry}>Export</button>
        <button on:click={importRegistry}>Import</button>
    </div>
    <JSONTreeView {registryValues} {vscode} />
{/if}
