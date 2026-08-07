import * as vscode from 'vscode';
import { EventEmitter } from 'eventemitter3';
import { RceManagementClient } from 'roku-deploy';
import type { DeviceType, IceServer, User } from 'roku-deploy';
import type { ExperimentalFeaturesManager } from './ExperimentalFeaturesManager';
import { ExperimentalFeature } from './ExperimentalFeaturesManager';

/**
 * Owns the Roku Cloud Emulator (RCE) accounts and the shared management-api client.
 * Multiple named accounts (each holding an api token) live in VS Code's SecretStorage (encrypted,
 * shared across windows), and each workspace selects its own active account, so different editors
 * can work against different RCE accounts at the same time. The `ROKU_RCE_TOKEN` environment
 * variable acts as a fallback when no accounts exist (headless/CI use).
 * Consumers (the RceFinder, device lifecycle actions, the launch flow) get the client from here.
 *
 * Account mutations are serialized within a window (see `enqueueAccountWrite`), and a
 * SecretStorage change subscription (see `register`) keeps every window's view fresh when another
 * window mutates the list. Truly concurrent writes from two windows remain last-writer-wins:
 * SecretStorage has no compare-and-swap, and account edits are rare interactive actions.
 */
export class RceManager {
    constructor(
        private context: vscode.ExtensionContext,
        private experimentalFeatures?: ExperimentalFeaturesManager
    ) {
        if (experimentalFeatures) {
            const unsubscribe = experimentalFeatures.onEnablementChanged((feature) => {
                if (feature === ExperimentalFeature.rokuCloudEmulator) {
                    //the effective token just changed between the account token and "none" (see
                    //getToken); ride the existing token-changed plumbing so finders rescan (which
                    //clears or restores cloud devices everywhere) and panels refresh
                    this.client = undefined;
                    this.emitter.emit('token-changed');
                }
            });
            context.subscriptions.push({ dispose: unsubscribe });
        }
    }

    private emitter = new EventEmitter();

    private client: RceManagementClient | undefined;

    /**
     * The token the current `client` was built with, so an account switch or token change
     * invalidates the client
     */
    private clientToken: string | undefined;

    public register(context: vscode.ExtensionContext) {
        context.subscriptions.push(
            vscode.commands.registerCommand('extension.brightscript.rce.addAccount', async () => {
                await this.promptAddAccount();
            }),
            vscode.commands.registerCommand('extension.brightscript.rce.switchAccount', async () => {
                await this.promptSwitchAccount();
            }),
            vscode.commands.registerCommand('extension.brightscript.rce.removeAccount', async () => {
                await this.promptRemoveAccount();
            }),
            //SecretStorage is shared across every VS Code window and fires this event in all of
            //them: when another window mutates the account list, drop the cached client and
            //re-announce so this window's finder and panels refresh instead of going stale. This
            //window's own saveAccounts lands here too, making a harmless duplicate emission (the
            //finder coalesces scans and the client rebuild is lazy)
            context.secrets.onDidChange((event) => {
                if (event.key === RceManager.accountsSecretKey) {
                    this.client = undefined;
                    this.emitter.emit('token-changed');
                }
            })
        );
    }

    /**
     * Serializes account mutations so overlapping calls in this window can't interleave their
     * read-modify-write over the shared secret. Writes from other windows are not covered (see
     * the class doc); a failed operation still rejects to its caller without wedging the queue.
     */
    private accountWriteQueue: Promise<unknown> = Promise.resolve();

    private enqueueAccountWrite<T>(operation: () => Promise<T>): Promise<T> {
        const queuedOperation = this.accountWriteQueue.then(operation);
        this.accountWriteQueue = queuedOperation.catch(() => { });
        return queuedOperation;
    }

    /**
     * Register a handler that fires whenever the effective token may have changed
     * (account added, removed, or switched)
     */
    public onTokenChanged(handler: () => void): () => void {
        this.emitter.on('token-changed', handler);
        return () => {
            this.emitter.off('token-changed', handler);
        };
    }

    /**
     * Get every stored account
     */
    public async getAccounts(): Promise<RceAccount[]> {
        const raw = await this.context.secrets.get(RceManager.accountsSecretKey);
        let accounts: RceAccount[] = [];
        if (raw) {
            try {
                accounts = JSON.parse(raw);
            } catch {
                accounts = [];
            }
        }
        return accounts;
    }

    /**
     * The name of this workspace's active account (may reference an account that no longer exists)
     */
    public getActiveAccountName(): string | undefined {
        return this.context.workspaceState.get<string>(RceManager.activeAccountStateKey);
    }

    /**
     * Resolve this workspace's active account: the selected account when it exists,
     * otherwise the first stored account.
     */
    public async getActiveAccount(): Promise<RceAccount | undefined> {
        const accounts = await this.getAccounts();
        if (accounts.length === 0) {
            return undefined;
        }
        const activeName = this.getActiveAccountName();
        return accounts.find(account => account.name === activeName) ?? accounts[0];
    }

