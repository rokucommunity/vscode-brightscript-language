import * as request from 'postman-request';
import type { Response } from 'request';
import type { ManagerOptions, SocketOptions } from 'socket.io-client';

/**
 * Base origin for the Cloud Emulator service. All browser traffic in the web app is proxied through
 * this origin, including calls that ultimately reach a running instance, so a client never talks to
 * the per-instance host (device.rce.roku.com) directly. That host sits behind a service-mesh
 * authorization policy that rejects outside callers regardless of session or API key.
 */
export const defaultCloudEmulatorBaseUrl = 'https://developer.roku.com';

/**
 * A browser-like User-Agent is required to pass the CloudFront / PerimeterX bot-protection layer that
 * fronts the Cloud Emulator service. Requests without one are rejected with a 403 "Request blocked"
 * before authentication is ever evaluated, so we send this on every request including WebSocket handshakes.
 */
export const defaultCloudEmulatorUserAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36';

export class RokuCloudEmulatorClient {
    constructor(options: RokuCloudEmulatorClientOptions) {
        this.apiKey = options.apiKey;
        this.baseUrl = (options.baseUrl ?? defaultCloudEmulatorBaseUrl).replace(/\/+$/, '');
        this.userAgent = options.userAgent ?? defaultCloudEmulatorUserAgent;
    }

    private readonly apiKey: string;
    /**
     * Service origin (no trailing slash), for example https://developer.roku.com. Exposed so the
     * WebSocket log stream and socket.io remote can build their own connection URLs against it.
     */
    public readonly baseUrl: string;
    private readonly userAgent: string;

    /**
     * The single place that decides how the API key is presented to the service. Roku has confirmed
     * an API key will be issued but has not finalized the exact scheme, so we assume a bearer token
     * for now. When the real format arrives, change it here only and every request picks it up.
     */
    public buildRequestHeaders(additionalHeaders?: Record<string, string>): Record<string, string> {
        return {
            'User-Agent': this.userAgent,
            Authorization: `Bearer ${this.apiKey}`,
            ...additionalHeaders
        };
    }

