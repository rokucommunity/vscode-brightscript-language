/* eslint-disable no-bitwise */
import { Transform } from 'stream';
import type { TransformCallback } from 'stream';
import { createHash } from 'crypto';

/**
 * Sits between the js-debug client and the device tunnel inside `JsDebugProxyManager`'s single
 * proxied connection, filtering the CDP traffic that flows through it. Hermes on RCE crashes the
 * whole app if it receives a second `Runtime.enable` on the same inspector WebSocket session
 * (verified by minimal reproducer; ~285ms after the duplicate arrives). js-debug legitimately
 * sends `Runtime.enable` twice during its attach burst - on LAN this is harmless because js-debug's
 * child auto-attach splits the burst across two separate inspector connections, but the RCE proxy
 * funnels everything into one connection (see `autoAttachChildProcesses` in extension.ts), so this
 * filter drops the second `Runtime.enable` and answers it locally instead.
 *
 * One instance is created per proxied connection (a fresh instance per debug session/reconnect).
 * The `upstream` and `downstream` Transforms are two ends of the same instance and share this
 * class's state via method calls (rather than each independently inspecting its own half of the
 * handshake), because two decisions genuinely need both halves' information:
 *
 * - Whether a WebSocket session actually formed at all: the client's request must have asked for
 *   an upgrade AND the device's response must be a `101`. A device response can legally omit the
 *   `Upgrade: websocket` header while still switching protocols, so the downstream half cannot
 *   decide this from its own head alone - it asks `confirmWebsocketSession()`, which folds in what
 *   the upstream half already saw. If no session formed, both halves fall back to raw byte
 *   pass-through and any dedupe state becomes moot.
 * - `Runtime.enable` dedupe is keyed per CDP `sessionId` (the flattened-protocol field CDP
 *   messages may carry to address a specific target session), not once per connection - a fresh
 *   target session on the same WebSocket legitimately gets its own first `Runtime.enable`.
 */
export class JsDebugCdpFilter {
    constructor(
        private logFn: (message: string) => void,
        /** Invoked once a real WebSocket session is confirmed established - see `confirmWebsocketSession`. */
        private onSessionEstablished?: () => void
    ) {
        this.upstream = new UpstreamFilterTransform(this);
        this.downstream = new DownstreamFilterTransform(this);
    }

    public readonly upstream: UpstreamFilterTransform;
    public readonly downstream: DownstreamFilterTransform;

    /** Lines emitted so far on this connection - caps unbounded output from the fail-open log lines below. */
    private loggedLineCount = 0;

    public log(message: string): void {
        if (this.loggedLineCount > MAX_LOG_LINES_PER_CONNECTION) {
            return;
        }
        if (this.loggedLineCount === MAX_LOG_LINES_PER_CONNECTION) {
            this.loggedLineCount++;
            this.logFn('[js-debug-proxy] further log lines suppressed for this connection');
            return;
        }
        this.loggedLineCount++;
        this.logFn(message);
    }

    /** Set by the upstream half once the client's request head is parsed as a WebSocket upgrade. */
    private upstreamSawUpgradeRequest = false;

    public noteUpstreamSawUpgradeRequest(): void {
        this.upstreamSawUpgradeRequest = true;
    }

    /**
     * Called by the downstream half once it has parsed the device's response head. A real
     * WebSocket session requires both sides to have agreed: the client asked to upgrade AND the
     * device answered with a `101`. If it didn't form, the upstream half (which may already have
     * switched into frame-parsing mode on the strength of the request alone) is forced back to
     * plain pass-through, since there is no session left for it to dedupe against.
     */
    public confirmWebsocketSession(deviceRespondedWith101: boolean): boolean {
        const established = this.upstreamSawUpgradeRequest && deviceRespondedWith101;
        if (!established) {
            this.upstream.forcePassthrough();
        } else {
            this.onSessionEstablished?.();
        }
        return established;
    }

    /**
     * `Runtime.enable` requests seen so far, keyed by CDP `sessionId` (or `''` for a message with
     * none). One admitted request per key, matching Hermes's tolerance of exactly one
     * `Runtime.enable` per target session.
     */
    private admittedRuntimeEnableSessionIds = new Set<string>();