    /**
     * Add an account (or update the token of an existing one) and make it this workspace's active account
     */
    public async addAccount(name: string, token: string): Promise<void> {
        await this.enqueueAccountWrite(async () => {
            const accounts = await this.getAccounts();
            const existing = accounts.find(account => account.name === name);
            if (existing) {
                existing.token = token;
            } else {
                accounts.push({ name: name, token: token });
            }
            await this.saveAccounts(accounts);
        });
        await this.setActiveAccount(name);
    }

    /**
     * Remove an account. When it was this workspace's active account, the selection is cleared
     * (the first remaining account becomes the effective one).
     */
    public async removeAccount(name: string): Promise<void> {
        await this.enqueueAccountWrite(async () => {
            const accounts = await this.getAccounts();
            await this.saveAccounts(accounts.filter(account => account.name !== name));
        });
        if (this.getActiveAccountName() === name) {
            await this.context.workspaceState.update(RceManager.activeAccountStateKey, undefined);
        }
        this.client = undefined;
        this.emitter.emit('token-changed');
    }

    /**
     * Select this workspace's active account
     */
    public async setActiveAccount(name: string): Promise<void> {
        await this.context.workspaceState.update(RceManager.activeAccountStateKey, name);
        this.client = undefined;
        this.emitter.emit('token-changed');
    }

    /**
     * Get the RCE api token for this workspace: the active account first,
     * then the ROKU_RCE_TOKEN environment variable.
     *
     * While the Roku Cloud Emulator experimental feature is disabled this always returns
     * undefined: "no token" is the single gate every consumer already handles (finder scans emit
     * an empty device list, panel state reports no account, launch resolution and adapter env
     * injection find nothing to send).
     */
    public async getToken(): Promise<string | undefined> {
        if (this.experimentalFeatures && !this.experimentalFeatures.isEnabled(ExperimentalFeature.rokuCloudEmulator)) {
            return undefined;
        }
        return (await this.getActiveAccount())?.token ?? process.env.ROKU_RCE_TOKEN;
    }

    public async hasToken(): Promise<boolean> {
        return (await this.getToken()) !== undefined;
    }

    /**
     * Get a management-api client for the current token, or undefined when no token is available.
     * The client is cached and rebuilt whenever the effective token changes.
     */
    public async getClient(): Promise<RceManagementClient | undefined> {
        const token = await this.getToken();
        if (!token) {
            return undefined;
        }
        if (!this.client || this.clientToken !== token) {
            this.client = this.createClient(token);
            this.clientToken = token;
        }
        return this.client;
    }

    /**
     * Build the management client. Protected so tests can substitute a fake.
     */
    protected createClient(token: string): RceManagementClient {
        return new RceManagementClient({ token: token });
    }

    /**
     * Validate a token against the management api and return the authenticated user.
     * Throws when the token is rejected or the api is unreachable.
     */
    public async validateToken(token: string): Promise<User> {
        return this.createClient(token).getUserInfo();
    }

    /**
     * Resolve a device's current Janus stream details into the config a video stream session starts
     * from. Throws when no account is configured or the device is missing, not running, or exposes
     * no video stream. Never includes the management api token; the session host fetches that itself
     * when it creates the signaling client.
     */
    public async resolveStreamRequest(deviceId: number): Promise<RceStreamRequestConfig> {
        const managementClient = await this.getClient();
        if (!managementClient) {
            throw new Error('No active Cloud Emulator account is configured');
        }
        const devices = await managementClient.listDevices();
        const device = devices.find((candidateDevice) => candidateDevice.id === deviceId);
        if (!device) {
            throw new Error(`Device ${deviceId} was not found`);
        }

        //typed errors so stream hosts can tell "the device is not running" apart from transient
        //failures: a pending device is waited for, a stopped one renders as a device-stopped state
        //rather than a retryable error
        if (device.status !== 'running') {
            throw new RceDeviceNotRunningError(`Device '${device.name}' is not running`, device.status);
        }
        const runningDevice = device.running_device;
        //janus_id can legitimately be 0 (a valid stream id), so its presence must be checked
        //with a nullish check rather than a truthiness check
        if (!runningDevice?.janus_websocket_url || runningDevice?.janus_id === undefined || runningDevice?.janus_id === null) {
            throw new RceDeviceNotRunningError(`Device '${device.name}' must be running and expose a video stream to watch it`, device.status);
        }

        /* eslint-disable camelcase -- the RCE management api uses snake_case fields */
        return {
            deviceId: device.id,
            deviceName: device.name,
            deviceType: device.device_type,
            websocketUrl: runningDevice.janus_websocket_url,
            streamId: runningDevice.janus_id,
            pin: runningDevice.janus_pin ?? undefined,
            janusToken: runningDevice.janus_token ?? undefined,
            iceServers: runningDevice.janus_ice_servers ?? []
        };
        /* eslint-enable camelcase */
    }

