import type { RceVideoJsep, RceVideoSignalingClient, RceVideoSignalingConfig, RceVideoSignalingClientOptions } from 'roku-deploy';
import { ViewProviderEvent } from './ViewProviderEvent';
import type { RceStreamRequestConfig } from '../managers/RceManager';

/**
 * Owns one Cloud Emulator video stream's Janus signaling session on behalf of a webview that
 * renders the video. The signaling runs extension-side (the Janus WebSocket host requires an
 * Authorization header on the socket handshake, which only a Node WebSocket client can set); the
 * webview only ever sees the resulting SDP offer/answer and ICE candidates through the host's
 * message plumbing. Extracted from RokuDeviceViewViewProvider so the Cloud Emulator video editor
 * tabs can run their own sessions with the same lifecycle semantics.
 */
export class RceStreamSession {
    constructor(private host: RceStreamSessionHost) { }

    private activeStream: ActiveRceStream | undefined;

    public get isActive(): boolean {
        return this.activeStream !== undefined;
    }

    public get deviceId(): number | undefined {
        return this.activeStream?.deviceId;
    }

    public get deviceName(): string | undefined {
        return this.activeStream?.deviceName;
    }

    /**
     * Stop any active signaling session, then connect a new one for the given stream request and
     * post its offer to the webview once negotiated. The api token is fetched here, extension-side,
     * and never included in the onRceStreamOffer payload sent to the webview.
     *
     * Posts onRceStreamConnecting first, before any async work (including the token fetch): the
     * webview only has a stream-mode UI to show anything in (the header, a "connecting" status, an
     * error banner) once it has seen this event, so without it a failure before the offer - no
     * account token, a connect() failure, a negotiation timeout - would be invisible.
     */
    public async start(streamRequest: RceStreamRequestConfig): Promise<void> {
        this.stop();

        this.postEvent(ViewProviderEvent.onRceStreamConnecting, {
            deviceId: streamRequest.deviceId,
            deviceName: streamRequest.deviceName
        });

        const apiToken = await this.host.getApiToken();
        if (apiToken === undefined) {
            this.postError(
                `No active Cloud Emulator account is configured; cannot watch device '${streamRequest.deviceName}'`,
                streamRequest.deviceId,
                streamRequest.deviceName
            );
            return;
        }

        const client = this.host.createSignalingClient({
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
        this.activeStream = session;
        this.host.onActiveChanged?.(true);

        client.on('error', (error) => {
            this.postError(`Video stream error for device '${streamRequest.deviceName}': ${error.message}`, streamRequest.deviceId, streamRequest.deviceName);
        });
        client.on('close', () => {
            if (this.activeStream === session) {
                this.activeStream = undefined;
                this.host.onActiveChanged?.(false);
            }
            this.postEvent(ViewProviderEvent.onRceStreamClosed, {});
        });

        try {
            const { offer, iceServers } = await client.connect();
            session.offerPosted = true;
            //if the webview was already ready by the time the offer is ready to post, this post goes
            //straight to it rather than being queued, so it is already delivered - see handleViewReady
            if (this.host.isViewReady()) {
                session.offerDelivered = true;
            }
            this.postEvent(ViewProviderEvent.onRceStreamOffer, {
                deviceId: streamRequest.deviceId,
                deviceName: streamRequest.deviceName,
                offer: offer,
                iceServers: iceServers
            });
        } catch (e) {
            this.postError(
                `Failed to start the video stream for device '${streamRequest.deviceName}': ${(e as Error).message}`,
                streamRequest.deviceId,
                streamRequest.deviceName
            );
        }
    }

    public stop(): void {
        this.activeStream?.client.stop();
        if (this.activeStream) {
            this.activeStream = undefined;
            this.host.onActiveChanged?.(false);
        }
    }

    /**
     * Relay the webview's SDP answer to the signaling client. Failures post through the stream
     * error banner rather than throwing back into the message plumbing.
     */
    public async sendAnswer(jsep: RceVideoJsep): Promise<void> {
        try {
            await this.activeStream?.client.sendAnswer(jsep);
        } catch (e) {
            this.postError(
                `Failed to start the video stream for device '${this.activeStream?.deviceName}': ${(e as Error).message}`,
                this.activeStream?.deviceId,
                this.activeStream?.deviceName
            );
        }
    }

    /**
     * Relay one of the webview's trickled ICE candidates (or its end-of-candidates marker, when
     * `context.completed` is set) to the signaling client.
     */
    public handleIceCandidate(context: { completed?: boolean; candidate?: unknown }): void {
        if (context.completed) {
            this.activeStream?.client.sendCandidatesComplete();
        } else {
            this.activeStream?.client.sendCandidate(context.candidate);
        }
    }

    /**
     * Reconcile the session with a webview that just reported ready. A ready report fires both on a
     * cold open and on a reload (the webview was closed/reopened or otherwise restarted), which need
     * opposite handling:
     * - a session whose offer already reached a live webview (offerDelivered) has no answering side
     *   left once this fires again, since that was a different, now-gone webview instance's peer
     *   connection - stop it.
     * - a session whose offer was posted but only queued (offerPosted, not yet delivered) is about
     *   to have that same offer flushed to this webview right after this call returns (the host's
     *   order is: set viewReady, reconcile, then flush queued messages) - mark it delivered rather
     *   than stopping a session that is about to be answered.
     * - a session with no offer yet is still negotiating; leave it alone. Once its offer does post,
     *   the view will already be ready, so start() marks it delivered directly instead of queuing.
     */
    public handleViewReady(): void {
        if (this.activeStream?.offerDelivered) {
            this.stop();
        } else if (this.activeStream?.offerPosted) {
            this.activeStream.offerDelivered = true;
        }
    }

    /**
     * Posts onRceStreamError, always carrying whatever device context is available (so the webview,
     * which may not yet be in stream mode when an early failure hits, can enter it itself and show
     * the error rather than the message going nowhere), and logs the full message to the extension
     * host console so a live signaling failure's real reason is captured there too.
     */
    public postError(message: string, deviceId?: number, deviceName?: string): void {
        console.error(`RCE video stream error: ${message}`);
        this.postEvent(ViewProviderEvent.onRceStreamError, {
            message: message,
            deviceId: deviceId,
            deviceName: deviceName
        });
    }

    private postEvent(event: ViewProviderEvent, context: Record<string, unknown>): void {
        this.host.postEvent(event, context);
    }
}

/**
 * What an RceStreamSession needs from whoever owns the webview its video renders in
 */
export interface RceStreamSessionHost {
    /** Resolve the management api token sent on the Janus WebSocket handshake */
    getApiToken(): Promise<string | undefined>;
    /** Post (or queue, until the webview is ready) an event message to the webview */
    postEvent(event: ViewProviderEvent, context: Record<string, unknown>): void;
    /** Whether the webview has reported ready (posted messages deliver immediately) */
    isViewReady(): boolean;
    /** Create the signaling client; hosts route this through a seam so tests can supply a fake */
    createSignalingClient(config: RceVideoSignalingConfig, options?: RceVideoSignalingClientOptions): RceVideoSignalingClient;
    /** Optional notification whenever a stream session starts or fully stops */
    onActiveChanged?(active: boolean): void;
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
     * the view was already ready, or a later ready report saw it queued and is about to flush it.
     * Only a session with this true has a peer connection on the other end that handleViewReady
     * should consider stale (and stop) the next time it fires.
     */
    offerDelivered: boolean;
}
