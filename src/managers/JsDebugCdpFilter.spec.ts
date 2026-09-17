import { expect } from 'chai';
import { JsDebugCdpFilter, normalizeFileUrl } from './JsDebugCdpFilter';

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

    describe('Host/Origin validation', () => {
        it('rejects an upgrade request with a foreign Host header', async () => {
            const request = Buffer.from(
                'GET /json/list HTTP/1.1\r\nHost: evil.example\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n'
            );
            const errorPromise = new Promise<Error>((resolve) => {
                filter.upstream.once('error', resolve);
            });
            filter.upstream.write(request);
            const caughtError = await errorPromise;
            expect(caughtError.message).to.match(/host/i);
        });

        it('rejects a request carrying an Origin header, even with a valid Host', async () => {
            const request = Buffer.from(
                'GET /json/list HTTP/1.1\r\nHost: localhost\r\nOrigin: http://evil.example\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n'
            );
            const errorPromise = new Promise<Error>((resolve) => {
                filter.upstream.once('error', resolve);
            });
            filter.upstream.write(request);
            const caughtError = await errorPromise;
            expect(caughtError.message).to.match(/origin/i);
        });

        it('accepts Host: 127.0.0.1:9229 and Host: localhost', async () => {
            const requestWithPort = Buffer.from(
                'GET /json/list HTTP/1.1\r\nHost: 127.0.0.1:9229\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n'
            );
            const output = await writeAndCollect(filter.upstream, [requestWithPort]);
            expect(output.length).to.be.greaterThan(0);

            const secondFilter = new JsDebugCdpFilter(() => { /* noop log */ });
            const requestWithLocalhost = Buffer.from(
                'GET /json/list HTTP/1.1\r\nHost: localhost\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n'
            );
            const secondOutput = await writeAndCollect(secondFilter.upstream, [requestWithLocalhost]);
            expect(secondOutput.length).to.be.greaterThan(0);
        });

        it('rejects a request with no Host header at all', async () => {
            const request = Buffer.from('GET /json/list HTTP/1.1\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n');
            const errorPromise = new Promise<Error>((resolve) => {
                filter.upstream.once('error', resolve);
            });
            filter.upstream.write(request);
            const caughtError = await errorPromise;
            expect(caughtError.message).to.match(/host/i);
        });

        it('rejects a non-upgrade /json/list request with a bad Host too', async () => {
            const request = Buffer.from('GET /json/list HTTP/1.1\r\nHost: evil.example\r\n\r\n');
            const errorPromise = new Promise<Error>((resolve) => {
                filter.upstream.once('error', resolve);
            });
            filter.upstream.write(request);
            const caughtError = await errorPromise;
            expect(caughtError.message).to.match(/host/i);
        });
    });

    describe('setBreakpointByUrl rewrite (masked-frame re-encode)', () => {
        it('rewrites a four-slash url on Debugger.setBreakpointByUrl and logs both urls', async () => {
            await completeUpgradeHandshake(filter);

            const originalUrl = 'file:////source/compiled/index.js';
            const message = { id: 5, method: 'Debugger.setBreakpointByUrl', params: { url: originalUrl, lineNumber: 42 } };
            const frame = buildMaskedTextFrameFromPayload(Buffer.from(JSON.stringify(message)));

            const output = await writeAndCollect(filter.upstream, [frame]);
            expect(output).to.not.deep.equal(frame);

            const parsed = parseMaskedTextFrame(output);
            expect(parsed).to.deep.equal({ id: 5, method: 'Debugger.setBreakpointByUrl', params: { url: 'file:///source/compiled/index.js', lineNumber: 42 } });

            expect(logMessages.some((message) => message.includes(originalUrl) && message.includes('file:///source/compiled/index.js'))).to.be.true;
        });

        it('leaves an already-correct three-slash url byte-identical, with no rewrite log', async () => {
            await completeUpgradeHandshake(filter);

            const message = { id: 6, method: 'Debugger.setBreakpointByUrl', params: { url: 'file:///source/compiled/index.js', lineNumber: 1 } };
            const frame = buildMaskedTextFrameFromPayload(Buffer.from(JSON.stringify(message)));

            const output = await writeAndCollect(filter.upstream, [frame]);
            expect(output).to.deep.equal(frame);
            expect(logMessages.some((message) => message.includes('rewrote'))).to.be.false;
        });

        it('leaves a four-slash url on a different method byte-identical', async () => {
            await completeUpgradeHandshake(filter);

            const message = { id: 7, method: 'Debugger.getPossibleBreakpoints', params: { url: 'file:////source/compiled/index.js' } };
            const frame = buildMaskedTextFrameFromPayload(Buffer.from(JSON.stringify(message)));

            const output = await writeAndCollect(filter.upstream, [frame]);
            expect(output).to.deep.equal(frame);
        });

        it('leaves a non-Debugger method (first Runtime.enable) byte-identical', async () => {
            await completeUpgradeHandshake(filter);

            const frame = buildMaskedTextFrame({ id: 1, method: 'Runtime.enable' });
            const output = await writeAndCollect(filter.upstream, [frame]);
            expect(output).to.deep.equal(frame);
        });

        it('leaves setBreakpointByUrl with only urlRegex (no url) byte-identical', async () => {
            await completeUpgradeHandshake(filter);

            const message = { id: 8, method: 'Debugger.setBreakpointByUrl', params: { urlRegex: 'file:////source/.*\\.js', lineNumber: 1 } };
            const frame = buildMaskedTextFrameFromPayload(Buffer.from(JSON.stringify(message)));

            const output = await writeAndCollect(filter.upstream, [frame]);
            expect(output).to.deep.equal(frame);
        });

        it('re-encodes correctly when the rewritten payload crosses the 125/126-byte header boundary', async () => {
            await completeUpgradeHandshake(filter);

            //padding lengths picked (once, offline) so the ORIGINAL (four-slash) payload lands at
            //exactly 126/65536 bytes and the REWRITTEN (three-slash, one byte shorter) payload
            //lands at exactly 125/65535 - the 4-byte-header/2-byte-header and 10-byte/4-byte
            //header-encoding boundaries respectively
            const originalUrlSmall = `file:////source/${'x'.repeat(34)}/index.js`;
            const messageSmall = { id: 9, method: 'Debugger.setBreakpointByUrl', params: { url: originalUrlSmall } };
            const payloadSmall = Buffer.from(JSON.stringify(messageSmall));
            expect(payloadSmall.length).to.equal(126);
            expect(Buffer.from(JSON.stringify({ ...messageSmall, params: { url: normalizeFileUrl(originalUrlSmall) } })).length).to.equal(125);

            const frameSmall = buildMaskedTextFrameFromPayload(payloadSmall);
            const outputSmall = await writeAndCollect(filter.upstream, [frameSmall]);
            const parsedSmall = parseMaskedTextFrame(outputSmall);
            expect(parsedSmall.params.url).to.equal(normalizeFileUrl(originalUrlSmall));

            //header-encoding proof: 125 fits the 7-bit length field directly (a 2-byte header),
            //not the 126 extended-length encoding (a 4-byte header) the ORIGINAL payload would need
            // eslint-disable-next-line no-bitwise
            expect(outputSmall[1] & 0x7F).to.equal(125);
            // eslint-disable-next-line no-bitwise
            expect(outputSmall[1] & 0x80).to.equal(0x80); // mask bit still set
            expect(outputSmall.subarray(2, 6)).to.deep.equal(DEFAULT_TEST_MASK_KEY);
            expect(outputSmall.length).to.equal(2 + 4 + 125); // 2-byte header + 4-byte mask key + payload

            const originalUrlLarge = `file:////source/${'x'.repeat(65_443)}/index.js`;
            const messageLarge = { id: 10, method: 'Debugger.setBreakpointByUrl', params: { url: originalUrlLarge } };
            const payloadLarge = Buffer.from(JSON.stringify(messageLarge));
            expect(payloadLarge.length).to.equal(65_536);
            expect(Buffer.from(JSON.stringify({ ...messageLarge, params: { url: normalizeFileUrl(originalUrlLarge) } })).length).to.equal(65_535);

            const frameLarge = buildMaskedTextFrameFromPayload(payloadLarge);
            const outputLarge = await writeAndCollect(filter.upstream, [frameLarge]);
            const parsedLarge = parseMaskedTextFrame(outputLarge);
            expect(parsedLarge.params.url).to.equal(normalizeFileUrl(originalUrlLarge));

            //header-encoding proof: 65535 fits the 16-bit extended-length encoding (a 4-byte
            //header), not the 64-bit encoding (a 10-byte header) the ORIGINAL payload would need
            // eslint-disable-next-line no-bitwise
            expect(outputLarge[1] & 0x7F).to.equal(126);
            expect(outputLarge.readUInt16BE(2)).to.equal(65_535);
            expect(outputLarge.subarray(4, 8)).to.deep.equal(DEFAULT_TEST_MASK_KEY);
            expect(outputLarge.length).to.equal(4 + 4 + 65_535); // 4-byte header + 4-byte mask key + payload
        });

        it('rewrites a setBreakpointByUrl url and dedupes a duplicate Runtime.enable on the same connection', async () => {
            await completeUpgradeHandshake(filter);

            const downstreamCollector = new BufferCollector(filter.downstream);

            const firstEnable = buildMaskedTextFrame({ id: 1, method: 'Runtime.enable' });
            expect(await writeAndCollect(filter.upstream, [firstEnable])).to.deep.equal(firstEnable);

            const rewriteMessage = { id: 2, method: 'Debugger.setBreakpointByUrl', params: { url: 'file:////source/compiled/index.js' } };
            const rewriteFrame = buildMaskedTextFrameFromPayload(Buffer.from(JSON.stringify(rewriteMessage)));
            const rewriteOutput = await writeAndCollect(filter.upstream, [rewriteFrame]);
            expect(parseMaskedTextFrame(rewriteOutput).params.url).to.equal('file:///source/compiled/index.js');

            const secondEnable = buildMaskedTextFrame({ id: 3, method: 'Runtime.enable' });
            expect((await writeAndCollect(filter.upstream, [secondEnable])).length).to.equal(0);
            expect(parseUnmaskedTextFrame(downstreamCollector.take())).to.deep.equal({ id: 3, result: {} });

            downstreamCollector.dispose();
        });
    });

    describe('fin tracking (message-boundary-only synthetic injection)', () => {
        it('only injects a synthetic frame after a fragmented downstream message fully completes', async () => {
            await completeUpgradeHandshake(filter);
            await writeAndCollect(filter.upstream, [buildMaskedTextFrame({ id: 1, method: 'Runtime.enable' })]);

            const downstreamCollector = new BufferCollector(filter.downstream);

            //a fragmented device message: fin=0 text frame, then a fin=1 continuation
            const firstFragmentPayload = Buffer.from('first-half');
            const firstFragment = buildFrameHeaderForTest(0x1, firstFragmentPayload.length, false, false);
            filter.downstream.write(Buffer.concat([firstFragment, firstFragmentPayload]));
            await tick();
            downstreamCollector.take();

            //a duplicate Runtime.enable is detected while the message is still open (mid-fragment,
            //not mid-frame) - the synthetic must NOT be spliced in here
            const droppedFrame = buildMaskedTextFrame({ id: 2, method: 'Runtime.enable' });
            await writeAndCollect(filter.upstream, [droppedFrame]);
            expect(downstreamCollector.take().length).to.equal(0);

            const continuationPayload = Buffer.from('second-half');
            const continuationHeader = buildFrameHeaderForTest(0x0, continuationPayload.length, false, true);
            filter.downstream.write(Buffer.concat([continuationHeader, continuationPayload]));
            await tick();
            const afterContinuation = downstreamCollector.take();

            expect(afterContinuation.subarray(0, continuationHeader.length + continuationPayload.length))
                .to.deep.equal(Buffer.concat([continuationHeader, continuationPayload]));
            const synthetic = parseUnmaskedTextFrame(afterContinuation.subarray(continuationHeader.length + continuationPayload.length));
            expect(synthetic).to.deep.equal({ id: 2, result: {} });

            downstreamCollector.dispose();
        });

        it('does not treat a control frame interleaved between fragments as a message boundary', async () => {
            await completeUpgradeHandshake(filter);
            await writeAndCollect(filter.upstream, [buildMaskedTextFrame({ id: 1, method: 'Runtime.enable' })]);

            const downstreamCollector = new BufferCollector(filter.downstream);

            //RFC 6455 §5.4 permits control frames (always FIN=1) interleaved between the fragments
            //of a still-open data message - a ping here must not be mistaken for a message boundary
            const firstFragmentPayload = Buffer.from('first-half');
            const firstFragment = buildFrameHeaderForTest(0x1, firstFragmentPayload.length, false, false);
            filter.downstream.write(Buffer.concat([firstFragment, firstFragmentPayload]));
            await tick();
            downstreamCollector.take();

            const pingPayload = Buffer.from('ping-payload');
            const pingFrame = buildFrameHeaderForTest(0x9, pingPayload.length, false, true);
            filter.downstream.write(Buffer.concat([pingFrame, pingPayload]));
            await tick();
            downstreamCollector.take();

            //a duplicate Runtime.enable is detected right after the ping - the message is still
            //open (only a control frame has completed since the fin=0 fragment), so the synthetic
            //must NOT be spliced in yet
            const droppedFrame = buildMaskedTextFrame({ id: 2, method: 'Runtime.enable' });
            await writeAndCollect(filter.upstream, [droppedFrame]);
            expect(downstreamCollector.take().length).to.equal(0);

            const continuationPayload = Buffer.from('second-half');
            const continuationHeader = buildFrameHeaderForTest(0x0, continuationPayload.length, false, true);
            filter.downstream.write(Buffer.concat([continuationHeader, continuationPayload]));
            await tick();
            const afterContinuation = downstreamCollector.take();

            expect(afterContinuation.subarray(0, continuationHeader.length + continuationPayload.length))
                .to.deep.equal(Buffer.concat([continuationHeader, continuationPayload]));
            const synthetic = parseUnmaskedTextFrame(afterContinuation.subarray(continuationHeader.length + continuationPayload.length));
            expect(synthetic).to.deep.equal({ id: 2, result: {} });

            downstreamCollector.dispose();
        });
    });

    describe('bounded parser state (security hardening caps)', () => {
        it('still dedupes a Runtime.enable whose sessionId exceeds the length cap, via a hashed key', async () => {
            await completeUpgradeHandshake(filter);

            const downstreamCollector = new BufferCollector(filter.downstream);

            const overlongSessionId = 'x'.repeat(300);
            const firstFrame = buildMaskedTextFrame({ id: 1, method: 'Runtime.enable', sessionId: overlongSessionId });
            const secondFrame = buildMaskedTextFrame({ id: 2, method: 'Runtime.enable', sessionId: overlongSessionId });

            //the first is forwarded (first-seen for this sessionId); the duplicate is still
            //dropped with a synthetic response, exactly as a normal-length sessionId would be -
            //an overlong sessionId is hashed down to a fixed-width dedupe key, not exempted from
            //dedupe entirely (which would re-arm the crash this filter exists to prevent)
            expect(await writeAndCollect(filter.upstream, [firstFrame])).to.deep.equal(firstFrame);
            expect((await writeAndCollect(filter.upstream, [secondFrame])).length).to.equal(0);
            expect(parseUnmaskedTextFrame(downstreamCollector.take())).to.deep.equal({ id: 2, result: {}, sessionId: overlongSessionId });

            expect(logMessages.some((message) => message.includes('exceeded') && message.includes('chars'))).to.be.true;

            downstreamCollector.dispose();
        });

        it('suppresses log output after the per-connection cap and emits one final notice', async () => {
            await completeUpgradeHandshake(filter);

            //each iteration logs one line via the oversized-frame skip path, cheaply exercising the
            //rate limiter without needing 200 distinct Runtime.enable sessions
            const oversizedPayload = Buffer.concat([Buffer.from(JSON.stringify({ method: 'Other.method' })), Buffer.alloc(300 * 1024, 'x')]);
            const oversizedFrame = buildMaskedTextFrameFromPayload(oversizedPayload);

            for (let index = 0; index < 205; index++) {
                await writeAndCollect(filter.upstream, [oversizedFrame]);
            }

            expect(logMessages.length).to.be.lessThan(205);
            expect(logMessages[logMessages.length - 1]).to.match(/suppressed/i);
        });
    });
});

