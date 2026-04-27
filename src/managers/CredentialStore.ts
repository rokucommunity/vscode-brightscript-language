import type * as vscode from 'vscode';
import type { Disposable } from 'vscode';
import { EventEmitter } from 'eventemitter3';

/**
 * Stores device developer passwords keyed by device serial number.
 *
 * Serial number is preferred over IP because a device's IP can change
 * (DHCP, network moves, etc.) but its serial number does not.
 *
 * Backed by the extension's `globalState` so credentials are shared
 * across workspaces on the same machine. The backend is intentionally
 * hidden behind this class so it can be swapped (e.g. to `SecretStorage`)
 * in the future without changing call sites.
 */
export class CredentialStore {
    constructor(
        private context: vscode.ExtensionContext
    ) { }

    private readonly storageKey = 'devicePasswordsBySerial';

    private emitter = new EventEmitter();

    /**
     * Subscribe to change events. `'changed'` fires whenever a stored password
     * is added, changed, or removed.
     */
    public on(eventName: 'changed', handler: () => void, disposables?: Disposable[]): () => void {
        this.emitter.on(eventName, handler);
        const unsubscribe = () => {
            this.emitter.removeListener(eventName, handler);
        };

        disposables?.push({
            dispose: unsubscribe
        });

        return unsubscribe;
    }

    /**
     * Get the stored password for a device by serial number.
     */
    public async getPassword(serialNumber: string | undefined): Promise<string | undefined> {
        if (!serialNumber) {
            return undefined;
        }
        const map = await this.readMap();
        return map[serialNumber];
    }

    /**
     * Store a password for a device by serial number.
     * Pass an empty string to store an empty password; use `clearPassword` to remove an entry.
     */
    public async setPassword(serialNumber: string, password: string): Promise<void> {
        if (!serialNumber) {
            throw new Error('serialNumber is required');
        }
        const map = await this.readMap();
        map[serialNumber] = password;
        await this.context.globalState.update(this.storageKey, map);
        this.emitter.emit('changed');
    }

    /**
     * Remove the stored password for a device by serial number.
     */
    public async clearPassword(serialNumber: string | undefined): Promise<void> {
        if (!serialNumber) {
            return;
        }
        const map = await this.readMap();
        if (serialNumber in map) {
            delete map[serialNumber];
            await this.context.globalState.update(this.storageKey, map);
            this.emitter.emit('changed');
        }
    }

    /**
     * List the serial numbers of every device with a stored password.
     */
    public async listSerialNumbersWithPasswords(): Promise<string[]> {
        return Object.keys(await this.readMap());
    }

    /**
     * Remove every stored password.
     */
    public async clearAll(): Promise<void> {
        await this.context.globalState.update(this.storageKey, undefined);
        this.emitter.emit('changed');
    }

    private readMap(): Promise<Record<string, string>> {
        return Promise.resolve(this.context.globalState.get<Record<string, string>>(this.storageKey) ?? {});
    }
}
