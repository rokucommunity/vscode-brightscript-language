import * as vscode from 'vscode';
import type { ChannelPublishedEvent } from 'roku-debug';
import type { DeviceConfig, RceDevice, RceVideoSignalingConfig, RceVideoSignalingClientOptions } from 'roku-deploy';
import { isRceDeviceConfig, RceVideoSignalingClient, rokuDeploy } from 'roku-deploy';
import { VscodeCommand } from '../commands/VscodeCommand';
import { vscodeContextManager } from '../managers/VscodeContextManager';
import type { RceStreamRequestConfig } from '../managers/RceManager';
import { BaseRdbViewProvider } from './BaseRdbViewProvider';
import { ViewProviderId } from './ViewProviderId';
import { ViewProviderCommand } from './ViewProviderCommand';
import { ViewProviderEvent } from './ViewProviderEvent';
import { RceStreamSession } from './RceStreamSession';

export class RokuDeviceViewViewProvider extends BaseRdbViewProvider {
    public readonly id = ViewProviderId.rokuDeviceView;

    private temporarilyDisableScreenshotCapture = false;
    private resumeScreenshotCapture?: () => void;

    /**
     * The Cloud Emulator device of the most recent sideload (channel-published event), when there
     * was one. This view follows the last sideloaded device - the same rule the LAN screenshot flow
     * gets from RtaManager's RTA device - so this is what a reopened webview reconnects to.
     * In-memory on purpose: RtaManager's device resets on a window reload too, and the view starts
     * empty until the next sideload either way.
     */
    private lastSideloadedRceDevice?: { id: number; name: string };

    /**
     * The Janus signaling session behind this view's Cloud Emulator video stream mode. The session
     * lives extension-side (see RceStreamSession) because the Janus WebSocket host requires an
     * Authorization header on the socket handshake, which only a Node WebSocket client (not a
     * webview WebSocket) can set. The webview only ever sees the resulting SDP offer/answer and ICE
     * candidates via the message plumbing below.
     */
    private rceStreamSession = new RceStreamSession({
        getApiToken: () => this.dependencies.rceManager.getToken(),
        postEvent: (event, context) => this.postOrQueueMessage(this.createEventMessage(event, context)),
        isViewReady: () => this.isViewReady(),
        createSignalingClient: (config, options) => this.createSignalingClient(config, options),
        //the session's automatic reconnect loop re-resolves the device's current stream details
        //(a restarted instance has a fresh Janus url and TURN credentials) through the manager
        resolveStreamRequest: (deviceId) => this.dependencies.rceManager.resolveStreamRequest(deviceId),
        //drives the view-title "Open Video in Editor Tab" button's visibility. A setContext failure
        //is inconsequential (the button just shows/hides late), so it must never surface as an
        //unhandled rejection out of a stream lifecycle transition
        onActiveChanged: (active) => {
            vscodeContextManager.set('brightscript.rokuDeviceView.isRceStreamActive', active).catch(() => { });
        }
    });