    public shouldForwardRuntimeEnable(sessionId: string | undefined): boolean {
        const rawKey = sessionId ?? '';

        //hash an overlong sessionId to a fixed-width key rather than skipping dedupe, which would
        //re-arm the Hermes crash this filter exists to prevent
        const isOverlong = rawKey.length > MAX_SESSION_ID_LENGTH;
        const key = isOverlong ? createHash('sha256').update(rawKey).digest('hex') : rawKey;

        if (this.admittedRuntimeEnableSessionIds.has(key)) {
            return false;
        }

        if (isOverlong) {
            this.log(`[js-debug-proxy] sessionId exceeded ${MAX_SESSION_ID_LENGTH} chars; deduping on a hashed key instead`);
        }

        if (this.admittedRuntimeEnableSessionIds.size >= MAX_ADMITTED_SESSION_IDS) {
            //fail open past the cap: subsequent duplicates on an untracked sessionId will also
            //forward, re-arming the crash this filter exists to prevent
            this.log(`[js-debug-proxy] Runtime.enable dedupe tracking is full (${MAX_ADMITTED_SESSION_IDS} sessions); forwarding un-tracked`);
            return true;
        }

        this.admittedRuntimeEnableSessionIds.add(key);
        return true;
    }

    /**
     * Synthetic frames waiting to be spliced into the downstream byte stream at the next frame
     * boundary. Queued (rather than written immediately) because the downstream Transform may be
     * mid-frame when a duplicate is detected upstream, and a synthetic frame must never be
     * injected in the middle of a real one.
     */
    private pendingSyntheticFrames: Buffer[] = [];

    public enqueueSyntheticResponse(requestId: number, sessionId: string | undefined): void {
        if (this.pendingSyntheticFrames.length >= MAX_PENDING_SYNTHETIC_FRAMES) {
            //js-debug has no per-request timeout, so the dropped request just never resolves,
            //rather than hanging the whole stream
            this.log(`[js-debug-proxy] dropped synthetic Runtime.enable response (id ${requestId}) - pending queue is full`);
            return;
        }

        this.log(`[js-debug-proxy] dropped duplicate Runtime.enable (id ${requestId}${sessionId !== undefined ? `, sessionId ${sessionId}` : ''}) — crashes Hermes on RCE`);

        const responseMessage: { id: number; result: Record<string, never>; sessionId?: string } = { id: requestId, result: {} };
        if (sessionId !== undefined) {
            responseMessage.sessionId = sessionId;
        }

        this.pendingSyntheticFrames.push(buildSyntheticTextFrame(JSON.stringify(responseMessage)));
        this.downstream.flushPendingSyntheticFrames();
    }

    public takePendingSyntheticFrames(): Buffer[] {
        const frames = this.pendingSyntheticFrames;
        this.pendingSyntheticFrames = [];
        return frames;
    }

    public hasPendingSyntheticFrames(): boolean {
        return this.pendingSyntheticFrames.length > 0;
    }
}

/**
 * Frames larger than this are streamed through via byte countdown rather than buffered whole -
 * console output and object previews can be arbitrarily large, and none of that traffic needs
 * inspection (only small, fixed-shape CDP method calls like `Runtime.enable` do).
 */
const MAX_INSPECTED_FRAME_SIZE = 256 * 1024;

/**
 * A frame header claiming a payload length beyond this is treated as a protocol violation (error
 * out the connection) rather than trusted - an absurd length (e.g. a corrupted or malicious
 * header claiming 2^40 bytes) would otherwise leave the boundary tracker counting down forever,
 * silently desyncing the proxy without ever surfacing an error.
 */
const MAX_FRAME_PAYLOAD_LENGTH = 16 * 1024 * 1024;

/** Bounds how long either half will buffer an HTTP head before giving up and erroring out. */
const MAX_HTTP_HEAD_SIZE = 64 * 1024;

/**
 * Cap on `admittedRuntimeEnableSessionIds`'s size - see `shouldForwardRuntimeEnable`. A real debug
 * session juggles a handful of CDP target sessions at most; this is far beyond that.
 */
const MAX_ADMITTED_SESSION_IDS = 100;

/** Cap on an individual CDP `sessionId`'s length - see `shouldForwardRuntimeEnable`. */
const MAX_SESSION_ID_LENGTH = 256;

/** Cap on `pendingSyntheticFrames`'s size - see `enqueueSyntheticResponse`. */
const MAX_PENDING_SYNTHETIC_FRAMES = 32;

/** Cap on log lines emitted per connection - see `JsDebugCdpFilter.log`. */
const MAX_LOG_LINES_PER_CONNECTION = 200;

/** Attacker-influenced content (a rewritten url, say) is truncated to this length before logging. */
const MAX_LOGGED_VALUE_LENGTH = 300;

function truncateForLog(value: string): string {
    return value.length > MAX_LOGGED_VALUE_LENGTH ? `${value.slice(0, MAX_LOGGED_VALUE_LENGTH)}…` : value;
}

