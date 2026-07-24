import * as vscode from 'vscode';
import { EventEmitter } from 'eventemitter3';
import { RceManagementClient } from 'roku-deploy';
import type { UserOut } from 'roku-deploy';

/**
 * Owns the Roku Cloud Emulator (RCE) accounts and the shared management-api client.
 * Multiple named accounts (each holding an api token) live in VS Code's SecretStorage (encrypted,
 * shared across windows), and each workspace selects its own active account, so different editors
 * can work against different RCE accounts at the same time. The `ROKU_RCE_TOKEN` environment
 * variable acts as a fallback when no accounts exist (headless/CI use).
 * Consumers (the RceFinder, device lifecycle actions, the launch flow) get the client from here.
 */
export class RceManager {
    constructor(
        private context: vscode.ExtensionContext
    ) { }

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
            })
        );
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
     * Get every stored account. Also migrates the legacy single-token secret into a
     * `default` account the first time it is seen.
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

        //migrate the legacy single-token secret into a named account
        const legacyToken = await this.context.secrets.get(RceManager.legacyTokenSecretKey);
        if (legacyToken) {
            await this.context.secrets.delete(RceManager.legacyTokenSecretKey);
            if (!accounts.some(account => account.token === legacyToken)) {
                accounts.push({ name: 'default', token: legacyToken });
                await this.saveAccounts(accounts);
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
        const accounts = await this.getAccounts();
        const existing = accounts.find(account => account.name === name);
        if (existing) {
            existing.token = token;
        } else {
            accounts.push({ name: name, token: token });
        }
        await this.saveAccounts(accounts);
        await this.setActiveAccount(name);
    }

    /**
     * Remove an account. When it was this workspace's active account, the selection is cleared
     * (the first remaining account becomes the effective one).
     */
    public async removeAccount(name: string): Promise<void> {
        const accounts = await this.getAccounts();
        await this.saveAccounts(accounts.filter(account => account.name !== name));
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
     * then the ROKU_RCE_TOKEN environment variable
     */
    public async getToken(): Promise<string | undefined> {
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
    public async validateToken(token: string): Promise<UserOut> {
        return this.createClient(token).getUserInfo();
    }

    /**
     * The default label for an account, derived from the authenticated user (for example `chrisdp (fubo)`)
     */
    private buildDefaultAccountName(user: UserOut): string {
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
        let user: UserOut;
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
        await this.removeAccount(picked);
        void vscode.window.showInformationMessage(`Cloud Emulator account '${picked}' removed`);
    }

    public static readonly accountsSecretKey = 'brightscript.rce.accounts';

    /**
     * The pre-account single-token secret; migrated into a `default` account on first read
     */
    public static readonly legacyTokenSecretKey = 'brightscript.rce.token';

    private static readonly activeAccountStateKey = 'brightscript.rce.activeAccount';
}

export interface RceAccount {
    name: string;
    token: string;
}
