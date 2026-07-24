import { expect } from 'chai';
import type { DeviceOut, RceManagementClient } from 'roku-deploy';
import type { RceManager } from '../managers/RceManager';
import { RceFinder } from './RceFinder';

describe('RceFinder', () => {
    let finder: RceFinder;
    let client: { listDevices: () => Promise<DeviceOut[]> } | undefined;
    let token: string | undefined;
    let tokenChangedHandlers: Array<() => void>;

    function makeRceManagerFake(): RceManager {
        tokenChangedHandlers = [];
        return {
            getClient: () => Promise.resolve(client as unknown as RceManagementClient),
            getToken: () => Promise.resolve(token),
            onTokenChanged: (handler: () => void) => {
                tokenChangedHandlers.push(handler);
                return () => { };
            }
        } as unknown as RceManager;
    }

    beforeEach(() => {
        client = undefined;
        token = undefined;
        finder = new RceFinder(makeRceManagerFake());
    });

    afterEach(() => {
        finder.dispose();
    });

    it('emits an empty device list when no token is configured', async () => {
        const events: DeviceOut[][] = [];
        finder.on('devices', (devices: DeviceOut[]) => events.push(devices));

        await finder.scan();

        expect(events).to.eql([[]]);
    });

    it('emits the device list from the management api', async () => {
        const devices = [{ id: 83, name: 'Chris', status: 'running' }] as unknown as DeviceOut[];
        client = { listDevices: () => Promise.resolve(devices) };
        const events: DeviceOut[][] = [];
        finder.on('devices', (result: DeviceOut[]) => events.push(result));

        await finder.scan();

        expect(events).to.eql([devices]);
    });

    it('emits error (and no devices) when the poll fails', async () => {
        client = {
            listDevices: () => Promise.reject(new Error('boom'))
        };
        const deviceEvents: DeviceOut[][] = [];
        const errors: Error[] = [];
        finder.on('devices', (result: DeviceOut[]) => deviceEvents.push(result));
        finder.on('error', (e: Error) => errors.push(e));

        await finder.scan();

        expect(deviceEvents).to.eql([]);
        expect(errors.map(e => e.message)).to.eql(['boom']);
    });

    it('start begins polling and stop ends it', () => {
        expect(finder.running).to.be.false;
        finder.start();
        expect(finder.running).to.be.true;
        //starting again is a no-op
        finder.start();
        expect(finder.running).to.be.true;
        finder.stop();
        expect(finder.running).to.be.false;
    });

    it('re-polls when the token changes', async () => {
        const events: DeviceOut[][] = [];
        finder.on('devices', (result: DeviceOut[]) => events.push(result));

        //simulate a token change (the handler was registered in the constructor)
        tokenChangedHandlers[0]();
        //scan is async; give it a beat to settle
        await new Promise(setImmediate);

        expect(events).to.eql([[]]);
    });

    describe('getCachedToken', () => {
        it('returns undefined before any scan', () => {
            expect(finder.getCachedToken()).to.be.undefined;
        });

        it('returns the token used for the most recent scan', async () => {
            token = 'secret-token';
            client = { listDevices: () => Promise.resolve([]) };

            await finder.scan();

            expect(finder.getCachedToken()).to.equal('secret-token');
        });

        it('returns undefined after a scan with no token configured', async () => {
            token = 'secret-token';
            client = { listDevices: () => Promise.resolve([]) };
            await finder.scan();
            expect(finder.getCachedToken()).to.equal('secret-token');

            token = undefined;
            client = undefined;
            await finder.scan();

            expect(finder.getCachedToken()).to.be.undefined;
        });
    });
});