const HTTP_HEAD_TERMINATOR = Buffer.from('\r\n\r\n');

function isWebSocketUpgradeRequest(headText: string): boolean {
    return /^upgrade:\s*websocket\s*$/im.test(headText);
}

function isSwitchingProtocolsResponse(headText: string): boolean {
    const statusLine = headText.split('\r\n', 1)[0];
    return /^HTTP\/\d\.\d\s+101\b/.test(statusLine);
}

/**
 * Requires a loopback `Host` and rejects any `Origin` header on an upstream HTTP head - a browser
 * always sends Origin, curl and js-debug never do, so this blocks drive-by-browser/DNS-rebinding access.
 */
function validateHttpHead(headText: string): void {
    const headerLines = headText.split('\r\n').slice(1);

    let hostHeaderValue: string | undefined;
    let hasOriginHeader = false;
    for (const line of headerLines) {
        const colonIndex = line.indexOf(':');
        if (colonIndex === -1) {
            continue;
        }
        const headerName = line.slice(0, colonIndex).trim().toLowerCase();
        if (headerName === 'host') {
            hostHeaderValue = line.slice(colonIndex + 1).trim();
        } else if (headerName === 'origin') {
            hasOriginHeader = true;
        }
    }

    if (hasOriginHeader) {
        throw new Error('[js-debug-proxy] rejected an HTTP request carrying an Origin header - a browser always sends one, curl and js-debug never do');
    }

    if (hostHeaderValue === undefined || !/^(127\.0\.0\.1|localhost)(:\d+)?$/i.test(hostHeaderValue)) {
        throw new Error(`[js-debug-proxy] rejected an HTTP request with an invalid Host header (${JSON.stringify(hostHeaderValue)})`);
    }
}

/**
 * Client-to-device half of the filter. Starts in HTTP mode (buffering the request head to decide
 * whether this is a WebSocket upgrade, and to strip `Sec-WebSocket-Extensions` if so) and then, for
 * upgrade connections, switches to parsing masked CDP WebSocket frames so it can detect and dedupe
 * `Runtime.enable`. Can be forced back to pass-through by the owning filter if the device's
 * response reveals no session actually formed (see `JsDebugCdpFilter.confirmWebsocketSession`).
 */
class UpstreamFilterTransform extends Transform {
    constructor(private owner: JsDebugCdpFilter) {
        super();
    }

    private httpBuffer = Buffer.alloc(0);
    private isHttpPhase = true;
    private isPassthrough = false;

    private frameParser = new FrameParser();

    public _transform(chunk: Buffer, encoding: BufferEncoding, callback: TransformCallback): void {
        try {
            const output = this.handleChunk(chunk);
            callback(undefined, output.length > 0 ? output : undefined);
        } catch (error) {
            //an unrecoverable parse error (a malformed frame, an absurd length, an overlong head)
            //must surface as a stream error so JsDebugProxyManager's teardown actually runs -
            //letting it throw synchronously here would instead crash as an uncaught exception and
            //leave the connection wedged
            callback(error as Error);
        }
    }

    public _flush(callback: TransformCallback): void {
        try {
            if (this.isHttpPhase && this.httpBuffer.length > 0) {
                //the connection ended mid-head; forward whatever partial head we had rather than
                //silently discarding it
                const leftover = this.httpBuffer;
                this.httpBuffer = Buffer.alloc(0);
                callback(undefined, leftover);
                return;
            }
            if (!this.isPassthrough) {
                const leftover = this.frameParser.flushRemaining();
                if (leftover.length > 0) {
                    callback(undefined, leftover);
                    return;
                }
            }
            callback();
        } catch (error) {
            callback(error as Error);
        }
    }

