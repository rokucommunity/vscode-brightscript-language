import * as vscode from 'vscode';
import { EventEmitter } from 'eventemitter3';
import { RceManagementClient } from 'roku-deploy';

/**
 * Owns the Roku Cloud Emulator (RCE) api token and the shared management-api client.
 * The token lives in VS Code's SecretStorage (encrypted, never in settings.json), with the
 * `ROKU_RCE_TOKEN` environment variable as a fallback for headless/CI use.
 * Consumers (the RceFinder, device lifecycle actions, the launch flow) get the client from here.
 */
export class RceManager {
    constructor(
        private context: vscode.ExtensionContext
    ) { }

    private emitter = new EventEmitter();

    private client: RceManagementClient | undefined;

    /**
     * The token the current `client` was built with, so a token change invalidates the client
     */
    private clientToken: string | undefined;

    public register(context: vscode.ExtensionContext) {
        context.subscriptions.push(
            vscode.commands.registerCommand('extension.brightscript.rce.setToken', async () => {
                const token = await vscode.window.showInputBox({
                    title: 'Roku Cloud Emulator api token',
                    prompt: 'Paste the api token used to access the Roku Cloud Emulator management api',
                    password: true,
                    ignoreFocusOut: true
                });
                if (token?.trim()) {
                    await this.setToken(token.trim());
                    void vscode.window.showInformationMessage('Roku Cloud Emulator token saved');
                }
            }),
            vscode.commands.registerCommand('extension.brightscript.rce.clearToken', async () => {
                await this.clearToken();
                void vscode.window.showInformationMessage('Roku Cloud Emulator token removed');
            })
        );
    }

    /**
     * Register a handler that fires whenever the token is set or cleared
     */
    public onTokenChanged(handler: () => void): () => void {
        this.emitter.on('token-changed', handler);
        return () => {
            this.emitter.off('token-changed', handler);
        };
    }

    /**
     * Get the RCE api token: SecretStorage first, then the ROKU_RCE_TOKEN environment variable
     */
    public async getToken(): Promise<string | undefined> {
        return (await this.context.secrets.get(RceManager.tokenSecretKey)) ?? process.env.ROKU_RCE_TOKEN;
    }

    public async hasToken(): Promise<boolean> {
        return (await this.getToken()) !== undefined;
    }

    public async setToken(token: string): Promise<void> {
        await this.context.secrets.store(RceManager.tokenSecretKey, token);
        this.client = undefined;
        this.emitter.emit('token-changed');
    }

    public async clearToken(): Promise<void> {
        await this.context.secrets.delete(RceManager.tokenSecretKey);
        this.client = undefined;
        this.emitter.emit('token-changed');
    }

    /**
     * Get a management-api client for the current token, or undefined when no token is available.
     * The client is cached and rebuilt whenever the token changes.
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

    public static readonly tokenSecretKey = 'brightscript.rce.token';
}
