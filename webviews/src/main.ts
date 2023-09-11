/* eslint-disable object-shorthand */
import rokuRegistryView from './views/RokuRegistryView/RokuRegistryView.svelte';
import rokuCommandsView from './views/RokuCommandsView/RokuCommandsView.svelte';
import rokuDeviceView from './views/RokuDeviceView/RokuDeviceView.svelte';
import sceneGraphInspectorView from './views/SceneGraphInspectorView/SceneGraphInspectorView.svelte';
import rokuAutomationView from './views/RokuAutomationView/RokuAutomationView.svelte';
import { provideVSCodeDesignSystem, allComponents } from '@vscode/webview-ui-toolkit';

import './style.css';

//write toolkit to window this to prevent svelte from tree-shaking it
import * as toolkit from '@vscode/webview-ui-toolkit/dist/toolkit';
(window as any).___toolkit = toolkit;

// In order to use the Webview UI Toolkit web components they
// must be registered with the browser (i.e. webview) using the
// syntax below.
provideVSCodeDesignSystem().register(allComponents);

// Provided by ViewProviders
declare const viewName;

//these need to exactly match the names from the "views" contributions in package.json
const views = {
    rokuRegistryView,
    rokuCommandsView,
    rokuDeviceView,
    sceneGraphInspectorView,
    rokuAutomationView
};

const app = new views[viewName]({
    target: document.body
});
export default app;
