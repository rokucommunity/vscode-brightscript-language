/* eslint-disable object-shorthand */
import RegistryView from './views/RegistryView.svelte';
import CommandsView from './views/CommandsView.svelte';
import SceneGraphInspectorPanel from './views/SceneGraphInspectorPanel.svelte';
import './style.css';
//export this to prevent svelte from tree-shaking it
export * from '@vscode/webview-ui-toolkit/dist/toolkit';
// Provided by ViewProviders
declare const viewName;

const views = {
    RegistryView,
    CommandsView,
    SceneGraphInspectorPanel
};

const app = new views[viewName]({
    target: document.body
});
export { app };
