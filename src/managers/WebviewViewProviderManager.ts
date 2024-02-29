import type { ChannelPublishedEvent } from 'roku-debug';
import type { BrightScriptLaunchConfiguration } from '../DebugConfigurationProvider';
import type { RtaManager } from './RtaManager';
import type { BrightScriptCommands } from '../BrightScriptCommands';
import * as vscode from 'vscode';
import { RokuCommandsViewProvider } from '../viewProviders/RokuCommandsViewProvider';
import { RokuDeviceViewViewProvider } from '../viewProviders/RokuDeviceViewViewProvider';
import { RokuFileSystemViewViewProvider } from '../viewProviders/RokuFileSystemViewViewProvider';
import { RokuAppOverlaysViewViewProvider } from '../viewProviders/RokuAppOverlaysViewViewProvider';
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
        constructor: RokuAutomationViewViewProvider,
        provider: undefined as RokuAutomationViewViewProvider
    }, {
        constructor: RokuCommandsViewProvider,
        provider: undefined as RokuCommandsViewProvider
    }, {
        constructor: RokuDeviceViewViewProvider,
        provider: undefined as RokuDeviceViewViewProvider
    }, {
        constructor: RokuFileSystemViewViewProvider,
        provider: undefined as RokuFileSystemViewViewProvider
    }, {
        constructor: RokuRegistryViewProvider,
        provider: undefined as RokuRegistryViewProvider
    }, {
        constructor: RokuAppOverlaysViewViewProvider,
        provider: undefined as RokuAppOverlaysViewViewProvider
    }, {
        constructor: SceneGraphInspectorViewProvider,
        provider: undefined as SceneGraphInspectorViewProvider
    }];

    public getWebviewViewProviders() {
        const providers = [];
        for (const webview of this.webviewViews) {
            providers.push(webview.provider);
        }
        return providers;
    }

    public onDidStartDebugSession(e: vscode.DebugSession) {
        for (const webview of this.webviewViews) {
            webview.provider.onDidStartDebugSession(e);
        }
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
