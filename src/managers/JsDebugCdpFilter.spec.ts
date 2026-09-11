import { expect } from 'chai';
import { JsDebugCdpFilter } from './JsDebugCdpFilter';

describe('JsDebugCdpFilter', () => {
    let logMessages: string[];
    let filter: JsDebugCdpFilter;

    beforeEach(() => {
        logMessages = [];
        filter = new JsDebugCdpFilter((message) => logMessages.push(message));
    });

    it('forwards a plain HTTP discovery connection untouched in both directions', async () => {
        const request = Buffer.from('GET /json/list HTTP/1.1\r\nHost: localhost\r\n\r\n');
        const response = Buffer.from('HTTP/1.1 200 OK\r\nContent-Type: application/json\r\n\r\n[{"id":"1"}]');

        const upstreamOutput = await writeAndCollect(filter.upstream, [request]);
        expect(upstreamOutput).to.deep.equal(request);

        const downstreamOutput = await writeAndCollect(filter.downstream, [response]);
        expect(downstreamOutput).to.deep.equal(response);
    });

    it('forwards the upgrade handshake with Sec-WebSocket-Extensions stripped, other headers intact', async () => {
        const request = Buffer.from(
            'GET /json/list HTTP/1.1\r\n' +
            'Host: localhost\r\n' +
            'Upgrade: websocket\r\n' +
            'Connection: Upgrade\r\n' +
            'Sec-WebSocket-Extensions: permessage-deflate; client_max_window_bits\r\n' +
            'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n' +
            '\r\n'
        );

        const upstreamOutput = await writeAndCollect(filter.upstream, [request]);
        const outputText = upstreamOutput.toString('latin1');

        expect(outputText).to.not.match(/sec-websocket-extensions/i);
        expect(outputText).to.match(/^GET \/json\/list HTTP\/1\.1\r\n/);
        expect(outputText).to.match(/Host: localhost\r\n/);
        expect(outputText).to.match(/Upgrade: websocket\r\n/);
        expect(outputText).to.match(/Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n/);
        expect(outputText.endsWith('\r\n\r\n')).to.be.true;

        const response = Buffer.from('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n');
        const downstreamOutput = await writeAndCollect(filter.downstream, [response]);
        expect(downstreamOutput).to.deep.equal(response);
    });

    it('forwards the first Runtime.enable and drops the second, injecting a synthetic response', async () => {
        await completeUpgradeHandshake(filter);

        //attached before the duplicate is sent so the synthetic push (which happens synchronously,
        //without waiting for any device bytes) isn't missed while nothing is listening yet
        const downstreamCollector = new BufferCollector(filter.downstream);

        const firstFrame = buildMaskedTextFrame({ id: 1, method: 'Runtime.enable' });
        const firstOutput = await writeAndCollect(filter.upstream, [firstFrame]);
        expect(firstOutput).to.deep.equal(firstFrame);

        const secondFrame = buildMaskedTextFrame({ id: 2, method: 'Runtime.enable' });
        const secondOutput = await writeAndCollect(filter.upstream, [secondFrame]);
        expect(secondOutput.length).to.equal(0);

        //the downstream side is idle at a boundary, so the synthetic frame is flushed as soon as
        //the duplicate is detected upstream, without waiting for any device bytes
        const parsedSynthetic = parseUnmaskedTextFrame(downstreamCollector.take());
        expect(parsedSynthetic).to.deep.equal({ id: 2, result: {} });

        expect(logMessages.some((message) => message.includes('dropped duplicate Runtime.enable (id 2)'))).to.be.true;
        downstreamCollector.dispose();
    });

    it('injects the synthetic response only at a frame boundary, never mid-frame', async () => {
        await completeUpgradeHandshake(filter);

        //admit the first Runtime.enable so the second one below is the duplicate that gets dropped
        await writeAndCollect(filter.upstream, [buildMaskedTextFrame({ id: 1, method: 'Runtime.enable' })]);

        const devicePayload = Buffer.from(JSON.stringify({ method: 'Runtime.consoleAPICalled', params: { big: 'x'.repeat(500) } }));
        const deviceFrame = buildUnmaskedFrame(0x1, devicePayload);
        const splitPoint = Math.floor(deviceFrame.length / 2);
        const firstHalf = deviceFrame.subarray(0, splitPoint);
        const secondHalf = deviceFrame.subarray(splitPoint);

        const downstreamCollector = new BufferCollector(filter.downstream);

        filter.downstream.write(firstHalf);
        await tick();
        expect(downstreamCollector.take()).to.deep.equal(firstHalf);

        //while the device frame is still mid-flight, a duplicate Runtime.enable is detected
        //upstream and queues a synthetic response - it must not be spliced into the still-open
        //device frame above
        const droppedFrame = buildMaskedTextFrame({ id: 2, method: 'Runtime.enable' });
        await writeAndCollect(filter.upstream, [droppedFrame]);
        expect(downstreamCollector.take().length).to.equal(0);

        filter.downstream.write(secondHalf);
        await tick();
        const remainder = downstreamCollector.take();

        expect(remainder.subarray(0, secondHalf.length)).to.deep.equal(secondHalf);
        const synthetic = parseUnmaskedTextFrame(remainder.subarray(secondHalf.length));
        expect(synthetic).to.deep.equal({ id: 2, result: {} });

        downstreamCollector.dispose();
    });

    it('forwards a duplicate Debugger.enable untouched (only Runtime.enable is deduplicated)', async () => {
        await completeUpgradeHandshake(filter);

        const firstFrame = buildMaskedTextFrame({ id: 1, method: 'Debugger.enable' });
        const secondFrame = buildMaskedTextFrame({ id: 2, method: 'Debugger.enable' });

        expect(await writeAndCollect(filter.upstream, [firstFrame])).to.deep.equal(firstFrame);
        expect(await writeAndCollect(filter.upstream, [secondFrame])).to.deep.equal(secondFrame);
    });

    it('parses the HTTP head and frames when split across arbitrary chunk boundaries, byte by byte', async () => {
        await completeUpgradeHandshakeByteByByte(filter);

        //attached before the duplicate is sent so the synthetic push (which happens synchronously,
        //without waiting for any device bytes) isn't missed while nothing is listening yet
        const downstreamCollector = new BufferCollector(filter.downstream);

        const firstFrame = buildMaskedTextFrame({ id: 1, method: 'Runtime.enable' });
        const secondFrame = buildMaskedTextFrame({ id: 2, method: 'Runtime.enable' });

        const firstOutput = await writeAndCollect(filter.upstream, chunkByByte(firstFrame));
        expect(firstOutput).to.deep.equal(firstFrame);

        const secondOutput = await writeAndCollect(filter.upstream, chunkByByte(secondFrame));
        expect(secondOutput.length).to.equal(0);

        expect(parseUnmaskedTextFrame(downstreamCollector.take())).to.deep.equal({ id: 2, result: {} });
        downstreamCollector.dispose();
    });

    it('parses all three payload-length encodings (7-bit, 16-bit, 64-bit)', async () => {
        await completeUpgradeHandshake(filter);

        const smallPayload = Buffer.from(JSON.stringify({ method: 'Other.method', data: 'x'.repeat(10) }));
        const mediumPayload = Buffer.from(JSON.stringify({ method: 'Other.method', data: 'x'.repeat(200) }));
        const largePayload = Buffer.from(JSON.stringify({ method: 'Other.method', data: 'x'.repeat(70_000) }));

        for (const payload of [smallPayload, mediumPayload, largePayload]) {
            const frame = buildMaskedTextFrameFromPayload(payload);
            const output = await writeAndCollect(filter.upstream, [frame]);
            expect(output).to.deep.equal(frame);
        }
    });

    it('forwards control frames and fragmented/continuation frames untouched', async () => {
        await completeUpgradeHandshake(filter);

        const pingFrame = buildMaskedFrame(0x9, Buffer.from('ping-payload'));
        expect(await writeAndCollect(filter.upstream, [pingFrame])).to.deep.equal(pingFrame);

        const closeFrame = buildMaskedFrame(0x8, Buffer.alloc(0));
        expect(await writeAndCollect(filter.upstream, [closeFrame])).to.deep.equal(closeFrame);

        //a fragmented Runtime.enable (FIN=0) must not be treated as a complete message
        const fragmentedFirstPart = buildMaskedFrame(0x1, Buffer.from(JSON.stringify({ id: 3, method: 'Runtime.enable' })), false);
        const continuationPart = buildMaskedFrame(0x0, Buffer.from(''), true);
        expect(await writeAndCollect(filter.upstream, [fragmentedFirstPart])).to.deep.equal(fragmentedFirstPart);
        expect(await writeAndCollect(filter.upstream, [continuationPart])).to.deep.equal(continuationPart);
    });

    it('streams oversized frames through without inspecting them', async () => {
        await completeUpgradeHandshake(filter);

        //admit the real Runtime.enable first
        await writeAndCollect(filter.upstream, [buildMaskedTextFrame({ id: 1, method: 'Runtime.enable' })]);

        //an oversized frame that would otherwise look like a duplicate Runtime.enable must still
        //be forwarded verbatim, since it's streamed through uninspected rather than JSON-parsed
        const oversizedPayload = Buffer.concat([
            Buffer.from(JSON.stringify({ id: 2, method: 'Runtime.enable', padding: '' })),
            Buffer.alloc(300 * 1024, 'x')
        ]);
        const oversizedFrame = buildMaskedTextFrameFromPayload(oversizedPayload);

        const output = await writeAndCollect(filter.upstream, [oversizedFrame]);
        expect(output).to.deep.equal(oversizedFrame);
    });

    it('allows Runtime.enable again on a fresh connection (a new filter instance)', async () => {
        await completeUpgradeHandshake(filter);
        const firstFrame = buildMaskedTextFrame({ id: 1, method: 'Runtime.enable' });
        expect(await writeAndCollect(filter.upstream, [firstFrame])).to.deep.equal(firstFrame);

        const secondFilter = new JsDebugCdpFilter(() => { /* noop log */ });
        await completeUpgradeHandshake(secondFilter);
        const freshFrame = buildMaskedTextFrame({ id: 1, method: 'Runtime.enable' });
        expect(await writeAndCollect(secondFilter.upstream, [freshFrame])).to.deep.equal(freshFrame);
    });

    it('errors the upstream stream (rather than throwing synchronously) on an unmasked client frame', async () => {
        await completeUpgradeHandshake(filter);

        //reviewer's repro: `0x81 0x22 <34-byte payload>` - FIN=1 TEXT frame with the mask bit unset.
        //`unmask()` used to dereference a nonexistent mask key here and throw synchronously out of
        //_transform, which never becomes a stream 'error' and leaves the connection wedged
        const payload = Buffer.from(JSON.stringify({ id: 1, method: 'Runtime.enable' }));
        const unmaskedClientFrame = buildUnmaskedFrame(0x1, payload);

        let uncaughtException: unknown;
        const onUncaughtException = (error: unknown) => {
            uncaughtException = error;
        };
        process.on('uncaughtException', onUncaughtException);

        try {
            const errorPromise = new Promise<Error>((resolve) => {
                filter.upstream.once('error', resolve);
            });
            filter.upstream.write(unmaskedClientFrame);
            const caughtError = await errorPromise;

            expect(caughtError).to.be.instanceOf(Error);
            expect(caughtError.message).to.match(/unmasked/i);

            //give any queued uncaughtException handler a tick to fire, if it was going to
            await tick();
            expect(uncaughtException).to.be.undefined;
        } finally {
            process.removeListener('uncaughtException', onUncaughtException);
        }
    });

    it('treats a 101 response without an Upgrade header as a completed handshake', async () => {
        const request = Buffer.from(
            'GET /json/list HTTP/1.1\r\nHost: localhost\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n'
        );
        //some servers omit the Upgrade header on the 101 response while still switching protocols
        //(ws/llhttp both accept this) - the filter must not require it either, or the synthetic
        //reply below would be silently dropped and js-debug would hang awaiting it forever
        const response = Buffer.from('HTTP/1.1 101 Switching Protocols\r\nSec-WebSocket-Accept: abc123==\r\n\r\n');

        await writeAndCollect(filter.upstream, [request]);
        await writeAndCollect(filter.downstream, [response]);

        const downstreamCollector = new BufferCollector(filter.downstream);
        await writeAndCollect(filter.upstream, [buildMaskedTextFrame({ id: 1, method: 'Runtime.enable' })]);
        await writeAndCollect(filter.upstream, [buildMaskedTextFrame({ id: 2, method: 'Runtime.enable' })]);

        expect(parseUnmaskedTextFrame(downstreamCollector.take())).to.deep.equal({ id: 2, result: {} });
        downstreamCollector.dispose();
    });

    it('falls back to plain pass-through and stops deduping when the response is not a 101', async () => {
        const request = Buffer.from(
            'GET /json/list HTTP/1.1\r\nHost: localhost\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n'
        );
        const response = Buffer.from('HTTP/1.1 400 Bad Request\r\nContent-Length: 0\r\n\r\n');

        await writeAndCollect(filter.upstream, [request]);
        const downstreamOutput = await writeAndCollect(filter.downstream, [response]);
        expect(downstreamOutput).to.deep.equal(response);

        //no real session ever formed, so subsequent upstream bytes are raw pass-through rather than
        //parsed as WebSocket frames - forwarding "frame-shaped" bytes unmodified is the proof: a
        //live frame parser would consume/interpret them (and, for a second Runtime.enable, drop it)
        const firstEnableFrame = buildMaskedTextFrame({ id: 1, method: 'Runtime.enable' });
        const secondEnableFrame = buildMaskedTextFrame({ id: 2, method: 'Runtime.enable' });
        expect(await writeAndCollect(filter.upstream, [firstEnableFrame])).to.deep.equal(firstEnableFrame);
        expect(await writeAndCollect(filter.upstream, [secondEnableFrame])).to.deep.equal(secondEnableFrame);
    });

    it('errors the stream when a frame header claims an absurd payload length', async () => {
        await completeUpgradeHandshake(filter);

        //64-bit length field claiming ~1TB; the boundary tracker would otherwise count that down
        //forever without ever reaching a boundary again, silently wedging synthetic-frame delivery
        const header = Buffer.alloc(10);
        header[0] = 0x81; // FIN=1, opcode=1 (text)
        header[1] = 127; // unmasked (device direction), 64-bit length follows
        header.writeBigUInt64BE(BigInt(1024) * BigInt(1024) * BigInt(1024) * BigInt(1024), 2);

        const errorPromise = new Promise<Error>((resolve) => {
            filter.downstream.once('error', resolve);
        });
        filter.downstream.write(header);
        const caughtError = await errorPromise;

        expect(caughtError).to.be.instanceOf(Error);
        expect(caughtError.message).to.match(/exceeds/i);
    });

    it('echoes the sessionId in the synthetic response and dedupes Runtime.enable per sessionId', async () => {
        await completeUpgradeHandshake(filter);

        const downstreamCollector = new BufferCollector(filter.downstream);

        //two independent CDP target sessions on the same WebSocket - each legitimately gets its own
        //first Runtime.enable
        const sessionAFirst = buildMaskedTextFrame({ id: 1, method: 'Runtime.enable', sessionId: 'session-A' });
        const sessionBFirst = buildMaskedTextFrame({ id: 2, method: 'Runtime.enable', sessionId: 'session-B' });
        expect(await writeAndCollect(filter.upstream, [sessionAFirst])).to.deep.equal(sessionAFirst);
        expect(await writeAndCollect(filter.upstream, [sessionBFirst])).to.deep.equal(sessionBFirst);

        const sessionADuplicate = buildMaskedTextFrame({ id: 3, method: 'Runtime.enable', sessionId: 'session-A' });
        expect((await writeAndCollect(filter.upstream, [sessionADuplicate])).length).to.equal(0);

        const synthetic = parseUnmaskedTextFrame(downstreamCollector.take());
        expect(synthetic).to.deep.equal({ id: 3, result: {}, sessionId: 'session-A' });

        downstreamCollector.dispose();
    });

    it('forwards a duplicate Runtime.enable with a non-numeric id unmodified instead of dropping it', async () => {
        await completeUpgradeHandshake(filter);

        await writeAndCollect(filter.upstream, [buildMaskedTextFrame({ id: 1, method: 'Runtime.enable' })]);

        //a duplicate we can't answer (no numeric id to echo back) is forwarded rather than dropped -
        //protocol-garbage {"result":{}} with no id would be worse than letting Hermes see it
        const duplicateWithBadId = buildMaskedTextFrame({ id: 'not-a-number', method: 'Runtime.enable' });
        expect(await writeAndCollect(filter.upstream, [duplicateWithBadId])).to.deep.equal(duplicateWithBadId);
    });

    it('forwards a buffered partial HTTP head at EOF instead of discarding it', async () => {
        const partialRequest = Buffer.from('GET /json/list HTTP/1.1\r\nHost: local');
        const output = await endAndCollect(filter.upstream, [partialRequest]);
        expect(output).to.deep.equal(partialRequest);
    });
});