    /**
     * The default label for an account, derived from the authenticated user (for example `chrisdp (fubo)`)
     */
    private buildDefaultAccountName(user: User): string {
        const orgName = user.organisation?.name;
        return orgName ? `${user.username} (${orgName})` : user.username;
    }

    private async saveAccounts(accounts: RceAccount[]): Promise<void> {
        await this.context.secrets.store(RceManager.accountsSecretKey, JSON.stringify(accounts));
        this.client = undefined;
        this.emitter.emit('token-changed');
    }

    private async promptAddAccount(): Promise<void> {
        const token = (await vscode.window.showInputBox({
            title: 'Cloud Emulator api token',
            prompt: 'Paste the api token used to access the Roku Cloud Emulator management api',
            password: true,
            ignoreFocusOut: true
        }))?.trim();
        if (!token) {
            return;
        }

        //validate the token against the management api before saving it, and learn who it belongs to
        let user: User;
        try {
            user = await vscode.window.withProgress(
                { location: vscode.ProgressLocation.Notification, title: 'Validating Cloud Emulator token' },
                () => this.validateToken(token)
            );
        } catch (e) {
            void vscode.window.showErrorMessage(`Cloud Emulator token was rejected: ${(e as Error).message}`);
            return;
        }

        const defaultName = this.buildDefaultAccountName(user);
        const nameInput = await vscode.window.showInputBox({
            title: 'Cloud Emulator account name',
            prompt: 'A label for this account (leave as-is to use the name from the account itself)',
            value: defaultName,
            ignoreFocusOut: true
        });
        if (nameInput === undefined) {
            return;
        }
        const name = nameInput.trim() || defaultName;

        await this.addAccount(name, token);
        void vscode.window.showInformationMessage(`Cloud Emulator account '${name}' added and active in this workspace`);
    }

    private async promptSwitchAccount(): Promise<void> {
        const accounts = await this.getAccounts();
        if (accounts.length === 0) {
            await this.promptAddAccount();
            return;
        }
        const active = await this.getActiveAccount();
        const addNewLabel = '$(plus) Add a new account...';
        const picked = await vscode.window.showQuickPick(
            [
                ...accounts.map(account => ({
                    label: account.name,
                    description: account.name === active?.name ? '(active)' : undefined
                })),
                { label: addNewLabel, description: undefined }
            ],
            { title: 'Switch Cloud Emulator account (for this workspace)' }
        );
        if (!picked) {
            return;
        }
        if (picked.label === addNewLabel) {
            await this.promptAddAccount();
            return;
        }
        await this.setActiveAccount(picked.label);
        void vscode.window.showInformationMessage(`Cloud Emulator account '${picked.label}' is now active in this workspace`);
    }

    private async promptRemoveAccount(): Promise<void> {
        const accounts = await this.getAccounts();
        if (accounts.length === 0) {
            void vscode.window.showInformationMessage('There are no Cloud Emulator accounts to remove');
            return;
        }
        const picked = await vscode.window.showQuickPick(
            accounts.map(account => account.name),
            { title: 'Remove Cloud Emulator account' }
        );
        if (!picked) {
            return;
        }
        const removeLabel = 'Remove';
        const confirmed = await vscode.window.showWarningMessage(
            `Remove Cloud Emulator account '${picked}'?`,
            {
                modal: true,
                detail: 'This deletes the saved token for this account from VS Code. The account and its devices are not affected.'
            },
            removeLabel
        );
        if (confirmed !== removeLabel) {
            return;
        }
        await this.removeAccount(picked);
        void vscode.window.showInformationMessage(`Cloud Emulator account '${picked}' removed`);
    }

    public static readonly accountsSecretKey = 'brightscript.rce.accounts';

    private static readonly activeAccountStateKey = 'brightscript.rce.activeAccount';
}

/**
 * Thrown by resolveStreamRequest when the device exists but is not running (or exposes no video
 * stream), so stream hosts can react to the device's actual state instead of a retryable error
 * banner: `deviceStatus` 'pending' means the device is still starting (wait for it); anything else
 * renders as a device-stopped state.
 */
export class RceDeviceNotRunningError extends Error {
    public constructor(message: string, public readonly deviceStatus?: string) {
        super(message);
        this.name = 'RceDeviceNotRunningError';
    }

    /**
     * Identify this error by name rather than instanceof, so the check survives the error being
     * relayed across an executeCommand boundary (which may hand back a copy rather than the
     * original instance)
     */
    public static is(error: unknown): boolean {
        return (error as Error)?.name === 'RceDeviceNotRunningError';
    }
}

export interface RceAccount {
    name: string;
    token: string;
}

/**
 * A device's resolved Janus stream details, ready to hand to an RceStreamSession. Never includes
 * the management api token; the session host fetches that itself when it creates the signaling
 * client.
 */
export interface RceStreamRequestConfig {
    deviceId: number;
    deviceName: string;
    deviceType: DeviceType;
    websocketUrl: string;
    streamId: number;
    pin?: string;
    janusToken?: string;
    iceServers: IceServer[];
}
