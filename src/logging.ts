import type * as vscode from 'vscode';
import type { LogMessage, Transport } from '@rokucommunity/logger';
import { Logger, ConsoleTransport } from '@rokucommunity/logger';

/**
 * Routes log messages to a vscode OutputChannel once one has been attached.
 * Until then, messages are buffered so logs emitted during module load
 * (before extension activation) are not lost.
 */
class OutputChannelTransport implements Transport {
    private channel: vscode.OutputChannel | undefined;
    private buffer: LogMessage[] = [];

    public attach(channel: vscode.OutputChannel) {
        this.channel = channel;
        for (const message of this.buffer) {
            this.write(message);
        }
        this.buffer = [];
    }

    public pipe(message: LogMessage) {
        if (this.channel) {
            this.write(message);
        } else {
            this.buffer.push(message);
        }
    }

    private write(message: LogMessage) {
        this.channel.appendLine(message.logger.formatMessage(message, false));
    }
}

const outputChannelTransport = new OutputChannelTransport();

/**
 * Singleton logger for the extension. Writes to the developer console (for
 * extension-host debugging) and to the `BrightScript Extension` output channel
 * (for end-users). Use `logger.createLogger('Prefix')` to make a sub-logger
 * that tags every message with a component name.
 */
export const logger = new Logger({
    logLevel: 'log',
    transports: [
        new ConsoleTransport(),
        outputChannelTransport
    ]
});

export const createLogger = logger.createLogger.bind(logger) as typeof Logger.prototype.createLogger;

/**
 * Attach the extension output channel to the shared logger. Should be called
 * once during extension activation, right after the channel is created.
 */
export function attachExtensionOutputChannel(channel: vscode.OutputChannel) {
    outputChannelTransport.attach(channel);
}
