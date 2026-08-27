import type { RceVideoJsep, RceVideoSignalingClient, RceVideoSignalingConfig, RceVideoSignalingClientOptions } from 'roku-deploy';
import { ViewProviderEvent } from './ViewProviderEvent';
import type { RceStreamRequestConfig } from '../managers/RceManager';
import { RceDeviceNotRunningError } from '../managers/RceManager';

/**
 * Owns one Cloud Emulator video stream's Janus signaling session on behalf of a webview that
 * renders the video. The signaling runs extension-side (the Janus WebSocket host requires an
 * Authorization header on the socket handshake, which only a Node WebSocket client can set); the
 * webview only ever sees the resulting SDP offer/answer and ICE candidates through the host's
 * message plumbing. Extracted from RokuDeviceViewViewProvider so the Cloud Emulator video editor
 * tabs can run their own sessions with the same lifecycle semantics.
 *
 * Connection resilience all funnels through one retry loop (runRetryLoop):
 * - a stream that drops after it was established (the signaling socket closed or errored, or the
 *   webview reported its peer connection failed) reconnects automatically, re-resolving the
 *   device's stream details through the host each attempt (a restarted instance has a fresh Janus
 *   url and TURN credentials);
 * - an initial start whose connection fails keeps trying the same way (a just-started device's
 *   gateway can refuse connections for a while after the device reports running);
 * - a device that is pending (starting up) is polled by status rather than connected to, without
 *   consuming connect attempts, until it reaches running - see beginWaitingForDevice;
 * - a device that is simply not running anymore (stopped by the user or its runtime limit) ends
 *   the loop with onRceStreamDeviceStopped instead of retrying.
 * Hosts can also feed device status changes from the management api poll into
 * handleDeviceStatusChanged, so an externally stopped device is noticed even while its Janus
 * socket lingers.
 */
export class RceStreamSession {
    constructor(private host: RceStreamSessionHost) { }

    private activeStream: ActiveRceStream | undefined;

    private reconnectState: RceStreamRetryState | undefined;

    /**
     * Remembers the device a device-stopped report was posted for, so the session resumes the
     * stream by itself when a later status poll shows that device starting again (see
     * handleDeviceStatusChanged). Cleared by stop() - an explicit stop (the user closed the tab or
     * left stream mode) opts out of resuming.
     */
    private stoppedDevice: StoppedRceDevice | undefined;

    /**
     * The backoff before each retry attempt's connection try; the array length is the attempt
     * limit. Instance-level (rather than const) so tests can shrink the delays.
     */
    private reconnectDelaysMs: number[] = [1000, 2000, 4000, 8000, 15000];

    /**
     * How often to re-check a pending (still starting) device's status, and how many such polls to
     * tolerate before giving up. Pending polls do not consume connect attempts: while the device is
     * starting there is nothing to connect to yet. Instance-level so tests can shrink them.
     */
    private pendingPollDelayMs = 5000;
    private pendingPollLimit = 36;

    /**
     * Guard against a reconnect cycle that never actually holds. A network that passes signaling
     * but blocks the media path (UDP/TURN) drops every stream right after its "successful"
     * negotiation - and since each negotiation ends the retry loop, every such cycle gets a fresh
     * attempt budget and mints another Janus session, forever. A stream that drops within
     * quickDropThresholdMs of posting its offer counts as a quick drop; quickDropCycleLimit
     * consecutive ones end the session with the error banner (whose Retry action starts fresh)
     * instead of reconnecting again, while a stream that held longer resets the count.
     * Instance-level so tests can adjust them.
     */
    private quickDropThresholdMs = 30000;
    private quickDropCycleLimit = 3;
    private consecutiveQuickDrops = 0;

    public get isActive(): boolean {
        return this.activeStream !== undefined || this.reconnectState !== undefined;
    }

    public get isReconnecting(): boolean {
        return this.reconnectState !== undefined;
    }

    public get deviceId(): number | undefined {
        return this.activeStream?.deviceId ?? this.reconnectState?.deviceId ?? this.stoppedDevice?.deviceId;
    }

    public get deviceName(): string | undefined {
        return this.activeStream?.deviceName ?? this.reconnectState?.deviceName ?? this.stoppedDevice?.deviceName;
    }

