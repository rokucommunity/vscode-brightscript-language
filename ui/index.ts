/* eslint-disable object-shorthand */
import RegistryPanel from './panels/RegistryPanel/RegistryPanel.svelte';
import CommandsPanel from './panels/CommandsPanel/CommandsPanel.svelte';
import SceneGraphInspectorPanel from './panels/SceneGraphInspectorPanel/SceneGraphInspectorPanel.svelte';
import './style.css';
//export this to prevent svelte from tree-shaking it
export * from '@vscode/webview-ui-toolkit/dist/toolkit';
// Provided by ViewProviders
declare const viewName;

const views = {
    RegistryPanel,
    CommandsPanel,
    SceneGraphInspectorPanel
};

const app = new views[viewName]({
    target: document.body
});
export { app };
