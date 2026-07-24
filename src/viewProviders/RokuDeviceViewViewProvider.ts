import * as vscode from 'vscode';
import type { ChannelPublishedEvent } from 'roku-debug';
import type { IceServer, RceVideoSignalingConfig, RceVideoSignalingClientOptions } from 'roku-deploy';
import { RceVideoSignalingClient } from 'roku-deploy';
import { VscodeCommand } from '../commands/VscodeCommand';
import { BaseRdbViewProvider } from './BaseRdbViewProvider';
import { ViewProviderId } from './ViewProviderId';
import { ViewProviderCommand } from './ViewProviderCommand';
import { ViewProviderEvent } from './ViewProviderEvent';

export class RokuDeviceViewViewProvider extends BaseRdbViewProvider {
    public readonly id = ViewProviderId.rokuDeviceView;

    private temporarilyDisableScreenshotCapture = false;
    private resumeScreenshotCapture?: () => void;
    private activeRceStream: ActiveRceStream | undefined;
    //mirrors BaseWebviewViewProvider's own (private) viewReady flag: we need to read it from
    //startRceStreamSession's onRceStreamOffer post to know whether that post is going straight to a
    //live webview or being queued, and the base class does not expose its own flag for that
    private webviewReady = false;

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
        //request config to hand a Cloud Emulator device's video stream off to this view. This view
        //owns the Janus signaling session (see RceVideoSignalingClient in roku-deploy) rather than the
        //webview, because the Janus WebSocket host requires an Authorization header on the socket
        //handshake, which only a Node WebSocket client (not a webview WebSocket) can set. The webview
        //only ever sees the resulting SDP offer/answer and ICE candidates via the message plumbing below.
        this.registerCommand(VscodeCommand.rokuDeviceViewShowRceStream, (streamRequest: RceStreamRequestConfig) => {
            void vscode.commands.executeCommand('rokuDeviceView.focus');
            this.view?.show(false);
            void this.startRceStreamSession(streamRequest);
        });

        this.addMessageCommandCallback(ViewProviderCommand.sendRceStreamAnswer, async (message) => {
            try {
                await this.activeRceStream?.client.sendAnswer(message.context.jsep);
            } catch (e) {
                this.postRceStreamError(
                    `Failed to start the video stream for device '${this.activeRceStream?.deviceName}': ${(e as Error).message}`,
                    this.activeRceStream?.deviceId,
                    this.activeRceStream?.deviceName
                );
            }
            return true;
        });

        this.addMessageCommandCallback(ViewProviderCommand.sendRceStreamIceCandidate, (message) => {
            const context = message.context;
            if (context.completed) {
                this.activeRceStream?.client.sendCandidatesComplete();
            } else {
                this.activeRceStream?.client.sendCandidate(context.candidate);
            }
            return Promise.resolve(true);
        });

        this.addMessageCommandCallback(ViewProviderCommand.stopRceStream, (message) => {
            this.stopActiveRceStream();
            return Promise.resolve(true);
        });

