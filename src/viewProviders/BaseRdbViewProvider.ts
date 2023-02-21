import * as rta from 'roku-test-automation';
import type * as vscode from 'vscode';
import type { ODC } from 'roku-test-automation';
import * as fsExtra from 'fs-extra';
import * as path from 'path';

import { BaseWebviewViewProvider } from './BaseWebviewViewProvider';
import type { RtaManager } from '../managers/RtaManager';

export abstract class BaseRdbViewProvider extends BaseWebviewViewProvider {
    protected rtaManager?: RtaManager;

    protected odcCommands: Array<ODC.RequestTypes>;

    constructor(context: vscode.ExtensionContext) {
        super(context);
        const requestTypesPath = path.join(rta.utils.getClientFilesPath(), 'requestTypes.schema.json');
        const json = JSON.parse(fsExtra.readFileSync(requestTypesPath, 'utf8'));
        this.odcCommands = json.enum;
    }

    public setRtaManager(rtaManager?: RtaManager) {
        this.rtaManager = rtaManager;
    }

    public updateDeviceAvailability() {
        this.postOrQueueMessage({
            event: 'onDeviceAvailabilityChange',
            odcAvailable: !!this.rtaManager.onDeviceComponent,
            deviceAvailable: !!this.rtaManager.device
        });
    }

    protected onViewReady() {
        // Always post back the device status so we make sure the client doesn't miss it if it got refreshed
        this.updateDeviceAvailability();
    }

    protected async handleViewMessage(message) {
        const { command, context } = message;
        if (this.odcCommands.includes(command)) {
            const response = await this.rtaManager.sendOdcRequest(this.id, command, context);
            this.postOrQueueMessage({
                ...message,
                response: response
            });
            return true;
        } else if (command === 'getStoredNodeReferences') {
            const response = this.rtaManager.getStoredNodeReferences();
            this.postOrQueueMessage({
                ...message,
                response: response
            });

            return true;
        } else if (command === 'setManualIpAddress') {
            this.rtaManager.setupRtaWithConfig({
                ...message.context,
                injectRdbOnDeviceComponent: true
            });
            return true;
        } else if (command === 'getScreenshot') {
            try {
                const result = await this.rtaManager.device.getScreenshot();
                this.postOrQueueMessage({
                    ...message,
                    response: {
                        success: true,
                        arrayBuffer: result.buffer.buffer
                    }
                });
            } catch (e) {
                this.postOrQueueMessage({
                    ...message,
                    response: {
                        success: false
                    }
                });
            }
            return true;
        }

        return false;
    }
}