async function completeUpgradeHandshake(filter: JsDebugCdpFilter): Promise<void> {
    const request = Buffer.from(
        'GET /json/list HTTP/1.1\r\nHost: localhost\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n'
    );
    const response = Buffer.from('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n');
    await writeAndCollect(filter.upstream, [request]);
    await writeAndCollect(filter.downstream, [response]);
}

async function completeUpgradeHandshakeByteByByte(filter: JsDebugCdpFilter): Promise<void> {
    const request = Buffer.from(
        'GET /json/list HTTP/1.1\r\nHost: localhost\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n'
    );
    const response = Buffer.from('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n');
    await writeAndCollect(filter.upstream, chunkByByte(request));
    await writeAndCollect(filter.downstream, chunkByByte(response));
}

function chunkByByte(buffer: Buffer): Buffer[] {
    const chunks: Buffer[] = [];
    for (let index = 0; index < buffer.length; index++) {
        chunks.push(buffer.subarray(index, index + 1));
    }
    return chunks;
}

function writeAndCollect(transform: NodeJS.ReadWriteStream, chunks: Buffer[]): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        const received: Buffer[] = [];
        const onData = (chunk: Buffer) => received.push(chunk);
        const onError = (error: Error) => {
            transform.removeListener('data', onData);
            reject(error);
        };
        transform.on('data', onData);
        transform.once('error', onError);

        for (const chunk of chunks) {
            transform.write(chunk);
        }

        //there's no explicit end-of-batch signal on a long-lived proxy stream, so give queued
        //microtasks/timers a moment to flush before collecting whatever arrived synchronously
        setImmediate(() => {
            transform.removeListener('data', onData);
            transform.removeListener('error', onError);
            resolve(Buffer.concat(received));
        });
    });
}

