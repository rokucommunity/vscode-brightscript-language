import { expect } from 'chai';
import * as sinon from 'sinon';
import { RokuCloudEmulatorClient } from './RokuCloudEmulatorClient';
import { RokuCloudEmulatorVideoStream } from './RokuCloudEmulatorVideoStream';
import type { IceServer, SessionDescription, WebRtcPeerConnection } from './RokuCloudEmulatorVideoStream';

/**
 * Minimal in-memory socket.io double that records emitted events and lets tests deliver
 * server-to-client events synchronously.
 */
class FakeSocket {
    public connected = true;
    public emitted: Array<{ event: string; payload: any }> = [];
    private handlers = new Map<string, Array<(payload: any) => void>>();

    public emit(event: string, payload: any) {
        this.emitted.push({ event: event, payload: payload });
    }
    public on(event: string, handler: (payload: any) => void) {
        const list = this.handlers.get(event) ?? [];
        list.push(handler);
        this.handlers.set(event, list);
    }
    public off(event: string, handler: (payload: any) => void) {
        this.handlers.set(event, (this.handlers.get(event) ?? []).filter((existing) => existing !== handler));
    }
    public removeAllListeners() {
        this.handlers.clear();
    }
    public disconnect() {
        this.connected = false;
    }
    /** deliver a server-to-client event to all registered handlers */
    public deliver(event: string, payload?: any) {
        for (const handler of this.handlers.get(event) ?? []) {
            handler(payload);
        }
    }
    public emittedEvents(event: string) {
        return this.emitted.filter((entry) => entry.event === event);
    }
}

class FakePeerConnection implements WebRtcPeerConnection {
    public iceConnectionState = 'new';
    public onicecandidate: ((event: { candidate: any }) => void) | null = null;
    public ontrack: ((event: { streams: readonly unknown[] }) => void) | null = null;
    public oniceconnectionstatechange: (() => void) | null = null;
    public remoteDescription: SessionDescription | undefined;
    public localDescription: SessionDescription | undefined;
    public dataChannels: string[] = [];
    public closed = false;

    public setRemoteDescription(description: SessionDescription) {
        this.remoteDescription = description;
        return Promise.resolve();
    }
    public createAnswer(): Promise<SessionDescription> {
        return Promise.resolve({ type: 'answer', sdp: 'answer-sdp' });
    }
    public setLocalDescription(description: SessionDescription) {
        this.localDescription = description;
        return Promise.resolve();
    }
    public addIceCandidate() {
        // not exercised: the server offer carried end-of-candidates
        return Promise.resolve();
    }
    public createDataChannel(label: string) {
        this.dataChannels.push(label);
        return {};
    }
    public close() {
        this.closed = true;
    }
}

describe('RokuCloudEmulatorVideoStream', () => {
    let client: RokuCloudEmulatorClient;
    let socket: FakeSocket;
    let peerConnection: FakePeerConnection;
    let lastIceServers: IceServer[] | undefined;
    let stream: RokuCloudEmulatorVideoStream;

    const iceServers: IceServer[] = [{ urls: ['turn:ice.rce.roku.com:3478'], username: 'u', credential: 'c' }];

    function makeOffer(sdp: string) {
        return { data: { jsep: { type: 'offer', sdp: sdp }, iceServers: iceServers, restart: false } };
    }

    beforeEach(() => {
        client = new RokuCloudEmulatorClient({ apiKey: 'test-key' });
        socket = new FakeSocket();
        peerConnection = new FakePeerConnection();
        stream = new RokuCloudEmulatorVideoStream(client, '83', (configuration) => {
            lastIceServers = configuration.iceServers;
            return peerConnection;
        });
        sinon.stub(stream as any, 'createSocket').returns(socket);
    });

    afterEach(() => {
        sinon.restore();
    });

    it('emits ecp-init and watch once the socket connects', () => {
        void stream.connect();
        socket.deliver('connect');
        expect(socket.emittedEvents('ecp-init')).to.have.lengthOf(1);
        const watch = socket.emittedEvents('watch');
        expect(watch).to.have.lengthOf(1);
        expect(watch[0].payload.data).to.deep.include({ deviceId: '83', restart: false });
    });

    it('answers the offer with the offered ICE servers and emits start', async () => {
        void stream.connect();
        socket.deliver('connect');
        socket.deliver('offer', makeOffer('v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 97\r\n'));
        // allow the async offer handler to run
        await new Promise((resolve) => {
            setImmediate(resolve);
        });

        expect(lastIceServers).to.deep.equal(iceServers);
        expect(peerConnection.remoteDescription?.sdp).to.include('m=audio');
        const start = socket.emittedEvents('start');
        expect(start).to.have.lengthOf(1);
        expect(start[0].payload.data.jsep).to.deep.equal({ type: 'answer', sdp: 'answer-sdp' });
    });

    it('opens a data channel only when the offer advertises an application section', async () => {
        void stream.connect();
        socket.deliver('connect');
        socket.deliver('offer', makeOffer('v=0\r\nm=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\n'));
        await new Promise((resolve) => {
            setImmediate(resolve);
        });
        expect(peerConnection.dataChannels).to.deep.equal(['JanusDataChannel']);
    });

    it('trickles local ICE candidates and completes', async () => {
        void stream.connect();
        socket.deliver('connect');
        socket.deliver('offer', makeOffer('v=0\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\n'));
        await new Promise((resolve) => {
            setImmediate(resolve);
        });

        peerConnection.onicecandidate?.({ candidate: { candidate: 'candidate:1 1 udp', sdpMid: 'a' } });
        peerConnection.onicecandidate?.({ candidate: null });

        const trickles = socket.emittedEvents('trickle');
        expect(trickles).to.have.lengthOf(1);
        expect(trickles[0].payload.data.candidate.sdpMid).to.equal('a');
        expect(socket.emittedEvents('trickle-complete')).to.have.lengthOf(1);
    });

    it('emits track when media arrives', async () => {
        const trackHandler = sinon.spy();
        stream.on('track', trackHandler);
        void stream.connect();
        socket.deliver('connect');
        socket.deliver('offer', makeOffer('v=0\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\n'));
        await new Promise((resolve) => {
            setImmediate(resolve);
        });

        const fakeStream = { id: 'media' };
        peerConnection.ontrack?.({ streams: [fakeStream] });
        expect(trackHandler.calledOnceWith(fakeStream)).to.be.true;
    });

    it('resolves connect() when the server reports started', async () => {
        const connectPromise = stream.connect();
        socket.deliver('connect');
        socket.deliver('started', { data: { id: 0 } });
        await connectPromise;
    });

    it('rejects connect() on a failed ICE connection', async () => {
        const connectPromise = stream.connect();
        socket.deliver('connect');
        socket.deliver('offer', makeOffer('v=0\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\n'));
        await new Promise((resolve) => {
            setImmediate(resolve);
        });

        peerConnection.iceConnectionState = 'failed';
        peerConnection.oniceconnectionstatechange?.();

        let message = '';
        try {
            await connectPromise;
        } catch (error) {
            message = (error as Error).message;
        }
        expect(message).to.include('ICE connection failed');
    });
});
