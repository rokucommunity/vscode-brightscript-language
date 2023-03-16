import type { ChannelPublishedEvent } from 'roku-debug';
import type { BrightScriptLaunchConfiguration } from '../DebugConfigurationProvider';
import type { RtaManager } from './RtaManager';
import * as vscode from 'vscode';
import { RokuCommandsViewProvider } from '../viewProviders/RokuCommandsViewProvider';
import { RokuDeviceViewViewProvider } from '../viewProviders/RokuDeviceViewViewProvider';
import { RokuRegistryViewProvider } from '../viewProviders/RokuRegistryViewProvider';
import { SceneGraphInspectorViewProvider } from '../viewProviders/SceneGraphInspectorViewProvider';


export class WebviewViewProviderManager {
    constructor(context: vscode.ExtensionContext, rtaManager: RtaManager) {
        this.rtaManager = rtaManager;

        for (const webview of this.webviewViews) {
            if (!webview.provider) {
                webview.provider = new webview.constructor(context);
                vscode.window.registerWebviewViewProvider(webview.provider.id, webview.provider);

                webview.provider.setWebviewViewProviderManager(this);

                if (typeof webview.provider.setRtaManager === 'function') {
                    webview.provider.setRtaManager(this.rtaManager);
                }
            }
        }
    }

    private rtaManager?: RtaManager;

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

    public dispose() {
        for (const webviewView of this.webviewViews) {
            webviewView?.provider?.dispose();
        }
    }
}