    private handleChunk(chunk: Buffer): Buffer {
        if (this.isPassthrough) {
            return chunk;
        }

        if (this.isHttpPhase) {
            this.httpBuffer = Buffer.concat([this.httpBuffer, chunk]);
            if (this.httpBuffer.length > MAX_HTTP_HEAD_SIZE) {
                throw new Error(`[js-debug-proxy] HTTP request head exceeded ${MAX_HTTP_HEAD_SIZE} bytes without terminating`);
            }

            const terminatorIndex = this.httpBuffer.indexOf(HTTP_HEAD_TERMINATOR);
            if (terminatorIndex === -1) {
                //still waiting for the rest of the request head to arrive
                return Buffer.alloc(0);
            }

            const head = this.httpBuffer.subarray(0, terminatorIndex + HTTP_HEAD_TERMINATOR.length);
            const remainder = this.httpBuffer.subarray(terminatorIndex + HTTP_HEAD_TERMINATOR.length);
            this.httpBuffer = Buffer.alloc(0);
            this.isHttpPhase = false;

            const headText = head.toString('latin1');
            validateHttpHead(headText);

            if (!isWebSocketUpgradeRequest(headText)) {
                //not a WebSocket upgrade (e.g. js-debug's GET /json/list discovery request) -
                //forward verbatim and become a pure pass-through for the rest of the connection
                this.isPassthrough = true;
                return Buffer.concat([head, remainder]);
            }

            //the request alone isn't sufficient proof a session will form (the device might not
            //answer with a 101) - record it and let the downstream half make the final call once
            //its response head arrives
            this.owner.noteUpstreamSawUpgradeRequest();

            const strippedHead = stripHeader(headText, 'sec-websocket-extensions');
            const outputChunks = [Buffer.from(strippedHead, 'latin1')];
            if (remainder.length > 0) {
                outputChunks.push(this.frameParser.process(remainder, this.owner));
            }
            return Buffer.concat(outputChunks);
        }

        return this.frameParser.process(chunk, this.owner);
    }

    /**
     * Called by the owning `JsDebugCdpFilter` when the device's response reveals that no real
     * WebSocket session formed (a non-101 answer to an upgrade request). Whatever bytes the frame
     * parser was already holding were never actually WS frames, so they're flushed raw, and the
     * connection becomes a plain byte pass-through for the rest of its life.
     */
    public forcePassthrough(): void {
        if (this.isPassthrough) {
            return;
        }
        this.isPassthrough = true;
        const leftover = this.frameParser.flushRemaining();
        if (leftover.length > 0) {
            this.push(leftover);
        }
    }
}

/**
 * Device-to-client half of the filter. Mirrors the upstream's HTTP phase (forwarding the response
 * head), then switches to frame-boundary tracking only - it never inspects or buffers whole frame
 * payloads, since device-originated traffic (console output, object previews) can be large. Its
 * only job once in frame mode is to know exactly where frame boundaries fall, so synthetic
 * responses can be spliced in between frames, never mid-frame.
 */
class DownstreamFilterTransform extends Transform {
    constructor(private owner: JsDebugCdpFilter) {
        super();
    }

    private httpBuffer = Buffer.alloc(0);
    private isHttpPhase = true;
    private isPassthrough = false;

    private boundaryTracker = new FrameBoundaryTracker();

    public _transform(chunk: Buffer, encoding: BufferEncoding, callback: TransformCallback): void {
        try {
            const output = this.handleChunk(chunk);
            callback(undefined, output.length > 0 ? output : undefined);
        } catch (error) {
            callback(error as Error);
        }
    }

    public _flush(callback: TransformCallback): void {
        try {
            if (this.isHttpPhase && this.httpBuffer.length > 0) {
                const leftover = this.httpBuffer;
                this.httpBuffer = Buffer.alloc(0);
                callback(undefined, leftover);
                return;
            }
            if (!this.isPassthrough) {
                const leftover = this.boundaryTracker.flushRemaining();
                if (leftover.length > 0) {
                    callback(undefined, leftover);
                    return;
                }
            }
            callback();
        } catch (error) {
            callback(error as Error);
        }
    }

    private handleChunk(chunk: Buffer): Buffer {
        if (this.isPassthrough) {
            return chunk;
        }

        if (this.isHttpPhase) {
            this.httpBuffer = Buffer.concat([this.httpBuffer, chunk]);
            if (this.httpBuffer.length > MAX_HTTP_HEAD_SIZE) {
                throw new Error(`[js-debug-proxy] HTTP response head exceeded ${MAX_HTTP_HEAD_SIZE} bytes without terminating`);
            }

            const terminatorIndex = this.httpBuffer.indexOf(HTTP_HEAD_TERMINATOR);
            if (terminatorIndex === -1) {
                return Buffer.alloc(0);
            }

            const head = this.httpBuffer.subarray(0, terminatorIndex + HTTP_HEAD_TERMINATOR.length);
            const remainder = this.httpBuffer.subarray(terminatorIndex + HTTP_HEAD_TERMINATOR.length);
            this.httpBuffer = Buffer.alloc(0);
            this.isHttpPhase = false;

            const headText = head.toString('latin1');
            //deliberately does NOT require an `Upgrade: websocket` header on the response - a 101
            //that omits it (which ws/llhttp both accept) must still be recognized, or the queued
            //synthetic reply below would be silently dropped and js-debug would hang forever
            //awaiting the Runtime.enable response this proxy already swallowed
            const established = this.owner.confirmWebsocketSession(isSwitchingProtocolsResponse(headText));

            if (!established) {
                this.isPassthrough = true;
                return Buffer.concat([head, remainder]);
            }

            const outputChunks = [head];
            if (remainder.length > 0) {
                outputChunks.push(this.emitWithBoundaryFlush(remainder));
            } else {
                this.flushAtBoundaryIfIdle(outputChunks);
            }
            return Buffer.concat(outputChunks);
        }

        return this.emitWithBoundaryFlush(chunk);
    }