        //the Retry action re-sends watchRceDevice with the device id it remembered from
        //onRceStreamOffer. This webview can only reach this provider (each webview only talks to the
        //provider that owns it), so re-resolving the device's current stream details goes through the
        //rceWatchDeviceById internal command, which RceManagementViewProvider also uses to implement
        //its own webview's Watch button
        this.addMessageCommandCallback(ViewProviderCommand.watchRceDevice, async (message) => {
            const deviceId = message.context.deviceId;
            const deviceName = this.activeRceStream?.deviceName;
            this.stopActiveRceStream();
            try {
                await vscode.commands.executeCommand(VscodeCommand.rceWatchDeviceById, deviceId);
            } catch (e) {
                this.postRceStreamError(`Failed to restart the video stream: ${(e as Error).message}`, deviceId, deviceName);
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
        this.stopActiveRceStream();
    }

    protected onViewReady() {
        super.onViewReady();
        this.webviewReady = true;

        //onViewReady fires both on a cold open (the panel was just created, for example because
        //startRceStreamSession's own executeCommand('rokuDeviceView.focus') just created it) and on a
        //reload (the panel already existed and was closed/reopened, or the webview otherwise restarted).
        //Those need opposite handling:
        // - a session whose offer already reached a live webview (offerDelivered) has no answering side
        //   left once THIS onViewReady fires again, since that was a different, now-gone webview
        //   instance's peer connection - stop it.
        // - a session whose offer was posted but only queued (offerPosted, not yet delivered) is about
        //   to have that same offer flushed to this webview right after this callback returns
        //   (BaseWebviewViewProvider's order is: set viewReady, call onViewReady, then flush queued
        //   messages) - mark it delivered rather than stopping a session that is about to be answered.
        // - a session with no offer yet is still negotiating; leave it alone. Once its offer does post,
        //   webviewReady will already be true here, so startRceStreamSession marks it delivered (and
        //   posts, rather than queues, the offer) directly instead of ever queuing it.
        if (this.activeRceStream?.offerDelivered) {
            this.stopActiveRceStream();
        } else if (this.activeRceStream?.offerPosted) {
            this.activeRceStream.offerDelivered = true;
        }
    }

    /**
     * Create the Janus signaling client for a stream request. Split out so tests can supply a fake
     * client instead of opening a real WebSocket.
     */
    protected createSignalingClient(config: RceVideoSignalingConfig, options?: RceVideoSignalingClientOptions): RceVideoSignalingClient {
        return new RceVideoSignalingClient(config, options);
    }

    /**
     * Stop any active Janus signaling session, then connect a new one for the given stream request and
     * post its offer to the webview once negotiated. The api token is fetched here, extension-side, and
     * never included in the onRceStreamOffer payload sent to the webview.
     *
     * Posts onRceStreamConnecting first, before any async work (including the token fetch): the
     * webview only has a stream-mode UI to show anything in (the header, a "connecting" status, an
     * error banner) once it has seen this event, so without it a failure before the offer - no
     * account token, a connect() failure, a negotiation timeout - was previously invisible, silently
     * leaving the default screenshot/setup-form view showing instead.
     */
    private async startRceStreamSession(streamRequest: RceStreamRequestConfig): Promise<void> {
        this.stopActiveRceStream();

        this.postOrQueueMessage(this.createEventMessage(ViewProviderEvent.onRceStreamConnecting, {
            deviceId: streamRequest.deviceId,
            deviceName: streamRequest.deviceName
        }));

        const apiToken = await this.dependencies.rceManager.getToken();
        if (apiToken === undefined) {
            this.postRceStreamError(
                `No active Cloud Emulator account is configured; cannot watch device '${streamRequest.deviceName}'`,
                streamRequest.deviceId,
                streamRequest.deviceName
            );
            return;
        }

        const client = this.createSignalingClient({
            websocketUrl: streamRequest.websocketUrl,
            streamId: streamRequest.streamId,
            pin: streamRequest.pin,
            janusToken: streamRequest.janusToken,
            apiToken: apiToken,
            iceServers: streamRequest.iceServers
        });
        const session: ActiveRceStream = {
            client: client,
            deviceId: streamRequest.deviceId,
            deviceName: streamRequest.deviceName,
            offerPosted: false,
            offerDelivered: false
        };
        this.activeRceStream = session;

        client.on('error', (error) => {
            this.postRceStreamError(`Video stream error for device '${streamRequest.deviceName}': ${error.message}`, streamRequest.deviceId, streamRequest.deviceName);
        });
        client.on('close', () => {
            if (this.activeRceStream === session) {
                this.activeRceStream = undefined;
            }
            this.postOrQueueMessage(this.createEventMessage(ViewProviderEvent.onRceStreamClosed));
        });

        try {
            const { offer, iceServers } = await client.connect();
            session.offerPosted = true;
            //if the webview was already ready by the time the offer is ready to post, this post goes
            //straight to it rather than being queued, so it is already delivered - see onViewReady
            if (this.webviewReady) {
                session.offerDelivered = true;
            }
            this.postOrQueueMessage(this.createEventMessage(ViewProviderEvent.onRceStreamOffer, {
                deviceId: streamRequest.deviceId,
                deviceName: streamRequest.deviceName,
                offer: offer,
                iceServers: iceServers
            }));
        } catch (e) {
            this.postRceStreamError(
                `Failed to start the video stream for device '${streamRequest.deviceName}': ${(e as Error).message}`,
                streamRequest.deviceId,
                streamRequest.deviceName
            );
        }
    }

    private stopActiveRceStream(): void {
        this.activeRceStream?.client.stop();
        this.activeRceStream = undefined;
    }

    /**
     * Posts onRceStreamError, always carrying whatever device context is available (so the webview,
     * which may not yet be in stream mode when an early failure hits, can enter it itself and show
     * the error rather than the message going nowhere), and logs the full message to the extension
     * host console so a live signaling failure's real reason is captured there too.
     */
    private postRceStreamError(message: string, deviceId?: number, deviceName?: string): void {
        console.error(`RCE video stream error: ${message}`);
        this.postOrQueueMessage(this.createEventMessage(ViewProviderEvent.onRceStreamError, {
            message: message,
            deviceId: deviceId,
            deviceName: deviceName
        }));
    }
}

/**
 * Sent by RceManagementViewProvider's watchRceDevice handler when the user clicks Watch on a
 * running device. Never includes the RCE management api token; RokuDeviceViewViewProvider fetches
 * that itself, extension-side, when it creates the signaling client.
 */
export interface RceStreamRequestConfig {
    deviceId: number;
    deviceName: string;
    websocketUrl: string;
    streamId: number;
    pin?: string;
    janusToken?: string;
    iceServers: IceServer[];
}

interface ActiveRceStream {
    client: RceVideoSignalingClient;
    deviceId: number;
    deviceName: string;
    /**
     * Whether this session's onRceStreamOffer has been posted (immediately or queued) at all.
     */
    offerPosted: boolean;
    /**
     * Whether this session's offer has actually reached a live webview: either it was posted while
     * webviewReady was already true, or a later onViewReady saw it queued and is about to flush it.
     * Only a session with this true has a peer connection on the other end that onViewReady should
     * consider stale (and stop) the next time it fires.
     */
    offerDelivered: boolean;
}
