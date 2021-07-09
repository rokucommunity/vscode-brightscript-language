<script lang="ts">
    window.vscode = acquireVsCodeApi();
    import {odc} from "../ExtensionIntermediary";
    import { nodeTreeView } from "./NodeTreeView";

    const storage = window.localStorage;
</script>

<style>
    #container {
        margin: 10px 0px;
    }
</style>
<div id="container">
    NodeTreeView
</div>
