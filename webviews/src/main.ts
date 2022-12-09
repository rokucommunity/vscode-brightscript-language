/* eslint-disable object-shorthand */
import rokuRegistryView from './views/RokuRegistryView/RokuRegistryView.svelte';
import rokuCommandsView from './views/RokuCommandsView/RokuCommandsView.svelte';
import sceneGraphInspectorView from './views/SceneGraphInspectorView/SceneGraphInspectorView.svelte';
import './style.css';
//export this to prevent svelte from tree-shaking it
export * from '@vscode/webview-ui-toolkit/dist/toolkit';
// Provided by ViewProviders
declare const viewName;

//these need to exactly match the names from the "views" contributions in package.json
const views = {
    rokuRegistryView,
    rokuCommandsView,
    sceneGraphInspectorView
};

const app = new views[viewName]({
    target: document.getElementById('app')
});
export default app;
