/* eslint-disable object-shorthand */
import rokuRegistryView from './views/RokuRegistryView/RokuRegistryView.svelte';
import rokuCommandsView from './views/RokuCommandsView/RokuCommandsView.svelte';
import rokuDeviceView from './views/RokuDeviceView/RokuDeviceView.svelte';
import sceneGraphInspectorView from './views/SceneGraphInspectorView/SceneGraphInspectorView.svelte';
import './style.css';

//write toolkit to window this to prevent svelte from tree-shaking it
import * as toolkit from '@vscode/webview-ui-toolkit/dist/toolkit';
(window as any).___toolkit = toolkit;

// Provided by ViewProviders
declare const viewName;

//these need to exactly match the names from the "views" contributions in package.json
const views = {
    rokuRegistryView,
    rokuCommandsView,
    rokuDeviceView,
    sceneGraphInspectorView
};

const app = new views[viewName]({
    target: document.body
});
export default app;
