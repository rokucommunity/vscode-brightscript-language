import * as vscode from 'vscode';
import { EventEmitter } from 'eventemitter3';

type ContextValue = boolean | string;

/**
 * Wrapper around VS Code's `setContext`.
 * The API call can take up to several seconds to complete,
 * so let's cache the values and only call the API when necessary.
 */
class VSCodeContextManager {
    private readonly cache = new Map<string, ContextValue>();
    private readonly emitter = new EventEmitter();

    public async set(key: string, value: ContextValue): Promise<void> {
        const prev = this.get(key);
        if (prev !== value) {
            //   Logger.get('vscode-context').debug(`Setting key='${key}' to value='${value}'`);
            this.cache.set(key, value);
            this.emitter.emit('change', key, value);
            await vscode.commands.executeCommand('setContext', key, value);
        }
    }

    public get<T extends ContextValue>(key: string, defaultValue?: T): T | undefined {
        return this.cache.get(key) as T ?? defaultValue;
    }

    /**
     * Subscribe to context value changes (only fired when a key's value actually changes).
     * @returns an unsubscribe function
     */
    public onChange(handler: (key: string, value: ContextValue) => void): () => void {
        this.emitter.on('change', handler);
        return () => {
            this.emitter.removeListener('change', handler);
        };
    }
}

export const vscodeContextManager = new VSCodeContextManager();