    /**
     * Called by the owning `JsDebugCdpFilter` when a synthetic response is enqueued. If this
     * stream is currently idle at a frame boundary, the queued frame(s) can be pushed immediately
     * rather than waiting for the next real device chunk to arrive (which, for an idle debug
     * session, might be a long time).
     */
    public flushPendingSyntheticFrames(): void {
        if (this.isHttpPhase || this.isPassthrough) {
            return;
        }
        if (!this.boundaryTracker.isAtBoundary()) {
            return;
        }
        for (const frame of this.owner.takePendingSyntheticFrames()) {
            this.push(frame);
        }
    }

    private flushAtBoundaryIfIdle(outputChunks: Buffer[]): void {
        if (this.boundaryTracker.isAtBoundary() && this.owner.hasPendingSyntheticFrames()) {
            outputChunks.push(...this.owner.takePendingSyntheticFrames());
        }
    }

    private emitWithBoundaryFlush(chunk: Buffer): Buffer {
        const outputChunks = [this.boundaryTracker.process(chunk)];
        this.flushAtBoundaryIfIdle(outputChunks);
        return Buffer.concat(outputChunks);
    }
}

function stripHeader(headText: string, headerNameLowercase: string): string {
    const lines = headText.split('\r\n');
    const filteredLines = lines.filter((line) => {
        const colonIndex = line.indexOf(':');
        if (colonIndex === -1) {
            //the request/status line, or the trailing blank line before \r\n\r\n
            return true;
        }
        return line.slice(0, colonIndex).trim().toLowerCase() !== headerNameLowercase;
    });
    return filteredLines.join('\r\n');
}

function buildSyntheticTextFrame(payloadText: string): Buffer {
    const payload = Buffer.from(payloadText, 'utf8');
    const header = buildFrameHeader(0x1, payload.length, false);
    return Buffer.concat([header, payload]);
}

/**
 * Builds a WebSocket frame header (RFC 6455). `masked` controls whether a 4-byte mask key follows
 * the length field - the proxy only ever synthesizes server-style (unmasked) frames, but the
 * length-encoding logic is written generally since a tiny synthetic payload always takes the
 * 7-bit path while still being correct if that ever changes.
 *
 * FOOTGUN: `masked` only sets the mask bit - the caller must still append the 4-byte mask key itself.
 */
function buildFrameHeader(opcode: number, payloadLength: number, masked: boolean): Buffer {
    const maskBit = masked ? 0x80 : 0x00;
    if (payloadLength <= 125) {
        return Buffer.from([0x80 | opcode, maskBit | payloadLength]);
    } else if (payloadLength <= 0xFFFF) {
        const header = Buffer.alloc(4);
        header[0] = 0x80 | opcode;
        header[1] = maskBit | 126;
        header.writeUInt16BE(payloadLength, 2);
        return header;
    } else {
        const header = Buffer.alloc(10);
        header[0] = 0x80 | opcode;
        header[1] = maskBit | 127;
        header.writeBigUInt64BE(BigInt(payloadLength), 2);
        return header;
    }
}

/**
 * Collapse `file:///` followed by one or more EXTRA slashes down to exactly `file:///` plus a
 * single path slash, e.g. `file:////source/compiled/index.js` -> `file:///source/compiled/index.js`.
 *
 * Returns the input unchanged when the extra-slash pattern isn't present, so a correct three-slash
 * url (`file:///source/...`) and a normal Windows url (`file:///c:/...`) both pass through
 * untouched. Only the authority-position slashes are considered — slashes elsewhere in the path
 * are none of our business.
 */
export function normalizeFileUrl(url: string): string {
    return url.replace(/^(file:\/\/\/)\/+/i, '$1');
}

/**
 * Re-encodes a masked client-to-device TEXT frame from scratch, sized for the rewritten payload
 * (which may cross a length-encoding boundary). `maskKey` is copied since the caller's is a view
 * into a buffer that gets reused.
 */
