import { expect } from 'chai';
import * as net from 'net';
import * as stream from 'stream';
import type { RceManager } from './RceManager';
import { JsDebugProxyManager, JS_DEBUG_PORT } from './JsDebugProxyManager';

describe('JsDebugProxyManager', () => {
    let manager: JsDebugProxyManager;
    let token: string | undefined;
    let factoryCalls: Array<{ device: any; port: number }>;
    let tunnels: FakeTunnel[];
    let openServers: JsDebugProxyManager[];

    function makeRceManagerFake(): RceManager {
        return { getToken: () => Promise.resolve(token) } as unknown as RceManager;
    }

    function makeManager() {
        factoryCalls = [];
        tunnels = [];
        manager = new JsDebugProxyManager(makeRceManagerFake(), () => { /* noop log */ }, (options) => {
            factoryCalls.push(options);
            const tunnel = new FakeTunnel();
            tunnels.push(tunnel);
            return tunnel as any;
        });
        openServers.push(manager);
        return manager;
    }

    beforeEach(() => {
        token = 'the-token';
        openServers = [];
        makeManager();
    });

    afterEach(() => {
        for (const openManager of openServers) {
            openManager.dispose();
        }
    });

    it('returns a listening port and calls the socketFactory with the device and JS_DEBUG_PORT', async () => {
        const port = await manager.start('session-1', { id: 123 } as any);
        expect(port).to.be.a('number');

        const client = net.connect(port, '127.0.0.1');
        await waitForEvent(client, 'connect');
        await waitUntil(() => factoryCalls.length === 1);

        expect(factoryCalls[0].port).to.equal(JS_DEBUG_PORT);
        expect(factoryCalls[0].device).to.include({ id: 123, rceToken: 'the-token' });

        client.destroy();
    });

    it('pipes bytes bidirectionally between the client and the fake tunnel', async () => {
        const port = await manager.start('session-2', { id: 1 } as any);
        const client = net.connect(port, '127.0.0.1');
        await waitForEvent(client, 'connect');
        await waitUntil(() => tunnels.length === 1);
        const tunnel = tunnels[0];

        //connections are now piped through JsDebugCdpFilter, which buffers an HTTP request/response
        //head before forwarding anything (so it can tell a WebSocket upgrade from js-debug's plain
        //discovery request); a non-upgrade request/response head is required here to reach the pure
        //pass-through path and observe raw byte-for-byte piping the way this test intends
        const tunnelReceived: Buffer[] = [];
        tunnel.on('tunnelWrite', (chunk: Buffer) => tunnelReceived.push(chunk));
        client.write('GET /json/list HTTP/1.1\r\nHost: localhost\r\n\r\n');
        client.write('hello from client');
        await waitUntil(() => Buffer.concat(tunnelReceived).includes('hello from client'));
        expect(Buffer.concat(tunnelReceived).toString()).to.equal('GET /json/list HTTP/1.1\r\nHost: localhost\r\n\r\nhello from client');

        const clientReceived: Buffer[] = [];
        client.on('data', (chunk: Buffer) => clientReceived.push(chunk));
        tunnel.push(Buffer.from('HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\n\r\n'));
        tunnel.push(Buffer.from('hello from tunnel'));
        await waitUntil(() => Buffer.concat(clientReceived).includes('hello from tunnel'));
        expect(Buffer.concat(clientReceived).toString()).to.equal('HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\n\r\nhello from tunnel');

        client.destroy();
    });

    it('destroys the client and never calls the socketFactory when there is no token', async () => {
        token = undefined;
        const port = await manager.start('session-3', { id: 1 } as any);
        const client = net.connect(port, '127.0.0.1');
        await waitForEvent(client, 'close');

        expect(factoryCalls).to.be.empty;
    });

    it('stop() closes the server and destroys live sockets', async () => {
        const port = await manager.start('session-4', { id: 1 } as any);
        const client = net.connect(port, '127.0.0.1');
        await waitForEvent(client, 'connect');
        await waitUntil(() => tunnels.length === 1);

        manager.stop('session-4');

        await waitForEvent(client, 'close');
        expect(tunnels[0].destroyed).to.be.true;

        const secondClient = net.connect(port, '127.0.0.1');
        await waitForEvent(secondClient, 'error');
    });

    it('is idempotent per sessionId: a second start() returns the same port', async () => {
        const firstPort = await manager.start('session-5', { id: 1 } as any);
        const secondPort = await manager.start('session-5', { id: 1 } as any);
        expect(secondPort).to.equal(firstPort);
    });

    it('stop() during a still-pending getToken() destroys the client and does not leak a tunnel', async () => {
        let resolveToken: (value: string | undefined) => void;
        manager = new JsDebugProxyManager(
            { getToken: () => new Promise((resolve) => {
                resolveToken = resolve;
            }) } as unknown as RceManager,
            () => { /* noop log */ },
            (options) => {
                factoryCalls.push(options);
                const tunnel = new FakeTunnel();
                tunnels.push(tunnel);
                return tunnel as any;
            }
        );
        openServers.push(manager);

        const port = await manager.start('session-6', { id: 1 } as any);
        const client = net.connect(port, '127.0.0.1');
        //a socket the proxy forcibly destroys mid-handshake can surface as an ECONNRESET on this
        //end; that's expected here, so swallow it rather than letting it crash the test process
        client.on('error', () => { /* expected: proxy destroys this socket mid-flight */ });
        await waitForEvent(client, 'connect');
        await waitUntil(() => resolveToken !== undefined);

        manager.stop('session-6');
        resolveToken('the-token');

        await waitForEvent(client, 'close');
        expect(factoryCalls).to.be.empty;
    });

    it('a rejected getToken() destroys the client without an unhandled rejection', async () => {
        let unhandledRejection: unknown;
        const onUnhandledRejection = (reason: unknown) => {
            unhandledRejection = reason;
        };
        process.on('unhandledRejection', onUnhandledRejection);

        try {
            manager = new JsDebugProxyManager(
                { getToken: () => Promise.reject(new Error('token fetch failed')) } as unknown as RceManager,
                () => { /* noop log */ },
                (options) => {
                    factoryCalls.push(options);
                    const tunnel = new FakeTunnel();
                    tunnels.push(tunnel);
                    return tunnel as any;
                }
            );
            openServers.push(manager);

            const port = await manager.start('session-7', { id: 1 } as any);
            const client = net.connect(port, '127.0.0.1');
            await waitForEvent(client, 'close');

            //give the unhandled-rejection detector a tick to fire, if it was going to
            await new Promise<void>((resolve) => {
                setTimeout(resolve, 50);
            });
            expect(unhandledRejection).to.be.undefined;
        } finally {
            process.removeListener('unhandledRejection', onUnhandledRejection);
        }
    });

    it('logs and tears down both sockets when the tunnel emits an error', async () => {
        const logMessages: string[] = [];
        manager = new JsDebugProxyManager(makeRceManagerFake(), (message) => logMessages.push(message), (options) => {
            factoryCalls.push(options);
            const tunnel = new FakeTunnel();
            tunnels.push(tunnel);
            return tunnel as any;
        });
        openServers.push(manager);

        const port = await manager.start('session-8', { id: 1 } as any);
        const client = net.connect(port, '127.0.0.1');
        await waitForEvent(client, 'connect');
        await waitUntil(() => tunnels.length === 1);

        tunnels[0].emit('error', new Error('tunnel exploded'));

        await waitForEvent(client, 'close');
        expect(tunnels[0].destroyed).to.be.true;
        expect(logMessages.length).to.be.greaterThan(0);
    });

    it('prunes the sockets set once a connection closes', async () => {
        const port = await manager.start('session-9', { id: 1 } as any);
        const client = net.connect(port, '127.0.0.1');
        await waitForEvent(client, 'connect');
        await waitUntil(() => tunnels.length === 1);

        expect(manager.getSocketCountForTest('session-9')).to.equal(2);

        client.destroy();
        await waitUntil(() => manager.getSocketCountForTest('session-9') === 0);
    });

    it('carries a full WebSocket upgrade handshake and a masked CDP frame through the pipe chain', async () => {
        const port = await manager.start('session-11', { id: 1 } as any);
        const client = net.connect(port, '127.0.0.1');
        await waitForEvent(client, 'connect');
        await waitUntil(() => tunnels.length === 1);
        const tunnel = tunnels[0];

        const tunnelReceived: Buffer[] = [];
        tunnel.on('tunnelWrite', (chunk: Buffer) => tunnelReceived.push(chunk));

        client.write(
            'GET /json/list HTTP/1.1\r\nHost: localhost\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n' +
            'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n\r\n'
        );
        await waitUntil(() => Buffer.concat(tunnelReceived).includes('Upgrade: websocket'));

        const clientReceived: Buffer[] = [];
        client.on('data', (chunk: Buffer) => clientReceived.push(chunk));
        tunnel.push(Buffer.from('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n'));
        await waitUntil(() => Buffer.concat(clientReceived).includes('101 Switching Protocols'));

        //a real masked Runtime.enable frame from the client should reach the tunnel unmodified
        const maskKey = Buffer.from([0x01, 0x02, 0x03, 0x04]);
        const payload = Buffer.from(JSON.stringify({ id: 1, method: 'Runtime.enable' }));
        const maskedPayload = Buffer.alloc(payload.length);
        for (let index = 0; index < payload.length; index++) {
            // eslint-disable-next-line no-bitwise
            maskedPayload[index] = payload[index] ^ maskKey[index % 4];
        }
        // eslint-disable-next-line no-bitwise
        const frame = Buffer.concat([Buffer.from([0x81, 0x80 | payload.length]), maskKey, maskedPayload]);

        tunnelReceived.length = 0;
        client.write(frame);
        await waitUntil(() => tunnelReceived.length > 0);
        expect(Buffer.concat(tunnelReceived)).to.deep.equal(frame);

        client.destroy();
    });

    it('tears down both sockets without an uncaught exception when the client sends an unmasked frame', async () => {
        const port = await manager.start('session-12', { id: 1 } as any);
        const client = net.connect(port, '127.0.0.1');
        //a socket the proxy forcibly destroys can surface as an ECONNRESET on this end; expected
        client.on('error', () => { /* expected: proxy destroys this socket after the parse error */ });
        await waitForEvent(client, 'connect');
        await waitUntil(() => tunnels.length === 1);
        const tunnel = tunnels[0];

        let uncaughtException: unknown;
        const onUncaughtException = (error: unknown) => {
            uncaughtException = error;
        };
        process.on('uncaughtException', onUncaughtException);

        try {
            client.write('GET /json/list HTTP/1.1\r\nHost: localhost\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n');

            //reviewer's repro: an unmasked (mask bit unset) FIN=1 TEXT frame from the client
            const payload = Buffer.from(JSON.stringify({ id: 1, method: 'Runtime.enable' }));
            const unmaskedFrame = Buffer.concat([Buffer.from([0x81, payload.length]), payload]);
            client.write(unmaskedFrame);

            await waitForEvent(client, 'close');
            expect(tunnel.destroyed).to.be.true;

            //give any queued uncaughtException handler a tick to fire, if it was going to
            await new Promise<void>((resolve) => {
                setTimeout(resolve, 50);
            });
            expect(uncaughtException).to.be.undefined;
        } finally {
            process.removeListener('uncaughtException', onUncaughtException);
        }
    });

    it('two concurrent start() calls for the same sessionId resolve to the same port', async () => {
        const [firstPort, secondPort] = await Promise.all([
            manager.start('session-10', { id: 1 } as any),
            manager.start('session-10', { id: 1 } as any)
        ]);
        expect(firstPort).to.equal(secondPort);

        const firstClient = net.connect(firstPort, '127.0.0.1');
        await waitForEvent(firstClient, 'connect');
        const secondClient = net.connect(firstPort, '127.0.0.1');
        await waitForEvent(secondClient, 'connect');
        await waitUntil(() => tunnels.length === 2);

        firstClient.destroy();
        secondClient.destroy();
    });
});

function waitForEvent(emitter: NodeJS.EventEmitter, eventName: string): Promise<void> {
    return new Promise((resolve) => {
        emitter.once(eventName, () => resolve());
    });
}

function waitUntil(condition: () => boolean, timeoutMilliseconds = 2000): Promise<void> {
    return new Promise((resolve, reject) => {
        const startTime = Date.now();
        const intervalHandle = setInterval(() => {
            if (condition()) {
                clearInterval(intervalHandle);
                resolve();
            } else if (Date.now() - startTime > timeoutMilliseconds) {
                clearInterval(intervalHandle);
                reject(new Error('waitUntil timed out'));
            }
        }, 10);
    });
}

/**
 * A stand-in for the `RokuDeploySocket` returned by `createRokuDeploySocket()`: a plain
 * `stream.Duplex` so it satisfies the same pipe/destroy/close surface, without opening any real
 * network connection.
 */
class FakeTunnel extends stream.Duplex {
    public connect(): this {
        return this;
    }

    public _write(chunk: Buffer, encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
        this.emit('tunnelWrite', chunk);
        callback();
    }

    public _read(size: number): void {
        //data is pushed manually in tests via `tunnel.push(...)`
    }
}