    constructor(context: vscode.ExtensionContext, dependencies) {
        super(context, dependencies);

        //keep the stream in step with the device's status from the management-api poll: an
        //externally stopped device shows the device-stopped state promptly (its Janus socket can
        //linger after the instance stops) and a restarting one waits instead of erroring.
        //Optional-chained because provider specs construct with partial dependencies.
        this.dependencies.rceFinder?.on('devices', this.handleFinderDevices);

        this.registerCommandWithWebViewNotifier(VscodeCommand.rokuDeviceViewEnableNodeInspector);
        this.registerCommandWithWebViewNotifier(VscodeCommand.rokuDeviceViewDisableNodeInspector);
        this.registerCommandWithWebViewNotifier(VscodeCommand.rokuDeviceViewRefreshScreenshot);
        this.registerCommandWithWebViewNotifier(VscodeCommand.rokuDeviceViewPauseScreenshotCapture);
        this.registerCommandWithWebViewNotifier(VscodeCommand.rokuDeviceViewResumeScreenshotCapture);
        this.registerCommandWithWebViewNotifier(VscodeCommand.rokuDeviceViewCopyScreenshot, () => {
            // In order for copy to be successful the webview has to have focus
            this.view.show(false);
        });

        //internal command (no package.json contribution): RceManagementViewProvider's
        //rceWatchDeviceById command invokes this with a resolved stream request to hand a Cloud
        //Emulator device's video stream to this view. Today that path serves this view's own
        //webview Retry action (which cannot resolve stream details itself - each webview only
        //talks to the provider that owns it); the sideload-follow path resolves directly instead,
        //since this focus() must not fire during a debug launch.
        this.registerCommand(VscodeCommand.rokuDeviceViewShowRceStream, (streamRequest: RceStreamRequestConfig) => {
            void vscode.commands.executeCommand('rokuDeviceView.focus');
            this.view?.show(false);
            void this.startRceStreamSession(streamRequest);
        });

        //the view-title pop-out button: opens the currently-streaming device's video in its own
        //editor tab (a second, independent stream session - the Janus gateway allows concurrent
        //watchers), leaving this view's stream running
        this.registerCommand(VscodeCommand.rokuDeviceViewOpenVideoEditor, async () => {
            if (this.rceStreamSession.deviceId === undefined) {
                return;
            }
            await vscode.commands.executeCommand(VscodeCommand.rceWatchDeviceInEditor, this.rceStreamSession.deviceId, this.rceStreamSession.deviceName);
        });

        this.addMessageCommandCallback(ViewProviderCommand.sendRceStreamAnswer, async (message) => {
            await this.rceStreamSession.sendAnswer(message.context.jsep);
            return true;
        });

        this.addMessageCommandCallback(ViewProviderCommand.sendRceStreamIceCandidate, (message) => {
            this.rceStreamSession.handleIceCandidate(message.context);
            return Promise.resolve(true);
        });

        //the sidebar's only in-view exit from a Cloud Emulator stream. A plain session stop would
        //leave rtaManager.device (and therefore deviceAvailable) pointed at this same cloud device,
        //so the view would fall into the dead LAN screenshot flow instead of the connect view;
        //route through the same full reset the "Disconnect from Device" button uses so
        //deviceAvailable goes false too, but only when RTA is actually holding THIS streamed
        //device (a cloud sideload or Connect-to-Device pick) - a Watch-button session that never
        //touched RTA must never clobber an unrelated LAN connection this way
        this.addMessageCommandCallback(ViewProviderCommand.stopRceStream, (message) => {
            const streamedDeviceId = this.rceStreamSession.deviceId;
            if (streamedDeviceId !== undefined && this.resolveRtaDeviceRceId() === streamedDeviceId) {
                this.dependencies.rtaManager.disconnectFromDevice();
            } else {
                this.rceStreamSession.stop();
            }
            return Promise.resolve(true);
        });

        //the stream header's power button: presses the Power key on the streamed device (toggles the
        //emulated display; the stream itself keeps running either way)
        this.addMessageCommandCallback(ViewProviderCommand.pressRceDevicePowerButton, async (message) => {
            const rceToken = await this.dependencies.rceManager.getToken();
            await rokuDeploy.keyPress({ device: { id: Number(message.context.deviceId), rceToken: rceToken }, key: 'Power' });
            this.postOrQueueMessage(this.createResponseMessage(message, { success: true }));
            return true;
        });

        //the controls under the video: start/stop the streamed device by id through the internal
        //commands RceManagementViewProvider registers, since this webview can only reach this provider
        this.addMessageCommandCallback(ViewProviderCommand.startRceDevice, async (message) => {
            await vscode.commands.executeCommand(VscodeCommand.rceStartDeviceById, message.context.deviceId);
            this.postOrQueueMessage(this.createResponseMessage(message, { success: true }));
            return true;
        });

        this.addMessageCommandCallback(ViewProviderCommand.stopRceDevice, async (message) => {
            await vscode.commands.executeCommand(VscodeCommand.rceStopDeviceById, message.context.deviceId);
            this.postOrQueueMessage(this.createResponseMessage(message, { success: true }));
            return true;
        });

        //the webview's peer connection failed (for example the ICE connection dropped); the session
        //reruns the whole negotiation through its reconnect loop
        this.addMessageCommandCallback(ViewProviderCommand.reportRceStreamFailure, (message) => {
            this.rceStreamSession.handleStreamFailure(message.context?.message);
            return Promise.resolve(true);
        });

        //the Retry action re-sends watchRceDevice with the device id it remembered from
        //onRceStreamOffer. This webview can only reach this provider (each webview only talks to the
        //provider that owns it), so re-resolving the device's current stream details goes through the
        //rceWatchDeviceById internal command, which RceManagementViewProvider registers
        this.addMessageCommandCallback(ViewProviderCommand.watchRceDevice, async (message) => {
            const deviceId = message.context.deviceId;
            const deviceName = this.rceStreamSession.deviceName;
            this.rceStreamSession.stop();
            try {
                await vscode.commands.executeCommand(VscodeCommand.rceWatchDeviceById, deviceId);
            } catch (e) {
                //a pending device enters the waiting-for-device phase, a stopped one the
                //device-stopped state; everything else is this host's error to report
                if (!this.rceStreamSession.handleDeviceNotRunning(e, deviceId, deviceName)) {
                    this.rceStreamSession.postError(`Failed to restart the video stream: ${(e as Error).message}`, deviceId, deviceName);
                }
            }
            return true;
        });

        this.addMessageCommandCallback(ViewProviderCommand.getScreenshot, async (message) => {
            try {
                if (this.temporarilyDisableScreenshotCapture) {
                    // Sometimes we need to temporarily stop screenshot capture as it can prevent successful package deployment to the device
                    // Originally was just returning true here but now we just pause until we resume capturing
                    await new Promise<void>((resolve) => {
                        this.resumeScreenshotCapture = resolve;
                    });
                }
                const result = await this.dependencies.rtaManager.device.getScreenshot();
                this.postOrQueueMessage(this.createResponseMessage(message, {
                    success: true,
                    arrayBuffer: result.buffer.buffer
                }));
            } catch (e) {
                this.postOrQueueMessage(this.createResponseMessage(message, {
                    success: false
                }));
            }
            return true;
        });
    }