function buildMaskedTextFrame(payloadText: string, maskKey: Buffer): Buffer {
    const payload = Buffer.from(payloadText, 'utf8');
    const header = buildFrameHeader(0x1, payload.length, true);
    const maskKeyCopy = Buffer.from(maskKey);
    const maskedPayload = unmask(payload, maskKeyCopy); //XOR is symmetric - unmask() doubles as the masker
    return Buffer.concat([header, maskKeyCopy, maskedPayload]);
}

/**
 * Streaming parser for masked (client-to-device) WebSocket frames. Maintains its buffer across
 * `_transform` calls since frames (and even frame headers) can be split across arbitrary TCP chunk
 * boundaries. Every client frame is required by RFC 6455 to be masked - an unmasked one errors the
 * stream rather than being interpreted. Of the masked frames, only unfragmented TEXT frames within
 * the inspection size cap are inspected for `Runtime.enable`; everything else - control frames,
 * binary frames, fragmented messages, and oversized frames - is streamed through without being
 * buffered whole.
 */
class FrameParser {
    private buffer = Buffer.alloc(0);

    /**
     * When set, we are in the middle of streaming an oversized/uninspected frame's payload through
     * without buffering it - `remainingBytes` counts down the payload bytes still to come.
     */
    private streamingPassthroughRemainingBytes = 0;

    public process(chunk: Buffer, owner: JsDebugCdpFilter): Buffer {
        this.buffer = Buffer.concat([this.buffer, chunk]);
        const outputChunks: Buffer[] = [];

        while (true) {
            if (this.streamingPassthroughRemainingBytes > 0) {
                const takeLength = Math.min(this.streamingPassthroughRemainingBytes, this.buffer.length);
                outputChunks.push(this.buffer.subarray(0, takeLength));
                this.buffer = this.buffer.subarray(takeLength);
                this.streamingPassthroughRemainingBytes -= takeLength;
                if (this.buffer.length === 0) {
                    break;
                }
                continue;
            }

            //may throw if the header claims an absurd payload length - propagates out of
            //`process()` and up through `_transform`'s try/catch, which turns it into a stream
            //error rather than a silent desync (the boundary would otherwise count down forever)
            const parsedHeader = parseFrameHeader(this.buffer);
            if (!parsedHeader) {
                //not enough bytes yet for a full header (+ mask key, for masked frames)
                break;
            }

            const maskKey = parsedHeader.maskKey;
            if (maskKey === undefined) {
                //RFC 6455 §5.1: every frame from the client MUST be masked. An unmasked frame here
                //is either a broken client or a hand-crafted/malicious one - either way there's no
                //sane way to keep interpreting this connection's bytes as WebSocket frames, so
                //error the stream (routed by `_transform`'s catch into the manager's teardown)
                //instead of what `unmask()` used to do: dereference a nonexistent mask key and
                //crash synchronously, or (worse) silently forward unvalidated "frames" as if they
                //were legitimate
                throw new Error(`[js-debug-proxy] received an unmasked frame from the client direction (opcode 0x${parsedHeader.opcode.toString(16)}) - client frames must be masked per RFC 6455`);
            }

            const totalFrameLength = parsedHeader.headerLength + parsedHeader.payloadLength;

            const isUnfragmentedTextFrame = parsedHeader.fin && parsedHeader.opcode === 0x1;
            const isInspectable = isUnfragmentedTextFrame && parsedHeader.payloadLength <= MAX_INSPECTED_FRAME_SIZE;

            if (!isInspectable) {
                logSkippedInspectionIfNoteworthy(parsedHeader, owner);

                //stream this frame through without buffering its whole payload: emit whatever of
                //it we already have, then count down any remainder across future chunks
                if (this.buffer.length >= totalFrameLength) {
                    outputChunks.push(this.buffer.subarray(0, totalFrameLength));
                    this.buffer = this.buffer.subarray(totalFrameLength);
                    continue;
                } else {
                    outputChunks.push(this.buffer);
                    this.streamingPassthroughRemainingBytes = totalFrameLength - this.buffer.length;
                    this.buffer = Buffer.alloc(0);
                    break;
                }
            }

            if (this.buffer.length < totalFrameLength) {
                //the whole (small, inspectable) frame hasn't arrived yet
                break;
            }

            const frameBytes = this.buffer.subarray(0, totalFrameLength);
            this.buffer = this.buffer.subarray(totalFrameLength);

            const maskedPayload = frameBytes.subarray(parsedHeader.headerLength, totalFrameLength);
            const unmaskedPayload = unmask(maskedPayload, maskKey);

            const filteredFrame = this.inspectClientTextFrame(frameBytes, unmaskedPayload, maskKey, owner);
            if (filteredFrame) {
                outputChunks.push(filteredFrame);
            }
        }

        return Buffer.concat(outputChunks);
    }

