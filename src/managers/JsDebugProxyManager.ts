import * as net from 'net';
import * as getPort from 'get-port';
import { createRokuDeploySocket } from 'roku-deploy';
import type { RceDeviceConfig, RokuDeploySocket } from 'roku-deploy';
import type { RceManager } from './RceManager';

/**
 * The Hermes JS debug port on the Roku device side. Local sessions attach the node debugger to
 * this port directly over the LAN; RCE sessions attach to a local proxy port instead (see
 * `JsDebugProxyManager`) that tunnels to this same device-side port.
 */
export const JS_DEBUG_PORT = 9999;

/**
 * Bridges the node debugger to a Roku Cloud Emulator (RCE) device's JS (Hermes) debug port, which
 * has no LAN address the debugger could attach to directly. For each debug session, this opens a
 * local `net.Server` and tunnels every connection made to it through `createRokuDeploySocket()`
 * (the same websocket-backed transport used for RCE's telnet consoles), so the node debugger can
 * attach to `127.0.0.1:<proxyPort>` exactly as it would attach to a local device.
 */
export class JsDebugProxyManager {
    constructor(
        private rceManager: RceManager,
        private log: (message: string) => void,
        private socketFactory: (options: { device: RceDeviceConfig; port: number }) => RokuDeploySocket = createRokuDeploySocket
    ) {
    }

    private proxiesBySessionId = new Map<string, JsDebugProxy>();

    /**
     * Starts (or reuses) the proxy for `sessionId` and returns the local port the node debugger
     * should attach to. Idempotent: a second call for the same session (even one made before the
     * first has finished binding) returns the same port instead of standing up a second server.
     */
    public async start(sessionId: string, device: RceDeviceConfig): Promise<number> {
        const existingProxy = this.proxiesBySessionId.get(sessionId);
        if (existingProxy) {
            return existingProxy.portPromise;
        }

        const proxy = {
            server: undefined,
            sockets: new Set<DestroyableSocket>(),
            stopped: false
        } as JsDebugProxy;
        this.proxiesBySessionId.set(sessionId, proxy);

        proxy.portPromise = this.bindServer(sessionId, device, proxy);
        return proxy.portPromise;
    }

    private async bindServer(sessionId: string, device: RceDeviceConfig, proxy: JsDebugProxy): Promise<number> {
        const port = await getPort();
        const server = net.createServer((client) => {
            this.handleConnection(sessionId, device, client).catch((error: Error) => {
                this.log(`[js-debug-proxy] connection handler failed: ${error?.message}`);
                if (!client.destroyed) {
                    client.destroy();
                }
            });
        });
        proxy.server = server;

        await new Promise<void>((resolve, reject) => {
            const onListening = () => {
                server.removeListener('error', onError);
                resolve();
            };
            const onError = (error: Error) => {
                server.removeListener('listening', onListening);
                reject(error);
            };
            server.once('listening', onListening);
            server.once('error', onError);
            server.listen(port, '127.0.0.1');
        });

        //a persistent error listener for the lifetime of the server, distinct from the one-shot
        //listener above that only guards the initial bind
        server.on('error', (error: Error) => {
            this.log(`[js-debug-proxy] server error for session '${sessionId}': ${error?.message}`);
            this.stop(sessionId);
        });

        if (proxy.stopped) {
            //`stop()` ran while we were still binding; nothing is listening on `sessionId` anymore
            //so close the server we just stood up rather than leaving it orphaned
            server.close();
            return port;
        }

        return port;
    }

    /**
     * Closes `sessionId`'s server (if any) and destroys every socket it is still tracking. No-op
     * for an unknown sessionId. Safe to call while the server is still binding (i.e. before
     * `start()`'s returned promise has resolved).
     */
    public stop(sessionId: string): void {
        const proxy = this.proxiesBySessionId.get(sessionId);
        if (!proxy) {
            return;
        }
        this.proxiesBySessionId.delete(sessionId);
        proxy.stopped = true;
        if (proxy.server) {
            proxy.server.close();
        }
        for (const socket of [...proxy.sockets]) {
            if (!socket.destroyed) {
                socket.destroy();
            }
        }
    }

    /**
     * Test-only accessor for the number of sockets `sessionId`'s proxy is currently tracking, to
     * verify that closed connections get pruned from `sockets` rather than accumulating there.
     */
    public getSocketCountForTest(sessionId: string): number {
        return this.proxiesBySessionId.get(sessionId)?.sockets.size ?? 0;
    }

    public dispose(): void {
        for (const sessionId of [...this.proxiesBySessionId.keys()]) {
            this.stop(sessionId);
        }
    }

    private async handleConnection(sessionId: string, device: RceDeviceConfig, client: net.Socket) {
        const proxy = this.proxiesBySessionId.get(sessionId);
        //`stop()` may have already torn this session down between the server accepting the
        //connection and this handler running
        if (!proxy) {
            client.destroy();
            return;
        }
        proxy.sockets.add(client);

        let tunnel: RokuDeploySocket | undefined;
        let tornDown = false;
        const teardown = () => {
            if (tornDown) {
                return;
            }
            tornDown = true;
            proxy.sockets.delete(client);
            if (!client.destroyed) {
                client.destroy();
            }
            if (tunnel) {
                proxy.sockets.delete(tunnel);
                if (!tunnel.destroyed) {
                    tunnel.destroy();
                }
            }
        };
        //attached synchronously (before the `await` below) so a client-side error/close occurring
        //while we're still waiting on the token can't leak the connection or crash the extension
        //host with an unhandled 'error' event
        client.on('error', teardown);
        client.on('close', teardown);

        //fetched fresh per connection (rather than once in `start()`) so an account/token change
        //mid-session is picked up by the extension's attach retry loop on its next attempt
        const rceToken = await this.rceManager.getToken();

        //re-check after the await: `stop()` may have run while we were waiting on the token, or
        //the client may have already disconnected
        if (client.destroyed || this.proxiesBySessionId.get(sessionId) !== proxy) {
            if (!client.destroyed) {
                client.destroy();
            }
            return;
        }

        if (!rceToken) {
            this.log('[js-debug-proxy] no active Cloud Emulator account token; JS debugger cannot reach the device');
            client.destroy();
            return;
        }

        tunnel = this.socketFactory({ device: { ...device, rceToken: rceToken }, port: JS_DEBUG_PORT });
        proxy.sockets.add(tunnel);

        tunnel.on('error', (error: Error) => {
            this.log(`[js-debug-proxy] tunnel error: ${error?.message}`);
            teardown();
        });
        tunnel.on('close', teardown);

        client.pipe(tunnel);
        tunnel.pipe(client);

        tunnel.connect();
    }
}

// ---- types ----

interface JsDebugProxy {
    server: net.Server | undefined;
    /**
     * Resolves once the server is bound and listening, to the port the node debugger should
     * attach to. Stored (rather than a plain resolved `port` field) so a second `start()` call
     * for the same sessionId made before binding finishes can just await this instead of racing
     * a second `getPort()`/`createServer()`.
     */
    portPromise: Promise<number>;
    sockets: Set<DestroyableSocket>;
    /** Set by `stop()`; lets a still-in-flight bind detect it should tear itself down. */
    stopped: boolean;
}

/**
 * The subset of `net.Socket` / `RokuDeploySocket` that `stop()` needs to forcibly tear down live
 * connections, without committing to either concrete socket type.
 */
interface DestroyableSocket {
    readonly destroyed: boolean;
    destroy: (error?: Error) => unknown;
}