    public onDidStartDebugSession(e: vscode.DebugSession) {
        this.temporarilyDisableScreenshotCapture = true;
    }

    public onDidTerminateDebugSession(e: vscode.DebugSession) {
        // In case we failed to start debugging we want to allow screenshots again
        this.temporarilyDisableScreenshotCapture = false;
        this.resumeScreenshotCapture?.();
        delete this.resumeScreenshotCapture;
    }

    /**
     * RtaManager's "Disconnect from Device" full reset: unlike a session terminating (which
     * deliberately leaves `device` in place), there is nothing left to stream from here, so a
     * running Cloud Emulator stream - and its remembered sideloaded device, which would otherwise
     * resurrect on the next onViewReady - is stopped too.
     */
    public onDeviceDisconnected() {
        this.lastSideloadedRceDevice = undefined;
        if (this.rceStreamSession.isActive) {
            this.rceStreamSession.stop();
            this.postOrQueueMessage(this.createEventMessage(ViewProviderEvent.onRceStreamStopped, {}));
        }
    }

    /**
     * The manual "Connect to Device" button just set up RTA against this target. That flow never
     * starts a stream on its own, so a Cloud Emulator target would otherwise leave this view stuck
     * retrying the LAN screenshot loop against a device with no sideloaded channel - route it through
     * the same follow-the-connected-device logic the sideload path uses (a LAN target's screenshot
     * loop already works, so it just stops any stream left over from a previous Cloud Emulator
     * device, mirroring the sideload path's symmetry).
     */
    protected onDeviceConnected(target: DeviceConfig) {
        void this.followSideloadedDevice(target);
    }

