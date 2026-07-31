import { expect } from 'chai';
import { createSandbox } from 'sinon';
import type { RceManagementClient } from 'roku-deploy';
import { vscode } from '../mockVscode.spec';
import { RceDeviceNotRunningError, RceManager } from './RceManager';

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
    /**
     * The device list resolveStreamRequest sees
     */
    public devices: any[] = [];
    protected override createClient(token: string): RceManagementClient {
        this.createdTokens.push(token);
        return {
            token: token,
            getUserInfo: () => {
                return this.userInfoError ? Promise.reject(this.userInfoError) : Promise.resolve(this.userInfo);
            },
            listDevices: () => Promise.resolve(this.devices)
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

    it('serializes overlapping account mutations so neither write is lost', async () => {
        //no awaits between the calls: both would read the same empty list and the second
        //write would clobber the first if the mutations were not queued
        await Promise.all([
            manager.addAccount('work', 'token-work'),
            manager.addAccount('personal', 'token-personal')
        ]);

        expect(await manager.getAccounts()).to.eql([
            { name: 'work', token: 'token-work' },
            { name: 'personal', token: 'token-personal' }
        ]);
    });

    it('refreshes when another window changes the stored accounts', async () => {
        manager.register(vscode.context as any);
        await manager.addAccount('work', 'token-work');
        const client1 = await manager.getClient();

        let tokenChangedCount = 0;
        manager.onTokenChanged(() => tokenChangedCount++);

        //another window's write lands as a bare SecretStorage change (no local emit path)
        await vscode.context.secrets.store(RceManager.accountsSecretKey, JSON.stringify([{ name: 'work', token: 'token-work' }]));
        expect(tokenChangedCount).to.equal(1);
        //the cached client was dropped, so the next getClient builds a fresh one
        expect(await manager.getClient()).to.not.equal(client1);

        //changes to unrelated secrets are ignored
        await vscode.context.secrets.store('some.other.secret', 'value');
        expect(tokenChangedCount).to.equal(1);
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

    describe('resolveStreamRequest', () => {
        it('throws when no account is configured', async () => {
            let caughtError: Error;
            try {
                await manager.resolveStreamRequest(5);
            } catch (e) {
                caughtError = e as Error;
            }
            expect(caughtError.message).to.contain('No active Cloud Emulator account');
        });

        it('throws the typed not-running error, carrying the device status, when the device is not running', async () => {
            await manager.addAccount('work', 'token-work');
            /* eslint-disable camelcase -- the RCE management api uses snake_case fields */
            manager.devices = [{ id: 5, name: 'my-device', status: 'shutdown' }];
            /* eslint-enable camelcase */

            let caughtError: Error;
            try {
                await manager.resolveStreamRequest(5);
            } catch (e) {
                caughtError = e as Error;
            }
            expect(caughtError.message).to.contain('is not running');
            //typed so stream hosts can react to the device's actual state (wait for pending, show
            //device-stopped otherwise), identified by name so the check survives an executeCommand
            //relay
            expect(RceDeviceNotRunningError.is(caughtError)).to.be.true;
            expect((caughtError as RceDeviceNotRunningError).deviceStatus).to.equal('shutdown');
            //a plain error is not misidentified
            expect(RceDeviceNotRunningError.is(new Error('is not running'))).to.be.false;

            //a pending device carries its status too, which is what the waiting-for-device phase keys on
            manager.devices = [{ id: 5, name: 'my-device', status: 'pending' }];
            caughtError = undefined;
            try {
                await manager.resolveStreamRequest(5);
            } catch (e) {
                caughtError = e as Error;
            }
            expect((caughtError as RceDeviceNotRunningError).deviceStatus).to.equal('pending');
        });

        it('throws when a running device has no janus_websocket_url or no janus_id', async () => {
            await manager.addAccount('work', 'token-work');
            /* eslint-disable camelcase -- the RCE management api uses snake_case fields */
            manager.devices = [{ id: 5, name: 'my-device', status: 'running', running_device: {} }];

            let caughtError: Error;
            try {
                await manager.resolveStreamRequest(5);
            } catch (e) {
                caughtError = e as Error;
            }
            expect(caughtError.message).to.contain('must be running');

            manager.devices = [{ id: 5, name: 'my-device', status: 'running', running_device: { janus_websocket_url: 'wss://x/janus', janus_id: null } }];
            /* eslint-enable camelcase */
            caughtError = undefined;
            try {
                await manager.resolveStreamRequest(5);
            } catch (e) {
                caughtError = e as Error;
            }
            expect(caughtError.message).to.contain('must be running');
        });

        it('resolves the full stream config for a running device, treating a janus_id of 0 as valid', async () => {
            await manager.addAccount('work', 'token-work');
            /* eslint-disable camelcase -- the RCE management api uses snake_case fields */
            manager.devices = [{
                id: 5,
                name: 'my-device',
                status: 'running',
                running_device: {
                    janus_websocket_url: 'wss://device.rce.roku.com/instance/abc/janus',
                    janus_id: 0,
                    janus_pin: '1234',
                    janus_token: 'janus-secret',
                    janus_ice_servers: [{ urls: ['stun:stun.example.com'] }]
                }
            }];
            /* eslint-enable camelcase */

            const streamRequest = await manager.resolveStreamRequest(5);
            expect(streamRequest).to.eql({
                deviceId: 5,
                deviceName: 'my-device',
                websocketUrl: 'wss://device.rce.roku.com/instance/abc/janus',
                streamId: 0,
                pin: '1234',
                janusToken: 'janus-secret',
                iceServers: [{ urls: ['stun:stun.example.com'] }]
            });
        });
    });
});
