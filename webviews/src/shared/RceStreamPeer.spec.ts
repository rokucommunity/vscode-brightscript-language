import { expect } from 'chai';
import { RceStreamPeer } from './RceStreamPeer';
import type { RceStreamJsep } from './RceStreamPeer';

/**
 * Minimal fake RTCPeerConnection: records the remote/local descriptions and lets the test fire
 * ontrack/oniceconnectionstatechange/onicecandidate directly.
 */
class FakePeerConnection {
    public onicecandidate: ((event: { candidate: any }) => void) | null = null;
    public ontrack: ((event: { streams: any[] }) => void) | null = null;
    public oniceconnectionstatechange: (() => void) | null = null;
    public iceConnectionState = 'new';
    public remoteDescription: any;
    public localDescription: any;
    public closed = false;
    public dataChannelLabels: string[] = [];

    public createDataChannel(label: string) {
        this.dataChannelLabels.push(label);
        return {};
    }

    public async setRemoteDescription(description: any) {
        this.remoteDescription = description;
    }

    public async createAnswer() {
        return { type: 'answer', sdp: 'v=0\r\no=- answer-sdp\r\n' };
    }

    public async setLocalDescription(description: any) {
        this.localDescription = description;
    }

    public close() {
        this.closed = true;
    }
}

function createOffer(overrides: Partial<RceStreamJsep> = {}): RceStreamJsep {
    return {
        type: 'offer',
        sdp: 'v=0\r\no=- offer-sdp\r\n',
        ...overrides
    };
}

describe('RceStreamPeer', () => {
    let fakePeerConnection: FakePeerConnection;

    function createStreamPeer(): RceStreamPeer {
        return new RceStreamPeer({
            createPeerConnection: () => {
                fakePeerConnection = new FakePeerConnection();
                return fakePeerConnection as unknown as RTCPeerConnection;
            }
        });
    }

    describe('answerOffer', () => {
        it('sets the remote description from the offer and emits the resulting local answer', async () => {
            const peer = createStreamPeer();
            const offer = createOffer();

            let emittedAnswer: RceStreamJsep | undefined;
            peer.on('answer', (answer) => {
                emittedAnswer = answer;
            });

            await peer.answerOffer(offer, [{ urls: ['stun:stun.example.com'] }]);

            expect(fakePeerConnection.remoteDescription).to.eql(offer);
            expect(emittedAnswer).to.eql({ type: 'answer', sdp: 'v=0\r\no=- answer-sdp\r\n' });
        });

        it('creates a data channel when the offer advertises an application media section', async () => {
            const peer = createStreamPeer();
            const offer = createOffer({ sdp: 'v=0\r\no=- offer-sdp\r\nm=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\n' });

            await peer.answerOffer(offer, []);

            expect(fakePeerConnection.dataChannelLabels).to.eql(['JanusDataChannel']);
        });

        it('does not create a data channel when the offer has no application media section', async () => {
            const peer = createStreamPeer();

            await peer.answerOffer(createOffer(), []);

            expect(fakePeerConnection.dataChannelLabels).to.eql([]);
        });

        it('stops any previous peer connection before answering a new offer', async () => {
            const peer = createStreamPeer();
            await peer.answerOffer(createOffer(), []);
            const firstPeerConnection = fakePeerConnection;

            await peer.answerOffer(createOffer(), []);

            expect(firstPeerConnection.closed).to.be.true;
            expect(fakePeerConnection.closed).to.be.false;
        });
    });

    describe('trickle ICE', () => {
        it('emits a candidate event for each local candidate, then a completed candidate event once gathering ends', async () => {
            const peer = createStreamPeer();
            await peer.answerOffer(createOffer(), []);

            const emittedMessages: any[] = [];
            peer.on('candidate', (message) => {
                emittedMessages.push(message);
            });

            const fakeCandidate = {
                candidate: 'candidate:1 1 UDP 1 1.2.3.4 5000 typ host',
                sdpMid: '0',
                sdpMLineIndex: 0,
                toJSON: () => ({ candidate: 'candidate:1 1 UDP 1 1.2.3.4 5000 typ host', sdpMid: '0', sdpMLineIndex: 0 })
            };
            fakePeerConnection.onicecandidate?.({ candidate: fakeCandidate });
            fakePeerConnection.onicecandidate?.({ candidate: null });

            expect(emittedMessages).to.eql([
                { candidate: { candidate: 'candidate:1 1 UDP 1 1.2.3.4 5000 typ host', sdpMid: '0', sdpMLineIndex: 0 } },
                { completed: true }
            ]);
        });
    });

    describe('track', () => {
        it('emits the track event with the remote MediaStream', async () => {
            const peer = createStreamPeer();
            await peer.answerOffer(createOffer(), []);

            const fakeStream = {} as MediaStream;
            let emittedStream: MediaStream | undefined;
            peer.on('track', (mediaStream) => {
                emittedStream = mediaStream;
            });

            fakePeerConnection.ontrack?.({ streams: [fakeStream] });

            expect(emittedStream).to.equal(fakeStream);
        });
    });

    describe('errors', () => {
        it('emits an error event when the ICE connection fails', async () => {
            const peer = createStreamPeer();
            await peer.answerOffer(createOffer(), []);

            let emittedError: Error | undefined;
            peer.on('error', (error) => {
                emittedError = error;
            });

            fakePeerConnection.iceConnectionState = 'failed';
            fakePeerConnection.oniceconnectionstatechange?.();

            expect(emittedError?.message).to.contain('failed');
        });
    });

    describe('stop', () => {
        it('closes the peer connection', async () => {
            const peer = createStreamPeer();
            await peer.answerOffer(createOffer(), []);

            peer.stop();

            expect(fakePeerConnection.closed).to.be.true;
        });

        it('is safe to call when nothing is connected', () => {
            const peer = createStreamPeer();

            expect(() => peer.stop()).not.to.throw();
        });

        it('is safe to call more than once', async () => {
            const peer = createStreamPeer();
            await peer.answerOffer(createOffer(), []);

            peer.stop();

            expect(() => peer.stop()).not.to.throw();
        });
    });
});
