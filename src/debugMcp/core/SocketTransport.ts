import type { Socket } from 'net';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import { ReadBuffer, serializeMessage } from '@modelcontextprotocol/sdk/shared/stdio.js';

/**
 * MCP transport over an already-connected socket, using the same newline-delimited JSON
 * framing as the SDK's stdio transport.
 */
export class SocketTransport implements Transport {
    constructor(
        private readonly socket: Socket
    ) { }

    public onclose?: () => void;
    public onerror?: (error: Error) => void;
    public onmessage?: (message: JSONRPCMessage) => void;

    private readBuffer = new ReadBuffer();
    private started = false;

    public start(): Promise<void> {
        if (this.started) {
            return Promise.reject(new Error('SocketTransport already started'));
        }
        this.started = true;
        this.socket.on('data', (chunk: Buffer) => this.receive(chunk));
        this.socket.on('error', (error) => this.onerror?.(error));
        this.socket.on('close', () => {
            this.readBuffer.clear();
            this.onclose?.();
        });
        return Promise.resolve();
    }

    /** Feed bytes that arrived on the socket before the transport was attached. */
    public receive(chunk: Buffer): void {
        this.readBuffer.append(chunk);
        for (; ;) {
            let message: JSONRPCMessage | null;
            try {
                message = this.readBuffer.readMessage();
            } catch (error) {
                this.onerror?.(error as Error);
                continue;
            }
            if (message === null) {
                return;
            }
            this.onmessage?.(message);
        }
    }

    public async send(message: JSONRPCMessage): Promise<void> {
        if (this.socket.destroyed) {
            throw new Error('Socket is closed');
        }
        await new Promise<void>((resolve, reject) => {
            this.socket.write(serializeMessage(message), (error) => {
                if (error) {
                    reject(error);
                } else {
                    resolve();
                }
            });
        });
    }

    public close(): Promise<void> {
        this.socket.destroy();
        return Promise.resolve();
    }
}
