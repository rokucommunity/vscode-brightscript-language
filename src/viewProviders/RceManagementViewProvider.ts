import * as vscode from 'vscode';
import type { RceDevice, DeviceRun, FirmwareVersion, RceDeviceConfig, RceManagementClient, Snapshot } from 'roku-deploy';
import { rokuDeploy } from 'roku-deploy';
import { BaseWebviewViewProvider } from './BaseWebviewViewProvider';
import { ViewProviderId } from './ViewProviderId';
import { ViewProviderCommand } from './ViewProviderCommand';
import { ViewProviderEvent } from './ViewProviderEvent';
import { VscodeCommand } from '../commands/VscodeCommand';
import type { RceManager } from '../managers/RceManager';
import type { RceStateDevice } from './RceManagementViewContract';
import type { RceFinder } from '../deviceDiscovery/RceFinder';

export type { RceStateDevice } from './RceManagementViewContract';

export class RceManagementViewProvider extends BaseWebviewViewProvider {
    public readonly id = ViewProviderId.rceManagementView;

    constructor(context: vscode.ExtensionContext, dependencies) {
        super(context, dependencies);

        this.rceManager = dependencies.rceManager;
        this.rceFinder = dependencies.rceFinder;

        this.unsubscribeFromTokenChanged = this.rceManager.onTokenChanged(() => {
            //a different account can belong to a different org, so its runtime cap and firmware
            //list must be refetched
            this.cachedMaxProjectRuntimeSeconds = undefined;
            this.cachedFirmwareVersions = undefined;
            void this.pushState();
        });

        //the finder already polls (continuously while started, and one-shot via scan()) and emits the
        //full device list on every successful poll; reusing that here avoids the panel owning its own
        //poll loop, and keeps it in sync with whatever else is driving the finder (the Devices tree view)
        this.rceFinder.on('devices', this.handleFinderDevices);

        //lets the webview's refresh button spin for a poll it did not itself trigger too (a
        //background poll, or another view's manual refresh), not just its own click
        this.rceFinder.on('scanStarted', this.handleFinderScanStarted);
        this.rceFinder.on('error', this.handleFinderScanError);

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
                const createdDevice = await managementClient.createDevice({
                    device: {
                        name: name,
                        deviceType: deviceType,
                        note: note
                    }
                });
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
                //the webview's pickers are the single source of truth for the snapshot and firmware
                //to start with; nothing is resolved here for the snapshot (the picker disables Start
                //until it has a selection)
                const snapshotId = message.context.snapshotId;
                const maxRuntimeSeconds = message.context.maxRuntimeSeconds ?? RceManagementViewProvider.defaultMaxRuntimeSeconds;
                const devices = await managementClient.listDevices();
                const device = devices.find((candidateDevice) => candidateDevice.id === deviceId);
                if (!device) {
                    throw new Error(`Device ${deviceId} was not found`);
                }
                if (!snapshotId) {
                    throw new Error(`Device '${device.name}' has no snapshot to start from; create a snapshot before starting it`);
                }

                //the webview only sets this when the picked snapshot isn't the live one, since only
                //that start would overwrite the live snapshot's current state
                if (message.context.replacesLiveSnapshot) {
                    const confirmationLabel = 'Continue';
                    const confirmedLabel = await vscode.window.showWarningMessage(
                        'Overwrite your live snapshot?',
                        {
                            modal: true,
                            detail: `Starting '${device.name}' with the snapshot "${message.context.snapshotName}" will cause your live snapshot to be overwritten.`
                        },
                        confirmationLabel
                    );
                    if (confirmedLabel !== confirmationLabel) {
                        this.postOrQueueMessage(this.createResponseMessage(message, { started: false }));
                        return true;
                    }
                }

                const startedDevice = await this.startDeviceCore({
                    managementClient: managementClient,
                    device: device,
                    snapshotId: snapshotId,
                    firmwareVersionId: message.context.firmwareVersionId,
                    maxRuntimeSeconds: maxRuntimeSeconds
                });
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
                const stoppedDevice = await this.stopDeviceCore(managementClient, message.context.deviceId);
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
                const updatedDevice = await managementClient.updateDevice({
                    deviceId: deviceId,
                    update: {
                        name: name,
                        note: note
                    }
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
                const snapshots = await managementClient.listSnapshots({ deviceId: deviceId });
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

                await managementClient.deleteSnapshot({ deviceId: deviceId, snapshotId: snapshotId });
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
                const createdSnapshot = await managementClient.createSnapshot({
                    deviceId: deviceId,
                    snapshot: {
                        name: name,
                        note: note
                    }
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
                await rokuDeploy.sendDeveloperSettingsCombo({ device: deviceConfig });
                this.postOrQueueMessage(this.createResponseMessage(message, { success: true }));
            } catch (error) {
                this.postOrQueueMessage(this.createResponseMessage(message, undefined, { message: (error as Error).message }));
            }
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

        //internal commands (no package.json contribution): the video editor tab and the Roku Device
        //View's stream controls both start/stop a device by id through these, since neither webview
        //can reach this provider directly. Unlike the webview handlers above, these throw on failure
        //so the calling surface can render the error itself.
        this.registerCommand(VscodeCommand.rceStartDeviceById, async (deviceId: number) => {
            await this.startDeviceById(deviceId);
        });

        this.registerCommand(VscodeCommand.rceStopDeviceById, async (deviceId: number) => {
            await this.stopDeviceById(deviceId);
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

        const instanceApiUrl = device.runningDevice?.instanceApiUrl;
        if (device.status !== 'running' || !instanceApiUrl) {
            throw new Error(`Device '${device.name}' must be running to ${actionDescription}`);
        }

        const token = await this.rceManager.getToken();
        return { instanceUrl: instanceApiUrl, rceToken: token };
    }

    /**
     * Shared start logic: resolves firmware (the chosen snapshot's own firmware, then the device's,
     * then the first one available for the device's type) when the caller does not already have
     * one, then calls the management api. Callers own confirmation, transition watch, and pushState.
     */
    private async startDeviceCore(options: StartDeviceCoreOptions): Promise<RceDevice> {
        const { managementClient, device, snapshotId, maxRuntimeSeconds } = options;
        let resolvedFirmwareVersionId = options.firmwareVersionId;
        if (!resolvedFirmwareVersionId) {
            const snapshots = await managementClient.listSnapshots({ deviceId: device.id });
            const chosenSnapshot = snapshots.find((snapshot) => snapshot.id === snapshotId);
            resolvedFirmwareVersionId = chosenSnapshot?.firmwareVersionId ?? device.firmwareVersionId;
            if (!resolvedFirmwareVersionId) {
                const firmwareVersions = await managementClient.listFirmwareVersions();
                resolvedFirmwareVersionId = firmwareVersions.find((firmwareVersion) => firmwareVersion.deviceType === device.deviceType)?.firmwareVersionId;
            }
        }
        if (!resolvedFirmwareVersionId) {
            throw new Error(`No firmware version is available for device type '${device.deviceType}'`);
        }

        return managementClient.startDevice({
            deviceId: device.id,
            start: {
                snapshotId: snapshotId,
                firmwareVersionId: resolvedFirmwareVersionId,
                maxRuntime: maxRuntimeSeconds
            }
        });
    }

    private async stopDeviceCore(managementClient: RceManagementClient, deviceId: number): Promise<RceDevice> {
        return managementClient.stopDevice({ deviceId: deviceId });
    }

    /**
     * Starts a device by id from its own live-or-fallback snapshot: the ready live snapshot, else
     * the first ready snapshot, mirroring the management view's primary play button (no confirmation
     * modal there either, since it is the same live-or-first-ready resolution). Always runs the
     * transition watch and pushes state, even on failure, then rethrows for the caller to render.
     */
    private async startDeviceById(deviceId: number): Promise<void> {
        try {
            const managementClient = await this.rceManager.getClient();
            if (!managementClient) {
                throw new Error('No active Cloud Emulator account is configured');
            }
            const devices = await managementClient.listDevices();
            const device = devices.find((candidateDevice) => candidateDevice.id === deviceId);
            if (!device) {
                throw new Error(`Device ${deviceId} was not found`);
            }

            const snapshots = await managementClient.listSnapshots({ deviceId: deviceId });
            const startSnapshot = snapshots.find((snapshot) => snapshot.live && snapshot.ready !== false) ??
                snapshots.find((snapshot) => snapshot.ready !== false);
            if (!startSnapshot) {
                throw new Error(`Device '${device.name}' has no ready snapshot to start from`);
            }

            //the snapshot is already in hand, so its own firmware is passed through directly
            //instead of letting startDeviceCore re-fetch the snapshot list to find it again
            await this.startDeviceCore({
                managementClient: managementClient,
                device: device,
                snapshotId: startSnapshot.id,
                firmwareVersionId: startSnapshot.firmwareVersionId,
                maxRuntimeSeconds: RceManagementViewProvider.defaultMaxRuntimeSeconds
            });
            this.startTransitionWatch();
        } finally {
            await this.pushStateIgnoringErrors();
        }
    }

    private async stopDeviceById(deviceId: number): Promise<void> {
        try {
            const managementClient = await this.rceManager.getClient();
            if (!managementClient) {
                throw new Error('No active Cloud Emulator account is configured');
            }
            await this.stopDeviceCore(managementClient, deviceId);
            this.startTransitionWatch();
        } finally {
            await this.pushStateIgnoringErrors();
        }
    }

    /**
     * pushState(), but swallowed: used from a `finally` around a by-id start/stop so a state-rebuild
     * failure can never mask (or overwrite the response of) the actual start/stop error the caller
     * is about to throw.
     */
    private async pushStateIgnoringErrors(): Promise<void> {
        try {
            await this.pushState();
        } catch (error) {
            console.error('Failed to push RCE state', error);
        }
    }

    private rceManager: RceManager;
    private rceFinder: RceFinder;
    private unsubscribeFromTokenChanged: () => void;

    private transitionWatchIntervalId: ReturnType<typeof setInterval> | undefined;
    private transitionWatchTimeoutId: ReturnType<typeof setTimeout> | undefined;

    private static readonly allowedAccountCommands = ['addAccount', 'switchAccount', 'removeAccount'];

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
    private handleFinderDevices = (devices: RceDevice[]) => {
        this.postRefreshingChanged(false);
        void this.pushState(devices);
        this.stopTransitionWatchIfSettled(devices);
    };

    /**
     * Bound fields (like handleFinderDevices above) so the exact same references can be removed
     * in dispose(). A completed scan always emits 'devices' or 'error', never both, so exactly one
     * of handleFinderDevices/handleFinderScanError clears what handleFinderScanStarted set.
     */
    private handleFinderScanStarted = () => {
        this.postRefreshingChanged(true);
    };

    private handleFinderScanError = () => {
        this.postRefreshingChanged(false);
    };

    private postRefreshingChanged(refreshing: boolean) {
        this.postOrQueueMessage(this.createEventMessage(ViewProviderEvent.onRceRefreshingChanged, { refreshing: refreshing }));
    }

    public dispose() {
        this.unsubscribeFromTokenChanged?.();
        this.rceFinder.off('devices', this.handleFinderDevices);
        this.rceFinder.off('scanStarted', this.handleFinderScanStarted);
        this.rceFinder.off('error', this.handleFinderScanError);
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

    private stopTransitionWatchIfSettled(devices: RceDevice[]) {
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
    private async buildStatePayload(devices?: RceDevice[]): Promise<RceManagementViewState> {
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
            state.firmwareVersions = await this.getFirmwareVersions(managementClient);
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

    //the webview gets only the fields it renders; RceDevice's runningDevice otherwise carries the
    //instance's stream credentials
    private projectDeviceForWebview(device: RceDevice): RceStateDevice {
        return {
            id: device.id,
            name: device.name,
            note: device.note,
            deviceType: device.deviceType,
            status: device.status,
            serialNumber: device.serialNumber,
            createdAt: device.createdAt,
            lastSnapshotId: device.lastSnapshotId,
            lastSnapshotName: device.lastSnapshotName,
            snapshots: device.snapshots,
            firmwareVersionId: device.firmwareVersionId,
            runningDevice: device.runningDevice ? {
                startedAt: device.runningDevice.startedAt,
                maxRuntime: device.runningDevice.maxRuntime
            } : device.runningDevice
        };
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
                this.cachedMaxProjectRuntimeSeconds = userInfo.organisation?.maxProjectRuntime;
            } catch {
                //the cap is presentation-only (the api enforces it server-side), so a failed fetch
                //should never block the rest of the state payload
            }
        }
        return this.cachedMaxProjectRuntimeSeconds;
    }

    /**
     * The firmware versions offered by the start control's firmware picker, fetched once per token
     * and reused across state builds (the token-changed handler clears it). Stays undefined when
     * the fetch fails, which the webview shows as an unavailable picker; the start handler's own
     * fallback resolution still covers starting in that state.
     */
    private cachedFirmwareVersions: FirmwareVersion[] | undefined;

    private async getFirmwareVersions(managementClient: RceManagementClient): Promise<FirmwareVersion[] | undefined> {
        if (this.cachedFirmwareVersions === undefined) {
            try {
                this.cachedFirmwareVersions = await managementClient.listFirmwareVersions();
            } catch {
                //like the runtime cap, the firmware list is presentation-only here, so a failed
                //fetch should never block the rest of the state payload
            }
        }
        return this.cachedFirmwareVersions;
    }

    private async pushState(devices?: RceDevice[]) {
        const state = await this.buildStatePayload(devices);
        this.postOrQueueMessage(this.createEventMessage(ViewProviderEvent.onRceStateChanged, state));
    }

    private async buildDeviceDetailsPayload(deviceId: number): Promise<RceDeviceDetailsPayload> {
        const details: RceDeviceDetailsPayload = {
            snapshots: undefined,
            runs: undefined
        };

        try {
            const managementClient = await this.rceManager.getClient();
            if (!managementClient) {
                throw new Error('No active Cloud Emulator account is configured');
            }
            const [snapshots, runs] = await Promise.all([
                managementClient.listSnapshots({ deviceId: deviceId }),
                managementClient.getDeviceRuns({ deviceId: deviceId })
            ]);
            details.snapshots = snapshots;
            details.runs = runs;
        } catch (error) {
            details.error = (error as Error).message;
        }

        return details;
    }
}

interface RceManagementViewState {
    accounts: string[];
    activeAccountName: string | undefined;
    hasToken: boolean;
    devices: RceStateDevice[] | undefined;
    /** The active org's device runtime cap in seconds; undefined when no account is active or the fetch failed */
    maxProjectRuntimeSeconds?: number;
    /** The firmware versions available for starting devices; undefined when no account is active or the fetch failed */
    firmwareVersions?: FirmwareVersion[];
    error?: string;
}

interface RceDeviceDetailsPayload {
    snapshots: Snapshot[] | undefined;
    runs: DeviceRun[] | undefined;
    error?: string;
}

interface StartDeviceCoreOptions {
    managementClient: RceManagementClient;
    device: RceDevice;
    snapshotId: number;
    firmwareVersionId: string | null | undefined;
    maxRuntimeSeconds: number;
}
