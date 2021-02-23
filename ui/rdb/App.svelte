<script>
  import JSONTreeView from "./JSONTreeView/JSONTreeView.svelte";
  let registryValues = {};
  const vscode = acquireVsCodeApi();
  window.addEventListener("message", (event) => {
    const message = event.data;
    switch (message.type) {
      case "readRegistry":
        registryValues = message.values;
        break;
    }
  });

  function exportRegistry() {
    vscode.postMessage({
      command: 'showSaveDialog',
      content: registryValues,
    });
  }

  function importRegistry() {
    vscode.postMessage({
      command: 'showChooseFileDialog',
      type: 'importRegistry',
    });
  }
</script>

{#if Object.keys(registryValues).length > 0}
  <div>
    <button on:click={exportRegistry}>Export</button>
    <button on:click={importRegistry}>Import</button>
  </div>
  <JSONTreeView {registryValues} />
{/if}