    public onChannelPublishedEvent(e: ChannelPublishedEvent) {
        this.temporarilyDisableScreenshotCapture = false;
        this.resumeScreenshotCapture?.();
        delete this.resumeScreenshotCapture;

        //this view follows the last sideloaded device, mirroring the LAN screenshot flow (whose RTA
        //device RtaManager repoints on this same event): a cloud sideload starts/retargets the video
        //stream, a LAN one hands the view back to the screenshot flow. Setting a device as the
        //active device deliberately does NOT move this view - only a sideload does.
        void this.followSideloadedDevice(e.body.launchConfiguration?.device);
    }

    /**
     * Point this view at the device a channel was just published to. A Cloud Emulator device starts
     * (or retargets) the video stream; anything else stops the stream and forgets the remembered
     * cloud device, so the screenshot flow (which RtaManager just repointed) owns the view again.
     */
    private async followSideloadedDevice(deviceConfig: DeviceConfig | undefined): Promise<void> {
        if (!deviceConfig || typeof deviceConfig !== 'object' || !isRceDeviceConfig(deviceConfig)) {
            this.lastSideloadedRceDevice = undefined;
            this.rceStreamSession.stop();
            return;
        }
        const deviceId = this.resolveRceDeviceId(deviceConfig);
        if (deviceId === undefined) {
            return;
        }
        const device = this.dependencies.deviceManager?.getDeviceByDeviceConfig?.(deviceConfig);
        const deviceName = device ? this.dependencies.deviceManager.getDeviceDisplayName(device) : `device ${deviceId}`;
        this.lastSideloadedRceDevice = { id: deviceId, name: deviceName };
        await this.watchRceDevice(deviceId, deviceName);
    }

    /**
     * Resolves a Cloud Emulator device config to its management-api device id: through the device
     * manager when it knows the device, else an id-addressed config's own id. Undefined for
     * anything the device manager can't place and that isn't id-addressed.
     */
    private resolveRceDeviceId(deviceConfig: DeviceConfig): number | undefined {
        const device = this.dependencies.deviceManager?.getDeviceByDeviceConfig?.(deviceConfig);
        if (device?.rce) {
            return device.rce.id;
        }
        if ('id' in deviceConfig) {
            const deviceId = Number(deviceConfig.id);
            return Number.isNaN(deviceId) ? undefined : deviceId;
        }
        return undefined;
    }

    /**
     * The Cloud Emulator device id rtaManager.device currently holds, or undefined when it holds
     * no device, a LAN device, or a cloud device the device manager and id-addressing both fail to
     * place. Used to gate stopRceStream's full disconnect to only the device this stream is for.
     */
    private resolveRtaDeviceRceId(): number | undefined {
        const rokuDevice = this.dependencies.rtaManager.device;
        if (!rokuDevice) {
            return undefined;
        }
        //rtaManager.device is RTA's own client wrapper, not the roku-deploy DeviceConfig itself
        const deviceConfig = rokuDevice.getRokuDeployDevice();
        if (!isRceDeviceConfig(deviceConfig)) {
            return undefined;
        }
        return this.resolveRceDeviceId(deviceConfig);
    }

    /**
     * Relay the streamed device's current status and runtime (from an RceFinder poll emission)
     * into the stream session. Bound so `on`/`off` see the same function reference.
     */
    private handleFinderDevices = (devices: RceDevice[]) => {
        const deviceId = this.rceStreamSession.deviceId;
        const device = deviceId === undefined ? undefined : devices.find((candidateDevice) => candidateDevice.id === deviceId);
        if (device) {
            this.rceStreamSession.handleDeviceStatusChanged(device.status);
            this.postDeviceRuntimeIfChanged(deviceId, device.runningDevice?.startedAt, device.runningDevice?.maxRuntime);
        }
    };

