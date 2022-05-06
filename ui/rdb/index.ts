import RegistryView from './views/RegistryView.svelte';
import CommandsView from './views/CommandsView.svelte';
import NodeTreeView from './views/NodeTreeView.svelte';
import './style.css';
//have to "export" this to prevent svelte from tree-shaking it
export * from '@vscode/webview-ui-toolkit/dist/toolkit';
declare const viewName; // Provided by ViewProviders
let view;

switch (viewName) {
    case 'RegistryView':
        view = RegistryView;
        break;
    case 'CommandsView':
        view = CommandsView;
        break;
    case 'NodeTreeView':
        view = NodeTreeView;
        break;
}
const app = new view({
    target: document.body
});
export { app };
