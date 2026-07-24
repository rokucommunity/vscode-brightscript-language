import * as vscode from 'vscode';
import type { DeviceOut, DeviceRun, RceDeviceConfig, SnapshotOut } from 'roku-deploy';
import { RceDevice } from 'roku-deploy';
import { BaseWebviewViewProvider } from './BaseWebviewViewProvider';
import { ViewProviderId } from './ViewProviderId';
import { ViewProviderCommand } from './ViewProviderCommand';
import { ViewProviderEvent } from './ViewProviderEvent';
import { WorkspaceStateKey } from './WorkspaceStateKey';
import { VscodeCommand } from '../commands/VscodeCommand';
import type { RceManager } from '../managers/RceManager';
import type { RceFinder } from '../deviceDiscovery/RceFinder';
import type { RceStreamRequestConfig } from './RokuDeviceViewViewProvider';

export class RceManagementViewProvider extends BaseWebviewViewProvider {
    public readonly id = ViewProviderId.rceManagementView;

    constructor(context: vscode.ExtensionContext, dependencies) {
        super(context, dependencies);

        this.rceManager = dependencies.rceManager;
        this.rceFinder = dependencies.rceFinder;

        this.unsubscribeFromTokenChanged = this.rceManager.onTokenChanged(() => {
            void this.pushState();
        });

        //the finder already polls (continuously while started, and one-shot via scan()) and emits the
        //full device list on every successful poll; reusing that here avoids the panel owning its own
        //poll loop, and keeps it in sync with whatever else is driving the finder (the Devices tree view)
        this.rceFinder.on('devices', this.handleFinderDevices);

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
                this.startTransitionWatch();
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
                const explicitSnapshotId = message.context.snapshotId;
                const devices = await managementClient.listDevices();
                const device = devices.find((candidateDevice) => candidateDevice.id === deviceId);
                if (!device) {
                    throw new Error(`Device ${deviceId} was not found`);
                }

                //fetched up front: the live snapshot participates in resolving which snapshot to start from,
                //and the chosen snapshot's firmware id is looked up from this same list further down
                const snapshots = await managementClient.listSnapshots(deviceId);

                const rememberedSnapshotId = this.getRememberedSnapshotId(deviceId);
                const rememberedSnapshotStillExists = rememberedSnapshotId !== undefined && (device.snapshots ?? []).includes(rememberedSnapshotId);
                const liveSnapshotId = snapshots.find((snapshot) => snapshot.live)?.id;
                const rememberedOrLiveOrLastSnapshotId = (rememberedSnapshotStillExists ? rememberedSnapshotId : undefined) ?? liveSnapshotId ?? device.last_snapshot_id ?? undefined;
                const snapshotId = explicitSnapshotId ?? rememberedOrLiveOrLastSnapshotId;
                if (!snapshotId) {
                    throw new Error(`Device '${device.name}' has no snapshot to start from; create a snapshot before starting it`);
                }

                const chosenSnapshot = snapshots.find((snapshot) => snapshot.id === snapshotId);

                let firmwareVersionId = chosenSnapshot?.firmware_version_id ?? device.firmware_version_id;
                if (!firmwareVersionId) {
                    const firmwareVersions = await managementClient.listFirmwareVersions();
                    firmwareVersionId = firmwareVersions.find((firmwareVersion) => firmwareVersion.device_type === device.device_type)?.firmware_version_id;
                }
                if (!firmwareVersionId) {
                    throw new Error(`No firmware version is available for device type '${device.device_type}'`);
                }

                /* eslint-disable camelcase -- the RCE management api uses snake_case fields */
                const startedDevice = await managementClient.startDevice(deviceId, {
                    snapshot_id: snapshotId,
                    firmware_version_id: firmwareVersionId,
                    max_runtime: 3600
                });
                /* eslint-enable camelcase */
                //only remember an explicit user pick; a resolved default (remembered/live/last) must not
                //get written back, or the default would silently harden into "remembered" and stop tracking live
                if (explicitSnapshotId !== undefined) {
                    await this.rememberSnapshotId(deviceId, snapshotId);
                }
                this.postOrQueueMessage(this.createResponseMessage(message, { device: startedDevice }));
                this.startTransitionWatch();
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
                this.startTransitionWatch();
            } catch (error) {
                this.postOrQueueMessage(this.createResponseMessage(message, undefined, { message: (error as Error).message }));
            }
            await this.pushState();
            return true;
        });

        this.addMessageCommandCallback(ViewProviderCommand.getRceDeviceDetails, async (message) => {
            const deviceId = message.context.deviceId;
            const details = await this.buildDeviceDetailsPayload(deviceId);
            this.postOrQueueMessage(this.createResponseMessage(message, details));
            return true;
        });

        this.addMessageCommandCallback(ViewProviderCommand.updateRceDevice, async (message) => {
            try {
                const managementClient = await this.rceManager.getClient();
                if (!managementClient) {
                    throw new Error('No active Cloud Emulator account is configured');
                }
                const { deviceId, name, note } = message.context;
                const updatedDevice = await managementClient.updateDevice(deviceId, {
                    name: name,
                    note: note
                });
                this.postOrQueueMessage(this.createResponseMessage(message, { device: updatedDevice }));
            } catch (error) {
                this.postOrQueueMessage(this.createResponseMessage(message, undefined, { message: (error as Error).message }));
            }
            await this.pushState();
            return true;
        });

        this.addMessageCommandCallback(ViewProviderCommand.deleteRceSnapshot, async (message) => {
            try {
                const { deviceId, snapshotId, snapshotName } = message.context;
                const managementClient = await this.rceManager.getClient();
                if (!managementClient) {
                    throw new Error('No active Cloud Emulator account is configured');
                }

                //the delete endpoint documents no business-rule error for the live/base snapshots, so
                //those have to be refused here rather than relying on the server to reject the request
                const snapshots = await managementClient.listSnapshots(deviceId);
                const snapshot = snapshots.find((candidateSnapshot) => candidateSnapshot.id === snapshotId);
                if (!snapshot) {
                    throw new Error(`Snapshot '${snapshotName}' no longer exists`);
                }
                if (snapshot.live || snapshot.base) {
                    const protectedKinds = [];
                    if (snapshot.live) {
                        protectedKinds.push('live');
                    }
                    if (snapshot.base) {
                        protectedKinds.push('base');
                    }
                    throw new Error(`Snapshot '${snapshotName}' is this device's ${protectedKinds.join(' and ')} snapshot and cannot be deleted`);
                }

                const confirmationLabel = 'Delete';
                const confirmedLabel = await vscode.window.showWarningMessage(
                    `Delete snapshot '${snapshotName}'? This cannot be undone.`,
                    { modal: true },
                    confirmationLabel
                );
                if (confirmedLabel !== confirmationLabel) {
                    this.postOrQueueMessage(this.createResponseMessage(message, { deleted: false }));
                    return true;
                }

                await managementClient.deleteSnapshot(deviceId, snapshotId);
                this.postOrQueueMessage(this.createResponseMessage(message, { deleted: true }));
            } catch (error) {
                this.postOrQueueMessage(this.createResponseMessage(message, undefined, { message: (error as Error).message }));
            }
            await this.pushState();
            return true;
        });

        this.addMessageCommandCallback(ViewProviderCommand.enableRceDevMode, async (message) => {
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

                const instanceApiUrl = device.running_device?.instance_api_url;
                if (device.status !== 'running' || !instanceApiUrl) {
                    throw new Error(`Device '${device.name}' must be running to enable dev mode`);
                }

                const token = await this.rceManager.getToken();
                const rceDevice = this.createRceDevice({ instanceUrl: instanceApiUrl, rceToken: token });
                await rceDevice.sendDeveloperSettingsCombo();
                this.postOrQueueMessage(this.createResponseMessage(message, { success: true }));
            } catch (error) {
                this.postOrQueueMessage(this.createResponseMessage(message, undefined, { message: (error as Error).message }));
            }
            await this.pushState();
            return true;
        });

        this.addMessageCommandCallback(ViewProviderCommand.watchRceDevice, async (message) => {
            try {
                await this.resolveAndShowRceStream(message.context.deviceId);
                this.postOrQueueMessage(this.createResponseMessage(message, { success: true }));
            } catch (error) {
                this.postOrQueueMessage(this.createResponseMessage(message, undefined, { message: (error as Error).message }));
            }
            //nothing about device state changes from watching it, so there is no pushState here
            return true;
        });

        //internal command (no package.json contribution): RokuDeviceViewViewProvider's Retry action
        //re-resolves a device's current stream details this same way, since its own webview cannot
        //reach this provider directly (each webview only talks to the provider that owns it)
        this.registerCommand(VscodeCommand.rceWatchDeviceById, async (deviceId: number) => {
            await this.resolveAndShowRceStream(deviceId);
        });
    }

    /**
     * Resolve a device's current Janus stream details and hand them off to RokuDeviceViewViewProvider
     * via the rokuDeviceViewShowRceStream command. Throws (rather than reporting an error itself) so
     * both callers - the watchRceDevice message handler and the rceWatchDeviceById command used for
     * retrying - can report the failure their own way.
     */
    private async resolveAndShowRceStream(deviceId: number): Promise<void> {
        const managementClient = await this.rceManager.getClient();
        if (!managementClient) {
            throw new Error('No active Cloud Emulator account is configured');
        }
        const devices = await managementClient.listDevices();
        const device = devices.find((candidateDevice) => candidateDevice.id === deviceId);
        if (!device) {
            throw new Error(`Device ${deviceId} was not found`);
        }

        const runningDevice = device.running_device;
        //janus_id can legitimately be 0 (a valid stream id), so its presence must be checked
        //with a nullish check rather than a truthiness check
        if (device.status !== 'running' || !runningDevice?.janus_websocket_url || runningDevice?.janus_id === undefined || runningDevice?.janus_id === null) {
            throw new Error(`Device '${device.name}' must be running and expose a video stream to watch it`);
        }

        /* eslint-disable camelcase -- the RCE management api uses snake_case fields */
        const streamRequest: RceStreamRequestConfig = {
            deviceId: device.id,
            deviceName: device.name,
            websocketUrl: runningDevice.janus_websocket_url,
            streamId: runningDevice.janus_id,
            pin: runningDevice.janus_pin ?? undefined,
            janusToken: runningDevice.janus_token ?? undefined,
            iceServers: runningDevice.janus_ice_servers ?? []
        };
        /* eslint-enable camelcase */

        await vscode.commands.executeCommand(VscodeCommand.rokuDeviceViewShowRceStream, streamRequest);
    }

    /**
     * Builds the RceDevice used to talk to a running instance's api. Split out so tests can
     * substitute a fake, the same pattern as RceManager's createClient.
     */
    protected createRceDevice(config: RceDeviceConfig): RceDevice {
        return new RceDevice(config);
    }

    private rceManager: RceManager;
    private rceFinder: RceFinder;
    private unsubscribeFromTokenChanged: () => void;

    private transitionWatchIntervalId: ReturnType<typeof setInterval> | undefined;
    private transitionWatchTimeoutId: ReturnType<typeof setTimeout> | undefined;

    private static readonly allowedAccountCommands = ['addAccount', 'switchAccount', 'removeAccount'];

    /**
     * How often the transition watch re-polls the finder while a device is expected to be settling
     * (pending -> running, or pending -> shutdown)
     */
    private static readonly transitionWatchIntervalMs = 5_000;

    /**
     * Safety cutoff for the transition watch, in case a device never leaves 'pending'
     */
    private static readonly transitionWatchTimeoutMs = 3 * 60 * 1000;

    /**
     * Handles every device list the finder emits, whether from its own continuous polling, a
     * token-change re-poll, or a scan() triggered by the transition watch below. Declared as a bound
     * field (rather than a method) so the exact same reference can be removed in dispose().
     */
    private handleFinderDevices = (devices: DeviceOut[]) => {
        void this.pushState(devices);
        this.stopTransitionWatchIfSettled(devices);
    };

    public dispose() {
        this.unsubscribeFromTokenChanged?.();
        this.rceFinder.off('devices', this.handleFinderDevices);
        this.stopTransitionWatch();
        super.dispose();
    }

    protected onViewReady() {
        void this.pushState();
    }

    /**
     * Begins (or resets) a short-lived poll of the finder, meant to catch a device finishing a
     * 'pending' transition without the user having to manually refresh. Stops itself once a finder
     * poll shows nothing pending, or after the safety timeout elapses.
     */
    private startTransitionWatch() {
        this.stopTransitionWatch();
        this.transitionWatchIntervalId = setInterval(() => {
            void this.rceFinder.scan();
        }, RceManagementViewProvider.transitionWatchIntervalMs);
        this.transitionWatchIntervalId.unref?.();
        this.transitionWatchTimeoutId = setTimeout(() => {
            this.stopTransitionWatch();
        }, RceManagementViewProvider.transitionWatchTimeoutMs);
        this.transitionWatchTimeoutId.unref?.();
    }

    private stopTransitionWatch() {
        if (this.transitionWatchIntervalId) {
            clearInterval(this.transitionWatchIntervalId);
            this.transitionWatchIntervalId = undefined;
        }
        if (this.transitionWatchTimeoutId) {
            clearTimeout(this.transitionWatchTimeoutId);
            this.transitionWatchTimeoutId = undefined;
        }
    }

    private stopTransitionWatchIfSettled(devices: DeviceOut[]) {
        if (this.transitionWatchIntervalId === undefined) {
            return;
        }
        const anyDevicePending = devices.some((device) => device.status === 'pending');
        if (!anyDevicePending) {
            this.stopTransitionWatch();
        }
    }

    /**
     * Builds the state payload. When `devices` is supplied (a fresh list the finder just emitted),
     * it is reused as-is rather than fetching again; otherwise devices are fetched fresh here.
     */
    private async buildStatePayload(devices?: DeviceOut[]): Promise<RceManagementViewState> {
        const accounts = await this.rceManager.getAccounts();
        const activeAccount = await this.rceManager.getActiveAccount();
        const hasToken = await this.rceManager.hasToken();

        const state: RceManagementViewState = {
            accounts: accounts.map((account) => account.name),
            activeAccountName: activeAccount?.name,
            hasToken: hasToken,
            devices: devices
        };

        if (devices === undefined) {
            const managementClient = await this.rceManager.getClient();
            if (managementClient) {
                try {
                    state.devices = await managementClient.listDevices();
                } catch (error) {
                    state.error = (error as Error).message;
                }
            }
        }

        return state;
    }

    private async pushState(devices?: DeviceOut[]) {
        const state = await this.buildStatePayload(devices);
        this.postOrQueueMessage(this.createEventMessage(ViewProviderEvent.onRceStateChanged, state));
    }

    private async buildDeviceDetailsPayload(deviceId: number): Promise<RceDeviceDetailsPayload> {
        const details: RceDeviceDetailsPayload = {
            snapshots: undefined,
            runs: undefined,
            lastUsedSnapshotId: this.getRememberedSnapshotId(deviceId)
        };

        try {
            const managementClient = await this.rceManager.getClient();
            if (!managementClient) {
                throw new Error('No active Cloud Emulator account is configured');
            }
            const [snapshots, runs] = await Promise.all([
                managementClient.listSnapshots(deviceId),
                managementClient.getDeviceRuns(deviceId)
            ]);
            details.snapshots = snapshots;
            details.runs = runs;
        } catch (error) {
            details.error = (error as Error).message;
        }

        return details;
    }

    /**
     * The snapshot id last used to start this device, remembered per workspace so the picker
     * pre-selects it (and the collapsed-row Start button can reuse it) across VS Code reloads
     */
    private getRememberedSnapshotId(deviceId: number): number | undefined {
        const remembered = this.extensionContext.workspaceState.get<Record<number, number>>(WorkspaceStateKey.rceLastSnapshotByDevice) ?? {};
        return remembered[deviceId];
    }

    private async rememberSnapshotId(deviceId: number, snapshotId: number): Promise<void> {
        const remembered = this.extensionContext.workspaceState.get<Record<number, number>>(WorkspaceStateKey.rceLastSnapshotByDevice) ?? {};
        remembered[deviceId] = snapshotId;
        await this.extensionContext.workspaceState.update(WorkspaceStateKey.rceLastSnapshotByDevice, remembered);
    }
}

interface RceManagementViewState {
    accounts: string[];
    activeAccountName: string | undefined;
    hasToken: boolean;
    devices: DeviceOut[] | undefined;
    error?: string;
}

interface RceDeviceDetailsPayload {
    snapshots: SnapshotOut[] | undefined;
    runs: DeviceRun[] | undefined;
    lastUsedSnapshotId: number | undefined;
    error?: string;
}