    /**
     * Build a WebSocket URL (wss) for the given service path, carrying the credentials the log and
     * remote-control sockets need. Unlike a browser, a native client can send Authorization on the
     * handshake, so we do not depend on session cookies.
     */
    public buildWebSocketUrl(servicePath: string): string {
        const httpUrl = new URL(servicePath.replace(/^\//, ''), `${this.baseUrl}/`);
        httpUrl.protocol = httpUrl.protocol === 'https:' ? 'wss:' : 'ws:';
        return httpUrl.toString();
    }

    /**
     * Build the socket.io connection options for the shared BFF socket (used by the remote-control
     * and video-streaming channels).
     *
     * We send credentials two ways because the two client environments differ: a Node client (the
     * extension host) can set Authorization via extraHeaders, but a browser or VS Code webview cannot
     * set headers on the handshake, so the key also rides in the socket.io auth payload. The auth
     * field name is assumed pending Roku's API details.
     */
    public buildSocketIoOptions(socketPath: string): Partial<ManagerOptions & SocketOptions> {
        return {
            path: socketPath,
            transports: ['websocket'],
            extraHeaders: this.buildRequestHeaders(),
            auth: { apiKey: this.apiKey }
        };
    }

    /**
     * Fetch the caller's Cloud Emulator devices along with their current run state. This is the one
     * endpoint verified against the live service; the web app polls it every few seconds.
     */
    public async getDevices(): Promise<CloudEmulatorDevice[]> {
        const response = await this.performRequest('GET', '/cloud-emulator/api/devices/poll');
        const body = this.parseJsonBody<CloudEmulatorDevicePollResponse>(response);
        if (!body?.ok) {
            throw new Error(`Cloud Emulator device poll failed (status ${response.statusCode})`);
        }
        return body.devices ?? [];
    }

    /**
     * Find a single device by its id, or undefined when the caller has no such device.
     */
    public async getDevice(deviceId: string): Promise<CloudEmulatorDevice | undefined> {
        const devices = await this.getDevices();
        return devices.find((device) => device.id === deviceId);
    }

    /**
     * Start (boot) a device from a snapshot.
     *
     * PROVISIONAL: the web app performs this via a Next.js server action whose id is a per-build hash,
     * which is not viable for a stable client. This assumes Roku will expose a REST equivalent under
     * the api namespace. Confirm the real path and payload against Roku's forthcoming API docs.
     */
    public async startDevice(deviceId: string, options: StartDeviceOptions): Promise<void> {
        const response = await this.performRequest('POST', `/cloud-emulator/api/devices/${encodeURIComponent(deviceId)}/start`, {
            snapshotId: options.snapshotId,
            firmwareVersion: options.firmwareVersion,
            maxRuntimeSeconds: options.maxRuntimeSeconds
        });
        this.assertOk(response, 'start device');
    }

    /**
     * Stop (shut down) a running device.
     *
     * PROVISIONAL: see the note on startDevice; this assumes a REST equivalent of the web app's
     * server action.
     */
    public async stopDevice(deviceId: string): Promise<void> {
        const response = await this.performRequest('POST', `/cloud-emulator/api/devices/${encodeURIComponent(deviceId)}/stop`);
        this.assertOk(response, 'stop device');
    }

    private assertOk(response: Response, action: string): void {
        const body = this.parseJsonBody<{ ok?: boolean; error?: string }>(response);
        if (response.statusCode >= 400 || body?.ok === false) {
            throw new Error(`Cloud Emulator ${action} failed (status ${response.statusCode})${body?.error ? `: ${body.error}` : ''}`);
        }
    }

    private parseJsonBody<TBody>(response: Response): TBody | undefined {
        if (typeof response.body !== 'string' || response.body.length === 0) {
            return undefined;
        }
        try {
            return JSON.parse(response.body) as TBody;
        } catch {
            return undefined;
        }
    }

    /**
     * Single choke point for HTTP so auth and the User-Agent are applied consistently, and so tests
     * can stub one method rather than the network.
     */
    protected performRequest(method: 'GET' | 'POST', servicePath: string, jsonBody?: unknown): Promise<Response> {
        const url = `${this.baseUrl}/${servicePath.replace(/^\//, '')}`;
        return new Promise<Response>((resolve, reject) => {
            request(url, {
                method: method,
                headers: this.buildRequestHeaders(jsonBody === undefined ? undefined : { 'Content-Type': 'application/json' }),
                body: jsonBody === undefined ? undefined : JSON.stringify(jsonBody)
            }, (error, response) => {
                return error ? reject(error) : resolve(response);
            });
        });
    }
}

export interface RokuCloudEmulatorClientOptions {
    /**
     * API key issued by Roku for the Cloud Emulator service.
     */
    apiKey: string;
    /**
     * Override the service origin. Defaults to the public developer.roku.com origin.
     */
    baseUrl?: string;
    /**
     * Override the User-Agent sent on every request. Defaults to a browser-like value required to
     * pass bot protection.
     */
    userAgent?: string;
}

export interface StartDeviceOptions {
    snapshotId: string;
    firmwareVersion: string;
    maxRuntimeSeconds: number;
}

export interface CloudEmulatorDevicePollResponse {
    ok: boolean;
    devices: CloudEmulatorDevice[];
}

export interface CloudEmulatorDevice {
    id: string;
    name: string;
    esn: string;
    /**
     * Device family, observed as 'tv' or 'player'. Left as a string so unknown future families do not
     * break parsing.
     */
    deviceType: string;
    note: string | null;
    accountName: string | null;
    qaHub: boolean;
    snapshotCount: number;
    status: CloudEmulatorDeviceStatus;
    lastSnapshotId: string | null;
    lastSnapshotName: string | null;
    firmwareVersion?: string;
    firmwareDisplayName?: string;
    runningDevice?: CloudEmulatorRunningDevice;
}

export interface CloudEmulatorRunningDevice {
    instanceId: string;
    startedAt: string;
    maxRuntimeSeconds: number;
    /**
     * URL of the per-instance host. Present for information only; it is not directly reachable by a
     * client because of the service-mesh authorization policy in front of it.
     */
    instanceApiUrl: string;
    snapshotId: string;
    snapshotName: string;
    firmwareVersion: string;
}

/**
 * Device run state. Observed values are 'shutdown', 'pending', and 'running'. Left as a string so
 * unknown future states do not break parsing.
 */
export type CloudEmulatorDeviceStatus = string;
