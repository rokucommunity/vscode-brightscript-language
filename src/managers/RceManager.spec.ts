import { expect } from 'chai';
import { createSandbox } from 'sinon';
import type { RceManagementClient } from 'roku-deploy';
import { vscode } from '../mockVscode.spec';
import { RceManager } from './RceManager';

const sinon = createSandbox();

/**
 * RceManager with the client construction stubbed out so no real client is built
 */
class TestRceManager extends RceManager {
    public createdTokens: string[] = [];
    /**
     * When set, getUserInfo rejects with this error (simulates an invalid token / unreachable api)
     */
    public userInfoError: Error | undefined;
    public userInfo = {
        id: 'user-1',
        username: 'chrisdp',
        organisation: { name: 'fubo' }
    };
    protected override createClient(token: string): RceManagementClient {
        this.createdTokens.push(token);
        return {
            token: token,
            getUserInfo: () => {
                return this.userInfoError ? Promise.reject(this.userInfoError) : Promise.resolve(this.userInfo);
            }
        } as unknown as RceManagementClient;
    }
}

describe('RceManager', () => {
    let manager: TestRceManager;
    let originalEnvToken: string | undefined;

    beforeEach(() => {
        originalEnvToken = process.env.ROKU_RCE_TOKEN;
        delete process.env.ROKU_RCE_TOKEN;
        manager = new TestRceManager(vscode.context as any);
    });

    afterEach(() => {
        if (originalEnvToken === undefined) {
            delete process.env.ROKU_RCE_TOKEN;
        } else {
            process.env.ROKU_RCE_TOKEN = originalEnvToken;
        }
        sinon.restore();
    });

    it('has no accounts or token by default', async () => {
        expect(await manager.getAccounts()).to.eql([]);
        expect(await manager.getToken()).to.be.undefined;
        expect(await manager.hasToken()).to.be.false;
        expect(await manager.getClient()).to.be.undefined;
    });

    it('adds an account and makes it the active one for this workspace', async () => {
        await manager.addAccount('work', 'token-work');
        expect(await manager.getAccounts()).to.eql([{ name: 'work', token: 'token-work' }]);
        expect(manager.getActiveAccountName()).to.equal('work');
        expect(await manager.getToken()).to.equal('token-work');
    });

    it('adding an account with an existing name updates its token', async () => {
        await manager.addAccount('work', 'token-1');
        await manager.addAccount('work', 'token-2');
        expect(await manager.getAccounts()).to.eql([{ name: 'work', token: 'token-2' }]);
        expect(await manager.getToken()).to.equal('token-2');
    });

    it('switches the active account per workspace', async () => {
        await manager.addAccount('work', 'token-work');
        await manager.addAccount('personal', 'token-personal');
        expect(await manager.getToken()).to.equal('token-personal');

        await manager.setActiveAccount('work');
        expect(await manager.getToken()).to.equal('token-work');
    });

    it('falls back to the first account when the selected account no longer exists', async () => {
        await manager.addAccount('work', 'token-work');
        await manager.addAccount('personal', 'token-personal');
        await manager.removeAccount('personal');
        expect(await manager.getToken()).to.equal('token-work');
    });

    it('falls back to the ROKU_RCE_TOKEN environment variable when there are no accounts', async () => {
        process.env.ROKU_RCE_TOKEN = 'env-token';
        expect(await manager.getToken()).to.equal('env-token');

        //a stored account wins over the environment variable
        await manager.addAccount('work', 'account-token');
        expect(await manager.getToken()).to.equal('account-token');
    });

    it('migrates the legacy single-token secret into a default account', async () => {
        await vscode.context.secrets.store(RceManager.legacyTokenSecretKey, 'legacy-token');

        expect(await manager.getAccounts()).to.eql([{ name: 'default', token: 'legacy-token' }]);
        expect(await manager.getToken()).to.equal('legacy-token');
        //the legacy secret is gone after migration
        expect(await vscode.context.secrets.get(RceManager.legacyTokenSecretKey)).to.be.undefined;
    });

    it('caches the client and rebuilds it when the effective token changes', async () => {
        await manager.addAccount('work', 'token-work');
        const client1 = await manager.getClient();
        expect(await manager.getClient()).to.equal(client1);
        expect(manager.createdTokens).to.eql(['token-work']);

        await manager.addAccount('personal', 'token-personal');
        const client2 = await manager.getClient();
        expect(client2).not.to.equal(client1);
        expect(manager.createdTokens).to.eql(['token-work', 'token-personal']);
    });

    it('validateToken resolves with the authenticated user for a good token', async () => {
        const user = await manager.validateToken('token-good');
        expect(user.username).to.equal('chrisdp');
        expect(manager.createdTokens).to.eql(['token-good']);
    });

    it('validateToken rejects for a bad token', async () => {
        manager.userInfoError = new Error('unauthorized');
        let error: Error;
        try {
            await manager.validateToken('token-bad');
        } catch (e) {
            error = e as Error;
        }
        expect(error?.message).to.equal('unauthorized');
    });

    it('derives the default account name from the authenticated user and their org', () => {
        expect(manager['buildDefaultAccountName']({ username: 'chrisdp', organisation: { name: 'fubo' } } as any)).to.equal('chrisdp (fubo)');
        expect(manager['buildDefaultAccountName']({ username: 'chrisdp' } as any)).to.equal('chrisdp');
    });

    it('emits token-changed on add, switch, and remove', async () => {
        const events: string[] = [];
        const off = manager.onTokenChanged(() => events.push('changed'));

        await manager.addAccount('work', 'token-work');
        await manager.setActiveAccount('work');
        await manager.removeAccount('work');
        expect(events.length).to.be.greaterThanOrEqual(3);

        const countBefore = events.length;
        off();
        await manager.addAccount('personal', 'token-personal');
        expect(events.length).to.equal(countBefore);
    });
});