    /**
     * Stop any active signaling session, then connect a new one for the given stream request and
     * post its offer to the webview once negotiated. The api token is fetched here, extension-side,
     * and never included in the onRceStreamOffer payload sent to the webview. A failed connection
     * is retried in the background through the retry loop (the gateway of a just-started device can
     * refuse connections for a while), so a failure here surfaces as reconnect attempts and only
     * ends in the error banner once those run out.
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
            deviceName: streamRequest.deviceName,
            deviceType: streamRequest.deviceType
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

        //the retry state exists for the whole first try too, so the session reads as active (and a
        //failed try's cleanup knows not to deactivate it) from the moment start() commits to a stream
        const state: RceStreamRetryState = {
            deviceId: streamRequest.deviceId,
            deviceName: streamRequest.deviceName,
            droppedStream: false,
            cancelled: false
        };
        this.reconnectState = state;

        try {
            await this.openStream(streamRequest, apiToken);
            this.endRetryLoop(state);
        } catch (e) {
            if (state.cancelled) {
                return;
            }
            state.lastFailureMessage = (e as Error).message;
            console.error(`RCE video stream for device '${state.deviceName}' failed to connect, retrying: ${state.lastFailureMessage}`);
            void this.runRetryLoop(state);
        }
    }

    /**
     * Create the signaling client for a stream request and negotiate as far as posting the offer to
     * the webview. Throws on failure (releasing the failed client first, so an attempt never leaves
     * a half-open socket or keepalive behind); used by both start() and the retry loop.
     */
    private async openStream(streamRequest: RceStreamRequestConfig, apiToken: string): Promise<void> {
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
            //an established stream that errors (a Janus hangup, a socket error) has dropped;
            //reconnect rather than leaving a dead video behind an error banner. Errors before the
            //offer surface through the connect() rejection instead.
            if (this.activeStream === session && session.offerPosted) {
                console.error(`RCE video stream for device '${session.deviceName}' errored, reconnecting: ${error.message}`);
                this.beginReconnect(session);
            } else {
                this.postError(`Video stream error for device '${streamRequest.deviceName}': ${error.message}`, streamRequest.deviceId, streamRequest.deviceName);
            }
        });
        client.on('close', () => {
            //an established stream whose socket closed underneath us has dropped - reconnect. A
            //close during negotiation instead surfaces through the connect() rejection; a close
            //from our own stop() never lands here (stop() detaches the client's listeners first).
            if (this.activeStream === session && session.offerPosted) {
                console.error(`RCE video stream for device '${session.deviceName}' closed unexpectedly, reconnecting`);
                this.beginReconnect(session);
                return;
            }
            if (this.activeStream === session) {
                this.activeStream = undefined;
                this.host.onActiveChanged?.(false);
            }
            this.postEvent(ViewProviderEvent.onRceStreamClosed, {});
        });

        try {
            const { offer, iceServers } = await client.connect();
            session.offerPosted = true;
            session.establishedAt = Date.now();
            //if the webview was already ready by the time the offer is ready to post, this post goes
            //straight to it rather than being queued, so it is already delivered - see handleViewReady
            if (this.host.isViewReady()) {
                session.offerDelivered = true;
            }
            this.postEvent(ViewProviderEvent.onRceStreamOffer, {
                deviceId: streamRequest.deviceId,
                deviceName: streamRequest.deviceName,
                deviceType: streamRequest.deviceType,
                offer: offer,
                iceServers: iceServers
            });
        } catch (e) {
            client.stop();
            if (this.activeStream === session) {
                this.activeStream = undefined;
                //a failed try inside the retry loop leaves the session active (the loop itself
                //holds it); only a failure outside the loop deactivates the session
                if (!this.reconnectState) {
                    this.host.onActiveChanged?.(false);
                }
            }
            throw e;
        }
    }

    /**
     * Kick off the retry loop for a dropped stream. The dropped stream's client is released here,
     * but the session stays "active" for the whole loop (reconnectState holds it), so hosts treat a
     * reconnecting session like a running one.
     */
    private beginReconnect(droppedStream: ActiveRceStream): void {
        if (this.reconnectState) {
            return;
        }
        droppedStream.client.stop();
        if (this.activeStream === droppedStream) {
            this.activeStream = undefined;
        }
        //a drop right after negotiation is the signature of a blocked media path (signaling works,
        //so every cycle "connects" and then drops again); give up once that repeats instead of
        //looping forever - see the quickDrop fields' doc
        if (Date.now() - (droppedStream.establishedAt ?? 0) < this.quickDropThresholdMs) {
            this.consecutiveQuickDrops += 1;
            if (this.consecutiveQuickDrops >= this.quickDropCycleLimit) {
                this.host.onActiveChanged?.(false);
                this.postError(
                    `The video stream for device '${droppedStream.deviceName}' dropped right after connecting ${this.consecutiveQuickDrops} times in a row; the network may be blocking the stream's media connection (UDP/TURN)`,
                    droppedStream.deviceId,
                    droppedStream.deviceName
                );
                return;
            }
        } else {
            this.consecutiveQuickDrops = 0;
        }
        const state: RceStreamRetryState = {
            deviceId: droppedStream.deviceId,
            deviceName: droppedStream.deviceName,
            droppedStream: true,
            cancelled: false
        };
        this.reconnectState = state;
        void this.runRetryLoop(state);
    }

    /**
     * Enter the waiting-for-device phase directly: the device is pending (still starting), so there
     * is nothing to connect to yet. Used by hosts whose initial watch resolution found the device
     * pending, and by handleDeviceStatusChanged when a streamed device starts restarting. Any
     * current stream is released without deactivating the session; the retry loop connects once the
     * device reaches running.
     */
    public beginWaitingForDevice(deviceId: number, deviceName: string): void {
        if (this.reconnectState) {
            return;
        }
        this.stoppedDevice = undefined;
        if (this.activeStream) {
            this.activeStream.client.stop();
            this.activeStream = undefined;
        }
        const state: RceStreamRetryState = {
            deviceId: deviceId,
            deviceName: deviceName,
            droppedStream: false,
            waitingForDeviceFirst: true,
            cancelled: false
        };
        this.reconnectState = state;
        this.host.onActiveChanged?.(true);
        this.postEvent(ViewProviderEvent.onRceStreamConnecting, {
            deviceId: deviceId,
            deviceName: deviceName,
            waitingForDevice: true
        });
        void this.runRetryLoop(state);
    }

    /**
     * The connection retry loop shared by every resilience path (see the class doc). Each attempt:
     * announce (onRceStreamConnecting with the attempt counter), wait out the attempt's backoff,
     * re-resolve the device's stream details (pausing - without consuming attempts - while the
     * device is pending), then negotiate. Terminal outcomes: connected; the device is not running
     * (onRceStreamDeviceStopped); attempts or pending polls ran out (onRceStreamError, whose Retry
     * action still works).
     */
    private async runRetryLoop(state: RceStreamRetryState): Promise<void> {
        const attemptLimit = this.reconnectDelaysMs.length;
        let pendingPolls = 0;

        for (let attempt = 1; attempt <= attemptLimit; attempt++) {
            //a loop that starts in the waiting-for-device phase already announced itself and wants
            //its first status poll right away, not after a backoff behind a "reconnecting" status
            if (!(attempt === 1 && state.waitingForDeviceFirst)) {
                this.postEvent(ViewProviderEvent.onRceStreamConnecting, {
                    deviceId: state.deviceId,
                    deviceName: state.deviceName,
                    reconnectAttempt: attempt,
                    reconnectAttemptLimit: attemptLimit
                });
                await this.waitForDelay(state, this.reconnectDelaysMs[attempt - 1]);
                if (state.cancelled) {
                    return;
                }
            }

            try {
                //re-resolve rather than reusing any previous config: a restarted instance has a
                //fresh Janus url, pin, and TURN credentials. A pending device is polled here until
                //it reaches running, without consuming connect attempts.
                let streamRequest: RceStreamRequestConfig;
                for (; ;) {
                    try {
                        streamRequest = await this.host.resolveStreamRequest(state.deviceId);
                        break;
                    } catch (e) {
                        if (state.cancelled) {
                            return;
                        }
                        if (!RceDeviceNotRunningError.is(e) || (e as RceDeviceNotRunningError).deviceStatus !== 'pending') {
                            throw e;
                        }
                        pendingPolls += 1;
                        if (pendingPolls > this.pendingPollLimit) {
                            this.endRetryLoop(state);
                            this.host.onActiveChanged?.(false);
                            this.postError(`Timed out waiting for device '${state.deviceName}' to start`, state.deviceId, state.deviceName);
                            return;
                        }
                        this.postEvent(ViewProviderEvent.onRceStreamConnecting, {
                            deviceId: state.deviceId,
                            deviceName: state.deviceName,
                            waitingForDevice: true
                        });
                        await this.waitForDelay(state, this.pendingPollDelayMs);
                        if (state.cancelled) {
                            return;
                        }
                    }
                }
                if (state.cancelled) {
                    return;
                }
                state.deviceName = streamRequest.deviceName;

                const apiToken = await this.host.getApiToken();
                if (state.cancelled) {
                    return;
                }
                if (apiToken === undefined) {
                    throw new Error('No active Cloud Emulator account is configured');
                }

                await this.openStream(streamRequest, apiToken);
                this.endRetryLoop(state);
                return;
            } catch (e) {
                if (state.cancelled) {
                    return;
                }
                //a device that is not running anymore (and not pending - that is handled above) was
                //stopped (by the user or its runtime limit): a terminal state to report, not a
                //failure to retry
                if (RceDeviceNotRunningError.is(e)) {
                    this.endRetryLoop(state);
                    this.host.onActiveChanged?.(false);
                    this.postDeviceStopped((e as Error).message, state.deviceId, state.deviceName);
                    return;
                }
                state.lastFailureMessage = (e as Error).message;
                console.error(`RCE video stream connect attempt ${attempt}/${attemptLimit} for device '${state.deviceName}' failed: ${state.lastFailureMessage}`);
            }
        }
        if (state.cancelled) {
            return;
        }

        this.endRetryLoop(state);
        this.host.onActiveChanged?.(false);
        const lastFailureMessage = state.lastFailureMessage ?? 'the stream could not be established';
        this.postError(
            state.droppedStream
                ? `Lost the video stream for device '${state.deviceName}' and could not reconnect: ${lastFailureMessage}`
                : `Failed to start the video stream for device '${state.deviceName}': ${lastFailureMessage}`,
            state.deviceId,
            state.deviceName
        );
    }

    private endRetryLoop(state: RceStreamRetryState): void {
        if (this.reconnectState === state) {
            this.reconnectState = undefined;
        }
    }

    /**
     * Wait out a retry backoff or pending poll. The wait is stored on the retry state so stop()
     * can cut it short (resolving immediately) instead of leaving the loop parked on a dead timer.
     */
    private waitForDelay(state: RceStreamRetryState, delayMs: number): Promise<void> {
        return new Promise<void>((resolve) => {
            state.resumeDelay = resolve;
            state.delayTimer = setTimeout(resolve, delayMs);
        });
    }

    /**
     * The webview reported its peer connection failed (for example the ICE connection dropped).
     * The signaling side may still look healthy, so this is its own reconnect trigger: rerun the
     * whole negotiation for the current stream. Ignored when no established stream exists (the
     * retry loop, or an error banner with its Retry action, already owns that situation).
     */
    public handleStreamFailure(failureMessage?: string): void {
        if (this.activeStream?.offerPosted) {
            console.error(`RCE video stream peer failure reported by the webview for device '${this.activeStream.deviceName}', reconnecting: ${failureMessage ?? 'no reason given'}`);
            this.beginReconnect(this.activeStream);
        }
    }

    /**
     * Keep the stream in step with the device's management-api status (hosts feed RceFinder's poll
     * emissions through here). The Janus socket can linger after an instance stops, so this is what
     * notices an externally stopped device promptly: a streamed device that left 'running' tears
     * down - to the waiting-for-device phase when it is 'pending' (restarting), or to the
     * device-stopped state otherwise. And it works the other way too: a session showing the
     * device-stopped state resumes the stream by itself once the device starts again, so the video
     * surfaces stay in step with the management panel without any manual action. A session already
     * in its retry loop needs nothing here; the loop polls the device's status itself.
     */
    public handleDeviceStatusChanged(status: string | undefined): void {
        if (status === undefined) {
            return;
        }
        if (this.activeStream) {
            if (status === 'running') {
                return;
            }
            const stream = this.activeStream;
            if (status === 'pending') {
                console.error(`RCE device '${stream.deviceName}' is restarting; waiting to reconnect its video stream`);
                stream.client.stop();
                this.activeStream = undefined;
                this.beginWaitingForDevice(stream.deviceId, stream.deviceName);
            } else {
                this.stop();
                this.postDeviceStopped(`Device '${stream.deviceName}' was stopped`, stream.deviceId, stream.deviceName);
            }
            return;
        }
        //resume a stopped session when its device starts again ('pending' enters the waiting phase,
        //which connects once the device reaches running)
        if (this.stoppedDevice && !this.reconnectState && (status === 'running' || status === 'pending')) {
            const stoppedDevice = this.stoppedDevice;
            console.log(`RCE device '${stoppedDevice.deviceName}' is starting again; resuming its video stream`);
            this.beginWaitingForDevice(stoppedDevice.deviceId, stoppedDevice.deviceName);
        }
    }

    /**
     * Classify a host's watch-resolution failure the way the retry loop would: a pending device
     * enters the waiting-for-device phase, any other not-running device posts the device-stopped
     * state. Returns false (leaving the reporting to the host) for every other kind of error.
     */
    public handleDeviceNotRunning(error: unknown, deviceId: number, deviceName: string): boolean {
        if (!RceDeviceNotRunningError.is(error)) {
            return false;
        }
        if ((error as RceDeviceNotRunningError).deviceStatus === 'pending') {
            this.beginWaitingForDevice(deviceId, deviceName);
        } else {
            this.postDeviceStopped((error as Error).message, deviceId, deviceName);
        }
        return true;
    }

    public stop(): void {
        const wasActive = this.isActive;
        this.stoppedDevice = undefined;
        //an explicit stop (or the stop() inside a fresh start(), e.g. the error banner's Retry)
        //starts the quick-drop accounting over
        this.consecutiveQuickDrops = 0;
        if (this.reconnectState) {
            this.reconnectState.cancelled = true;
            clearTimeout(this.reconnectState.delayTimer);
            this.reconnectState.resumeDelay?.();
            this.reconnectState = undefined;
        }
        this.activeStream?.client.stop();
        this.activeStream = undefined;
        if (wasActive) {
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
     * A session mid-retry has no activeStream and needs nothing here: the loop's next attempt posts
     * its offer to whichever webview instance is live by then. A session in the device-stopped
     * state re-posts that state, since the previous webview instance's copy of it is gone.
     */
    public handleViewReady(): void {
        if (this.activeStream?.offerDelivered) {
            this.stop();
        } else if (this.activeStream?.offerPosted) {
            this.activeStream.offerDelivered = true;
        } else if (!this.activeStream && !this.reconnectState && this.stoppedDevice) {
            if (this.stoppedDevice.delivered) {
                //a fresh webview instance; the one that had the device-stopped state is gone
                this.postEvent(ViewProviderEvent.onRceStreamDeviceStopped, {
                    message: this.stoppedDevice.message,
                    deviceId: this.stoppedDevice.deviceId,
                    deviceName: this.stoppedDevice.deviceName
                });
            } else {
                //the queued device-stopped message is about to flush to this webview
                this.stoppedDevice.delivered = true;
            }
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

    /**
     * Posts onRceStreamDeviceStopped, which the webview renders as a neutral device-stopped state
     * rather than an error banner, and remembers the device so the session resumes its stream by
     * itself when a later status poll shows the device starting again.
     */
    public postDeviceStopped(message: string, deviceId?: number, deviceName?: string): void {
        if (deviceId !== undefined) {
            this.stoppedDevice = {
                deviceId: deviceId,
                deviceName: deviceName ?? 'Cloud Emulator device',
                message: message,
                //the same queued-versus-delivered bookkeeping as the offer's (see handleViewReady)
                delivered: this.host.isViewReady()
            };
        }
        this.postEvent(ViewProviderEvent.onRceStreamDeviceStopped, {
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
    /**
     * Re-resolve a device's current stream details for a retry attempt. Throws
     * RceDeviceNotRunningError when the device is not running: a pending status pauses the retry
     * loop in its waiting-for-device phase, any other ends it with a device-stopped report.
     */
    resolveStreamRequest(deviceId: number): Promise<RceStreamRequestConfig>;
    /** Optional notification whenever a stream session starts or fully stops (a session mid-retry still counts as active) */
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
     * When this session's negotiation completed (its offer posted), for the quick-drop accounting
     * in beginReconnect. Unset until offerPosted.
     */
    establishedAt?: number;
    /**
     * Whether this session's offer has actually reached a live webview: either it was posted while
     * the view was already ready, or a later ready report saw it queued and is about to flush it.
     * Only a session with this true has a peer connection on the other end that handleViewReady
     * should consider stale (and stop) the next time it fires.
     */
    offerDelivered: boolean;
}

/**
 * The device a device-stopped report was posted for, remembered so the session resumes its stream
 * when the device starts again and so a reloaded webview can be shown the stopped state again.
 */
interface StoppedRceDevice {
    deviceId: number;
    deviceName: string;
    message: string;
    /**
     * Whether the stopped report has actually reached a live webview - the same queued-versus-
     * delivered bookkeeping as ActiveRceStream.offerDelivered (see handleViewReady).
     */
    delivered: boolean;
}

/**
 * One in-flight retry loop's state. `cancelled` is checked after every await so a stop() (or a
 * fresh start()) that lands mid-attempt ends the loop instead of racing it.
 */
interface RceStreamRetryState {
    deviceId: number;
    deviceName: string;
    /**
     * Whether an established stream dropped to start this loop (true) or the loop is trying to
     * establish the first connection (false); picks the final failure message.
     */
    droppedStream: boolean;
    /**
     * Set when the loop begins in the waiting-for-device phase (the device was already known to be
     * pending): the waiting status was just announced, so the first attempt skips its own
     * announcement and backoff and goes straight to the status poll.
     */
    waitingForDeviceFirst?: boolean;
    lastFailureMessage?: string;
    cancelled: boolean;
    delayTimer?: ReturnType<typeof setTimeout>;
    resumeDelay?: () => void;
}