/** Like `writeAndCollect`, but ends the stream afterward so `_flush` runs and any bytes it forwards are included. */
function endAndCollect(transform: NodeJS.ReadWriteStream, chunks: Buffer[]): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        const received: Buffer[] = [];
        transform.on('data', (chunk: Buffer) => received.push(chunk));
        transform.once('error', reject);
        transform.once('end', () => {
            resolve(Buffer.concat(received));
        });

        for (const chunk of chunks) {
            transform.write(chunk);
        }
        transform.end();
    });
}

function tick(): Promise<void> {
    return new Promise((resolve) => {
        setImmediate(resolve);
    });
}

/**
 * Accumulates `data` events from a stream across multiple `take()` calls, so a test can assert on
 * what arrived between two writes rather than only what arrived by the end of the whole test.
 */
class BufferCollector {
    constructor(private stream: NodeJS.ReadableStream) {
        this.stream.on('data', this.onData);
    }

    private chunks: Buffer[] = [];

    private onData = (chunk: Buffer) => {
        this.chunks.push(chunk);
    };

    public take(): Buffer {
        const collected = Buffer.concat(this.chunks);
        this.chunks = [];
        return collected;
    }

    public dispose(): void {
        this.stream.removeListener('data', this.onData);
    }
}

function buildMaskedTextFrame(message: { id?: number | string; method: string; sessionId?: string }): Buffer {
    return buildMaskedTextFrameFromPayload(Buffer.from(JSON.stringify(message)));
}

