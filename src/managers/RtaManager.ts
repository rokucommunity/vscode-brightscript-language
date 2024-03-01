import * as fs from 'fs';
import * as path from 'path';
import * as rta from 'roku-test-automation';
import * as vscode from 'vscode';
import { ViewProviderEvent } from '../viewProviders/ViewProviderEvent';
import { ViewProviderId } from '../viewProviders/ViewProviderId';
import { vscodeContextManager } from './VscodeContextManager';
import type { WebviewViewProviderManager } from './WebviewViewProviderManager';
import { VscodeCommand } from '../commands/VscodeCommand';

export class RtaManager {
    constructor(
        context: vscode.ExtensionContext
    ) {
        context.subscriptions.push(vscode.commands.registerCommand(VscodeCommand.disconnectFromDevice, () => {
            void this.onDeviceComponent?.shutdown();
            this.onDeviceComponent = undefined;
            void vscodeContextManager.set('brightscript.isOnDeviceComponentAvailable', false);
            this.updateDeviceAvailabilityOnWebViewProviders();
        }));
    }

    public onDeviceComponent?: rta.OnDeviceComponent;
    public device?: rta.RokuDevice;

    private webviewViewProviderManager?: WebviewViewProviderManager;
    private lastStoreNodesResponse: Awaited<ReturnType<typeof rta.odc.storeNodeReferences>>;

    public setupRtaWithConfig(config: { host: string; password: string; logLevel?: string; disableScreenSaver?: boolean; injectRdbOnDeviceComponent?: boolean }) {
        const enableDebugging = ['info', 'debug', 'trace'].includes(config.logLevel);
        const rtaConfig: rta.ConfigOptions = {
            RokuDevice: {
                devices: [{
                    host: config.host,
                    password: config.password
                }]
            },
            OnDeviceComponent: {
                logLevel: enableDebugging ? 'verbose' : undefined,
                clientDebugLogging: enableDebugging,
                disableTelnet: true,
                disableCallOriginationLine: true
            }
        };

        rta.odc.setConfig(rtaConfig);

        rta.ecp.setConfig(rtaConfig);

        this.device = rta.device;

        if (config.injectRdbOnDeviceComponent) {
            this.onDeviceComponent = rta.odc;
        } else {
            void this.onDeviceComponent?.shutdown();
            this.onDeviceComponent = undefined;
        }
        void vscodeContextManager.set('brightscript.isOnDeviceComponentAvailable', !!this.onDeviceComponent);

        this.updateDeviceAvailabilityOnWebViewProviders();

        if (config.disableScreenSaver) {
            void this.onDeviceComponent?.disableScreenSaver({ disableScreensaver: true });
        }
    }

    public async sendOdcRequest(requestorId: string, command: string, context: { args: any; options: any }) {
        const { args, options } = context;

        if (command === rta.RequestType.storeNodeReferences) {
            this.lastStoreNodesResponse = await rta.odc.storeNodeReferences(args, options);

            const viewIds = [];
            if (requestorId === ViewProviderId.rokuDeviceView) {
                viewIds.push(ViewProviderId.sceneGraphInspectorView);
            } else if (requestorId === ViewProviderId.sceneGraphInspectorView) {
                viewIds.push(ViewProviderId.rokuDeviceView);
            }
            this.webviewViewProviderManager.sendMessageToWebviews(viewIds, {
                event: ViewProviderEvent.onStoredNodeReferencesUpdated
            });
            return this.lastStoreNodesResponse;
        } else if (command === rta.RequestType.writeFile) {
            // We can't access files from the webview so we just store the path and access it in node instead
            const directoryPath = path.dirname(args.destinationPath);
            // We always try to make the directory. Doesn't fail if it already exists
            await rta.odc.createDirectory({
                path: directoryPath
            });

            return rta.odc.writeFile({
                binaryPayload: fs.readFileSync(args.sourcePath),
                path: args.destinationPath
            }, options);
        } else {
            return this.onDeviceComponent[command](args, options);
        }
    }

    public setWebviewViewProviderManager(manager: WebviewViewProviderManager) {
        this.webviewViewProviderManager = manager;
    }

    public getStoredNodeReferences() {
        return this.lastStoreNodesResponse;
    }

    private updateDeviceAvailabilityOnWebViewProviders() {
        for (const webviewProvider of this.webviewViewProviderManager.getWebviewViewProviders()) {
            if (typeof webviewProvider.updateDeviceAvailability === 'function') {
                webviewProvider.updateDeviceAvailability();
            }
        }
    }
}