    /**
     * Returns whatever unparsed bytes remain buffered (a partial frame or header that will never
     * be completed because the connection is ending), clearing internal state. Used by `_flush` so
     * those bytes are forwarded rather than silently dropped.
     */
    public flushRemaining(): Buffer {
        const leftover = this.buffer;
        this.buffer = Buffer.alloc(0);
        this.streamingPassthroughRemainingBytes = 0;
        return leftover;
    }

    /**
     * Inspects one complete client-to-device CDP text frame: drops a duplicate `Runtime.enable`,
     * rewrites a `Debugger.setBreakpointByUrl` url if needed, or forwards the original bytes unchanged.
     */
    private inspectClientTextFrame(originalFrameBytes: Buffer, unmaskedPayload: Buffer, maskKey: Buffer, owner: JsDebugCdpFilter): Buffer | undefined {
        let parsedMessage: any;
        try {
            parsedMessage = JSON.parse(unmaskedPayload.toString('utf8'));
        } catch {
            return originalFrameBytes;
        }

        if (!parsedMessage || typeof parsedMessage !== 'object') {
            return originalFrameBytes;
        }

        if (parsedMessage.method === 'Runtime.enable') {
            //shouldForwardRuntimeEnable mutates state on read - call at most once per message
            const sessionId: string | undefined = typeof parsedMessage.sessionId === 'string' ? parsedMessage.sessionId : undefined;

            if (owner.shouldForwardRuntimeEnable(sessionId)) {
                return originalFrameBytes;
            }

            if (typeof parsedMessage.id !== 'number') {
                //can't answer a request we can't identify - forwarding it unmodified is the lesser
                //evil (protocol-garbage {"result":{}} with no id is worse), and this is unreachable
                //in practice since js-debug always assigns a numeric id
                return originalFrameBytes;
            }

            owner.enqueueSyntheticResponse(parsedMessage.id, sessionId);
            return undefined;
        }

        if (parsedMessage.method === 'Debugger.setBreakpointByUrl' && typeof parsedMessage.params?.url === 'string') {
            const originalUrl: string = parsedMessage.params.url;
            const normalizedUrl = normalizeFileUrl(originalUrl);
            if (normalizedUrl === originalUrl) {
                return originalFrameBytes;
            }

            //shipped js-debug on Windows sends this url four-slashed, which Hermes never matches
            parsedMessage.params.url = normalizedUrl;
            owner.log(`[js-debug-proxy] rewrote setBreakpointByUrl url from '${truncateForLog(originalUrl)}' to '${truncateForLog(normalizedUrl)}'`);
            return buildMaskedTextFrame(JSON.stringify(parsedMessage), maskKey);
        }

        return originalFrameBytes;
    }
}

/**
 * Logs the two fail-open paths worth knowing about when a text (or continuation-of-text) frame is
 * deliberately skipped for inspection: a fragmented message (which could theoretically be a
 * `Runtime.enable` split across frames, though no real CDP client does that) and an oversized one.
 * Control and binary frames are routine and not logged - only shapes that could plausibly have
 * been a CDP method call are worth a line.
 */
function logSkippedInspectionIfNoteworthy(header: ParsedFrameHeader, owner: JsDebugCdpFilter): void {
    const isTextOrContinuationOpcode = header.opcode === 0x1 || header.opcode === 0x0;
    if (!isTextOrContinuationOpcode) {
        return;
    }

    if (!header.fin || header.opcode === 0x0) {
        owner.log(`[js-debug-proxy] skipped inspecting a fragmented CDP text frame (opcode 0x${header.opcode.toString(16)}) - forwarded unmodified`);
    } else if (header.payloadLength > MAX_INSPECTED_FRAME_SIZE) {
        owner.log(`[js-debug-proxy] skipped inspecting an oversized CDP text frame (${header.payloadLength} bytes) - forwarded unmodified`);
    }
}

/**
 * Tracks frame boundaries in the unmasked device-to-client stream without buffering payloads, so
 * the downstream Transform always knows whether it is currently between frames (safe to splice a
 * synthetic frame in) or partway through one (must not).
 */
class FrameBoundaryTracker {
    private buffer = Buffer.alloc(0);
    private remainingPayloadBytes = 0;

    /**
     * `fin` of the most recently completed DATA frame (opcode 0x0/0x1/0x2), so a fragmented
     * message doesn't look like a boundary mid-fragment. Control frames (opcode >= 0x8) never
     * update this - RFC 6455 §5.4 lets them interleave between fragments, always with FIN=1.
     */
    private lastFrameFin = true;