function buildMaskedTextFrameFromPayload(payload: Buffer): Buffer {
    return buildMaskedFrame(0x1, payload, true);
}

/** Builds an RFC 6455 client-to-server frame: masked, with the mask key XORed into the payload. */
function buildMaskedFrame(opcode: number, payload: Buffer, fin = true): Buffer {
    const maskKey = Buffer.from([0x12, 0x34, 0x56, 0x78]);
    const maskedPayload = Buffer.alloc(payload.length);
    for (let index = 0; index < payload.length; index++) {
        // eslint-disable-next-line no-bitwise
        maskedPayload[index] = payload[index] ^ maskKey[index % 4];
    }

    const header = buildFrameHeaderForTest(opcode, payload.length, true, fin);
    return Buffer.concat([header, maskKey, maskedPayload]);
}

/** Builds an RFC 6455 server-to-client frame: unmasked, as Hermes on the device would send it. */
function buildUnmaskedFrame(opcode: number, payload: Buffer, fin = true): Buffer {
    const header = buildFrameHeaderForTest(opcode, payload.length, false, fin);
    return Buffer.concat([header, payload]);
}

function buildFrameHeaderForTest(opcode: number, payloadLength: number, masked: boolean, fin: boolean): Buffer {
    // eslint-disable-next-line no-bitwise
    const finBit = fin ? 0x80 : 0x00;
    // eslint-disable-next-line no-bitwise
    const maskBit = masked ? 0x80 : 0x00;

    if (payloadLength <= 125) {
        // eslint-disable-next-line no-bitwise
        return Buffer.from([finBit | opcode, maskBit | payloadLength]);
    } else if (payloadLength <= 0xFFFF) {
        const header = Buffer.alloc(4);
        // eslint-disable-next-line no-bitwise
        header[0] = finBit | opcode;
        // eslint-disable-next-line no-bitwise
        header[1] = maskBit | 126;
        header.writeUInt16BE(payloadLength, 2);
        return header;
    } else {
        const header = Buffer.alloc(10);
        // eslint-disable-next-line no-bitwise
        header[0] = finBit | opcode;
        // eslint-disable-next-line no-bitwise
        header[1] = maskBit | 127;
        header.writeBigUInt64BE(BigInt(payloadLength), 2);
        return header;
    }
}

/** Parses a small unmasked server-to-client text frame (as the filter's synthetic injections are) back into its JSON payload, for assertions. */
function parseUnmaskedTextFrame(frame: Buffer): any {
    // eslint-disable-next-line no-bitwise
    const lengthIndicator = frame[1] & 0x7F;
    let offset = 2;
    let payloadLength = lengthIndicator;

    if (lengthIndicator === 126) {
        payloadLength = frame.readUInt16BE(2);
        offset = 4;
    } else if (lengthIndicator === 127) {
        payloadLength = Number(frame.readBigUInt64BE(2));
        offset = 10;
    }

    const payload = frame.subarray(offset, offset + payloadLength);
    return JSON.parse(payload.toString('utf8'));
}
