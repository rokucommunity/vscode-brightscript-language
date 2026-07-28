import { expect } from 'chai';
import * as sinon from 'sinon';
import { rokuDeploy } from 'roku-deploy';
import { Prober } from './Prober';

describe('Prober', () => {
    let prober: Prober;
    let globalStateManager: any;
    let deviceCache: Map<string, any>;
    let ipToSerial: Map<string, string>;
    const networkId = 'net-1';

    beforeEach(() => {
        deviceCache = new Map();
        ipToSerial = new Map();
        globalStateManager = {
            getCachedDevice: sinon.stub().callsFake((serial: string) => deviceCache.get(serial)),
            setCachedDevice: sinon.stub().callsFake((serial: string, entry: any) => deviceCache.set(serial, entry)),
            getSerialNumberForIp: sinon.stub().callsFake((ip: string) => ipToSerial.get(ip)),
            setSerialNumberForIp: sinon.stub().callsFake((_networkId: string, ip: string, serial: string) => ipToSerial.set(ip, serial)),
            getIpForSerial: sinon.stub().callsFake((serial: string) => {
                for (const [ip, s] of ipToSerial) {
                    if (s === serial) {
                        return ip;
                    }
                }
                return undefined;
            })
        };
        prober = new Prober(globalStateManager, () => networkId);
    });

    afterEach(() => {
        sinon.restore();
    });

    describe('fetchDeviceInfo (in-flight de-dupe)', () => {
        it('shares a single HTTP request between concurrent callers for the same ip:port', async () => {
            let resolveFetch: (value: any) => void;
            const getDeviceInfoStub = sinon.stub(rokuDeploy, 'getDeviceInfo').returns(new Promise((resolve) => {
                resolveFetch = resolve;
            }) as any);

            const first = prober.fetchDeviceInfo('192.168.1.10', 8060);
            const second = prober.fetchDeviceInfo('192.168.1.10', 8060);

            resolveFetch({ 'serial-number': 'shared-1' });

            const [firstResult, secondResult] = await Promise.all([first, second]);
            expect(getDeviceInfoStub.calledOnce).to.be.true;
            expect(firstResult['serial-number']).to.equal('shared-1');
            expect(secondResult['serial-number']).to.equal('shared-1');
        });

        it('does not share requests across different IPs', async () => {
            const getDeviceInfoStub = sinon.stub(rokuDeploy, 'getDeviceInfo').resolves({ 'serial-number': 'x' } as any);

            await Promise.all([
                prober.fetchDeviceInfo('192.168.1.10', 8060),
                prober.fetchDeviceInfo('192.168.1.11', 8060)
            ]);

            expect(getDeviceInfoStub.calledTwice).to.be.true;
        });

        it('makes a fresh request after the shared one settles (no result caching)', async () => {
            const getDeviceInfoStub = sinon.stub(rokuDeploy, 'getDeviceInfo').resolves({ 'serial-number': 'x' } as any);

            await prober.fetchDeviceInfo('192.168.1.10', 8060);
            await prober.fetchDeviceInfo('192.168.1.10', 8060);

            expect(getDeviceInfoStub.calledTwice).to.be.true;
        });

        it('writes the device cache and IP↔serial mapping on success', async () => {
            sinon.stub(rokuDeploy, 'getDeviceInfo').resolves({ 'serial-number': 'ABC123' } as any);

            await prober.fetchDeviceInfo('192.168.1.10', 8060);

            expect(deviceCache.get('ABC123')?.serialNumber).to.equal('ABC123');
            expect(ipToSerial.get('192.168.1.10')).to.equal('ABC123');
        });

        it('returns undefined (never rejects) when the request fails', async () => {
            sinon.stub(rokuDeploy, 'getDeviceInfo').rejects(new Error('Unreachable'));

            const result = await prober.fetchDeviceInfo('192.168.1.10', 8060);

            expect(result).to.be.undefined;
        });
    });

    describe('sequence guard', () => {
        it('only the newest-started check is current', () => {
            const first = prober.nextSequence('192.168.1.10');
            const second = prober.nextSequence('192.168.1.10');

            expect(prober.isCurrentSequence('192.168.1.10', first)).to.be.false;
            expect(prober.isCurrentSequence('192.168.1.10', second)).to.be.true;
        });

        it('tracks sequences independently per IP', () => {
            const a = prober.nextSequence('192.168.1.10');
            const b = prober.nextSequence('192.168.1.11');

            expect(prober.isCurrentSequence('192.168.1.10', a)).to.be.true;
            expect(prober.isCurrentSequence('192.168.1.11', b)).to.be.true;
        });

        it('clearSequences invalidates all in-flight checks', () => {
            const seq = prober.nextSequence('192.168.1.10');
            prober.clearSequences();
            expect(prober.isCurrentSequence('192.168.1.10', seq)).to.be.false;
        });
    });

    describe('getFreshCachedDeviceInfo (trust window)', () => {
        function seedCache(serial: string, ip: string, ageMs: number) {
            deviceCache.set(serial, {
                serialNumber: serial,
                deviceInfo: { 'serial-number': serial },
                createdAt: Date.now() - ageMs
            });
            ipToSerial.set(ip, serial);
        }

        it('returns cached info when fresh and still mapped to this IP', () => {
            seedCache('ABC123', '192.168.1.10', 60_000);

            const info = prober.getFreshCachedDeviceInfo('192.168.1.10', 'ABC123');

            expect(info?.['serial-number']).to.equal('ABC123');
        });

        it('resolves the serial from the IP mapping when none is provided', () => {
            seedCache('ABC123', '192.168.1.10', 60_000);

            const info = prober.getFreshCachedDeviceInfo('192.168.1.10', undefined);

            expect(info?.['serial-number']).to.equal('ABC123');
        });

        it('returns undefined when the cache is older than the trust window', () => {
            seedCache('ABC123', '192.168.1.10', Prober.DEVICE_FRESHNESS_MS + 1);

            expect(prober.getFreshCachedDeviceInfo('192.168.1.10', 'ABC123')).to.be.undefined;
        });

        it('returns undefined when the serial was last seen at a different IP (device moved)', () => {
            seedCache('ABC123', '192.168.1.99', 60_000);

            expect(prober.getFreshCachedDeviceInfo('192.168.1.10', 'ABC123')).to.be.undefined;
        });

        it('returns undefined when there is no cache entry at all', () => {
            expect(prober.getFreshCachedDeviceInfo('192.168.1.10', 'ABC123')).to.be.undefined;
        });
    });
});
