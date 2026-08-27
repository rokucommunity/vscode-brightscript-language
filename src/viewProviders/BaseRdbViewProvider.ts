import * as rta from 'roku-test-automation';
import type * as vscode from 'vscode';
import type { RequestType } from 'roku-test-automation';
import type { DeviceConfig } from 'roku-deploy';
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
            deviceAvailable: !!this.dependencies.rtaManager.device,
            isRceDebugSession: !!this.dependencies.rtaManager.isRceDebugSession
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

        this.addMessageCommandCallback(ViewProviderCommand.connectToDevice, async (message) => {
            const { deviceTargetManager, rtaManager } = this.dependencies;

            try {
                const target = await deviceTargetManager.resolveTargetDevice();
                if (!target) {
                    this.postOrQueueMessage(this.createResponseMessage(message, { status: 'cancelled' }));
                    return true;
                }

                const password = await deviceTargetManager.resolveValidatedPassword(target.device, target.serialNumber, target.label);
                if (password === undefined) {
                    this.postOrQueueMessage(this.createResponseMessage(message, { status: 'cancelled' }));
                    return true;
                }

                await rtaManager.setupRtaWithDeviceTarget(target.device, password, { injectRdbOnDeviceComponent: true });
                this.postOrQueueMessage(this.createResponseMessage(message, { status: 'success' }));
                //fire-and-forget: a stream-start failure for the connected device is this hook's own
                //problem to surface (see RokuDeviceViewViewProvider's override), not a reason to turn
                //an otherwise-successful RTA connect into an error response
                this.onDeviceConnected(target.device);
            } catch (e) {
                this.postOrQueueMessage(this.createResponseMessage(message, { status: 'error', message: e?.message }));
            }
            return true;
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
        this.updateDeviceAvailability();
    }

    /**
     * Called after a manual connectToDevice succeeds, with the device the button just connected RTA
     * to. No-op by default; RokuDeviceViewViewProvider overrides this to route a Roku Cloud Emulator
     * target into its video stream, since the button flow only sets up RTA and otherwise leaves that
     * view stuck on the LAN screenshot loop.
     */
    protected onDeviceConnected(target: DeviceConfig) {
        // no-op by default
    }
}
