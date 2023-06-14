import * as rta from 'roku-test-automation';
import { ViewProviderEvent } from '../viewProviders/ViewProviderEvent';
import { ViewProviderId } from '../viewProviders/ViewProviderId';
import { vscodeContextManager } from './VscodeContextManager';
import type { WebviewViewProviderManager } from './WebviewViewProviderManager';

export class RtaManager {
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

        for (const webviewProvider of this.webviewViewProviderManager.getWebviewViewProviders()) {
            if (typeof webviewProvider.updateDeviceAvailability === 'function') {
                webviewProvider.updateDeviceAvailability();
            }
        }

        if (config.disableScreenSaver) {
            void this.onDeviceComponent?.disableScreenSaver({ disableScreensaver: true });
        }
    }

    public async sendOdcRequest(requestorId: string, command: string, context: { args: any; options: any }) {
        const { args, options } = context;

        if (command === rta.RequestType.findNodesAtLocation) {
            if (!this.lastStoreNodesResponse) {
                args.includeBoundingRectInfo = true;
                await this.sendOdcRequest(requestorId, rta.RequestType.storeNodeReferences, args);
            }
            context.args.nodeTreeResponse = this.lastStoreNodesResponse;
            let { matches } = await rta.odc.findNodesAtLocation(args, options);
            if (requestorId === ViewProviderId.rokuDeviceView) {
                if (matches.length) {
                    const match = { ...matches[0] };
                    // Remove children as this is where most of the payload is and we don't need this info
                    match.children = [];
                    matches = [match];
                }
            }
            return {
                matches: matches
            };
        } else if (command === rta.RequestType.storeNodeReferences) {
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
}
