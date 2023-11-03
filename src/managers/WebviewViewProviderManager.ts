import type { ChannelPublishedEvent } from 'roku-debug';
import type { BrightScriptLaunchConfiguration } from '../DebugConfigurationProvider';
import type { RtaManager } from './RtaManager';
import type { BrightScriptCommands } from '../BrightScriptCommands';
import * as vscode from 'vscode';
import { RokuCommandsViewProvider } from '../viewProviders/RokuCommandsViewProvider';
import { RokuDeviceViewViewProvider } from '../viewProviders/RokuDeviceViewViewProvider';
import { RokuRegistryViewProvider } from '../viewProviders/RokuRegistryViewProvider';
import { SceneGraphInspectorViewProvider } from '../viewProviders/SceneGraphInspectorViewProvider';
import { RokuAutomationViewViewProvider } from '../viewProviders/RokuAutomationViewViewProvider';

export class WebviewViewProviderManager {
    constructor(
        context: vscode.ExtensionContext,
        private rtaManager: RtaManager,
        brightScriptCommands: BrightScriptCommands
    ) {

        for (const webview of this.webviewViews) {
            if (!webview.provider) {
                webview.provider = new webview.constructor(context, {
                    rtaManager: rtaManager,
                    brightScriptCommands: brightScriptCommands
                });
                vscode.window.registerWebviewViewProvider(webview.provider.id, webview.provider);

                webview.provider.setWebviewViewProviderManager(this);
            }
        }
    }

    private webviewViews = [{
        constructor: SceneGraphInspectorViewProvider,
        provider: undefined as SceneGraphInspectorViewProvider
    }, {
        constructor: RokuRegistryViewProvider,
        provider: undefined as RokuRegistryViewProvider
    }, {
        constructor: RokuCommandsViewProvider,
        provider: undefined as RokuCommandsViewProvider
    }, {
        constructor: RokuDeviceViewViewProvider,
        provider: undefined as RokuDeviceViewViewProvider
    }, {
        constructor: RokuAutomationViewViewProvider,
        provider: undefined as RokuAutomationViewViewProvider
    }];

    public getWebviewViewProviders() {
        const providers = [];
        for (const webview of this.webviewViews) {
            providers.push(webview.provider);
        }
        return providers;
    }

    // Notification from extension
    public onChannelPublishedEvent(e: ChannelPublishedEvent) {
        const config = e.body.launchConfiguration as BrightScriptLaunchConfiguration;
        this.rtaManager.setupRtaWithConfig(config);

        for (const webview of this.webviewViews) {
            void webview.provider.onChannelPublishedEvent(e);
        }
    }

    // Mainly for communicating between webviews
    public sendMessageToWebviews(viewIds: string | string[], message) {
        if (typeof viewIds === 'string') {
            viewIds = [viewIds];
        }

        for (const webviewView of this.webviewViews) {
            if (viewIds.includes(webviewView.provider.id)) {
                webviewView.provider.postOrQueueMessage(message);
            }
        }
    }
}
