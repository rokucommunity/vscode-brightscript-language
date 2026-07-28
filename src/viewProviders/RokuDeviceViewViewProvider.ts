import * as vscode from 'vscode';
import type { ChannelPublishedEvent } from 'roku-debug';
import type { RceVideoSignalingConfig, RceVideoSignalingClientOptions } from 'roku-deploy';
import { RceVideoSignalingClient } from 'roku-deploy';
import { VscodeCommand } from '../commands/VscodeCommand';
import { vscodeContextManager } from '../managers/VscodeContextManager';
import type { RceStreamRequestConfig } from '../managers/RceManager';
import { BaseRdbViewProvider } from './BaseRdbViewProvider';
import { ViewProviderId } from './ViewProviderId';
import { ViewProviderCommand } from './ViewProviderCommand';
import { RceStreamSession } from './RceStreamSession';

export class RokuDeviceViewViewProvider extends BaseRdbViewProvider {
    public readonly id = ViewProviderId.rokuDeviceView;

    private temporarilyDisableScreenshotCapture = false;
    private resumeScreenshotCapture?: () => void;

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
        //drives the view-title "Open Video in Editor Tab" button's visibility. A setContext failure
        //is inconsequential (the button just shows/hides late), so it must never surface as an
        //unhandled rejection out of a stream lifecycle transition
        onActiveChanged: (active) => {
            vscodeContextManager.set('brightscript.rokuDeviceView.isRceStreamActive', active).catch(() => { });
        }
    });

    constructor(context: vscode.ExtensionContext, dependencies) {
        super(context, dependencies);

        this.registerCommandWithWebViewNotifier(VscodeCommand.rokuDeviceViewEnableNodeInspector);
        this.registerCommandWithWebViewNotifier(VscodeCommand.rokuDeviceViewDisableNodeInspector);
        this.registerCommandWithWebViewNotifier(VscodeCommand.rokuDeviceViewRefreshScreenshot);
        this.registerCommandWithWebViewNotifier(VscodeCommand.rokuDeviceViewPauseScreenshotCapture);
        this.registerCommandWithWebViewNotifier(VscodeCommand.rokuDeviceViewResumeScreenshotCapture);
        this.registerCommandWithWebViewNotifier(VscodeCommand.rokuDeviceViewCopyScreenshot, () => {
            // In order for copy to be successful the webview has to have focus
            this.view.show(false);
        });

        //internal command (no package.json contribution): the RCE panel invokes this with a stream
        //request config to hand a Cloud Emulator device's video stream off to this view.
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

        this.addMessageCommandCallback(ViewProviderCommand.stopRceStream, (message) => {
            this.rceStreamSession.stop();
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
                this.rceStreamSession.postError(`Failed to restart the video stream: ${(e as Error).message}`, deviceId, deviceName);
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

    public onChannelPublishedEvent(e: ChannelPublishedEvent) {
        this.temporarilyDisableScreenshotCapture = false;
        this.resumeScreenshotCapture?.();
        delete this.resumeScreenshotCapture;
    }

    public dispose() {
        super.dispose();
        this.rceStreamSession.stop();
    }

    protected onViewReady() {
        super.onViewReady();

        //reconcile the stream session with the webview that just reported in (a reloaded webview has
        //no peer connection left for an already-delivered offer; a queued offer is about to flush)
        this.rceStreamSession.handleViewReady();

        //a webview that opens with no stream session underway connects to the active device when
        //that device is a Cloud Emulator device: its video stream is this view's equivalent of the
        //LAN screenshot view, so opening the view should reach it without a trip to the RCE panel's
        //Watch button
        if (!this.rceStreamSession.isActive) {
            void this.watchActiveRceDevice();
        }
    }

    /**
     * Start (or restart) the video stream for the active device when it is a Cloud Emulator device;
     * a LAN (or missing) active device leaves the existing screenshot flow alone. Stream resolution
     * failures (device not running, account trouble) surface through the webview's stream error
     * banner - with its Retry button - rather than being swallowed.
     */
    private async watchActiveRceDevice(): Promise<void> {
        const activeDeviceKey = this.extensionContext.workspaceState.get<string>('activeDeviceKey');
        const device = activeDeviceKey ? this.dependencies.deviceManager.getDevice(activeDeviceKey) : undefined;
        if (!device?.rce) {
            return;
        }
        try {
            //the same resolve-and-hand-off path the webview's Retry action uses (registered by
            //RceManagementViewProvider)
            await vscode.commands.executeCommand(VscodeCommand.rceWatchDeviceById, Number(device.rce.id));
        } catch (e) {
            const deviceName = this.dependencies.deviceManager.getDeviceDisplayName(device);
            this.rceStreamSession.postError(
                `Failed to start the video stream for device '${deviceName}': ${(e as Error).message}`,
                Number(device.rce.id),
                deviceName
            );
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
