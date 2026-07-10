import { EventEmitter } from 'eventemitter3';
import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import type { RokuCloudEmulatorClient } from './RokuCloudEmulatorClient';
import { cloudEmulatorSocketPath } from './RokuCloudEmulatorRemote';

/**
 * Negotiates a WebRTC video/audio stream from a running Cloud Emulator device over the BFF socket.io
 * channel, following the same Janus streaming handshake the web viewer uses:
 *
 *   1. emit "ecp-init" then "watch" for the device
 *   2. receive "offer" (contains the SDP offer plus time-limited TURN ICE servers)
 *   3. create a peer connection with those ICE servers, answer the offer, emit "start"
 *   4. trickle local ICE candidates ("trickle", then "trickle-complete")
 *   5. receive "starting" then "started"; the media arrives via the peer connection's ontrack
 *
 * WebRTC itself is not implemented here. A peer-connection factory is injected so the same signaling
 * runs in a VS Code webview (browser RTCPeerConnection), in Node (a node-webrtc implementation), or
 * against a fake in tests.
 */
export class RokuCloudEmulatorVideoStream extends EventEmitter<RokuCloudEmulatorVideoStreamEvents> {
    constructor(
        private readonly client: RokuCloudEmulatorClient,
        private readonly deviceId: string,
        private readonly createPeerConnection: WebRtcPeerConnectionFactory
    ) {
        super();
    }

    private socket: Socket | undefined;
    private peerConnection: WebRtcPeerConnection | undefined;

    public get isConnected(): boolean {
        return this.socket?.connected ?? false;
    }

    /**
     * Open the socket and negotiate the stream. Resolves once the server reports the stream has
     * started, or rejects on a connection error or if it does not start within the timeout. The media
     * itself is delivered via the "track" event.
     */
    public connect(startTimeoutMs = 20000): Promise<void> {
        this.disconnect();

        const socket = this.createSocket();
        this.socket = socket;

        socket.on('connect', () => {
            socket.emit('ecp-init', { deviceId: this.deviceId });
            socket.emit('watch', { data: { deviceId: this.deviceId, restart: false }, _id: this.nextCorrelationId() });
        });
        socket.on('offer', (payload: OfferPayload) => {
            this.handleOffer(payload).catch((error: Error) => this.emit('error', error));
        });
        socket.on('started', () => {
            this.emit('started');
        });
        socket.on('disconnect', (reason: string) => {
            this.emit('close', reason);
        });

        return new Promise<void>((resolve, reject) => {
            const timeoutHandle = setTimeout(() => {
                cleanup();
                reject(new Error('Timed out waiting for the Cloud Emulator video stream to start'));
            }, startTimeoutMs);

            const onStarted = () => {
                cleanup();
                resolve();
            };
            const onConnectError = (error: Error) => {
                cleanup();
                reject(error);
            };
            const onError = (error: Error) => {
                cleanup();
                reject(error);
            };
            const cleanup = () => {
                clearTimeout(timeoutHandle);
                socket.off('started', onStarted);
                socket.off('connect_error', onConnectError);
                this.off('error', onError);
            };

            socket.on('started', onStarted);
            socket.on('connect_error', onConnectError);
            this.on('error', onError);
        });
    }

    public disconnect(): void {
        if (this.peerConnection) {
            this.peerConnection.close();
            this.peerConnection = undefined;
        }
        if (this.socket) {
            this.socket.removeAllListeners();
            this.socket.disconnect();
            this.socket = undefined;
        }
    }

    private async handleOffer(payload: OfferPayload): Promise<void> {
        const offer = payload?.data?.jsep;
        if (!offer?.sdp) {
            throw new Error('Cloud Emulator video offer did not include an SDP');
        }
        const peerConnection = this.createPeerConnection({ iceServers: payload.data.iceServers ?? [] });
        this.peerConnection = peerConnection;

        // the web viewer opens a data channel when the offer advertises an application media section
        if (/m=application [1-9]\d*/.test(offer.sdp)) {
            peerConnection.createDataChannel('JanusDataChannel');
        }

        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                this.socket?.emit('trickle', { data: { candidate: event.candidate }, _id: this.nextCorrelationId() });
            } else {
                this.socket?.emit('trickle-complete', { data: {}, _id: this.nextCorrelationId() });
            }
        };
        peerConnection.ontrack = (event) => {
            const stream = event.streams?.[0];
            if (stream) {
                this.emit('track', stream);
            }
        };
        peerConnection.oniceconnectionstatechange = () => {
            const state = peerConnection.iceConnectionState;
            this.emit('iceConnectionStateChange', state);
            if (state === 'failed' || state === 'closed') {
                this.emit('error', new Error(`WebRTC ICE connection ${state}`));
            }
        };

        await peerConnection.setRemoteDescription(offer);
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        this.socket?.emit('start', { data: { jsep: { type: 'answer', sdp: answer.sdp } }, _id: this.nextCorrelationId() });
    }

    /**
     * Create the underlying socket. Split out so tests can supply a fake socket.
     */
    protected createSocket(): Socket {
        return io(this.client.baseUrl, this.client.buildSocketIoOptions(cloudEmulatorSocketPath));
    }

    private correlationCounter = 0;
    private nextCorrelationId(): number {
        this.correlationCounter += 1;
        return this.correlationCounter;
    }
}

export interface IceServer {
    urls: string | string[];
    username?: string;
    credential?: string;
}

export interface SessionDescription {
    type: string;
    sdp: string;
}

export interface IceCandidatePayload {
    candidate: string;
    sdpMid?: string | null;
    sdpMLineIndex?: number | null;
    usernameFragment?: string | null;
}

export interface OfferPayload {
    data: {
        jsep: SessionDescription;
        iceServers?: IceServer[];
        restart?: boolean;
    };
    _id?: number;
}

/**
 * The subset of the WebRTC RTCPeerConnection API this signaling uses. Kept minimal and DOM-free so
 * it can be backed by a browser RTCPeerConnection, a node-webrtc implementation, or a test fake.
 */
export interface WebRtcPeerConnection {
    iceConnectionState: string;
    onicecandidate: ((event: { candidate: IceCandidatePayload | null }) => void) | null;
    ontrack: ((event: { streams: readonly unknown[] }) => void) | null;
    oniceconnectionstatechange: (() => void) | null;
    setRemoteDescription(description: SessionDescription): Promise<void>;
    createAnswer(): Promise<SessionDescription>;
    setLocalDescription(description: SessionDescription): Promise<void>;
    addIceCandidate(candidate: IceCandidatePayload): Promise<void>;
    createDataChannel(label: string): unknown;
    close(): void;
}

export type WebRtcPeerConnectionFactory = (configuration: { iceServers: IceServer[] }) => WebRtcPeerConnection;

export interface RokuCloudEmulatorVideoStreamEvents {
    track: (stream: unknown) => void;
    started: () => void;
    iceConnectionStateChange: (state: string) => void;
    error: (error: Error) => void;
    close: (reason: string) => void;
}
