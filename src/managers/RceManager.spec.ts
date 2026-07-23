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
    protected override createClient(token: string): RceManagementClient {
        this.createdTokens.push(token);
        return { token: token } as unknown as RceManagementClient;
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

    it('has no token by default', async () => {
        expect(await manager.getToken()).to.be.undefined;
        expect(await manager.hasToken()).to.be.false;
        expect(await manager.getClient()).to.be.undefined;
    });

    it('stores and clears the token in SecretStorage', async () => {
        await manager.setToken('token-1');
        expect(await manager.getToken()).to.equal('token-1');
        expect(await manager.hasToken()).to.be.true;

        await manager.clearToken();
        expect(await manager.getToken()).to.be.undefined;
    });

    it('falls back to the ROKU_RCE_TOKEN environment variable', async () => {
        process.env.ROKU_RCE_TOKEN = 'env-token';
        expect(await manager.getToken()).to.equal('env-token');

        //SecretStorage wins over the environment variable
        await manager.setToken('secret-token');
        expect(await manager.getToken()).to.equal('secret-token');
    });

    it('caches the client and rebuilds it when the token changes', async () => {
        await manager.setToken('token-1');
        const client1 = await manager.getClient();
        const client1Again = await manager.getClient();
        expect(client1Again).to.equal(client1);
        expect(manager.createdTokens).to.eql(['token-1']);

        await manager.setToken('token-2');
        const client2 = await manager.getClient();
        expect(client2).not.to.equal(client1);
        expect(manager.createdTokens).to.eql(['token-1', 'token-2']);
    });

    it('emits token-changed on set and clear', async () => {
        const events: string[] = [];
        const off = manager.onTokenChanged(() => events.push('changed'));

        await manager.setToken('token-1');
        await manager.clearToken();
        expect(events).to.eql(['changed', 'changed']);

        off();
        await manager.setToken('token-2');
        expect(events.length).to.equal(2);
    });
});
