import * as net from 'net';
import { createRokuDeploySocket, isLocalDeviceConfig, isRceDeviceConfig } from 'roku-deploy';
import type { DeviceConfig, LocalDeviceConfig, RokuDeploySocket } from 'roku-deploy';
import type { RceManager } from '../RceManager';
import { JsDebugCdpFilter } from './JsDebugCdpFilter';

/** The device-side Hermes debug port; relayed sessions attach to a local proxy port that tunnels here. */
export const JS_DEBUG_PORT = 9999;

/**
 * Caps repeated local connects from driving unbounded authenticated cloud tunnels. js-debug's own
 * steady state is ~3 sockets (2 pooled discovery + 1 CDP).
 */
const MAX_PROXY_CONNECTIONS = 8;

/**
 * Idle timer for connections with no established websocket session. Must NOT apply once a session
 * exists - CDP has no heartbeat, so a paused session sits silent indefinitely.
 */
const DEFAULT_IDLE_WITHOUT_SESSION_TIMEOUT_MS = 30_000;

/**
 * Bridges the node debugger to a Roku device's JS (Hermes) debug port, tunneling each local
 * connection through `createRokuDeploySocket()` (a plain tcp `LocalSocket` for a LAN device, an
 * authenticated websocket `RceSocket` for an RCE one).
 *
 * The pass-through `/json/list` discovery relay depends on shipped js-debug forcibly rewriting the
 * discovered `webSocketDebuggerUrl`'s host to the address it attached to - undocumented VS
 * Code-internal behavior. If that ever changes, the relayed response would advertise the device's
 * own address and js-debug would bypass this proxy entirely.
 */
export class JsDebugProxyManager {
    constructor(
        private rceManager: RceManager,
        private log: (message: string) => void,
        private socketFactory: (options: { device: DeviceConfig; port: number }) => RokuDeploySocket = createRokuDeploySocket,
        private idleWithoutSessionTimeoutMs: number = DEFAULT_IDLE_WITHOUT_SESSION_TIMEOUT_MS
    ) {
    }

    private proxiesBySessionId = new Map<string, JsDebugProxy>();

