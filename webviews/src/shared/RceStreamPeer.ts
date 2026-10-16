import { EventEmitter } from 'eventemitter3';
import type { IceServer } from 'roku-deploy';

/**
 * The RTCPeerConnection side of a Roku Cloud Emulator device's Janus video stream. All Janus
 * signaling (create/attach/watch/start, keepalive, and so on) runs extension-side, over a WebSocket
 * to the device's Janus gateway (see roku-deploy's RceVideoSignalingClient), because that gateway
 * requires an Authorization header on the WebSocket handshake, which a webview WebSocket cannot set.
 *
 * This class only ever sees the resulting SDP offer (delivered via RokuDeviceViewViewProvider's
 * onRceStreamOffer event) and produces the SDP answer and local ICE candidates for the caller to
 * send back over that same message channel (sendRceStreamAnswer / sendRceStreamIceCandidate), rather
 * than talking to Janus directly.
 */
export class RceStreamPeer extends EventEmitter<RceStreamPeerEvents> {
    constructor(options: RceStreamPeerOptions = {}) {
        super();
        this.createPeerConnection = options.createPeerConnection ?? ((configuration) => new RTCPeerConnection(configuration));
    }

    private readonly createPeerConnection: (configuration: RTCConfiguration) => RTCPeerConnection;
    private peerConnection: RTCPeerConnection | undefined;

    /**
     * Answer an offer received from onRceStreamOffer. Emits 'answer' once the local description is
     * set (for the caller to send as sendRceStreamAnswer), and 'candidate' as local ICE candidates
     * are gathered (for the caller to send as sendRceStreamIceCandidate), including a completed
     * marker once gathering finishes. Media arrives via the 'track' event.
     */
    public async answerOffer(offer: RceStreamJsep, iceServers: IceServer[]): Promise<void> {
        this.stop();

        const peerConnection = this.createPeerConnection({ iceServers: iceServers });
        this.peerConnection = peerConnection;

        //the streaming plugin opens a data channel for some devices; the offer advertises it with an
        //application media section, and the answering side must create the channel before answering
        if (/m=application [1-9]\d*/.test(offer.sdp)) {
            peerConnection.createDataChannel('JanusDataChannel');
        }

        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                this.emit('candidate', { candidate: event.candidate.toJSON() });
            } else {
                this.emit('candidate', { completed: true });
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
            if (state === 'failed' || state === 'closed') {
                this.emit('error', new Error(`Video stream ICE connection ${state}`));
            }
        };

        await peerConnection.setRemoteDescription(offer);
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);

        this.emit('answer', { type: answer.type, sdp: answer.sdp });
    }

    /**
     * Close the peer connection. Safe to call more than once, or when nothing is connected.
     */
    public stop(): void {
        if (this.peerConnection) {
            this.peerConnection.onicecandidate = null;
            this.peerConnection.ontrack = null;
            this.peerConnection.oniceconnectionstatechange = null;
            this.peerConnection.close();
            this.peerConnection = undefined;
        }
    }
}

export interface RceStreamPeerOptions {
    createPeerConnection?: (configuration: RTCConfiguration) => RTCPeerConnection;
}

export interface RceStreamJsep {
    type: RTCSdpType;
    sdp: string;
}

export type RceStreamCandidateMessage = { candidate: RTCIceCandidateInit } | { completed: true };

export interface RceStreamPeerEvents {
    answer: (jsep: RceStreamJsep) => void;
    candidate: (message: RceStreamCandidateMessage) => void;
    track: (stream: MediaStream) => void;
    error: (error: Error) => void;
}
