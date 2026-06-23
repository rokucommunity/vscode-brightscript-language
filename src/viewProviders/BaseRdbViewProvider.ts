import * as rta from 'roku-test-automation';
import type * as vscode from 'vscode';
import type { RequestType } from 'roku-test-automation';
import * as fsExtra from 'fs-extra';
import * as path from 'path';
import { rokuDeploy } from 'roku-deploy';

import { BaseWebviewViewProvider } from './BaseWebviewViewProvider';
import { ViewProviderEvent } from './ViewProviderEvent';
import { ViewProviderCommand } from './ViewProviderCommand';


export abstract class BaseRdbViewProvider extends BaseWebviewViewProvider {
    protected odcCommands: Array<RequestType>;

    constructor(context: vscode.ExtensionContext, dependencies) {
        super(context, dependencies);
        const requestTypesPath = path.join(rta.utils.getClientFilesPath(), 'requestTypes.schema.json');
        const json = JSON.parse(fsExtra.readFileSync(requestTypesPath, 'utf8'));
        this.odcCommands = Object.values(json.enum);

        this.setupCommandObservers();
    }

    /**
     * Update the device availability status and send it to the webview.
     * This method is asynchronous because it fetches device info from the network,
     * which may take time and could fail. Callers should use `void` or `await`
     * as appropriate for their context.
     */
    public async updateDeviceAvailability() {
        const device = this.dependencies.rtaManager.device;
        const deviceConfig = this.dependencies.rtaManager.deviceConfig;
        let deviceInfo = null;

        // Try to get device info if device is available
        if (device && deviceConfig) {
            try {
                const info = await rokuDeploy.getDeviceInfo({
                    host: deviceConfig.host,
                    timeout: 5000
                });
                deviceInfo = info;
            } catch (e) {
                // Device might be temporarily unavailable, just continue without device info
                console.error('Failed to get device info:', e);
            }
        }

        const message = this.createEventMessage(ViewProviderEvent.onDeviceAvailabilityChange, {
            odcAvailable: !!this.dependencies.rtaManager.onDeviceComponent,
            deviceAvailable: !!device,
            deviceInfo: deviceInfo
        });

        this.postOrQueueMessage(message);
    }

    protected setupCommandObservers() {
        for (const command of this.odcCommands) {
            this.addMessageCommandCallback(command, async (message) => {
                const { command, context } = message;
                const response = await this.dependencies.rtaManager.sendOdcRequest(this.id, command, context);
                this.postOrQueueMessage(this.createResponseMessage(message, response));
                return true;
            });
        }

        this.addMessageCommandCallback(ViewProviderCommand.setManualIpAddress, (message) => {
            this.dependencies.rtaManager.setupRtaWithConfig({
                ...message.context,
                injectRdbOnDeviceComponent: true
            });
            return Promise.resolve(true);
        });

        this.addMessageCommandCallback(ViewProviderCommand.getStoredAppUI, (message) => {
            const response = this.dependencies.rtaManager.getStoredAppUI();
            this.postOrQueueMessage(this.createResponseMessage(message, response));
            return Promise.resolve(true);
        });

        this.addMessageCommandCallback(ViewProviderCommand.getAppUI, async (message) => {
            try {
                const appUIResponse = await this.dependencies.rtaManager.getAppUI(this.id);

                this.postOrQueueMessage(this.createResponseMessage(message, {
                    success: true,
                    response: appUIResponse
                }));
            } catch (e) {
                this.postOrQueueMessage(this.createResponseMessage(message, {
                    success: false
                }));
            }
            return true;
        });
    }

    protected onViewReady() {
        // Always post back the device status so we make sure the client doesn't miss it if it got refreshed
        void this.updateDeviceAvailability();
    }
}
