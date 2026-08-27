/* eslint-disable object-shorthand */
import { provideVSCodeDesignSystem, allComponents } from '@vscode/webview-ui-toolkit';
import rokuAutomationView from './views/RokuAutomationView/RokuAutomationView.svelte';
import rokuCommandsView from './views/RokuCommandsView/RokuCommandsView.svelte';
import rokuDeviceView from './views/RokuDeviceView/RokuDeviceView.svelte';
import rokuFileSystemView from './views/RokuFileSystemView/RokuFileSystemView.svelte';
import rokuRegistryView from './views/RokuRegistryView/RokuRegistryView.svelte';
import rokuAppOverlaysView from './views/RokuAppOverlaysView/RokuAppOverlaysView.svelte';
import sceneGraphInspectorView from './views/SceneGraphInspectorView/SceneGraphInspectorView.svelte';
import rokuReplView from './views/RokuReplView/RokuReplView.svelte';
import rceManagementView from './views/RceManagementView/RceManagementView.svelte';
import rceVideoView from './views/RceVideoView/RceVideoView.svelte';


import './style.css';

// Provided by ViewProviders
declare const viewName;

//these need to exactly match the names from the "views" contributions in package.json
const views = {
    rokuAutomationView,
    rokuCommandsView,
    rokuDeviceView,
    rokuFileSystemView,
    rokuRegistryView,
    rokuAppOverlaysView,
    sceneGraphInspectorView,
    rokuReplView,
    rceManagementView,
    rceVideoView
};

/**
 * Registers the custom elements the current page's view renders. Registration is per page (each
 * view is its own webview document), which is what makes it safe for different views to use
 * different component libraries even though several tag names exist in both.
 */
async function registerComponentLibrary() {
    if (viewName === 'rceManagementView') {
        //experiment: the management view uses the maintained vscode-elements library instead of
        //the deprecated webview-ui-toolkit. The toolkit must not also be registered on this page
        //(several tag names like vscode-button and vscode-option exist in both libraries); the
        //dynamic imports keep the library and the codicon font off every other page
        await import('@vscode-elements/elements');

        //vscode-icon (which vscode-toolbar-button renders) requires the codicon stylesheet to be
        //linked in the page with this exact id, so it can adopt the styles into its shadow root
        //(the url stays inside the page's <base href> thanks to vite's relative base setting)
        const codiconStylesheetUrl = (await import('@vscode/codicons/dist/codicon.css?url')).default;
        const codiconLink = document.createElement('link');
        codiconLink.id = 'vscode-codicon-stylesheet';
        codiconLink.rel = 'stylesheet';
        codiconLink.href = codiconStylesheetUrl;
        document.head.appendChild(codiconLink);
    } else {
        //the dist/toolkit module SELF-REGISTERS every toolkit component as a side effect of being
        //imported (its final line calls register(allComponents)), so even its import has to stay
        //page-conditional or it would claim the shared tag names before vscode-elements can.
        //Assigning it to window also keeps the bundler from tree-shaking it away.
        const toolkit = await import('@vscode/webview-ui-toolkit/dist/toolkit');
        (window as any).___toolkit = toolkit;

        // In order to use the Webview UI Toolkit web components they
        // must be registered with the browser (i.e. webview) using the
        // syntax below.
        provideVSCodeDesignSystem().register(allComponents);
    }
}

void registerComponentLibrary().then(() => {
    return new views[viewName]({
        target: document.body
    });
});
