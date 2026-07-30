import * as vscode from 'vscode';
import type { DeviceOut, DeviceRun, DeviceStatus, DeviceType, RceDeviceConfig, RceManagementClient, SnapshotOut } from 'roku-deploy';
import { RceDevice, rokuDeploy } from 'roku-deploy';
import { BaseWebviewViewProvider } from './BaseWebviewViewProvider';
import { ViewProviderId } from './ViewProviderId';
import { ViewProviderCommand } from './ViewProviderCommand';
import { ViewProviderEvent } from './ViewProviderEvent';
import { WorkspaceStateKey } from './WorkspaceStateKey';
import { VscodeCommand } from '../commands/VscodeCommand';
import type { RceManager } from '../managers/RceManager';
import type { RceFinder } from '../deviceDiscovery/RceFinder';

export class RceManagementViewProvider extends BaseWebviewViewProvider {
    public readonly id = ViewProviderId.rceManagementView;

    constructor(context: vscode.ExtensionContext, dependencies) {
        super(context, dependencies);

        this.rceManager = dependencies.rceManager;
        this.rceFinder = dependencies.rceFinder;

        this.unsubscribeFromTokenChanged = this.rceManager.onTokenChanged(() => {
            //a different account can belong to a different org, so its runtime cap must be refetched
            this.cachedMaxProjectRuntimeSeconds = undefined;
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
                const maxRuntimeSeconds = message.context.maxRuntimeSeconds ?? RceManagementViewProvider.defaultMaxRuntimeSeconds;
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
                    max_runtime: maxRuntimeSeconds
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

        this.addMessageCommandCallback(ViewProviderCommand.createRceSnapshot, async (message) => {
            try {
                const managementClient = await this.rceManager.getClient();
                if (!managementClient) {
                    throw new Error('No active Cloud Emulator account is configured');
                }
                const { deviceId, name, note } = message.context;
                const createdSnapshot = await managementClient.createSnapshot(deviceId, {
                    name: name,
                    note: note
                });
                this.postOrQueueMessage(this.createResponseMessage(message, { snapshot: createdSnapshot }));
            } catch (error) {
                this.postOrQueueMessage(this.createResponseMessage(message, undefined, { message: (error as Error).message }));
            }
            await this.pushState();
            return true;
        });

        this.addMessageCommandCallback(ViewProviderCommand.enableRceDevMode, async (message) => {
            try {
                const deviceConfig = await this.getRunningRceDeviceConfig(message.context.deviceId, 'enable dev mode');
                await this.createRceDevice(deviceConfig).sendDeveloperSettingsCombo();
                this.postOrQueueMessage(this.createResponseMessage(message, { success: true }));
            } catch (error) {
                this.postOrQueueMessage(this.createResponseMessage(message, undefined, { message: (error as Error).message }));
            }
            await this.pushState();
            return true;
        });

        this.addMessageCommandCallback(ViewProviderCommand.disableRceLimitedEcp, async (message) => {
            try {
                const deviceConfig = await this.getRunningRceDeviceConfig(message.context.deviceId, 'change its ECP mode');
                //walks the on-screen settings to flip Control-by-mobile-apps network access off
                //Limited. Sent over the ECP2 auth-proxy socket (not the /ecp1 proxy) because
                //limited mode is exactly the state that 403s plain ECP keypresses.
                await this.createRceDevice(deviceConfig).sendKeySequence(RceManagementViewProvider.disableLimitedEcpKeySequence);
                this.postOrQueueMessage(this.createResponseMessage(message, { success: true }));
            } catch (error) {
                this.postOrQueueMessage(this.createResponseMessage(message, undefined, { message: (error as Error).message }));
            }
            await this.pushState();
            return true;
        });

        this.addMessageCommandCallback(ViewProviderCommand.wakeRceDevice, async (message) => {
            try {
                const deviceConfig = await this.getRunningRceDeviceConfig(message.context.deviceId, 'wake it');
                //how the web app wakes a device: a guide keypress (wakes the display) followed by home
                await rokuDeploy.keyPress({ device: deviceConfig, key: 'Guide' });
                await rokuDeploy.keyPress({ device: deviceConfig, key: 'Home' });
                this.postOrQueueMessage(this.createResponseMessage(message, { success: true }));
            } catch (error) {
                this.postOrQueueMessage(this.createResponseMessage(message, undefined, { message: (error as Error).message }));
            }
            //waking changes nothing the state payload carries, but pushing keeps the handler shape
            //consistent and refreshes the running_device block's freshness either way
            await this.pushState();
            return true;
        });

        //the panel's Watch button: opens the device's video in its own editor tab (the
        //rceWatchDeviceInEditor command is registered by RceVideoEditorManager). Stream failures
        //render inside the tab itself, so a success response here only means the tab was opened.
        this.addMessageCommandCallback(ViewProviderCommand.watchRceDevice, async (message) => {
            try {
                await vscode.commands.executeCommand(VscodeCommand.rceWatchDeviceInEditor, message.context.deviceId, message.context.deviceName);
                this.postOrQueueMessage(this.createResponseMessage(message, { success: true }));
            } catch (error) {
                this.postOrQueueMessage(this.createResponseMessage(message, undefined, { message: (error as Error).message }));
            }
            //nothing about device state changes from watching it, so there is no pushState here
            return true;
        });

        //internal command (no package.json contribution): the Roku Device View streams a device by
        //id through this (its active-cloud-device auto-connect and its webview's Retry action),
        //since its own webview cannot reach this provider directly (each webview only talks to the
        //provider that owns it)
        this.registerCommand(VscodeCommand.rceWatchDeviceById, async (deviceId: number) => {
            const streamRequest = await this.rceManager.resolveStreamRequest(deviceId);
            await vscode.commands.executeCommand(VscodeCommand.rokuDeviceViewShowRceStream, streamRequest);
        });
    }

    /**
     * Resolve a device to the roku-deploy device config for its running instance. Throws when no
     * account is configured or the device is missing or not running; `actionDescription` completes
     * the not-running error ("must be running to <actionDescription>").
     */
    private async getRunningRceDeviceConfig(deviceId: number, actionDescription: string): Promise<RceDeviceConfig> {
        const managementClient = await this.rceManager.getClient();
        if (!managementClient) {
            throw new Error('No active Cloud Emulator account is configured');
        }
        const devices = await managementClient.listDevices();
        const device = devices.find((candidateDevice) => candidateDevice.id === deviceId);
        if (!device) {
            throw new Error(`Device ${deviceId} was not found`);
        }

        const instanceApiUrl = device.running_device?.instance_api_url;
        if (device.status !== 'running' || !instanceApiUrl) {
            throw new Error(`Device '${device.name}' must be running to ${actionDescription}`);
        }

        const token = await this.rceManager.getToken();
        return { instanceUrl: instanceApiUrl, rceToken: token };
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
     * The remote-key walk through the on-screen settings that flips Control-by-mobile-apps network
     * access off Limited mode ('Select' is the remote's OK button)
     */
    private static readonly disableLimitedEcpKeySequence = [
        'Home', 'Up', 'Right', 'Up', 'Right', 'Up', 'Right', 'Up', 'Right', 'Right', 'Down', 'Select', 'Up', 'Select'
    ];

    /**
     * Max runtime used when the webview does not send one (one hour, matching the runtime
     * dropdown's default choice)
     */
    private static readonly defaultMaxRuntimeSeconds = 3600;

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

        let deviceList = devices;
        const state: RceManagementViewState = {
            accounts: accounts.map((account) => account.name),
            activeAccountName: activeAccount?.name,
            hasToken: hasToken,
            devices: undefined
        };

        const managementClient = await this.rceManager.getClient();
        if (managementClient) {
            state.maxProjectRuntimeSeconds = await this.getMaxProjectRuntimeSeconds(managementClient);
            if (deviceList === undefined) {
                try {
                    deviceList = await managementClient.listDevices();
                } catch (error) {
                    state.error = (error as Error).message;
                }
            }
        }

        state.devices = deviceList?.map((device) => this.projectDeviceForWebview(device));

        return state;
    }

    //the webview gets only the fields it renders; DeviceOut's running_device otherwise carries the
    //instance's stream credentials
    private projectDeviceForWebview(device: DeviceOut): RceStateDevice {
        /* eslint-disable camelcase -- the RCE management api uses snake_case fields */
        return {
            id: device.id,
            name: device.name,
            note: device.note,
            device_type: device.device_type,
            status: device.status,
            serial_number: device.serial_number,
            created_at: device.created_at,
            last_snapshot_id: device.last_snapshot_id,
            last_snapshot_name: device.last_snapshot_name,
            snapshots: device.snapshots,
            running_device: device.running_device ? {
                started_at: device.running_device.started_at,
                max_runtime: device.running_device.max_runtime
            } : device.running_device
        };
        /* eslint-enable camelcase */
    }

    /**
     * The active org's device runtime cap in seconds, fetched once per token and reused across
     * state builds (the token-changed handler clears it). Stays undefined when the fetch fails,
     * which the webview treats as "cap unknown" and falls back to its full preset list.
     */
    private cachedMaxProjectRuntimeSeconds: number | undefined;

    private async getMaxProjectRuntimeSeconds(managementClient: RceManagementClient): Promise<number | undefined> {
        if (this.cachedMaxProjectRuntimeSeconds === undefined) {
            try {
                const userInfo = await managementClient.getUserInfo();
                this.cachedMaxProjectRuntimeSeconds = userInfo.organisation?.max_project_runtime;
            } catch {
                //the cap is presentation-only (the api enforces it server-side), so a failed fetch
                //should never block the rest of the state payload
            }
        }
        return this.cachedMaxProjectRuntimeSeconds;
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
    devices: RceStateDevice[] | undefined;
    /** The active org's device runtime cap in seconds; undefined when no account is active or the fetch failed */
    maxProjectRuntimeSeconds?: number;
    error?: string;
}

/* eslint-disable camelcase -- the RCE management api uses snake_case fields */
/**
 * The device fields the management webview renders - a projection of roku-deploy's DeviceOut that
 * leaves the instance's stream credentials behind (see projectDeviceForWebview).
 */
export interface RceStateDevice {
    id: number;
    name: string;
    note?: string | null;
    device_type: DeviceType;
    status?: DeviceStatus;
    serial_number?: string | null;
    created_at: string;
    last_snapshot_id?: number | null;
    last_snapshot_name?: string | null;
    snapshots?: number[];
    running_device?: {
        started_at?: string | null;
        max_runtime: number;
    } | null;
}
/* eslint-enable camelcase */

interface RceDeviceDetailsPayload {
    snapshots: SnapshotOut[] | undefined;
    runs: DeviceRun[] | undefined;
    lastUsedSnapshotId: number | undefined;
    error?: string;
}
