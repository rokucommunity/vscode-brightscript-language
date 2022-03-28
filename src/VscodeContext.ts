import * as vscode from 'vscode';

type ContextValue = boolean | string;

/**
 * Wrapper around VS Code's `setContext`.
 * The API call takes several milliseconds to seconds to complete,
 * so let's cache the values and only call the API when necessary.
 */
class Context {
    private readonly cache: Map<string, ContextValue> = new Map();

    public async set(key: string, value: ContextValue): Promise<void> {
        const prev = this.get(key);
        if (prev !== value) {
            //   Logger.get('vscode-context').debug(`Setting key='${key}' to value='${value}'`);
            this.cache.set(key, value);
            await vscode.commands.executeCommand('setContext', key, value);
        }
    }

    public get(key: string): ContextValue | undefined {
        return this.cache.get(key);
    }
}

export const VSCodeContext = new Context();