    public isAtBoundary(): boolean {
        return this.remainingPayloadBytes === 0 && this.buffer.length === 0 && this.lastFrameFin;
    }

    public process(chunk: Buffer): Buffer {
        this.buffer = Buffer.concat([this.buffer, chunk]);
        const outputChunks: Buffer[] = [];

        while (true) {
            if (this.remainingPayloadBytes > 0) {
                const takeLength = Math.min(this.remainingPayloadBytes, this.buffer.length);
                outputChunks.push(this.buffer.subarray(0, takeLength));
                this.buffer = this.buffer.subarray(takeLength);
                this.remainingPayloadBytes -= takeLength;
                if (this.buffer.length === 0) {
                    break;
                }
                continue;
            }

            //may throw for an absurd claimed payload length - see the comment in FrameParser.process
            const parsedHeader = parseFrameHeader(this.buffer);
            if (!parsedHeader) {
                break;
            }
            if (parsedHeader.opcode < 0x8) {
                //only data opcodes count toward message-boundary tracking - see `lastFrameFin`
                this.lastFrameFin = parsedHeader.fin;
            }

            const availableAfterHeader = this.buffer.length - parsedHeader.headerLength;
            const takeLength = Math.min(parsedHeader.payloadLength, availableAfterHeader);
            outputChunks.push(this.buffer.subarray(0, parsedHeader.headerLength + takeLength));
            this.buffer = this.buffer.subarray(parsedHeader.headerLength + takeLength);
            this.remainingPayloadBytes = parsedHeader.payloadLength - takeLength;

            if (this.remainingPayloadBytes > 0) {
                break;
            }
        }

        return Buffer.concat(outputChunks);
    }

    /** See `FrameParser.flushRemaining` - same purpose, mirrored for the downstream direction. */
    public flushRemaining(): Buffer {
        const leftover = this.buffer;
        this.buffer = Buffer.alloc(0);
        this.remainingPayloadBytes = 0;
        return leftover;
    }
}

/**
 * Parses a single WebSocket frame header out of `buffer`, returning `undefined` if `buffer`
 * doesn't yet contain enough bytes (the caller should wait for more). Whether the frame is masked
 * is read from the header's mask bit rather than assumed from direction, so this works for both
 * client-to-device (masked, per RFC 6455) and device-to-client (unmasked) frames. Throws if the
 * header claims a payload length beyond `MAX_FRAME_PAYLOAD_LENGTH` - see that constant's comment.
 */
function parseFrameHeader(buffer: Buffer): ParsedFrameHeader | undefined {
    if (buffer.length < 2) {
        return undefined;
    }

    const fin = (buffer[0] & 0x80) !== 0;
    const opcode = buffer[0] & 0x0F;
    const isMasked = (buffer[1] & 0x80) !== 0;
    const lengthIndicator = buffer[1] & 0x7F;

    let offset = 2;
    let payloadLength: number;

    if (lengthIndicator === 126) {
        if (buffer.length < offset + 2) {
            return undefined;
        }
        payloadLength = buffer.readUInt16BE(offset);
        offset += 2;
    } else if (lengthIndicator === 127) {
        if (buffer.length < offset + 8) {
            return undefined;
        }
        payloadLength = Number(buffer.readBigUInt64BE(offset));
        offset += 8;
    } else {
        payloadLength = lengthIndicator;
    }

    if (payloadLength > MAX_FRAME_PAYLOAD_LENGTH) {
        throw new Error(`[js-debug-proxy] WebSocket frame payload length ${payloadLength} exceeds the ${MAX_FRAME_PAYLOAD_LENGTH}-byte sanity cap`);
    }

    let maskKey: Buffer | undefined;
    if (isMasked) {
        if (buffer.length < offset + 4) {
            return undefined;
        }
        maskKey = buffer.subarray(offset, offset + 4);
        offset += 4;
    }

    return {
        fin: fin,
        opcode: opcode,
        payloadLength: payloadLength,
        headerLength: offset,
        maskKey: maskKey
    };
}

function unmask(maskedPayload: Buffer, maskKey: Buffer): Buffer {
    const unmasked = Buffer.alloc(maskedPayload.length);
    for (let index = 0; index < maskedPayload.length; index++) {
        unmasked[index] = maskedPayload[index] ^ maskKey[index % 4];
    }
    return unmasked;
}

// ---- types ----

interface ParsedFrameHeader {
    fin: boolean;
    opcode: number;
    payloadLength: number;
    headerLength: number;
    maskKey: Buffer | undefined;
}
