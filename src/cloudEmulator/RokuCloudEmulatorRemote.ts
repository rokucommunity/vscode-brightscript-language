import { EventEmitter } from 'eventemitter3';
import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import type { RokuCloudEmulatorClient } from './RokuCloudEmulatorClient';

/**
 * Engine.IO path the Cloud Emulator BFF serves the remote-control socket on. It is not the socket.io
 * default of /socket.io/, so it must be passed explicitly.
 */
export const cloudEmulatorSocketPath = '/cloud-emulator-bff/io/';

/**
 * Friendly remote-button names mapped to the ECP key each one sends. Mirrors the button vocabulary
 * the Cloud Emulator web remote uses. Callers that already hold a raw ECP key (as the extension's
 * existing remote commands do) can skip this and call sendKeypress directly.
 */
export const remoteButtonToEcpKey = {
    back: 'Back',
    home: 'Home',
    power: 'Power',
    up: 'Up',
    down: 'Down',
    left: 'Left',
    right: 'Right',
    ok: 'Select',
    rewind: 'Rev',
    play: 'Play',
    fastForward: 'Fwd',
    replay: 'InstantReplay',
    options: 'Info',
    rokuChannel: 'Partner45'
} as const;

/**
 * Sends ECP remote input to a running Cloud Emulator device over the same socket.io channel the web
 * remote uses. After connecting, an "ecp-init" is emitted for the device (and re-emitted on every
 * reconnect); the server answers with "ecp-ready". Input is then sent as "ecp" events carrying a
 * verb (keypress for a tap, keydown/keyup for press-and-hold) and an ECP key.
 *
 * The ECP key strings are exactly those the extension already sends to physical devices over HTTP
 * (Home, Up, Select, Rev, InstantReplay, Lit_<char>, and so on), so this can back the existing
 * remote commands by swapping only the transport.
 */
export class RokuCloudEmulatorRemote extends EventEmitter<RokuCloudEmulatorRemoteEvents> {
    constructor(
        private readonly client: RokuCloudEmulatorClient,
        private readonly deviceId: string
    ) {
        super();
    }

    private socket: Socket | undefined;
    private heldKey: string | undefined;

    public get isConnected(): boolean {
        return this.socket?.connected ?? false;
    }

    /**
     * Open the socket and initialize ECP for the device. Resolves once the server reports the device
     * is ready to receive input, or rejects on a connection error or if readiness is not reached
     * within the timeout.
     */
    public connect(readyTimeoutMs = 15000): Promise<void> {
        this.disconnect();

        const socket = this.createSocket();
        this.socket = socket;

        // (re)initialize ECP whenever the socket connects, matching the web remote's behavior
        socket.on('connect', () => {
            socket.emit('ecp-init', { deviceId: this.deviceId });
        });
        socket.on('ecp-ready', () => {
            this.emit('ready');
        });
        socket.on('ecp-error', (payload: { error?: string }) => {
            this.emit('remoteError', payload?.error ?? 'unknown');
        });
        socket.on('disconnect', (reason: string) => {
            this.heldKey = undefined;
            this.emit('close', reason);
        });

        return new Promise<void>((resolve, reject) => {
            const timeoutHandle = setTimeout(() => {
                cleanup();
                reject(new Error('Timed out waiting for the Cloud Emulator device to become ready for remote input'));
            }, readyTimeoutMs);

            const onReady = () => {
                cleanup();
                resolve();
            };
            const onConnectError = (error: Error) => {
                cleanup();
                reject(error);
            };
            const cleanup = () => {
                clearTimeout(timeoutHandle);
                socket.off('ecp-ready', onReady);
                socket.off('connect_error', onConnectError);
            };

            socket.on('ecp-ready', onReady);
            socket.on('connect_error', onConnectError);
        });
    }

    public disconnect(): void {
        if (!this.socket) {
            return;
        }
        this.releaseHeldKey();
        this.socket.removeAllListeners();
        this.socket.disconnect();
        this.socket = undefined;
    }

    /**
     * Create the underlying socket. Split out so tests can supply a fake socket.
     */
    protected createSocket(): Socket {
        return io(this.client.baseUrl, this.client.buildSocketIoOptions(cloudEmulatorSocketPath));
    }

    /**
     * Tap a key (press and immediately release).
     * @param key an ECP key such as Home, Up, Select, or a literal character when literalCharacter is true
     * @param literalCharacter when true, the key is sent as a literal character (prefixed with Lit_)
     */
    public sendKeypress(key: string, literalCharacter = false): void {
        this.emitEcp('keypress', this.resolveKey(key, literalCharacter));
    }

    /**
     * Tap a remote button by its friendly name (for example 'home' or 'ok').
     */
    public pressButton(button: RemoteButton): void {
        this.sendKeypress(remoteButtonToEcpKey[button]);
    }

    /**
     * Send text by tapping each character as a literal key.
     */
    public sendText(text: string): void {
        for (const character of text) {
            this.sendKeypress(character, true);
        }
    }

    /**
     * Press and hold a key. Any previously held key is released first so at most one key is held at a time.
     */
    public holdKey(key: string): void {
        const resolvedKey = this.resolveKey(key, false);
        if (this.heldKey && this.heldKey !== resolvedKey) {
            this.releaseHeldKey();
        }
        this.heldKey = resolvedKey;
        this.emitEcp('keydown', resolvedKey);
    }

    /**
     * Release the currently held key, if any.
     */
    public releaseHeldKey(): void {
        if (!this.heldKey) {
            return;
        }
        const key = this.heldKey;
        this.heldKey = undefined;
        this.emitEcp('keyup', key);
    }

    private resolveKey(key: string, literalCharacter: boolean): string {
        return literalCharacter ? `Lit_${key}` : key;
    }

    private emitEcp(verb: EcpVerb, key: string): void {
        if (!this.socket) {
            throw new Error('Cannot send remote input before connect() is called');
        }
        this.socket.emit('ecp', { deviceId: this.deviceId, verb: verb, key: key });
    }
}

export type RemoteButton = keyof typeof remoteButtonToEcpKey;

export type EcpVerb = 'keypress' | 'keydown' | 'keyup';

export interface RokuCloudEmulatorRemoteEvents {
    ready: () => void;
    remoteError: (message: string) => void;
    close: (reason: string) => void;
}
