import type { ChannelPublishedEvent } from 'roku-debug';
import type { BrightScriptLaunchConfiguration } from '../DebugConfigurationProvider';
import type { RtaManager } from './RtaManager';
import type { BrightScriptCommands } from '../BrightScriptCommands';
import type { RceManager } from './RceManager';
import type { RceFinder } from '../deviceDiscovery/RceFinder';
import type { DeviceManager } from '../deviceDiscovery/DeviceManager';
import type { DeviceTargetManager } from './DeviceTargetManager';
import * as vscode from 'vscode';
import { RokuCommandsViewProvider } from '../viewProviders/RokuCommandsViewProvider';
import { RokuDeviceViewViewProvider } from '../viewProviders/RokuDeviceViewViewProvider';
import { RokuFileSystemViewViewProvider } from '../viewProviders/RokuFileSystemViewViewProvider';
import { RokuAppOverlaysViewViewProvider } from '../viewProviders/RokuAppOverlaysViewViewProvider';
import { RokuRegistryViewProvider } from '../viewProviders/RokuRegistryViewProvider';
import { SceneGraphInspectorViewProvider } from '../viewProviders/SceneGraphInspectorViewProvider';
import { RokuAutomationViewViewProvider } from '../viewProviders/RokuAutomationViewViewProvider';
import { RokuReplViewProvider } from '../viewProviders/RokuReplViewProvider';
import { RceManagementViewProvider } from '../viewProviders/RceManagementViewProvider';

export class WebviewViewProviderManager {
    constructor(
        context: vscode.ExtensionContext,
        private rtaManager: RtaManager,
        rceManager: RceManager,
        rceFinder: RceFinder,
        deviceManager: DeviceManager,
        brightScriptCommands: BrightScriptCommands,
        deviceTargetManager: DeviceTargetManager
    ) {
        for (const webview of this.webviewViews) {
            if (!webview.provider) {
                webview.provider = new webview.constructor(context, {
                    rtaManager: rtaManager,
                    rceManager: rceManager,
                    rceFinder: rceFinder,
                    deviceManager: deviceManager,
                    brightScriptCommands: brightScriptCommands,
                    deviceTargetManager: deviceTargetManager
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
    }, {
        constructor: RokuReplViewProvider,
        provider: undefined as RokuReplViewProvider
    }, {
        constructor: RceManagementViewProvider,
        provider: undefined as RceManagementViewProvider
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

    public onDidTerminateDebugSession(e: vscode.DebugSession) {
        this.rtaManager.onDidTerminateDebugSession();
        for (const webview of this.webviewViews) {
            webview.provider.onDidTerminateDebugSession(e);
        }
    }

    // Notification from extension
    public onChannelPublishedEvent(e: ChannelPublishedEvent) {
        const config = e.body.launchConfiguration as BrightScriptLaunchConfiguration;
        this.rtaManager.setupRtaWithConfig(config).catch((error: Error) => console.error('Failed to set up RTA from the launch config', error));

        for (const webview of this.webviewViews) {
            void webview.provider.onChannelPublishedEvent(e);
        }
    }

    // Mainly for communicating between webviews
    public sendMessageToWebviews(viewIds: string | string[], message) {
        // console.log(`WebviewViewProviderManager: sendMessageToWebviews: ${viewIds} ${JSON.stringify(message)}`);
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
