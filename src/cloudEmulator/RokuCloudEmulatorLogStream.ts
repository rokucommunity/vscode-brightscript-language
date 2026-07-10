import { EventEmitter } from 'eventemitter3';
import * as WebSocket from 'ws';
import type { RokuCloudEmulatorClient } from './RokuCloudEmulatorClient';

/**
 * Streams a running device's BrightScript console output (the Cloud Emulator equivalent of the
 * telnet port 8085 log) over a WebSocket.
 *
 * The socket delivers two kinds of frames: raw console text lines, and JSON control frames of the
 * shape { type: "error", code, message } (for example when no sideloaded app is running yet). We
 * surface console text as "output" and control frames as "control" so a consumer can route each
 * appropriately, for example console text to an OutputChannel and control frames to a status line.
 */
export class RokuCloudEmulatorLogStream extends EventEmitter<RokuCloudEmulatorLogStreamEvents> {
    constructor(
        private readonly client: RokuCloudEmulatorClient,
        private readonly deviceId: string
    ) {
        super();
    }

    private socket: WebSocket | undefined;

    public get isConnected(): boolean {
        return this.socket?.readyState === WebSocket.OPEN;
    }

    public connect(): void {
        this.disconnect();
        const url = this.client.buildWebSocketUrl(`/cloud-emulator-bff/devices/${encodeURIComponent(this.deviceId)}/log`);
        const socket = new WebSocket(url, {
            headers: this.client.buildRequestHeaders()
        });
        this.socket = socket;

        socket.on('open', () => {
            this.emit('open');
        });
        socket.on('message', (data: WebSocket.RawData) => {
            this.handleMessage(data.toString());
        });
        socket.on('error', (error: Error) => {
            this.emit('error', error);
        });
        socket.on('close', (code: number, reason: Buffer) => {
            this.socket = undefined;
            this.emit('close', { code: code, reason: reason.toString() });
        });
    }

    public disconnect(): void {
        if (!this.socket) {
            return;
        }
        this.socket.removeAllListeners();
        if (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING) {
            this.socket.close();
        }
        this.socket = undefined;
    }

    private handleMessage(text: string): void {
        const controlFrame = this.tryParseControlFrame(text);
        if (controlFrame) {
            this.emit('control', controlFrame);
        } else {
            this.emit('output', text);
        }
    }

    private tryParseControlFrame(text: string): CloudEmulatorLogControlFrame | undefined {
        let parsed: any;
        try {
            parsed = JSON.parse(text);
        } catch {
            return undefined;
        }
        if (parsed && typeof parsed === 'object' && parsed.type === 'error' && typeof parsed.code === 'string' && typeof parsed.message === 'string') {
            return { type: 'error', code: parsed.code, message: parsed.message };
        }
        return undefined;
    }
}

export interface CloudEmulatorLogControlFrame {
    type: 'error';
    code: string;
    message: string;
}

export interface CloudEmulatorLogCloseEvent {
    code: number;
    reason: string;
}

export interface RokuCloudEmulatorLogStreamEvents {
    open: () => void;
    output: (line: string) => void;
    control: (frame: CloudEmulatorLogControlFrame) => void;
    error: (error: Error) => void;
    close: (event: CloudEmulatorLogCloseEvent) => void;
}
