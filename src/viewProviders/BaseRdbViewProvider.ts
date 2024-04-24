import * as rta from 'roku-test-automation';
import type * as vscode from 'vscode';
import type { RequestType } from 'roku-test-automation';
import * as fsExtra from 'fs-extra';
import * as path from 'path';

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

    public updateDeviceAvailability() {
        const message = this.createEventMessage(ViewProviderEvent.onDeviceAvailabilityChange, {
            odcAvailable: !!this.dependencies.rtaManager.onDeviceComponent,
            deviceAvailable: !!this.dependencies.rtaManager.device
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

        this.addMessageCommandCallback(ViewProviderCommand.getStoredNodeReferences, (message) => {
            const response = this.dependencies.rtaManager.getStoredNodeReferences();
            this.postOrQueueMessage(this.createResponseMessage(message, response));
            return Promise.resolve(true);
        });
    }

    protected onViewReady() {
        // Always post back the device status so we make sure the client doesn't miss it if it got refreshed
        this.updateDeviceAvailability();
    }
}