describe('normalizeFileUrl', () => {
    it('collapses the four-slash form js-debug produces on windows', () => {
        expect(normalizeFileUrl('file:////source/compiled/index.js')).to.equal('file:///source/compiled/index.js');
    });

    it('collapses more than one extra slash too', () => {
        expect(normalizeFileUrl('file://////source/compiled/index.js')).to.equal('file:///source/compiled/index.js');
    });

    it('leaves a correct three-slash url alone', () => {
        expect(normalizeFileUrl('file:///source/compiled/index.js')).to.equal('file:///source/compiled/index.js');
    });

    it('leaves a normal windows file url alone', () => {
        expect(normalizeFileUrl('file:///c:/projects/app/index.js')).to.equal('file:///c:/projects/app/index.js');
    });

    it('leaves a scheme-less posix url alone', () => {
        expect(normalizeFileUrl('/source/compiled/index.js')).to.equal('/source/compiled/index.js');
    });

    it('does not touch slashes elsewhere in the path', () => {
        expect(normalizeFileUrl('file:///source//compiled/index.js')).to.equal('file:///source//compiled/index.js');
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

/** The fixed mask key every masked test fixture uses, so re-encoded output frames are predictable to assert on. */
const DEFAULT_TEST_MASK_KEY = Buffer.from([0x12, 0x34, 0x56, 0x78]);

/** Builds an RFC 6455 client-to-server frame: masked, with the mask key XORed into the payload. */
function buildMaskedFrame(opcode: number, payload: Buffer, fin = true): Buffer {
    const maskedPayload = Buffer.alloc(payload.length);
    for (let index = 0; index < payload.length; index++) {
        // eslint-disable-next-line no-bitwise
        maskedPayload[index] = payload[index] ^ DEFAULT_TEST_MASK_KEY[index % 4];
    }

    const header = buildFrameHeaderForTest(opcode, payload.length, true, fin);
    return Buffer.concat([header, DEFAULT_TEST_MASK_KEY, maskedPayload]);
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

/**
 * Parses a masked client-to-device text frame (as the filter's re-encoded `setBreakpointByUrl`
 * rewrites are) back into its JSON payload, reading the mask key out of the frame itself rather
 * than requiring the caller to already know it.
 */
function parseMaskedTextFrame(frame: Buffer): any {
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

    const maskKey = frame.subarray(offset, offset + 4);
    offset += 4;

    const maskedPayload = frame.subarray(offset, offset + payloadLength);
    const unmaskedPayload = Buffer.alloc(maskedPayload.length);
    for (let index = 0; index < maskedPayload.length; index++) {
        // eslint-disable-next-line no-bitwise
        unmaskedPayload[index] = maskedPayload[index] ^ maskKey[index % 4];
    }
    return JSON.parse(unmaskedPayload.toString('utf8'));
}