    /**
     * Starts (or reuses) the proxy for `sessionId` and returns the local port the node debugger
     * should attach to. Idempotent: a second call for the same session (even one made before the
     * first has finished binding) returns the same port instead of standing up a second server.
     */
    public async start(sessionId: string, device: DeviceConfig): Promise<number> {
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

    private async bindServer(sessionId: string, device: DeviceConfig, proxy: JsDebugProxy): Promise<number> {
        const server = net.createServer((client) => {
            this.handleConnection(sessionId, device, client).catch((error: Error) => {
                this.log(`[js-debug-proxy] connection handler failed: ${error?.message}`);
                if (!client.destroyed) {
                    client.destroy();
                }
            });
        });
        server.maxConnections = MAX_PROXY_CONNECTIONS;
        //Node never runs the connection listener for dropped connections; log or the client just sees ECONNRESET
        server.on('drop', () => {
            this.log(`[js-debug-proxy] dropped a connection for session '${sessionId}': already at the ${MAX_PROXY_CONNECTIONS}-connection cap`);
        });
        proxy.server = server;

        //atomic ephemeral-port bind; avoids get-port's check-then-bind race
        const port = await new Promise<number>((resolve, reject) => {
            const onListening = () => {
                server.removeListener('error', onError);
                const address = server.address();
                resolve(typeof address === 'object' && address !== null ? address.port : 0);
            };
            const onError = (error: Error) => {
                server.removeListener('listening', onListening);
                reject(error);
            };
            server.once('listening', onListening);
            server.once('error', onError);
            server.listen(0, '127.0.0.1');
        });

        //persistent listener, distinct from the one-shot bind guard above
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

    /**
     * Pure/vscode-free: decides whether (and how) to route the node debugger through this proxy.
     * RCE always relays (no LAN address to attach to directly). LAN relays only on win32
     * (js-debug's four-slash file-url bug is client-side) or when forced via the setting.
     * `device.host` wins over `fallbackHost` because the raw configured host may be an unresolved
     * placeholder.
     */
    public resolveRoute(input: {
        device: DeviceConfig | undefined;
        fallbackHost: string | undefined;
        platform: NodeJS.Platform;
        forceLanRelay: boolean;
    }): JsDebugRoute {
        if (input.device && isRceDeviceConfig(input.device)) {
            return {
                useRelay: true,
                device: input.device,
                summary: 'relay mode: rce'
            };
        }

        //isLocalDeviceConfig dereferences config.host - guard undefined
        const lanHost = (input.device !== undefined && isLocalDeviceConfig(input.device)) ? input.device.host : input.fallbackHost;
        if (lanHost) {
            if (input.platform === 'win32') {
                return {
                    useRelay: true,
                    device: { host: lanHost } as LocalDeviceConfig,
                    summary: 'relay mode: lan (win32)'
                };
            }
            if (input.forceLanRelay) {
                return {
                    useRelay: true,
                    device: { host: lanHost } as LocalDeviceConfig,
                    summary: 'relay mode: lan (forced by brightscript.debug.forceJsDebugRelay)'
                };
            }
            return {
                useRelay: false,
                host: lanHost,
                summary: 'direct attach: lan'
            };
        }

        return {
            useRelay: false,
            summary: 'direct attach: no device and no fallback host - attach will fail downstream'
        };
    }

    private async handleConnection(sessionId: string, device: DeviceConfig, client: net.Socket) {
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
        //attach before the await so an early client error can't leak the connection
        client.on('error', teardown);
        client.on('close', teardown);

        //disarmed below once the filter confirms a session established
        client.setTimeout(this.idleWithoutSessionTimeoutMs, () => {
            this.log(`[js-debug-proxy] closed an idle connection for session '${sessionId}' with no active websocket session (benign for js-debug's pooled discovery sockets)`);
            teardown();
        });

        //a LAN device needs no token; fetching one unconditionally would hard-fail LAN relays while signed out of RCE
        let rceToken: string | undefined;
        if (isRceDeviceConfig(device)) {
            //fetched fresh per connection so a token change is picked up by the next attach attempt
            rceToken = await this.rceManager.getToken();

            //stop() may have run, or the client disconnected, while we were waiting on the token
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
        }

        const tunnelDevice: DeviceConfig = rceToken === undefined ? device : { ...device, rceToken: rceToken };
        tunnel = this.socketFactory({ device: tunnelDevice, port: JS_DEBUG_PORT });
        proxy.sockets.add(tunnel);
        tunnel.setTimeout(this.idleWithoutSessionTimeoutMs, () => {
            this.log(`[js-debug-proxy] closed an idle tunnel connection for session '${sessionId}' with no active websocket session (benign for js-debug's pooled discovery sockets)`);
            teardown();
        });

        tunnel.on('error', (error: Error) => {
            this.log(`[js-debug-proxy] tunnel error: ${error?.message}`);
            teardown();
        });
        tunnel.on('close', teardown);

        //Hermes on RCE crashes the whole app on a second `Runtime.enable` on this session; the
        //filter drops the duplicate and answers it locally instead of forwarding it to the device
        const filter = new JsDebugCdpFilter(this.log, () => {
            //disarm the idle-without-session timer now that a session has formed
            client.setTimeout(0);
            tunnel?.setTimeout(0);
        });
        filter.upstream.on('error', teardown);
        filter.downstream.on('error', teardown);

        client.pipe(filter.upstream).pipe(tunnel);
        tunnel.pipe(filter.downstream).pipe(client);

        tunnel.connect();
    }
}

// ---- types ----

interface JsDebugProxy {
    server: net.Server | undefined;
    /** Resolves to the bound port; lets a concurrent `start()` call await instead of racing a second bind. */
    portPromise: Promise<number>;
    sockets: Set<DestroyableSocket>;
    /** Set by `stop()`; lets a still-in-flight bind detect it should tear itself down. */
    stopped: boolean;
}

/** Minimal `net.Socket`/`RokuDeploySocket` surface `stop()` needs to tear down a connection. */
interface DestroyableSocket {
    readonly destroyed: boolean;
    destroy: (error?: Error) => unknown;
}

/** The result of `JsDebugProxyManager.resolveRoute`. */
interface JsDebugRoute {
    useRelay: boolean;
    device?: DeviceConfig;
    host?: string;
    summary: string;
}