    /**
     * Posts the streamed device's current runtime, but only when it actually changed since the
     * last post - every finder emission (every few seconds) would otherwise repost an identical
     * message regardless of whether the webview is even ready to receive it.
     */
    private postDeviceRuntimeIfChanged(deviceId: number, startedAt: string | null | undefined, maxRuntime: number | null | undefined): void {
        if (this.lastPostedRuntimeDeviceId === deviceId && this.lastPostedRuntimeStartedAt === startedAt && this.lastPostedRuntimeMaxRuntime === maxRuntime) {
            return;
        }
        this.lastPostedRuntimeDeviceId = deviceId;
        this.lastPostedRuntimeStartedAt = startedAt;
        this.lastPostedRuntimeMaxRuntime = maxRuntime;
        this.postOrQueueMessage(this.createEventMessage(ViewProviderEvent.onRceDeviceRuntimeChanged, {
            deviceId: deviceId,
            startedAt: startedAt,
            maxRuntime: maxRuntime
        }));
    }

    private lastPostedRuntimeDeviceId: number | undefined;
    private lastPostedRuntimeStartedAt: string | null | undefined;
    private lastPostedRuntimeMaxRuntime: number | null | undefined;

    public dispose() {
        super.dispose();
        this.dependencies.rceFinder?.off('devices', this.handleFinderDevices);
        this.rceStreamSession.stop();
    }

    protected onViewReady() {
        super.onViewReady();

        //reconcile the stream session with the webview that just reported in (a reloaded webview has
        //no peer connection left for an already-delivered offer; a queued offer is about to flush)
        this.rceStreamSession.handleViewReady();

        //a webview that opens with no stream session underway reconnects to the last sideloaded
        //device when that was a Cloud Emulator device: this view follows the last sideload (the
        //LAN screenshot flow's rule), so reopening the view resumes that device's stream
        if (!this.rceStreamSession.isActive && this.lastSideloadedRceDevice) {
            void this.watchRceDevice(this.lastSideloadedRceDevice.id, this.lastSideloadedRceDevice.name);
        }
    }

    /**
     * Start (or restart) the video stream for a Cloud Emulator device. Stream resolution failures
     * (device not running, account trouble) surface through the webview's stream error banner -
     * with its Retry button - rather than being swallowed. Deliberately does not focus the view:
     * the sideload-follow path must never steal focus during a debug launch.
     */
    private async watchRceDevice(deviceId: number, deviceName: string): Promise<void> {
        try {
            //the same stream resolution the webview's Retry action reaches through the
            //rceWatchDeviceById command, called directly since no focus change is wanted here
            const streamRequest = await this.dependencies.rceManager.resolveStreamRequest(deviceId);
            await this.startRceStreamSession(streamRequest);
        } catch (e) {
            //a pending device enters the waiting-for-device phase, a stopped one the device-stopped
            //state; everything else is this host's error to report
            if (!this.rceStreamSession.handleDeviceNotRunning(e, deviceId, deviceName)) {
                this.rceStreamSession.postError(
                    `Failed to start the video stream for device '${deviceName}': ${(e as Error).message}`,
                    deviceId,
                    deviceName
                );
            }
        }
    }

    /**
     * Create the Janus signaling client for a stream request. Split out so tests can supply a fake
     * client instead of opening a real WebSocket.
     */
    protected createSignalingClient(config: RceVideoSignalingConfig, options?: RceVideoSignalingClientOptions): RceVideoSignalingClient {
        return new RceVideoSignalingClient(config, options);
    }

    private startRceStreamSession(streamRequest: RceStreamRequestConfig): Promise<void> {
        return this.rceStreamSession.start(streamRequest);
    }
}
