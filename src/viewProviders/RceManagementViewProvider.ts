import * as vscode from 'vscode';
import type { DeviceOut } from 'roku-deploy';
import { BaseWebviewViewProvider } from './BaseWebviewViewProvider';
import { ViewProviderId } from './ViewProviderId';
import { ViewProviderCommand } from './ViewProviderCommand';
import { ViewProviderEvent } from './ViewProviderEvent';
import type { RceManager } from '../managers/RceManager';

export class RceManagementViewProvider extends BaseWebviewViewProvider {
    public readonly id = ViewProviderId.rceManagementView;

    constructor(context: vscode.ExtensionContext, dependencies) {
        super(context, dependencies);

        this.rceManager = dependencies.rceManager;

        this.unsubscribeFromTokenChanged = this.rceManager.onTokenChanged(() => {
            void this.pushState();
        });

        this.addMessageCommandCallback(ViewProviderCommand.getRceState, async (message) => {
            const state = await this.buildStatePayload();
            this.postOrQueueMessage(this.createResponseMessage(message, state));
            return true;
        });

        this.addMessageCommandCallback(ViewProviderCommand.setRceActiveAccount, async (message) => {
            const accountName = message.context.name;
            await this.rceManager.setActiveAccount(accountName);
            //the token-changed handler will push the refreshed state once the switch takes effect
            this.postOrQueueMessage(this.createResponseMessage(message, { success: true }));
            return true;
        });

        this.addMessageCommandCallback(ViewProviderCommand.runRceAccountCommand, async (message) => {
            const accountCommand = message.context.command;
            if (!RceManagementViewProvider.allowedAccountCommands.includes(accountCommand)) {
                throw new Error(`Rejected unsupported Cloud Emulator account command '${accountCommand}'`);
            }
            await vscode.commands.executeCommand(`extension.brightscript.rce.${accountCommand}`);
            this.postOrQueueMessage(this.createResponseMessage(message, { success: true }));
            //the prompt may have been cancelled without changing the token, so refresh explicitly
            await this.pushState();
            return true;
        });

        this.addMessageCommandCallback(ViewProviderCommand.createRceDevice, async (message) => {
            try {
                const managementClient = await this.rceManager.getClient();
                if (!managementClient) {
                    throw new Error('No active Cloud Emulator account is configured');
                }
                const { name, deviceType, note } = message.context;
                /* eslint-disable camelcase -- the RCE management api uses snake_case fields */
                const createdDevice = await managementClient.createDevice({
                    name: name,
                    device_type: deviceType,
                    note: note
                });
                /* eslint-enable camelcase */
                this.postOrQueueMessage(this.createResponseMessage(message, { device: createdDevice }));
            } catch (error) {
                this.postOrQueueMessage(this.createResponseMessage(message, undefined, { message: (error as Error).message }));
            }
            await this.pushState();
            return true;
        });

        this.addMessageCommandCallback(ViewProviderCommand.startRceDevice, async (message) => {
            try {
                const managementClient = await this.rceManager.getClient();
                if (!managementClient) {
                    throw new Error('No active Cloud Emulator account is configured');
                }
                const deviceId = message.context.deviceId;
                const devices = await managementClient.listDevices();
                const device = devices.find((candidateDevice) => candidateDevice.id === deviceId);
                if (!device) {
                    throw new Error(`Device ${deviceId} was not found`);
                }
                if (!device.last_snapshot_id) {
                    throw new Error(`Device '${device.name}' has no snapshot to start from; create a snapshot before starting it`);
                }

                let firmwareVersionId = device.firmware_version_id;
                if (!firmwareVersionId) {
                    const firmwareVersions = await managementClient.listFirmwareVersions();
                    firmwareVersionId = firmwareVersions.find((firmwareVersion) => firmwareVersion.device_type === device.device_type)?.firmware_version_id;
                }
                if (!firmwareVersionId) {
                    throw new Error(`No firmware version is available for device type '${device.device_type}'`);
                }

                /* eslint-disable camelcase -- the RCE management api uses snake_case fields */
                const startedDevice = await managementClient.startDevice(deviceId, {
                    snapshot_id: device.last_snapshot_id,
                    firmware_version_id: firmwareVersionId,
                    max_runtime: 3600
                });
                /* eslint-enable camelcase */
                this.postOrQueueMessage(this.createResponseMessage(message, { device: startedDevice }));
            } catch (error) {
                this.postOrQueueMessage(this.createResponseMessage(message, undefined, { message: (error as Error).message }));
            }
            await this.pushState();
            return true;
        });

        this.addMessageCommandCallback(ViewProviderCommand.stopRceDevice, async (message) => {
            try {
                const managementClient = await this.rceManager.getClient();
                if (!managementClient) {
                    throw new Error('No active Cloud Emulator account is configured');
                }
                const deviceId = message.context.deviceId;
                const stoppedDevice = await managementClient.stopDevice(deviceId);
                this.postOrQueueMessage(this.createResponseMessage(message, { device: stoppedDevice }));
            } catch (error) {
                this.postOrQueueMessage(this.createResponseMessage(message, undefined, { message: (error as Error).message }));
            }
            await this.pushState();
            return true;
        });
    }

    private rceManager: RceManager;
    private unsubscribeFromTokenChanged: () => void;

    private static readonly allowedAccountCommands = ['addAccount', 'switchAccount', 'removeAccount'];

    public dispose() {
        this.unsubscribeFromTokenChanged?.();
        super.dispose();
    }

    protected onViewReady() {
        void this.pushState();
    }

    private async buildStatePayload(): Promise<RceManagementViewState> {
        const accounts = await this.rceManager.getAccounts();
        const activeAccount = await this.rceManager.getActiveAccount();
        const hasToken = await this.rceManager.hasToken();

        const state: RceManagementViewState = {
            accounts: accounts.map((account) => account.name),
            activeAccountName: activeAccount?.name,
            hasToken: hasToken,
            devices: undefined
        };

        const managementClient = await this.rceManager.getClient();
        if (managementClient) {
            try {
                state.devices = await managementClient.listDevices();
            } catch (error) {
                state.error = (error as Error).message;
            }
        }

        return state;
    }

    private async pushState() {
        const state = await this.buildStatePayload();
        this.postOrQueueMessage(this.createEventMessage(ViewProviderEvent.onRceStateChanged, state));
    }
}

interface RceManagementViewState {
    accounts: string[];
    activeAccountName: string | undefined;
    hasToken: boolean;
    devices: DeviceOut[] | undefined;
    error?: string;
}
