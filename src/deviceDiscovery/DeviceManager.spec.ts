import { expect } from 'chai';
import * as sinon from 'sinon';
import { rokuDeploy, DeviceUnreachableError, InvalidDeviceResponseCodeError } from 'roku-deploy';
import { vscode } from '../mockVscode.spec';
import type { RokuDevice } from './DeviceManager';
import { DeviceManager } from './DeviceManager';
import { RokuFinder } from './RokuFinder';
import { OrderManager } from './OrderManager';
import * as NetworkChangeMonitorModule from './NetworkChangeMonitor';
import { vscodeContextManager } from '../managers/VscodeContextManager';
import { util } from '../util';

describe('DeviceManager', () => {
    let manager: DeviceManager;
    let mockGlobalStateManager: any;
    let queueHydrationStub: sinon.SinonStub;

    function createMockDevice(overrides: Partial<RokuDevice> & { deviceInfo?: any; serialNumber?: string | null } = {}): RokuDevice {
        // Explicit null means no serial, undefined means use default
        const serialNumber = overrides.serialNumber === null ? undefined : (overrides.serialNumber ?? 'device-123');
        const ip = overrides.ip ?? '192.168.1.100';

        // Remove serialNumber and deviceInfo from overrides since we handle them separately
        const { serialNumber: _, deviceInfo: __, ...deviceOverrides } = overrides;

        // If deviceInfo was provided, cache it for this device
        if (overrides.deviceInfo !== undefined && serialNumber) {
            const deviceInfo = {
                'default-device-name': 'Roku Express',
                'device-id': serialNumber,
                'is-stick': 'false',
                'is-tv': 'false',
                ...overrides.deviceInfo,
                'serial-number': serialNumber // Serial goes in deviceInfo - after spread to not be overwritten
            };
            // Directly store in cache (setCachedDevice uses callsFake to store in map)
            mockGlobalStateManager.setCachedDevice(serialNumber, {
                serialNumber: serialNumber,
                deviceInfo: deviceInfo,
                createdAt: Date.now()
            });
        }

        // Set up IP→serial mapping when serialNumber is provided
        if (serialNumber) {
            mockGlobalStateManager.setSerialNumberForIp('test-network-hash', ip, serialNumber);
        }

        // Compute key same as setDevice
        const key = serialNumber ? `s:${serialNumber}` : `i:${ip}`;

        return {
            ip: ip,
            serialNumber: serialNumber ?? undefined,
            key: key,
            deviceState: 'online',
            deviceInfo: {},
            isConfigured: false, // Default to discovered-only
            isDiscovered: true, // Default to discovered
            ...deviceOverrides
        } as RokuDevice;
    }

    /**
     * Add a discovered device to the manager's discoveredDevices array
     */
    function addDiscoveredDevice(device: RokuDevice): void {
        manager['discoveredDevices'].push({
            ip: device.ip,
            serialNumber: device.serialNumber
        });
        // Set the device state in the separate state map
        manager['setDeviceState']({ ip: device.ip, serialNumber: device.serialNumber }, device.deviceState === 'offline' ? 'pending' : device.deviceState);
    }

    /**
     * Add a configured device to the manager's configuredDevices array
     */
    function addConfiguredDevice(device: RokuDevice): void {
        manager['configuredDevices'].push({
            host: device.ip,
            resolvedIp: device.ip,
            name: device.configuredName,
            password: device.configuredPassword,
            serialNumber: device.serialNumber,
            configuredIn: device.configuredIn
        });
        // Set the device state in the separate state map
        manager['setDeviceState']({ ip: device.ip, serialNumber: device.serialNumber }, device.deviceState);
    }

    /**
     * Add a device to the appropriate array(s) based on its isConfigured/isDiscovered flags
     */
    function addDevice(device: RokuDevice): void {
        if (device.isConfigured) {
            addConfiguredDevice(device);
        }
        if (device.isDiscovered) {
            addDiscoveredDevice(device);
        }
    }

    beforeEach(() => {
        // Map to track IP→serial mappings across the test
        const ipToSerialMap = new Map<string, string>();
        // Map to track cached devices
        const deviceCache = new Map<string, any>();

        // Mock GlobalStateManager
        mockGlobalStateManager = {
            getLastSeenDevices: sinon.stub().returns([]),
            setLastSeenDevices: sinon.stub(),
            addLastSeenDevice: sinon.stub(),
            removeLastSeenDevice: sinon.stub(),
            setLastSeenDeviceIds: sinon.stub(),
            getCachedDevice: sinon.stub().callsFake((serial) => {
                return deviceCache.get(serial);
            }),
            setCachedDevice: sinon.stub().callsFake((serial, device) => {
                deviceCache.set(serial, device);
            }),
            removeCachedDevice: sinon.stub(),
            clearExpiredDevices: sinon.stub(),
            getSerialNumberForIp: sinon.stub().callsFake((ip, networkId) => {
                return ipToSerialMap.get(`${networkId}:${ip}`);
            }),
            setSerialNumberForIp: sinon.stub().callsFake((networkId, ip, serial) => {
                ipToSerialMap.set(`${networkId}:${ip}`, serial);
            }),
            getIpForSerial: sinon.stub().callsFake((serial, networkId) => {
                // Reverse lookup in ipToSerialMap
                for (const [key, value] of ipToSerialMap.entries()) {
                    if (value === serial && key.startsWith(networkId + ':')) {
                        return key.split(':')[1];
                    }
                }
                return undefined;
            }),
            clearLastSeenDevices: sinon.stub(),
            clearDeviceCache: sinon.stub().callsFake(() => {
                deviceCache.clear();
            }),
            clearSerialNumberByIpForNetwork: sinon.stub().callsFake(() => {
                ipToSerialMap.clear();
            }),
            clearExpiredEntriesSerialNumberByIpForNetwork: sinon.stub()
        };

        // Mock vscode configuration
        sinon.stub(vscode.workspace, 'getConfiguration').returns({
            get: () => undefined,
            inspect: () => ({ workspaceValue: [], globalValue: [] }),
            deviceDiscovery: {
                enabled: false, // Disabled to prevent auto-initialization
                showInfoMessages: false
            }
        } as any);

        // Mock network hash
        sinon.stub(NetworkChangeMonitorModule, 'getNetworkHash').returns('test-network-hash');

        // Mock window state
        (vscode.window as any).state = { focused: false };

        // Neutralize read-triggered background hydration so tests with unknown/uncached fixtures
        // stay deterministic. The 'lazy hydration on read' describe restores this per-test.
        queueHydrationStub = sinon.stub(DeviceManager.prototype as any, 'queueHydration');
    });

    afterEach(() => {
        manager?.dispose();
        sinon.restore();
    });

    describe('order submission', () => {
        it('forwards broadcast-ordered from the OrderManager', () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);

            const eventSpy = sinon.spy();
            manager.on('broadcast-ordered', eventSpy);

            manager['orderManager'].submitBroadcast('network');

            expect(eventSpy.calledOnce).to.be.true;
        });
    });

    describe('lazy hydration on read', () => {
        beforeEach(() => {
            //these tests exercise the real hydration mechanism
            queueHydrationStub.restore();
        });

        async function settle() {
            await new Promise<void>(resolve => {
                setTimeout(resolve, 20);
            });
        }

        it('hydrates unknown devices with no cache when getAllDevices is called', async () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);
            const getDeviceInfoStub = sinon.stub(rokuDeploy, 'getDeviceInfo').resolves({ 'serial-number': 'hydrate-1' } as any);

            addDiscoveredDevice(createMockDevice({ ip: '192.168.1.30', serialNumber: 'hydrate-1', deviceState: 'unknown' }));

            const devices = manager.getAllDevices();
            //the read itself returns immediately with the un-hydrated snapshot
            expect(devices[0].deviceState).to.equal('unknown');

            await settle();

            expect(getDeviceInfoStub.calledOnce).to.be.true;
            expect(manager['getDeviceState']({ ip: '192.168.1.30' }).state).to.equal('online');

            //a follow-up read finds a fresh cache and does not fetch again
            manager.getAllDevices();
            await settle();
            expect(getDeviceInfoStub.calledOnce).to.be.true;
        });

        it('does not hydrate online devices with a fresh cache', async () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);
            const getDeviceInfoStub = sinon.stub(rokuDeploy, 'getDeviceInfo').resolves({ 'serial-number': 'fresh-1' } as any);

            //deviceInfo present = fresh cache entry created by the helper
            addDiscoveredDevice(createMockDevice({
                ip: '192.168.1.31',
                serialNumber: 'fresh-1',
                deviceState: 'online',
                deviceInfo: { 'default-device-name': 'Fresh Roku' }
            }));

            manager.getAllDevices();
            await settle();

            expect(getDeviceInfoStub.called).to.be.false;
        });

        it('hydrates online devices whose cache is older than 8 hours', async () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);
            const getDeviceInfoStub = sinon.stub(rokuDeploy, 'getDeviceInfo').resolves({ 'serial-number': 'old-1' } as any);

            addDiscoveredDevice(createMockDevice({ ip: '192.168.1.32', serialNumber: 'old-1', deviceState: 'online' }));
            //cache exists but is 9 hours old
            mockGlobalStateManager.setCachedDevice('old-1', {
                serialNumber: 'old-1',
                deviceInfo: { 'serial-number': 'old-1' },
                createdAt: Date.now() - (9 * 60 * 60 * 1_000)
            });

            manager.getAllDevices();
            await settle();

            expect(getDeviceInfoStub.calledOnce).to.be.true;
        });

        it('only fetches once when reads repeat while a hydration is in flight', async () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);
            let resolveFetch: (value: any) => void;
            const getDeviceInfoStub = sinon.stub(rokuDeploy, 'getDeviceInfo').returns(new Promise<any>(resolve => {
                resolveFetch = resolve;
            }) as any);

            addDiscoveredDevice(createMockDevice({ ip: '192.168.1.33', serialNumber: 'busy-1', deviceState: 'unknown' }));

            manager.getAllDevices();
            manager.getAllDevices();
            manager.getAllDevices();

            resolveFetch({ 'serial-number': 'busy-1' });
            await settle();

            expect(getDeviceInfoStub.calledOnce).to.be.true;
        });

        it('applies a per-IP retry cooldown after a failed hydration', async () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);
            const getDeviceInfoStub = sinon.stub(rokuDeploy, 'getDeviceInfo').rejects(new Error('unreachable'));

            //configured device (persists on failure) with a stale cache — the one shape that
            //still qualifies for hydration after a failed attempt
            addConfiguredDevice(createMockDevice({ ip: '192.168.1.34', serialNumber: 'flaky-1', deviceState: 'unknown', isConfigured: true, isDiscovered: false }));
            mockGlobalStateManager.setCachedDevice('flaky-1', {
                serialNumber: 'flaky-1',
                deviceInfo: { 'serial-number': 'flaky-1' },
                createdAt: Date.now() - (9 * 60 * 60 * 1_000)
            });

            manager.getAllDevices();
            await settle();
            expect(getDeviceInfoStub.calledOnce).to.be.true;

            //immediate re-read: still within the cooldown, no second attempt
            manager.getAllDevices();
            await settle();
            expect(getDeviceInfoStub.calledOnce).to.be.true;

            //age the last attempt past the hydration cooldown — the next read retries.
            //(also age the offline-state timestamp: in production the 5-minute hydration cooldown
            //always outlives resolveDevice's 5-second offline cooldown, but this test skips ahead)
            manager['hydrationLastAttempt'].set('192.168.1.34', Date.now() - (5 * 60 * 1_000) - 1);
            for (const entry of manager['configuredDevices']) {
                entry.stateLastUpdated = Date.now() - 6_000;
            }
            manager.getAllDevices();
            await settle();
            expect(getDeviceInfoStub.calledTwice).to.be.true;
        });

        it('getDevice hydrates the single returned device', async () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);
            const getDeviceInfoStub = sinon.stub(rokuDeploy, 'getDeviceInfo').resolves({ 'serial-number': 'single-1' } as any);

            addDiscoveredDevice(createMockDevice({ ip: '192.168.1.35', serialNumber: 'single-1', deviceState: 'unknown' }));

            manager.getDevice({ ip: '192.168.1.35' });
            await settle();

            expect(getDeviceInfoStub.calledOnce).to.be.true;
            expect(manager['getDeviceState']({ ip: '192.168.1.35' }).state).to.equal('online');
        });
    });

    describe('fetchDeviceInfo in-flight de-dupe', () => {
        it('shares a single HTTP request between concurrent callers for the same ip:port', async () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);

            let resolveFetch: (value: any) => void;
            const getDeviceInfoStub = sinon.stub(rokuDeploy, 'getDeviceInfo').returns(new Promise((resolve) => {
                resolveFetch = resolve;
            }) as any);

            const first = manager['fetchDeviceInfo']('192.168.1.10', 8060);
            const second = manager['fetchDeviceInfo']('192.168.1.10', 8060);

            resolveFetch({ 'serial-number': 'shared-1' });

            const [firstResult, secondResult] = await Promise.all([first, second]);
            expect(getDeviceInfoStub.calledOnce).to.be.true;
            expect(firstResult['serial-number']).to.equal('shared-1');
            expect(secondResult['serial-number']).to.equal('shared-1');
        });

        it('does not share requests across different IPs', async () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);
            const getDeviceInfoStub = sinon.stub(rokuDeploy, 'getDeviceInfo').resolves({ 'serial-number': 'x' } as any);

            await Promise.all([
                manager['fetchDeviceInfo']('192.168.1.10', 8060),
                manager['fetchDeviceInfo']('192.168.1.11', 8060)
            ]);

            expect(getDeviceInfoStub.calledTwice).to.be.true;
        });

        it('makes a fresh request after the shared one settles', async () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);
            const getDeviceInfoStub = sinon.stub(rokuDeploy, 'getDeviceInfo').resolves({ 'serial-number': 'x' } as any);

            await manager['fetchDeviceInfo']('192.168.1.10', 8060);
            await manager['fetchDeviceInfo']('192.168.1.10', 8060);

            expect(getDeviceInfoStub.calledTwice).to.be.true;
        });
    });

    describe('ssdp:byebye (finder lost event)', () => {
        it('removes the discovered entry and marks configured entries at that IP offline', () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);

            const device = createMockDevice({
                ip: '192.168.1.77',
                serialNumber: 'bye-device',
                isConfigured: true,
                isDiscovered: true,
                deviceState: 'online'
            });
            addDevice(device);

            manager['finder'].emit('lost', '192.168.1.77');

            //discovered entry is gone
            expect(manager['discoveredDevices'].find(d => d.ip === '192.168.1.77')).to.be.undefined;
            //configured entry persists but is offline, with the previous state preserved
            const configured = manager['configuredDevices'].find(c => c.host === '192.168.1.77');
            expect(configured.state).to.equal('offline');
            expect(configured.lastState).to.equal('online');
        });

        it('is a no-op for configured devices at other IPs', () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);

            addConfiguredDevice(createMockDevice({
                ip: '192.168.1.88',
                serialNumber: 'other-device',
                isConfigured: true,
                isDiscovered: false,
                deviceState: 'online'
            }));

            manager['finder'].emit('lost', '192.168.1.77');

            const configured = manager['configuredDevices'].find(c => c.host === '192.168.1.88');
            expect(configured.state).to.equal('online');
        });
    });

    describe('trigger order routing', () => {
        it('config change submits a config-changed reconcile order instead of health-checking directly', () => {
            //capture the manager's own config-change handler (emitting on the shared mock emitter
            //would also wake unrelated module singletons subscribed by other specs)
            let configHandler: (e: any) => void;
            sinon.stub(vscode.workspace, 'onDidChangeConfiguration').callsFake(((handler: any) => {
                configHandler = handler;
                return { dispose: () => { } };
            }) as any);

            manager = new DeviceManager(vscode.context, mockGlobalStateManager);
            const healthCheckStub = sinon.stub(manager as any, 'healthCheckAllDevices').resolves();

            configHandler({
                affectsConfiguration: (section: string) => section === 'brightscript.devices'
            });

            expect(manager.getPendingReconcile()).to.include({ reason: 'config-changed' });
            expect(healthCheckStub.called).to.be.false;
        });

        it('healthCheckDevice failure on a discovered device submits an unhealthy-device broadcast order', async () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);
            sinon.stub(manager as any, 'deviceDiscoveryEnabled').get(() => true);
            sinon.stub(manager as any, 'resolveDevice').returns(Promise.resolve(false) as any);
            const scanStub = sinon.stub(manager['finder'], 'scan');

            const device = createMockDevice({ ip: '192.168.1.50', serialNumber: 'sick-device' });
            addDiscoveredDevice(device);

            const isHealthy = await manager.healthCheckDevice(device);

            expect(isHealthy).to.be.false;
            expect(manager.getPendingBroadcast()).to.include({ reason: 'unhealthy-device' });
            expect(scanStub.called).to.be.false;
        });

        it('suppresses the unhealthy-device order when a scan ran within the last minute', async () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);
            sinon.stub(manager as any, 'deviceDiscoveryEnabled').get(() => true);
            sinon.stub(manager as any, 'resolveDevice').returns(Promise.resolve(false) as any);
            manager['lastScanDate'] = new Date();

            const device = createMockDevice({ ip: '192.168.1.50', serialNumber: 'sick-device' });
            addDiscoveredDevice(device);

            await manager.healthCheckDevice(device);

            expect(manager.getPendingBroadcast()).to.be.null;
        });

        it('suppresses the unhealthy-device order when discovery is disabled', async () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);
            //default test config has discovery disabled
            sinon.stub(manager as any, 'resolveDevice').returns(Promise.resolve(false) as any);

            const device = createMockDevice({ ip: '192.168.1.50', serialNumber: 'sick-device' });
            addDiscoveredDevice(device);

            await manager.healthCheckDevice(device);

            expect(manager.getPendingBroadcast()).to.be.null;
        });

        it('healthCheckAllDevices submits an unhealthy-device order instead of scanning directly', async () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);
            sinon.stub(manager as any, 'deviceDiscoveryEnabled').get(() => true);
            sinon.stub(manager as any, 'resolveDevice').returns(Promise.resolve(false) as any);
            const scanStub = sinon.stub(manager['finder'], 'scan');

            addDiscoveredDevice(createMockDevice({ ip: '192.168.1.50', serialNumber: 'sick-device' }));

            await manager['healthCheckAllDevices'](false, false);

            expect(manager.getPendingBroadcast()).to.include({ reason: 'unhealthy-device' });
            expect(scanStub.called).to.be.false;
        });
    });

    describe('stale timers', () => {
        it('activateMonitoring starts the stale order timers, deactivateMonitoring stops them', async () => {
            const clock = sinon.useFakeTimers();
            try {
                manager = new DeviceManager(vscode.context, mockGlobalStateManager);
                sinon.stub(manager['finder'], 'start').resolves();
                sinon.stub(manager['networkChangeMonitor'], 'start');
                sinon.stub(manager['networkChangeMonitor'], 'stop');

                await manager['activateMonitoring']();

                clock.tick(OrderManager.DEFAULT_RECONCILE_STALE_MS);
                expect(manager.getPendingReconcile()).to.include({ reason: 'stale' });

                clock.tick(OrderManager.DEFAULT_BROADCAST_STALE_MS);
                expect(manager.getPendingBroadcast()).to.include({ reason: 'stale' });

                //consume the pending orders, stop monitoring, and verify no new stale orders arrive
                manager.takePendingBroadcast();
                manager.takePendingReconcile();
                manager['deactivateMonitoring']();

                clock.tick(OrderManager.DEFAULT_BROADCAST_STALE_MS * 2);
                expect(manager.getPendingBroadcast()).to.be.null;
                expect(manager.getPendingReconcile()).to.be.null;
            } finally {
                clock.restore();
            }
        });
    });

    describe('startup behavior', () => {
        it('does not proactively scan on a cold cache — startup orders queue instead', async () => {
            //enable device discovery for this test
            (vscode.workspace.getConfiguration as sinon.SinonStub).returns({
                get: () => undefined,
                inspect: () => ({ workspaceValue: [], globalValue: [] }),
                deviceDiscovery: {
                    enabled: true,
                    showInfoMessages: false
                }
            } as any);
            //prevent real UDP sockets and observe scan calls
            sinon.stub(RokuFinder.prototype, 'start').resolves();
            const scanStub = sinon.stub(RokuFinder.prototype, 'scan');

            //cold cache: getLastSeenDevices already returns [] from the default mock
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);
            //let the async activateMonitoring settle
            await Promise.resolve();

            expect(scanStub.called).to.be.false;
            expect(manager.getPendingBroadcast()).to.include({ reason: 'startup' });
            expect(manager.getPendingReconcile()).to.include({ reason: 'startup' });
        });
    });

    describe('timeSinceLastScan', () => {
        it('returns Infinity when no scan has occurred', () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);
            expect(manager['timeSinceLastScan']).to.equal(Infinity);
        });

        it('returns elapsed time after a broadcast', () => {
            const clock = sinon.useFakeTimers();
            try {
                manager = new DeviceManager(vscode.context, mockGlobalStateManager);

                manager.broadcast(true);

                clock.tick(5_000);

                expect(manager['timeSinceLastScan']).to.be.greaterThanOrEqual(5_000);
            } finally {
                clock.restore();
            }
        });
    });

    describe('setDeviceState', () => {
        describe('lastState tracking', () => {
            it('records the prior state on transition for a discovered entry', () => {
                manager = new DeviceManager(vscode.context, mockGlobalStateManager);
                manager['discoveredDevices'].push({ ip: '192.168.1.100', serialNumber: 'ABC123' });

                manager['setDeviceState']({ ip: '192.168.1.100', serialNumber: 'ABC123' }, 'online');
                expect(manager['discoveredDevices'][0].state).to.equal('online');
                expect(manager['discoveredDevices'][0].lastState).to.be.undefined;

                manager['setDeviceState']({ ip: '192.168.1.100', serialNumber: 'ABC123' }, 'offline');
                expect(manager['discoveredDevices'][0].state).to.equal('offline');
                expect(manager['discoveredDevices'][0].lastState).to.equal('online');
            });

            it('records the prior state on transition for a configured entry', () => {
                manager = new DeviceManager(vscode.context, mockGlobalStateManager);
                manager['configuredDevices'].push({ host: '192.168.1.100', serialNumber: 'ABC123' } as any);

                manager['setDeviceState']({ ip: '192.168.1.100', serialNumber: 'ABC123' }, 'online');
                expect(manager['configuredDevices'][0].state).to.equal('online');
                expect(manager['configuredDevices'][0].lastState).to.be.undefined;

                manager['setDeviceState']({ ip: '192.168.1.100', serialNumber: 'ABC123' }, 'pending');
                expect(manager['configuredDevices'][0].state).to.equal('pending');
                expect(manager['configuredDevices'][0].lastState).to.equal('online');
            });
        });

        describe('no-op guard', () => {
            it('does not move lastState when the new state matches the current state', () => {
                manager = new DeviceManager(vscode.context, mockGlobalStateManager);
                manager['discoveredDevices'].push({ ip: '192.168.1.100', serialNumber: 'ABC123' });

                manager['setDeviceState']({ ip: '192.168.1.100', serialNumber: 'ABC123' }, 'online');
                manager['setDeviceState']({ ip: '192.168.1.100', serialNumber: 'ABC123' }, 'offline');
                expect(manager['discoveredDevices'][0].lastState).to.equal('online');

                // Re-applying the same 'offline' state must not clobber lastState back to 'offline'
                manager['setDeviceState']({ ip: '192.168.1.100', serialNumber: 'ABC123' }, 'offline');
                expect(manager['discoveredDevices'][0].state).to.equal('offline');
                expect(manager['discoveredDevices'][0].lastState).to.equal('online');
            });

            it('still bumps stateLastUpdated when the new state matches the current state', () => {
                const clock = sinon.useFakeTimers({ now: 1_000_000 });
                try {
                    manager = new DeviceManager(vscode.context, mockGlobalStateManager);
                    manager['discoveredDevices'].push({ ip: '192.168.1.100', serialNumber: 'ABC123' });

                    manager['setDeviceState']({ ip: '192.168.1.100', serialNumber: 'ABC123' }, 'online');
                    const firstTimestamp = manager['discoveredDevices'][0].stateLastUpdated;

                    clock.tick(5_000);

                    manager['setDeviceState']({ ip: '192.168.1.100', serialNumber: 'ABC123' }, 'online');
                    expect(manager['discoveredDevices'][0].stateLastUpdated).to.equal(firstTimestamp + 5_000);
                } finally {
                    clock.restore();
                }
            });

            it('updates lastState only on entries whose state actually changes', () => {
                manager = new DeviceManager(vscode.context, mockGlobalStateManager);

                // Two entries at the same IP — one online, one already pending
                manager['discoveredDevices'].push({ ip: '192.168.1.100', serialNumber: 'ABC123', state: 'online' });
                manager['configuredDevices'].push({ host: '192.168.1.100', state: 'pending' } as any);

                manager['setDeviceState']({ ip: '192.168.1.100' }, 'pending');

                // The discovered entry transitioned online → pending, so lastState records online
                expect(manager['discoveredDevices'][0].state).to.equal('pending');
                expect(manager['discoveredDevices'][0].lastState).to.equal('online');

                // The configured entry was already pending — lastState must stay undefined
                expect(manager['configuredDevices'][0].state).to.equal('pending');
                expect(manager['configuredDevices'][0].lastState).to.be.undefined;
            });
        });
    });

    describe('getDeviceState', () => {
        describe('serial conflict guard', () => {
            it('skips an IP-matching discovered entry that has a conflicting serial', () => {
                manager = new DeviceManager(vscode.context, mockGlobalStateManager);
                manager['discoveredDevices'].push({ ip: '192.168.1.100', serialNumber: 'ABC123' });
                manager['setDeviceState']({ ip: '192.168.1.100', serialNumber: 'ABC123' }, 'online');

                // Looking up the same IP with a different serial must NOT inherit the ABC123 online state
                expect(manager['getDeviceState']({ ip: '192.168.1.100', serialNumber: 'ZZZZZ' }).state).to.equal('unknown');
            });

            it('falls back to a serial-only match when the IP-match is filtered by serial conflict', () => {
                manager = new DeviceManager(vscode.context, mockGlobalStateManager);

                // Online device with serial ABC123 lives at 192.168.1.99
                manager['discoveredDevices'].push({ ip: '192.168.1.99', serialNumber: 'ABC123' });
                manager['setDeviceState']({ ip: '192.168.1.99', serialNumber: 'ABC123' }, 'online');

                // Another (offline) device sits at the stale IP 192.168.1.5 with a different serial
                manager['discoveredDevices'].push({ ip: '192.168.1.5', serialNumber: 'ZZZZZ' });
                manager['setDeviceState']({ ip: '192.168.1.5', serialNumber: 'ZZZZZ' }, 'offline');

                // Lookup with ABC123 + the stale IP should still resolve to the online entry via serial
                expect(manager['getDeviceState']({ ip: '192.168.1.5', serialNumber: 'ABC123' }).state).to.equal('online');
            });

            it('matches by IP alone when no serial is supplied in the lookup', () => {
                manager = new DeviceManager(vscode.context, mockGlobalStateManager);
                manager['discoveredDevices'].push({ ip: '192.168.1.100', serialNumber: 'ABC123' });
                manager['setDeviceState']({ ip: '192.168.1.100', serialNumber: 'ABC123' }, 'online');

                // No serial in the lookup → conflict guard is a no-op
                expect(manager['getDeviceState']({ ip: '192.168.1.100' }).state).to.equal('online');
            });

            it('applies the conflict guard to configured entries', () => {
                manager = new DeviceManager(vscode.context, mockGlobalStateManager);
                manager['configuredDevices'].push({ host: '192.168.1.100', serialNumber: 'ABC123' } as any);
                manager['setDeviceState']({ ip: '192.168.1.100', serialNumber: 'ABC123' }, 'online');

                expect(manager['getDeviceState']({ ip: '192.168.1.100', serialNumber: 'ZZZZZ' }).state).to.equal('unknown');
            });

            it('does not flash a configured device online when its serial is changed to a value not present at that IP', async () => {
                // Discovered: real device ABC123 is online at 192.168.1.100
                (vscode.workspace.getConfiguration as sinon.SinonStub).returns({
                    inspect: () => ({
                        workspaceValue: [],
                        globalValue: [{ host: '192.168.1.100', serialNumber: 'ZZZZZ', name: 'Mislabeled' }]
                    }),
                    deviceDiscovery: {
                        enabled: false
                    }
                });

                manager = new DeviceManager(vscode.context, mockGlobalStateManager);
                manager['discoveredDevices'].push({ ip: '192.168.1.100', serialNumber: 'ABC123' });
                manager['setDeviceState']({ ip: '192.168.1.100', serialNumber: 'ABC123' }, 'online');

                await manager['loadConfiguredDevices']();

                const configured = manager['configuredDevices'].find(d => d.serialNumber === 'ZZZZZ');
                expect(configured?.state).to.not.equal('online');
            });
        });
    });

    describe('setDiscoveredDevice', () => {
        it('preserves state on a re-discovered entry (does not wipe state back to unknown)', () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);

            manager['setDiscoveredDevice']('192.168.1.100', 'ABC123');
            manager['setDeviceState']({ ip: '192.168.1.100', serialNumber: 'ABC123' }, 'online');
            expect(manager['discoveredDevices'][0].state).to.equal('online');

            // Re-discovering the same IP/serial — without preserving fields, setDeviceState's
            // intelligent default would see no prior state and downgrade to 'unknown'
            manager['setDiscoveredDevice']('192.168.1.100', 'ABC123');

            expect(manager['discoveredDevices'].length).to.equal(1);
            expect(manager['discoveredDevices'][0].state).to.equal('online');
        });

        it('preserves lastState on a re-discovered entry', () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);

            manager['setDiscoveredDevice']('192.168.1.100', 'ABC123');
            manager['setDeviceState']({ ip: '192.168.1.100', serialNumber: 'ABC123' }, 'offline');
            manager['setDeviceState']({ ip: '192.168.1.100', serialNumber: 'ABC123' }, 'online');
            expect(manager['discoveredDevices'][0].lastState).to.equal('offline');

            manager['setDiscoveredDevice']('192.168.1.100', 'ABC123');

            // The re-discovery path keeps lastState intact rather than dropping it on the floor
            expect(manager['discoveredDevices'][0].lastState).to.equal('offline');
        });
    });

    describe('on', () => {
        it('registers handler and returns unsubscribe function', () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);

            const handler = sinon.spy();
            const unsubscribe = manager.on('broadcast-ordered', handler);

            manager['orderManager'].submitBroadcast('network');
            expect(handler.calledOnce).to.be.true;

            unsubscribe();

            // After unsubscribing, further orders should not reach the handler
            manager['orderManager'].submitBroadcast('network');
            expect(handler.calledOnce).to.be.true; // Still just one call (unsubscribed)
        });

        it('adds to disposables array if provided', () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);

            const disposables: any[] = [];
            manager.on('broadcast-ordered', () => { }, disposables);

            expect(disposables.length).to.equal(1);
            expect(disposables[0]).to.have.property('dispose');
        });
    });

    describe('getActiveDevices', () => {
        it('returns empty array when no devices', () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);
            expect(manager.getAllDevices()).to.deep.equal([]);
        });

        it('sorts devices: sticks first, then boxes, then TVs', () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);

            const tv = createMockDevice({
                serialNumber: 'tv-1',
                ip: '192.168.1.101',
                deviceInfo: { 'default-device-name': 'Roku TV', 'is-tv': 'true', 'is-stick': 'false' }
            });
            const stick = createMockDevice({
                serialNumber: 'stick-1',
                ip: '192.168.1.102',
                deviceInfo: { 'default-device-name': 'Roku Stick', 'is-tv': 'false', 'is-stick': 'true' }
            });
            const box = createMockDevice({
                serialNumber: 'box-1',
                ip: '192.168.1.103',
                deviceInfo: { 'default-device-name': 'Roku Express', 'is-tv': 'false', 'is-stick': 'false' }
            });

            // Add devices in wrong order
            addDevice(tv);
            addDevice(box);
            addDevice(stick);

            const devices = manager.getAllDevices();

            expect(devices[0].serialNumber).to.equal('stick-1');
            expect(devices[1].serialNumber).to.equal('box-1');
            expect(devices[2].serialNumber).to.equal('tv-1');
        });

        it('sorts by name within same form factor', () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);

            const boxB = createMockDevice({
                serialNumber: 'box-b',
                ip: '192.168.1.201',
                deviceInfo: { 'default-device-name': 'Roku B', 'is-tv': 'false', 'is-stick': 'false' }
            });
            const boxA = createMockDevice({
                serialNumber: 'box-a',
                ip: '192.168.1.202',
                deviceInfo: { 'default-device-name': 'Roku A', 'is-tv': 'false', 'is-stick': 'false' }
            });
            const boxC = createMockDevice({
                serialNumber: 'box-c',
                ip: '192.168.1.203',
                deviceInfo: { 'default-device-name': 'Roku C', 'is-tv': 'false', 'is-stick': 'false' }
            });

            addDevice(boxB);
            addDevice(boxC);
            addDevice(boxA);

            const devices = manager.getAllDevices();

            expect(devices[0].deviceInfo['default-device-name']).to.equal('Roku A');
            expect(devices[1].deviceInfo['default-device-name']).to.equal('Roku B');
            expect(devices[2].deviceInfo['default-device-name']).to.equal('Roku C');
        });
    });

    describe('reconcile', () => {
        it('calls healthCheckAllDevices with force flag', () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);

            const healthCheckAllDevicesSpy = sinon.stub(manager as any, 'healthCheckAllDevices').resolves();

            manager.reconcile(true);
            expect(healthCheckAllDevicesSpy.calledWith(true)).to.be.true;

            manager.reconcile(false);
            expect(healthCheckAllDevicesSpy.calledWith(false)).to.be.true;

            manager.reconcile(); // defaults to false
            expect(healthCheckAllDevicesSpy.calledWith(false)).to.be.true;
        });
    });

    describe('broadcast', () => {
        it('sets lastScanDate', () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);

            expect(manager['timeSinceLastScan']).to.equal(Infinity);

            manager.broadcast(true);

            // After a broadcast, timeSinceLastScan should be very small (just happened)
            expect(manager['timeSinceLastScan']).to.be.lessThan(100);
        });

        it('triggers discovery without health checking', () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);

            const discoverAllSpy = sinon.spy(manager as any, 'discoverAll');
            const healthCheckAllDevicesSpy = sinon.spy(manager as any, 'healthCheckAllDevices');

            manager.broadcast(true);

            expect(discoverAllSpy.calledOnce).to.be.true;
            expect(healthCheckAllDevicesSpy.called).to.be.false;
        });

        it('respects deviceDiscoveryEnabled when force=false', () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);
            sinon.stub(manager as any, 'deviceDiscoveryEnabled').get(() => false);

            const discoverAllSpy = sinon.spy(manager as any, 'discoverAll');

            const result = manager.broadcast(false);

            expect(result).to.be.false;
            expect(discoverAllSpy.called).to.be.false;
        });

        it('ignores deviceDiscoveryEnabled when force=true', () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);
            sinon.stub(manager as any, 'deviceDiscoveryEnabled').get(() => false);

            const discoverAllSpy = sinon.spy(manager as any, 'discoverAll');

            const result = manager.broadcast(true);

            expect(result).to.be.true;
            expect(discoverAllSpy.calledOnce).to.be.true;
        });

        it('emits scan-started event', () => {
            const clock = sinon.useFakeTimers();
            try {
                manager = new DeviceManager(vscode.context, mockGlobalStateManager);

                const scanStartedSpy = sinon.spy();
                manager.on('scan-started', scanStartedSpy);

                manager.broadcast(true);

                expect(scanStartedSpy.calledOnce).to.be.true;
            } finally {
                clock.restore();
            }
        });
    });

    describe('healthCheckAllDevices', () => {
        it('sets all devices to pending and checks all when force=true', async () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);

            const device1 = createMockDevice({ serialNumber: 'device-1', ip: '192.168.1.101' });
            const device2 = createMockDevice({ serialNumber: 'device-2', ip: '192.168.1.102' });
            addDevice(device1);
            addDevice(device2);

            const resolveDeviceSpy = sinon.stub(manager as any, 'resolveDevice').returns(Promise.resolve(true) as any);

            await (manager as any).healthCheckAllDevices(true);

            expect(resolveDeviceSpy.calledTwice).to.be.true;
        });

        it('calls resolveDevice for all devices (caching happens in resolveDevice)', async () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);

            const device1 = createMockDevice({ serialNumber: 'device-1', ip: '192.168.1.101' });
            const device2 = createMockDevice({ serialNumber: 'device-2', ip: '192.168.1.102' });
            addDevice(device1);
            addDevice(device2);

            const resolveDeviceSpy = sinon.stub(manager as any, 'resolveDevice').returns(Promise.resolve(true) as any);

            await (manager as any).healthCheckAllDevices(false);

            // Both devices should have resolveDevice called (caching is internal to resolveDevice)
            expect(resolveDeviceSpy.calledTwice).to.be.true;
        });

        it('does not bulk-flip devices to pending (resolveDevice owns that transition)', async () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);

            // Device is currently offline; the sweep must not overwrite that state before
            // resolveDevice reads it (offline devices must hit the network even with fresh cache)
            const device = createMockDevice({ deviceState: 'offline', isConfigured: true, isDiscovered: false });
            addDevice(device);

            let stateWhenResolveCalled: string;
            sinon.stub(manager as any, 'resolveDevice').callsFake(() => {
                stateWhenResolveCalled = manager.getAllDevices()[0].deviceState;
                return Promise.resolve(true);
            });

            await (manager as any).healthCheckAllDevices(false);

            expect(stateWhenResolveCalled).to.equal('offline');
        });

        it('resolveDevice uses cached data when recently fetched', async () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);

            const device = createMockDevice();
            addDevice(device);

            const getDeviceInfoStub = sinon.stub(rokuDeploy, 'getDeviceInfo').resolves({
                'device-id': 'device-123',
                'serial-number': 'device-123',
                'default-device-name': 'Roku Express'
            } as any);

            // Stub random delay to be instant
            sinon.stub(manager as any, 'randomDelay').resolves();

            // Pre-populate the cache by calling resolveDevice once
            await manager['resolveDevice'](device, false);
            expect(getDeviceInfoStub.calledOnce).to.be.true;

            // Now call healthCheckAllDevices - should use cached data
            await (manager as any).healthCheckAllDevices(false);

            // Still only one network call (second used cache)
            expect(getDeviceInfoStub.calledOnce).to.be.true;
        });
    });

    describe('healthCheckDevice with force=false (cooldown)', () => {
        it('skips network fetch if within cooldown period (uses cached data)', async () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);

            const device = createMockDevice();
            addDevice(device);

            const getDeviceInfoStub = sinon.stub(rokuDeploy, 'getDeviceInfo').resolves({
                'device-id': 'device-123',
                'serial-number': 'device-123',
                'default-device-name': 'Roku Express'
            } as any);

            // Stub random delay to be instant
            sinon.stub(manager as any, 'randomDelay').resolves();

            // First call - should fetch from network
            await manager.healthCheckDevice(device);
            expect(getDeviceInfoStub.calledOnce).to.be.true;

            // Second call immediately - should use cache, no new network call
            await manager.healthCheckDevice(device);
            expect(getDeviceInfoStub.calledOnce).to.be.true; // Still just one call
        });

        it('fetches again after cooldown expires', async () => {
            const clock = sinon.useFakeTimers(Date.now());
            try {
                manager = new DeviceManager(vscode.context, mockGlobalStateManager);

                const device = createMockDevice();
                addDevice(device);

                const getDeviceInfoStub = sinon.stub(rokuDeploy, 'getDeviceInfo').resolves({
                    'device-id': 'device-123',
                    'serial-number': 'device-123',
                    'default-device-name': 'Roku Express'
                } as any);

                // Stub random delay to be instant
                sinon.stub(manager as any, 'randomDelay').resolves();

                // First call
                await manager.healthCheckDevice(device);
                expect(getDeviceInfoStub.calledOnce).to.be.true;

                // Advance past cooldown (5 minutes)
                clock.tick((5 * 60 * 1_000) + 1);

                // Second call - cache expired, should fetch again
                await manager.healthCheckDevice(device);
                expect(getDeviceInfoStub.calledTwice).to.be.true;
            } finally {
                clock.restore();
            }
        });

        it('always fetches when force=true regardless of cooldown', async () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);

            const device = createMockDevice();
            addDevice(device);

            const getDeviceInfoStub = sinon.stub(rokuDeploy, 'getDeviceInfo').resolves({
                'device-id': 'device-123',
                'serial-number': 'device-123',
                'default-device-name': 'Roku Express'
            } as any);

            // Stub random delay to be instant
            sinon.stub(manager as any, 'randomDelay').resolves();

            // First call with force
            await manager.healthCheckDevice(device, true);
            expect(getDeviceInfoStub.calledOnce).to.be.true;

            // Second call immediately with force - should still fetch
            await manager.healthCheckDevice(device, true);
            expect(getDeviceInfoStub.calledTwice).to.be.true;
        });
    });

    describe('scan events', () => {
        it('emits scan-started when scan begins', () => {
            const clock = sinon.useFakeTimers();
            try {
                manager = new DeviceManager(vscode.context, mockGlobalStateManager);

                const scanStartedSpy = sinon.spy();
                manager.on('scan-started', scanStartedSpy);

                manager.broadcast(true);

                expect(scanStartedSpy.calledOnce).to.be.true;
            } finally {
                clock.restore();
            }
        });

        it('emits scan-ended after min duration and settle time', () => {
            const clock = sinon.useFakeTimers();
            try {
                manager = new DeviceManager(vscode.context, mockGlobalStateManager);

                const scanEndedSpy = sinon.spy();
                manager.on('scan-ended', scanEndedSpy);

                manager.broadcast(true);

                // Not ended yet - neither timer has fired
                expect(scanEndedSpy.called).to.be.false;

                // Advance past settle time (1.5s) but not min time (3s)
                clock.tick(1_500);
                expect(scanEndedSpy.called).to.be.false;

                // Advance to min time (3s total) - settle already fired, now min fires
                clock.tick(1_500);
                expect(scanEndedSpy.calledOnce).to.be.true;
            } finally {
                clock.restore();
            }
        });

        it('does not start new scan if already scanning', () => {
            const clock = sinon.useFakeTimers();
            try {
                manager = new DeviceManager(vscode.context, mockGlobalStateManager);

                const scanStartedSpy = sinon.spy();
                manager.on('scan-started', scanStartedSpy);

                manager.broadcast(true);
                expect(scanStartedSpy.calledOnce).to.be.true;

                // Try to start another scan while one is in progress
                manager.broadcast(true);
                expect(scanStartedSpy.calledOnce).to.be.true; // Still just one call
            } finally {
                clock.restore();
            }
        });

        it('can start new scan after previous scan ends', () => {
            const clock = sinon.useFakeTimers();
            try {
                manager = new DeviceManager(vscode.context, mockGlobalStateManager);

                const scanStartedSpy = sinon.spy();
                const scanEndedSpy = sinon.spy();
                manager.on('scan-started', scanStartedSpy);
                manager.on('scan-ended', scanEndedSpy);

                manager.broadcast(true);
                expect(scanStartedSpy.calledOnce).to.be.true;

                // Complete the scan
                clock.tick(3_000); // min + settle both complete
                expect(scanEndedSpy.calledOnce).to.be.true;

                // Now can start a new scan
                manager.broadcast(true);
                expect(scanStartedSpy.calledTwice).to.be.true;
            } finally {
                clock.restore();
            }
        });
    });

    describe('devices-changed event', () => {
        it('emits when device is added', () => {
            const clock = sinon.useFakeTimers();
            try {
                manager = new DeviceManager(vscode.context, mockGlobalStateManager);

                // Wait for initial throttle window from constructor's loadLastSeenDevices
                clock.tick(400);

                const devicesChangedSpy = sinon.spy();
                manager.on('devices-changed', devicesChangedSpy);

                // setDiscoveredDevice + emitDevicesChanged is the pattern used in real code
                manager['setDiscoveredDevice']('192.168.1.100', 'serial-123');
                manager['emitDevicesChanged']();

                // First call after throttle window emits immediately
                expect(devicesChangedSpy.calledOnce).to.be.true;
            } finally {
                clock.restore();
            }
        });

        it('emits when device is removed', () => {
            const clock = sinon.useFakeTimers();
            try {
                manager = new DeviceManager(vscode.context, mockGlobalStateManager);

                // Add a device first
                const device = createMockDevice();
                addDevice(device);

                // Wait for initial throttle window from constructor's loadLastSeenDevices
                clock.tick(400);

                const devicesChangedSpy = sinon.spy();
                manager.on('devices-changed', devicesChangedSpy);

                manager['removeDiscoveredDevice'](device.ip);
                manager['emitDevicesChanged']();

                // First call after throttle window emits immediately
                expect(devicesChangedSpy.calledOnce).to.be.true;
            } finally {
                clock.restore();
            }
        });

        it('throttles multiple rapid changes', () => {
            const clock = sinon.useFakeTimers();
            try {
                manager = new DeviceManager(vscode.context, mockGlobalStateManager);

                // Wait for initial throttle window from constructor's loadLastSeenDevices
                clock.tick(400);

                const devicesChangedSpy = sinon.spy();
                manager.on('devices-changed', devicesChangedSpy);

                // First call emits immediately
                manager['setDiscoveredDevice']('192.168.1.101', 'device-1');
                manager['emitDevicesChanged']();
                expect(devicesChangedSpy.calledOnce).to.be.true;

                // Subsequent calls within throttle window are queued
                clock.tick(10);
                manager['setDiscoveredDevice']('192.168.1.102', 'device-2');
                manager['emitDevicesChanged']();
                clock.tick(10);
                manager['setDiscoveredDevice']('192.168.1.103', 'device-3');
                manager['emitDevicesChanged']();

                // Still just one emit (subsequent calls queued)
                expect(devicesChangedSpy.calledOnce).to.be.true;

                // After throttle window, the last queued call emits
                clock.tick(200); // 400ms total from first call
                expect(devicesChangedSpy.calledTwice).to.be.true;
            } finally {
                clock.restore();
            }
        });
    });

    describe('healthCheckDevice', () => {
        it('sets device to pending during health check', async () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);
            (vscode.window as any).state = { focused: true };

            const device = createMockDevice();
            addDevice(device);

            // Stub rokuDeploy.getDeviceInfo to delay so we can check pending state
            let resolveHealth: (value: any) => void;
            const healthPromise = new Promise<any>(resolve => {
                resolveHealth = resolve;
            });
            sinon.stub(rokuDeploy, 'getDeviceInfo').returns(healthPromise);

            const checkPromise = manager.healthCheckDevice(device, true);

            // Device should be pending during check
            expect(manager.getAllDevices()[0].deviceState).to.equal('pending');

            // Resolve with mock deviceInfo
            resolveHealth({
                'device-id': 'device-123',
                'serial-number': 'device-123',
                'default-device-name': 'Roku Express'
            });
            await checkPromise;

            // Device should be online after successful check
            expect(manager.getAllDevices()[0].deviceState).to.equal('online');
        });

        it('removes device when health check fails', async () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);
            (vscode.window as any).state = { focused: true };

            const device = createMockDevice();
            addDevice(device);

            sinon.stub(rokuDeploy, 'getDeviceInfo').rejects(new Error('Device not responding'));

            const result = await manager.healthCheckDevice(device, true);

            expect(result).to.be.false;
            expect(manager.getAllDevices().length).to.equal(0);
        });

        it('preserves cache data when device goes offline (for offline display)', async () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);
            (vscode.window as any).state = { focused: true };

            // Use a configured-only device so it persists when offline (discovered-only devices are removed)
            const device = createMockDevice({
                serialNumber: 'device-123',
                isConfigured: true,
                isDiscovered: false,
                deviceInfo: { 'default-device-name': 'My Roku' }
            });
            addDevice(device);

            // First health check fails (device offline)
            sinon.stub(rokuDeploy, 'getDeviceInfo').rejects(new Error('Device not responding'));
            await manager.healthCheckDevice(device, true);

            // Cache should still exist with device info preserved for offline display
            const cached = mockGlobalStateManager.getCachedDevice('device-123');
            expect(cached).to.exist;
            expect(cached.deviceInfo['default-device-name']).to.equal('My Roku');

            // Device should be offline (configured devices persist with state)
            expect(manager['getDeviceState']({ serialNumber: 'device-123' }).state).to.equal('offline');
        });

        it('returns true when device is healthy', async () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);

            const device = createMockDevice({ serialNumber: 'device-123' });
            addDevice(device);

            sinon.stub(rokuDeploy, 'getDeviceInfo').resolves({
                'device-id': 'device-123',
                'serial-number': 'device-123',
                'default-device-name': 'Roku Express'
            });

            const result = await manager.healthCheckDevice(device, true);

            expect(result).to.be.true;
        });

        it('concurrent health checks of the same device share one request (first one wins)', async () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);
            (vscode.window as any).state = { focused: true };

            const device = createMockDevice({ serialNumber: 'device-123' });
            addDevice(device);

            // Stub broadcast/reconcile to prevent cascade of health checks
            sinon.stub(manager, 'reconcile');
            sinon.stub(manager, 'broadcast');

            let resolveFetch: (value: any) => void;
            const getDeviceInfoStub = sinon.stub(rokuDeploy, 'getDeviceInfo').returns(new Promise<any>(resolve => {
                resolveFetch = resolve;
            }) as any);

            // Start two concurrent health checks — they share the single in-flight request,
            // so a fast/slow divergence for the same device can't happen at the fetch level
            const firstResult = manager.healthCheckDevice(device, true, false);
            const secondResult = manager.healthCheckDevice(device, true, false);

            resolveFetch({
                'device-id': 'device-123',
                'serial-number': 'device-123',
                'default-device-name': 'Roku Express'
            });

            const [first, second] = await Promise.all([firstResult, secondResult]);

            expect(getDeviceInfoStub.calledOnce).to.be.true;
            expect(first).to.be.true;
            expect(second).to.be.true;
            expect(manager.getAllDevices().length).to.equal(1);
            expect(manager.getAllDevices()[0].deviceState).to.equal('online');
        });

        it('discards an earlier check\'s result when a newer check for the same IP already applied its own', async () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);
            (vscode.window as any).state = { focused: true };

            const device = createMockDevice({ serialNumber: 'device-1', ip: '192.168.1.101' });
            addDevice(device);

            // Stub broadcast/reconcile to prevent cascade of health checks
            sinon.stub(manager, 'reconcile');
            sinon.stub(manager, 'broadcast');

            // First check's network call fails fast (device unreachable) - this is NOT the race
            // window. The race window is the synthetic delay that runs *after* the fetch settles.
            const getDeviceInfoStub = sinon.stub(rokuDeploy, 'getDeviceInfo');
            getDeviceInfoStub.onCall(0).rejects(new Error('Unreachable'));
            getDeviceInfoStub.onCall(1).resolves({
                'device-id': 'device-1',
                'serial-number': 'device-1',
                'default-device-name': 'Roku Express'
            } as any);

            // Hold the first check's synthetic delay open so a second, independent check can
            // start, finish, and apply its result before the first one resumes.
            let releaseFirstDelay: () => void;
            const firstDelay = new Promise<void>(resolve => {
                releaseFirstDelay = resolve;
            });
            const randomDelayStub = sinon.stub(manager as any, 'randomDelay');
            randomDelayStub.onCall(0).returns(firstDelay);
            randomDelayStub.onCall(1).resolves();

            // Start the first (soon-to-be-stale) check.
            const firstCheck = manager['resolveDevice'](device, true);

            // Let it reach (and suspend on) its synthetic delay. By this point its own network
            // call has already failed and cleared out of the in-flight map, which is what lets
            // the second check below issue its own independent request instead of sharing this one.
            for (let i = 0; i < 20 && randomDelayStub.callCount < 1; i++) {
                await Promise.resolve();
            }
            expect(randomDelayStub.callCount).to.equal(1);

            // Start a second, newer check for the SAME device while the first is still suspended.
            const secondCheck = manager['resolveDevice'](device, true);
            await secondCheck;

            // The newer check's result (online) is applied.
            expect(manager.getAllDevices()[0].deviceState).to.equal('online');

            // Now let the first (stale) check's failure resolve. Its result must be discarded -
            // it must NOT flip the device back to offline.
            releaseFirstDelay();
            await firstCheck;

            expect(getDeviceInfoStub.callCount).to.equal(2);
            expect(manager.getAllDevices().length).to.equal(1);
            expect(manager.getAllDevices()[0].deviceState).to.equal('online');
        });

        it('tracks sequence numbers independently per device', async () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);
            (vscode.window as any).state = { focused: true };

            const device1 = createMockDevice({ serialNumber: 'device-1', ip: '192.168.1.101' });
            const device2 = createMockDevice({ serialNumber: 'device-2', ip: '192.168.1.102' });
            addDevice(device1);
            addDevice(device2);

            // Stub broadcast/reconcile to prevent cascade of health checks
            sinon.stub(manager, 'reconcile');
            sinon.stub(manager, 'broadcast');

            let resolveDevice1: (value: any) => void;
            let resolveDevice2: (value: any) => void;
            const device1Promise = new Promise<any>(resolve => {
                resolveDevice1 = resolve;
            });
            const device2Promise = new Promise<any>(resolve => {
                resolveDevice2 = resolve;
            });

            const getDeviceInfoStub = sinon.stub(rokuDeploy, 'getDeviceInfo');
            getDeviceInfoStub.onFirstCall().returns(device1Promise);
            getDeviceInfoStub.onSecondCall().returns(device2Promise);

            // Start health checks for both devices
            const result1 = manager.healthCheckDevice(device1, true);
            const result2 = manager.healthCheckDevice(device2, true);

            // Device 2 completes first (healthy)
            resolveDevice2({
                'device-id': 'device-2',
                'serial-number': 'device-2',
                'default-device-name': 'Roku Express 2'
            });
            await result2;

            // Device 1 completes second (healthy)
            resolveDevice1({
                'device-id': 'device-1',
                'serial-number': 'device-1',
                'default-device-name': 'Roku Express 1'
            });
            await result1;

            // Both devices should be online - sequence numbers are independent
            expect(manager.getAllDevices().length).to.equal(2);
            expect(manager.getAllDevices().find(d => d.ip === device1.ip)?.deviceState).to.equal('online');
            expect(manager.getAllDevices().find(d => d.ip === device2.ip)?.deviceState).to.equal('online');
        });
    });

    describe('validateDevicePassword', () => {
        let validateStub: sinon.SinonStub;

        beforeEach(() => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);
            validateStub = sinon.stub(rokuDeploy, 'validateDeveloperPassword');
        });

        it(`returns 'ok' when the device accepts the credentials`, async () => {
            validateStub.resolves(true);
            const result = await manager.validateDevicePassword('192.168.1.100', 'rokudev');
            expect(result).to.equal('ok');
            expect(validateStub.firstCall.args[0]).to.deep.equal({ host: '192.168.1.100', password: 'rokudev' });
        });

        it(`returns 'bad-password' when the device rejects the credentials`, async () => {
            validateStub.resolves(false);
            const result = await manager.validateDevicePassword('192.168.1.100', 'wrong');
            expect(result).to.equal('bad-password');
        });

        it(`returns 'unreachable' when roku-deploy throws DeviceUnreachableError`, async () => {
            validateStub.rejects(new DeviceUnreachableError('offline'));
            const result = await manager.validateDevicePassword('192.168.1.100', 'rokudev');
            expect(result).to.equal('unreachable');
        });

        it(`returns 'unreachable' on unexpected response codes`, async () => {
            validateStub.rejects(new InvalidDeviceResponseCodeError('500'));
            const result = await manager.validateDevicePassword('192.168.1.100', 'rokudev');
            expect(result).to.equal('unreachable');
        });

        it(`returns 'unreachable' on any other unexpected error`, async () => {
            validateStub.rejects(new Error('something weird'));
            const result = await manager.validateDevicePassword('192.168.1.100', 'rokudev');
            expect(result).to.equal('unreachable');
        });
    });

    describe('removeDiscoveredDevice', () => {
        it('clears lastUsedDeviceIp when removed device matches', () => {
            const clock = sinon.useFakeTimers();
            try {
                manager = new DeviceManager(vscode.context, mockGlobalStateManager);
                (vscode.window as any).state = { focused: true };

                const device = createMockDevice();
                addDevice(device);
                manager.setLastUsedDeviceIp(device.ip);

                expect(manager.getLastUsedDeviceIp()).to.equal(device.ip);

                manager['removeDiscoveredDevice'](device.ip);

                expect(manager.getLastUsedDeviceIp()).to.be.undefined;
            } finally {
                clock.restore();
            }
        });

        it('does not clear lastUsedDeviceIp when different device is removed', () => {
            const clock = sinon.useFakeTimers();
            try {
                manager = new DeviceManager(vscode.context, mockGlobalStateManager);
                (vscode.window as any).state = { focused: true };

                const device1 = createMockDevice({ serialNumber: 'device-1', ip: '192.168.1.101' });
                const device2 = createMockDevice({ serialNumber: 'device-2', ip: '192.168.1.102' });
                addDevice(device1);
                addDevice(device2);
                manager.setLastUsedDeviceIp(device1.ip);

                manager['removeDiscoveredDevice'](device2.ip);

                expect(manager.getLastUsedDeviceIp()).to.equal(device1.ip);
            } finally {
                clock.restore();
            }
        });

        it('removes device from lastSeenDevices', () => {
            const clock = sinon.useFakeTimers();
            try {
                manager = new DeviceManager(vscode.context, mockGlobalStateManager);
                (vscode.window as any).state = { focused: true };

                const device = createMockDevice();
                addDevice(device);

                manager['removeDiscoveredDevice'](device.ip);

                expect(mockGlobalStateManager.removeLastSeenDevice.calledWith('test-network-hash', device.serialNumber)).to.be.true;
            } finally {
                clock.restore();
            }
        });

        it('does not throw when removing non-existent device', () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);

            // Should not throw
            expect(() => manager['removeDiscoveredDevice']('192.168.1.100')).to.not.throw();
        });
    });

    describe('loadLastSeenDevices', () => {
        it('merges cached devices with existing devices', () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);

            // Add a configured device (configured devices are preserved)
            const existingDevice = createMockDevice({ serialNumber: 'existing', ip: '192.168.1.150', isConfigured: true });
            addDevice(existingDevice);

            // Setup cache to return a different device
            mockGlobalStateManager.getLastSeenDevices.returns(['cached-device']);
            mockGlobalStateManager.setCachedDevice('cached-device', {
                serialNumber: 'cached-device',
                deviceInfo: {
                    'default-device-name': 'Cached Roku',
                    'serial-number': 'cached-device'
                },
                createdAt: Date.now()
            });
            // Set IP→serial mapping for cached device (required for loadLastSeenDevices to work)
            mockGlobalStateManager.setSerialNumberForIp('test-network-hash', '192.168.1.200', 'cached-device');
            // Mock getIpForSerial to return the IP
            mockGlobalStateManager.getIpForSerial = sinon.stub().callsFake((serial) => {
                if (serial === 'cached-device') {
                    return '192.168.1.200';
                }
                return undefined;
            });

            manager['loadLastSeenDevices']();

            // Should have both devices (merges instead of clearing)
            expect(manager.getAllDevices().length).to.equal(2);
            expect(manager.getAllDevices().some(d => d.serialNumber === 'existing')).to.be.true;
            expect(manager.getAllDevices().some(d => d.serialNumber === 'cached-device')).to.be.true;
        });

        it('loads cached devices as online when cache is fresh (within 5 minutes)', () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);

            mockGlobalStateManager.getLastSeenDevices.returns(['device-1']);
            mockGlobalStateManager.getCachedDevice.returns({
                serialNumber: 'device-1',
                deviceInfo: {
                    'default-device-name': 'Test Roku',
                    'serial-number': 'device-1'
                },
                createdAt: Date.now() // Fresh cache
            });
            // Mock getIpForSerial to return the IP
            mockGlobalStateManager.getIpForSerial = sinon.stub().returns('192.168.1.100');

            manager['loadLastSeenDevices']();

            expect(manager['getDeviceState']({ ip: '192.168.1.100', serialNumber: 'device-1' }).state).to.equal('online');
        });

        it('loads cached devices as unknown when cache is stale (older than 5 minutes)', () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);

            mockGlobalStateManager.getLastSeenDevices.returns(['device-1']);
            mockGlobalStateManager.getCachedDevice.returns({
                serialNumber: 'device-1',
                deviceInfo: {
                    'default-device-name': 'Test Roku',
                    'serial-number': 'device-1'
                },
                createdAt: Date.now() - (6 * 60 * 1_000) // 6 minutes ago - stale
            });
            // Mock getIpForSerial to return the IP
            mockGlobalStateManager.getIpForSerial = sinon.stub().returns('192.168.1.100');

            manager['loadLastSeenDevices']();

            expect(manager.getAllDevices()[0].deviceState).to.equal('unknown');
        });

        it('removes stale entries when cache returns undefined', () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);

            mockGlobalStateManager.getLastSeenDevices.returns(['stale-device']);
            mockGlobalStateManager.getCachedDevice.returns(undefined);

            manager['loadLastSeenDevices']();

            expect(manager.getAllDevices().length).to.equal(0);
            expect(mockGlobalStateManager.removeLastSeenDevice.calledWith('test-network-hash', 'stale-device')).to.be.true;
        });
    });

    describe('getDevice', () => {
        it('returns full device with deviceInfo when found', () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);

            const device = createMockDevice({ serialNumber: 'target-device' });
            addDevice(device);

            // Mock the cache to return deviceInfo
            mockGlobalStateManager.getCachedDevice.withArgs('target-device').returns({
                serialNumber: 'target-device',
                deviceInfo: {
                    'serial-number': 'target-device',
                    'default-device-name': 'Test Device'
                },
                createdAt: Date.now()
            });

            const result = manager.getDevice({ serialNumber: 'target-device' });

            expect(result).to.exist;
            expect(result.ip).to.equal(device.ip);
            expect(result.serialNumber).to.equal('target-device');
            expect(result.deviceInfo).to.exist;
            expect(result.deviceInfo['default-device-name']).to.equal('Test Device');
        });

        it('returns undefined when not found', () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);

            const result = manager.getDevice({ serialNumber: 'nonexistent' });

            expect(result).to.be.undefined;
        });
    });

    describe('handleDeviceOnline', () => {
        const mockDeviceInfo = {
            'device-id': 'test-device-123',
            'serial-number': 'YN00AB123456',
            'default-device-name': 'Roku Express',
            'developer-enabled': 'true',
            'is-stick': 'false',
            'is-tv': 'false'
        };

        it('shows toast when showInfoMessages enabled and device is cached', async () => {
            const clock = sinon.useFakeTimers();
            (vscode.workspace.getConfiguration as sinon.SinonStub).returns({
                get: () => undefined,
                inspect: () => ({ workspaceValue: [], globalValue: [] }),
                deviceDiscovery: {
                    enabled: false,
                    showInfoMessages: true
                }
            } as any);

            manager = new DeviceManager(vscode.context, mockGlobalStateManager);
            const showTimedStub = sinon.stub(util, 'showTimedNotification').resolves();

            // Add device with cached info
            const device = createMockDevice({
                serialNumber: 'YN00AB123456',
                ip: '192.168.1.100',
                deviceInfo: mockDeviceInfo
            });
            addDevice(device);

            // Trigger device-online
            manager['handleDeviceOnline']('192.168.1.100', 'YN00AB123456');
            clock.tick(1_000);
            await Promise.resolve();

            expect(showTimedStub.calledOnce).to.be.true;
            expect(showTimedStub.firstCall.args[0]).to.include('Roku Express');
        });

        it('shows toast with IP fallback when device not cached', async () => {
            const clock = sinon.useFakeTimers();
            (vscode.workspace.getConfiguration as sinon.SinonStub).returns({
                get: () => undefined,
                deviceDiscovery: {
                    enabled: false,
                    showInfoMessages: true
                }
            } as any);

            manager = new DeviceManager(vscode.context, mockGlobalStateManager);
            const showTimedStub = sinon.stub(util, 'showTimedNotification').resolves();

            // Trigger device-online without cached device
            manager['handleDeviceOnline']('192.168.1.100', 'ABC123');
            clock.tick(1_000);
            await Promise.resolve();

            expect(showTimedStub.calledOnce).to.be.true;
            expect(showTimedStub.firstCall.args[0]).to.include('192.168.1.100');
        });

        it('does not show toast when showInfoMessages disabled', () => {
            (vscode.workspace.getConfiguration as sinon.SinonStub).returns({
                get: () => undefined,
                deviceDiscovery: {
                    enabled: false,
                    showInfoMessages: false
                }
            } as any);

            manager = new DeviceManager(vscode.context, mockGlobalStateManager);
            const showTimedStub = sinon.stub(util, 'showTimedNotification').resolves();

            manager['handleDeviceOnline']('192.168.1.100', 'ABC123');

            expect(showTimedStub.called).to.be.false;
        });

        it('shows toast for repeated device-online events', async () => {
            const clock = sinon.useFakeTimers();
            (vscode.workspace.getConfiguration as sinon.SinonStub).returns({
                get: () => undefined,
                inspect: () => ({ workspaceValue: [], globalValue: [] }),
                deviceDiscovery: {
                    enabled: false,
                    showInfoMessages: true
                }
            } as any);

            manager = new DeviceManager(vscode.context, mockGlobalStateManager);
            const showTimedStub = sinon.stub(util, 'showTimedNotification').resolves();

            // Add device with cached info
            const device = createMockDevice({
                serialNumber: 'YN00AB123456',
                ip: '192.168.1.100',
                deviceInfo: mockDeviceInfo
            });
            addDevice(device);

            // First device-online
            manager['handleDeviceOnline']('192.168.1.100', 'YN00AB123456');
            clock.tick(1_000);
            await Promise.resolve();

            expect(showTimedStub.calledOnce).to.be.true;

            // Second device-online from same device - should still show notification
            manager['handleDeviceOnline']('192.168.1.100', 'YN00AB123456');
            clock.tick(1_000);
            await Promise.resolve();

            expect(showTimedStub.calledTwice).to.be.true;
        });
    });

    describe('notifyFocusGained', () => {
        it('starts the network change monitor', () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);

            const startStub = sinon.stub(manager['networkChangeMonitor'], 'start');

            manager['notifyFocusGained']();

            expect(startStub.calledOnce).to.be.true;
        });
    });

    describe('fetchDeviceInfo', () => {
        it('always makes network call (no caching in fetchDeviceInfo)', async () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);

            const getDeviceInfoStub = sinon.stub(rokuDeploy, 'getDeviceInfo').resolves({
                'device-id': 'device-123',
                'serial-number': 'device-123',
                'default-device-name': 'Roku Express'
            } as any);

            // Call twice in rapid succession - both should hit network
            await manager['fetchDeviceInfo']('192.168.1.100', 8060);
            await manager['fetchDeviceInfo']('192.168.1.100', 8060);

            // fetchDeviceInfo always makes network calls (caching is in resolveDevice)
            expect(getDeviceInfoStub.callCount).to.equal(2);
        });
    });

    describe('resolveDevice caching', () => {
        it('only makes one network call for rapid successive requests', async () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);

            const device = createMockDevice();
            addDevice(device);

            const getDeviceInfoStub = sinon.stub(rokuDeploy, 'getDeviceInfo').resolves({
                'device-id': 'device-123',
                'serial-number': 'device-123',
                'default-device-name': 'Roku Express'
            } as any);

            // Stub random delay to be instant
            sinon.stub(manager as any, 'randomDelay').resolves();

            // Call twice in rapid succession via resolveDevice
            await manager['resolveDevice'](device, false);
            await manager['resolveDevice'](device, false);

            // Should only have made one actual network call (second uses cache)
            expect(getDeviceInfoStub.callCount).to.equal(1);
        });

        it('makes a new network call after cache TTL expires', async () => {
            const clock = sinon.useFakeTimers(Date.now());
            try {
                manager = new DeviceManager(vscode.context, mockGlobalStateManager);

                const device = createMockDevice();
                addDevice(device);

                const getDeviceInfoStub = sinon.stub(rokuDeploy, 'getDeviceInfo').resolves({
                    'device-id': 'device-123',
                    'serial-number': 'device-123',
                    'default-device-name': 'Roku Express'
                } as any);

                // Stub random delay to be instant
                sinon.stub(manager as any, 'randomDelay').resolves();

                // First call - should hit network
                await manager['resolveDevice'](device, false);
                expect(getDeviceInfoStub.callCount).to.equal(1);

                // Advance past TTL (5 minutes)
                clock.tick((5 * 60 * 1_000) + 1);

                // Second call - cache expired, should hit network again
                await manager['resolveDevice'](device, false);
                expect(getDeviceInfoStub.callCount).to.equal(2);
            } finally {
                clock.restore();
            }
        });

        it('caches different serial numbers separately', async () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);

            const device1 = createMockDevice({ ip: '192.168.1.100', serialNumber: 'device-100' });
            const device2 = createMockDevice({ ip: '192.168.1.101', serialNumber: 'device-101' });
            addDevice(device1);
            addDevice(device2);

            // Return different serials for different devices
            const getDeviceInfoStub = sinon.stub(rokuDeploy, 'getDeviceInfo');
            getDeviceInfoStub.onCall(0).resolves({
                'device-id': 'device-100',
                'serial-number': 'device-100',
                'default-device-name': 'Roku Express 1'
            } as any);
            getDeviceInfoStub.onCall(1).resolves({
                'device-id': 'device-101',
                'serial-number': 'device-101',
                'default-device-name': 'Roku Express 2'
            } as any);
            // Subsequent calls return same data for cache hits
            getDeviceInfoStub.resolves({
                'device-id': 'device-100',
                'serial-number': 'device-100',
                'default-device-name': 'Roku Express 1'
            } as any);

            // Stub random delay to be instant
            sinon.stub(manager as any, 'randomDelay').resolves();

            // Call for two different devices
            await manager['resolveDevice'](device1, false);
            await manager['resolveDevice'](device2, false);

            // Should make two network calls (different serials)
            expect(getDeviceInfoStub.callCount).to.equal(2);

            // Calling same devices again should use cache (keyed by serial)
            await manager['resolveDevice'](device1, false);
            await manager['resolveDevice'](device2, false);

            // Still only two calls (cache hit)
            expect(getDeviceInfoStub.callCount).to.equal(2);
        });

        it('refetches on network change when serial unknown (IP→serial mapping is network-specific)', async () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);

            // Device with unknown serial (only IP known) - like a newly discovered device
            const deviceIpOnly = { ip: '192.168.1.100' };

            const getDeviceInfoStub = sinon.stub(rokuDeploy, 'getDeviceInfo').resolves({
                'device-id': 'device-123',
                'serial-number': 'device-123',
                'default-device-name': 'Roku Express'
            } as any);

            // Stub random delay to be instant
            sinon.stub(manager as any, 'randomDelay').resolves();

            // First call - fetches from network (no cache, no IP→serial mapping)
            await manager['resolveDevice'](deviceIpOnly, false);
            expect(getDeviceInfoStub.callCount).to.equal(1);

            // Now we have IP→serial mapping. Second call should use cache.
            await manager['resolveDevice'](deviceIpOnly, false);
            expect(getDeviceInfoStub.callCount).to.equal(1);

            // Simulate network change
            (NetworkChangeMonitorModule.getNetworkHash as sinon.SinonStub).returns('new-network-hash');
            manager['networkChangeMonitor']['onNetworkChanged']();
            await util.sleep(10);

            // On new network, IP→serial mapping is cleared.
            // Resolving by IP alone should refetch since we can't look up the serial.
            await manager['resolveDevice'](deviceIpOnly, false);
            expect(getDeviceInfoStub.callCount).to.equal(2);
        });

        it('refetches on network change even when serial is known (IP mapping is network-specific)', async () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);

            // Device with known serial (from config or previous discovery)
            const device = createMockDevice();
            addDevice(device);

            const getDeviceInfoStub = sinon.stub(rokuDeploy, 'getDeviceInfo').resolves({
                'device-id': 'device-123',
                'serial-number': 'device-123',
                'default-device-name': 'Roku Express'
            } as any);

            // Stub random delay to be instant
            sinon.stub(manager as any, 'randomDelay').resolves();

            // First call - fetches from network
            await manager['resolveDevice'](device, false);
            expect(getDeviceInfoStub.callCount).to.equal(1);

            // Verify cache is working
            await manager['resolveDevice'](device, false);
            expect(getDeviceInfoStub.callCount).to.equal(1);

            // Simulate network change
            (NetworkChangeMonitorModule.getNetworkHash as sinon.SinonStub).returns('new-network-hash');
            manager['networkChangeMonitor']['onNetworkChanged']();
            await util.sleep(10);

            // Re-add device (network change clears discovered devices)
            addDevice(device);

            // IP→serial mapping is network-specific and gets cleared on network change.
            // Even though device info cache is keyed by serial, we validate that the
            // cached IP matches the device's current IP. After network change, this
            // validation fails so we must refetch to confirm the device is still at this IP.
            await manager['resolveDevice'](device, false);
            expect(getDeviceInfoStub.callCount).to.equal(2); // Refetches after network change
        });
    });

    describe('network change handling', () => {
        it('updates networkId when NetworkChangeMonitor triggers callback', () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);

            // Change the network hash
            (NetworkChangeMonitorModule.getNetworkHash as sinon.SinonStub).returns('new-network-hash');

            // Trigger the network change callback directly
            manager['networkChangeMonitor']['onNetworkChanged']();

            // networkId should be updated
            expect(manager['networkId']).to.equal('new-network-hash');
        });

        it('reloads devices when network changes', () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);

            // Add a discovered device to verify it gets cleared on network change
            manager['discoveredDevices'].push({
                serialNumber: 'device-123',
                ip: '192.168.1.100'
            });
            manager['setDeviceState']({ serialNumber: 'device-123', ip: '192.168.1.100' }, 'online');
            expect(manager['discoveredDevices'].length).to.equal(1);

            // Change the network hash
            (NetworkChangeMonitorModule.getNetworkHash as sinon.SinonStub).returns('new-network-hash');

            // Trigger the network change callback directly
            manager['networkChangeMonitor']['onNetworkChanged']();

            // Discovered device should be removed (loadLastSeenDevices clears discoveredDevices)
            expect(manager['discoveredDevices'].length).to.equal(0);
        });

        it('submits broadcast + reconcile orders when network changes', () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);

            const broadcastSpy = sinon.spy(manager['orderManager'], 'submitBroadcast');
            const reconcileSpy = sinon.spy(manager['orderManager'], 'submitReconcile');

            // Change the network hash
            (NetworkChangeMonitorModule.getNetworkHash as sinon.SinonStub).returns('new-network-hash');

            // Trigger the network change callback directly
            manager['networkChangeMonitor']['onNetworkChanged']();

            expect(broadcastSpy.calledWith('network')).to.be.true;
            expect(reconcileSpy.calledWith('network')).to.be.true;
        });

        it('clears discovered devices when network changes', () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);

            // Add discovered devices
            manager['discoveredDevices'].push({
                serialNumber: 'device-123',
                ip: '192.168.1.100'
            });
            manager['setDeviceState']({ serialNumber: 'device-123', ip: '192.168.1.100' }, 'online');
            manager['discoveredDevices'].push({
                serialNumber: 'device-456',
                ip: '192.168.1.101'
            });
            manager['setDeviceState']({ serialNumber: 'device-456', ip: '192.168.1.101' }, 'online');
            expect(manager['discoveredDevices'].length).to.equal(2);

            // Change the network hash
            (NetworkChangeMonitorModule.getNetworkHash as sinon.SinonStub).returns('new-network-hash');

            // Trigger the network change callback directly
            manager['networkChangeMonitor']['onNetworkChanged']();

            // Discovered devices should be cleared
            expect(manager['discoveredDevices'].length).to.equal(0);
        });

        it('preserves configured devices when network changes', () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);

            // Add a configured device
            manager['configuredDevices'].push({
                host: '192.168.1.100',
                name: 'My Roku'
            } as any);
            manager['setDeviceState']({ ip: '192.168.1.100' }, 'online');

            // Add a discovered device
            manager['discoveredDevices'].push({
                serialNumber: 'device-123',
                ip: '192.168.1.101'
            });
            manager['setDeviceState']({ serialNumber: 'device-123', ip: '192.168.1.101' }, 'online');

            expect(manager['configuredDevices'].length).to.equal(1);
            expect(manager['discoveredDevices'].length).to.equal(1);

            // Change the network hash
            (NetworkChangeMonitorModule.getNetworkHash as sinon.SinonStub).returns('new-network-hash');

            // Trigger the network change callback directly
            manager['networkChangeMonitor']['onNetworkChanged']();

            // Configured device should persist, discovered should be cleared
            expect(manager['configuredDevices'].length).to.equal(1);
            expect(manager['discoveredDevices'].length).to.equal(0);
        });

        it('records lastState on configured entries before resetting to unknown', () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);

            manager['configuredDevices'].push({ host: '192.168.1.100', serialNumber: 'ABC123' } as any);
            manager['setDeviceState']({ ip: '192.168.1.100', serialNumber: 'ABC123' }, 'online');

            (NetworkChangeMonitorModule.getNetworkHash as sinon.SinonStub).returns('new-network-hash');
            manager['networkChangeMonitor']['onNetworkChanged']();

            const entry = manager['configuredDevices'][0];
            expect(entry.state).to.equal('unknown');
            expect(entry.lastState).to.equal('online');
        });
    });

    describe('active device persistence', () => {
        it('setActiveDevice persists the serial number alongside the IP', async () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);
            manager['discoveredDevices'].push({ ip: '192.168.1.100', serialNumber: 'device-123' });

            await manager.setActiveDevice('192.168.1.100');

            expect(vscode.context.workspaceState.get('remoteHost')).to.equal('192.168.1.100');
            expect(vscode.context.workspaceState.get(DeviceManager.ACTIVE_DEVICE_STATE_KEY)).to.eql({
                serialNumber: 'device-123',
                ip: '192.168.1.100'
            });
        });

        it('setActiveDevice persists just the IP when the serial number is unknown', async () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);

            await manager.setActiveDevice('192.168.1.100');

            expect(vscode.context.workspaceState.get(DeviceManager.ACTIVE_DEVICE_STATE_KEY)).to.eql({
                serialNumber: undefined,
                ip: '192.168.1.100'
            });
        });

        it('clearActiveDevice clears the persisted entry', async () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);
            await manager.setActiveDevice('192.168.1.100');

            await manager.clearActiveDevice();

            expect(vscode.context.workspaceState.get('remoteHost')).to.equal('');
            expect(vscode.context.workspaceState.get(DeviceManager.ACTIVE_DEVICE_STATE_KEY)).to.be.undefined;
        });

        it('recovers the active device by serial number on startup', async () => {
            //active device persisted by a previous session at an old IP
            await vscode.context.workspaceState.update(DeviceManager.ACTIVE_DEVICE_STATE_KEY, { serialNumber: 'device-123', ip: '192.168.1.50' });
            await vscode.context.workspaceState.update('remoteHost', '192.168.1.50');
            //the SN↔IP store knows the device now lives at a new IP on this network
            mockGlobalStateManager.setSerialNumberForIp('test-network-hash', '192.168.1.60', 'device-123');

            manager = new DeviceManager(vscode.context, mockGlobalStateManager);
            await manager['syncActiveDevice']();

            expect(vscode.context.workspaceState.get('remoteHost')).to.equal('192.168.1.60');
            expect(vscode.context.workspaceState.get(DeviceManager.ACTIVE_DEVICE_STATE_KEY)).to.eql({
                serialNumber: 'device-123',
                ip: '192.168.1.60'
            });
            expect(vscodeContextManager.get('activeHost')).to.equal('192.168.1.60');
        });

        it('leaves remoteHost alone when something else has since pointed it elsewhere', async () => {
            await vscode.context.workspaceState.update(DeviceManager.ACTIVE_DEVICE_STATE_KEY, { serialNumber: 'device-123', ip: '192.168.1.50' });
            //e.g. a debug launch set remoteHost to a different host after the active device was chosen
            await vscode.context.workspaceState.update('remoteHost', '192.168.1.99');
            mockGlobalStateManager.setSerialNumberForIp('test-network-hash', '192.168.1.60', 'device-123');

            manager = new DeviceManager(vscode.context, mockGlobalStateManager);
            await manager['syncActiveDevice']();

            expect(vscode.context.workspaceState.get('remoteHost')).to.equal('192.168.1.99');
            expect(vscode.context.workspaceState.get(DeviceManager.ACTIVE_DEVICE_STATE_KEY)).to.eql({
                serialNumber: 'device-123',
                ip: '192.168.1.60'
            });
        });

        it('re-points the active device when a network change finds it at a new IP', async () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);
            await vscode.context.workspaceState.update(DeviceManager.ACTIVE_DEVICE_STATE_KEY, { serialNumber: 'device-123', ip: '192.168.1.50' });
            await vscode.context.workspaceState.update('remoteHost', '192.168.1.50');

            (NetworkChangeMonitorModule.getNetworkHash as sinon.SinonStub).returns('new-network-hash');
            mockGlobalStateManager.setSerialNumberForIp('new-network-hash', '10.0.0.5', 'device-123');

            const syncSpy = sinon.spy(manager as any, 'syncActiveDevice');
            manager['networkChangeMonitor']['onNetworkChanged']();
            await Promise.all(syncSpy.returnValues);

            expect(vscode.context.workspaceState.get('remoteHost')).to.equal('10.0.0.5');
            expect(vscode.context.workspaceState.get(DeviceManager.ACTIVE_DEVICE_STATE_KEY)).to.eql({
                serialNumber: 'device-123',
                ip: '10.0.0.5'
            });
        });

        it('follows the active device when discovery sees it at a new IP', async () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);
            await vscode.context.workspaceState.update(DeviceManager.ACTIVE_DEVICE_STATE_KEY, { serialNumber: 'device-123', ip: '192.168.1.50' });
            await vscode.context.workspaceState.update('remoteHost', '192.168.1.50');

            const syncSpy = sinon.spy(manager as any, 'syncActiveDevice');
            manager['setDiscoveredDevice']('192.168.1.60', 'device-123');
            await Promise.all(syncSpy.returnValues);

            expect(vscode.context.workspaceState.get('remoteHost')).to.equal('192.168.1.60');
            expect(vscode.context.workspaceState.get(DeviceManager.ACTIVE_DEVICE_STATE_KEY)).to.eql({
                serialNumber: 'device-123',
                ip: '192.168.1.60'
            });
        });

        it('does not follow discovery updates for devices that are not the active device', async () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);
            await vscode.context.workspaceState.update(DeviceManager.ACTIVE_DEVICE_STATE_KEY, { serialNumber: 'device-123', ip: '192.168.1.50' });
            await vscode.context.workspaceState.update('remoteHost', '192.168.1.50');

            const syncSpy = sinon.spy(manager as any, 'syncActiveDevice');
            manager['setDiscoveredDevice']('192.168.1.60', 'device-456');
            await Promise.all(syncSpy.returnValues);

            expect(syncSpy.called).to.be.false;
            expect(vscode.context.workspaceState.get('remoteHost')).to.equal('192.168.1.50');
        });

        it('keeps the last known IP when the serial number cannot be found in the stores', async () => {
            await vscode.context.workspaceState.update(DeviceManager.ACTIVE_DEVICE_STATE_KEY, { serialNumber: 'device-123', ip: '192.168.1.50' });
            await vscode.context.workspaceState.update('remoteHost', '192.168.1.50');

            manager = new DeviceManager(vscode.context, mockGlobalStateManager);
            await manager['syncActiveDevice']();

            expect(vscode.context.workspaceState.get('remoteHost')).to.equal('192.168.1.50');
            expect(vscodeContextManager.get('activeHost')).to.equal('192.168.1.50');
        });

        it('forgets the saved active device when the user picks a different device', async () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);
            await vscode.context.workspaceState.update(DeviceManager.ACTIVE_DEVICE_STATE_KEY, { serialNumber: 'device-123', ip: '192.168.1.50' });
            await vscodeContextManager.set('activeHost', '192.168.1.50');
            manager['discoveredDevices'].push({ ip: '192.168.1.60', serialNumber: 'device-456' });

            await manager.forgetActiveDeviceIfDifferent('192.168.1.60');

            expect(vscode.context.workspaceState.get(DeviceManager.ACTIVE_DEVICE_STATE_KEY)).to.be.undefined;
            expect(vscodeContextManager.get('activeHost')).to.equal('');
        });

        it('keeps the saved active device when the user picks it at its known IP', async () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);
            await vscode.context.workspaceState.update(DeviceManager.ACTIVE_DEVICE_STATE_KEY, { serialNumber: 'device-123', ip: '192.168.1.50' });

            await manager.forgetActiveDeviceIfDifferent('192.168.1.50');

            expect(vscode.context.workspaceState.get(DeviceManager.ACTIVE_DEVICE_STATE_KEY)).to.eql({
                serialNumber: 'device-123',
                ip: '192.168.1.50'
            });
        });

        it('keeps and re-syncs the saved active device when the user picks it at a new IP', async () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);
            await vscode.context.workspaceState.update(DeviceManager.ACTIVE_DEVICE_STATE_KEY, { serialNumber: 'device-123', ip: '192.168.1.50' });
            await vscode.context.workspaceState.update('remoteHost', '192.168.1.50');
            //the same device was discovered at a new IP, and the user picked it there
            manager['discoveredDevices'].push({ ip: '192.168.1.60', serialNumber: 'device-123' });

            await manager.forgetActiveDeviceIfDifferent('192.168.1.60');

            expect(vscode.context.workspaceState.get(DeviceManager.ACTIVE_DEVICE_STATE_KEY)).to.eql({
                serialNumber: 'device-123',
                ip: '192.168.1.60'
            });
            expect(vscode.context.workspaceState.get('remoteHost')).to.equal('192.168.1.60');
        });

        it('does nothing when no active device is saved', async () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);

            await manager.forgetActiveDeviceIfDifferent('192.168.1.60');

            expect(vscode.context.workspaceState.get(DeviceManager.ACTIVE_DEVICE_STATE_KEY)).to.be.undefined;
        });
    });

    describe('configured devices', () => {
        describe('merging configured and discovered', () => {
            it('merges configured and discovered entries by serialNumber', () => {
                manager = new DeviceManager(vscode.context, mockGlobalStateManager);

                // Add configured device
                addConfiguredDevice(createMockDevice({
                    serialNumber: 'device-123',
                    ip: '192.168.1.100',
                    isConfigured: true,
                    configuredName: 'My Roku'
                }));

                // Add discovered device with same serial (simulating discovery)
                addDiscoveredDevice(createMockDevice({
                    serialNumber: 'device-123',
                    ip: '192.168.1.100',
                    deviceState: 'online'
                }));

                // Should merge into one device with both flags
                expect(manager.getAllDevices().length).to.equal(1);
                expect(manager.getAllDevices()[0].isConfigured).to.equal(true);
                expect(manager.getAllDevices()[0].isDiscovered).to.equal(true);
                expect(manager.getAllDevices()[0].configuredName).to.equal('My Roku');
            });

            it('merges configured and discovered entries by IP when no serial match', () => {
                manager = new DeviceManager(vscode.context, mockGlobalStateManager);

                // Add configured device (no serial yet - not resolved)
                manager['configuredDevices'].push({
                    host: '192.168.1.100',
                    resolvedIp: '192.168.1.100',
                    name: 'My Roku',
                    serialNumber: undefined
                } as any);
                manager['setDeviceState']({ ip: '192.168.1.100' }, 'pending');

                // Add discovered device at same IP with serial
                addDiscoveredDevice(createMockDevice({
                    serialNumber: 'real-serial-number',
                    ip: '192.168.1.100',
                    deviceState: 'online'
                }));

                // Should merge into one device
                expect(manager.getAllDevices().length).to.equal(1);
                expect(manager.getAllDevices()[0].serialNumber).to.equal('real-serial-number');
                expect(manager.getAllDevices()[0].isConfigured).to.equal(true);
                expect(manager.getAllDevices()[0].isDiscovered).to.equal(true);
                expect(manager.getAllDevices()[0].configuredName).to.equal('My Roku');
            });

            it('preserves configuredName separately from deviceInfo', () => {
                manager = new DeviceManager(vscode.context, mockGlobalStateManager);

                // Set up cache with deviceInfo
                mockGlobalStateManager.getCachedDevice.withArgs('device-123').returns({
                    serialNumber: 'device-123',
                    deviceInfo: { 'user-device-name': 'Discovered Name' },
                    createdAt: Date.now()
                });

                // Add configured device with configuredName
                addConfiguredDevice(createMockDevice({
                    serialNumber: 'device-123',
                    ip: '192.168.1.100',
                    isConfigured: true,
                    configuredName: 'My Custom Name'
                }));

                // configuredName should be separate from cached deviceInfo
                const device = manager.getAllDevices()[0];
                expect(device.deviceInfo['user-device-name']).to.equal('Discovered Name');
                expect(device.configuredName).to.equal('My Custom Name');
            });
        });

        describe('healthCheckDevice with failed network calls', () => {
            it('marks configured device as offline when health check fails and cache exists', async () => {
                manager = new DeviceManager(vscode.context, mockGlobalStateManager);
                sinon.stub(manager as any, 'randomDelay').resolves();
                sinon.stub(manager as any, 'broadcast');
                sinon.stub(manager as any, 'reconcile');

                const device = createMockDevice({
                    serialNumber: 'device-123',
                    isConfigured: true
                });
                addDevice(device);

                // Simulate cache exists
                mockGlobalStateManager.getCachedDevice.returns({
                    serialNumber: 'device-123',
                    deviceInfo: { 'serial-number': 'device-123' },
                    createdAt: Date.now()
                });

                // Stub to simulate network failure
                sinon.stub(rokuDeploy, 'getDeviceInfo').rejects(new Error('Device not responding'));

                const result = await manager.healthCheckDevice(device, true);

                expect(result).to.be.false;
                expect(manager.getAllDevices().length).to.equal(1);
                expect(manager.getAllDevices()[0].deviceState).to.equal('offline');
            });

            it('marks configured device as offline when health check fails and no cache exists', async () => {
                manager = new DeviceManager(vscode.context, mockGlobalStateManager);
                sinon.stub(manager as any, 'randomDelay').resolves();
                sinon.stub(manager as any, 'broadcast');
                sinon.stub(manager as any, 'reconcile');

                const device = createMockDevice({
                    serialNumber: 'device-123',
                    isConfigured: true
                });
                addDevice(device);

                // Simulate no cache - view layer uses hasDeviceCache() to show warning icon
                mockGlobalStateManager.getCachedDevice.returns(undefined);

                // Stub to simulate network failure
                sinon.stub(rokuDeploy, 'getDeviceInfo').rejects(new Error('Device not responding'));

                const result = await manager.healthCheckDevice(device, true);

                expect(result).to.be.false;
                expect(manager.getAllDevices().length).to.equal(1);
                // State is always 'offline' - icon logic uses cache check to distinguish
                expect(manager.getAllDevices()[0].deviceState).to.equal('offline');
                // hasDeviceCache() would return false, triggering warning icon in view
                expect(manager.hasDeviceCache('device-123')).to.equal(false);
            });

            it('removes discovered-only device when health check fails', async () => {
                manager = new DeviceManager(vscode.context, mockGlobalStateManager);
                sinon.stub(manager as any, 'randomDelay').resolves();
                sinon.stub(manager as any, 'broadcast');
                sinon.stub(manager as any, 'reconcile');

                const device = createMockDevice({
                    serialNumber: 'device-123',
                    isConfigured: false
                });
                addDevice(device);

                // Stub to simulate network failure
                sinon.stub(rokuDeploy, 'getDeviceInfo').rejects(new Error('Device not responding'));

                const result = await manager.healthCheckDevice(device, true);

                expect(result).to.be.false;
                expect(manager.getAllDevices().length).to.equal(0);
            });
        });

        describe('isDiscovered flag', () => {
            it('sets isDiscovered true when device comes from discovery', () => {
                manager = new DeviceManager(vscode.context, mockGlobalStateManager);

                // Simulate SSDP discovery - just adds to discoveredDevices
                manager['setDiscoveredDevice']('192.168.1.100', 'ABC123');

                const device = manager.getAllDevices().find(d => d.ip === '192.168.1.100');
                expect(device?.isDiscovered).to.be.true;
            });

            it('sets isDiscovered false when health check fails on configured device', async () => {
                manager = new DeviceManager(vscode.context, mockGlobalStateManager);
                sinon.stub(manager as any, 'randomDelay').resolves();
                sinon.stub(manager as any, 'broadcast');
                sinon.stub(manager as any, 'reconcile');

                const device = createMockDevice({
                    ip: '192.168.1.100',
                    serialNumber: 'ABC123',
                    isConfigured: true,
                    isDiscovered: true
                });
                addDevice(device);

                sinon.stub(rokuDeploy, 'getDeviceInfo').rejects(new Error('Offline'));

                await manager.healthCheckDevice(device, true);

                // Device kept (configured) but not discovered
                expect(manager.getAllDevices().length).to.equal(1);
                expect(manager.getAllDevices()[0].isDiscovered).to.be.false;
                expect(manager.getAllDevices()[0].deviceState).to.equal('offline');
            });

            it('removes discovered-only device when health check fails', async () => {
                manager = new DeviceManager(vscode.context, mockGlobalStateManager);
                sinon.stub(manager as any, 'randomDelay').resolves();
                sinon.stub(manager as any, 'broadcast');
                sinon.stub(manager as any, 'reconcile');

                const device = createMockDevice({
                    ip: '192.168.1.100',
                    serialNumber: 'ABC123',
                    isConfigured: false, // Not configured
                    isDiscovered: true // Only discovered
                });
                addDevice(device);

                sinon.stub(rokuDeploy, 'getDeviceInfo').rejects(new Error('Offline'));

                await manager.healthCheckDevice(device, true);

                // Device removed (not configured, not discovered)
                expect(manager.getAllDevices().length).to.equal(0);
            });
        });

        describe('getAllDevices sorting', () => {
            it('sorts by form factor, then name, then serial number', () => {
                manager = new DeviceManager(vscode.context, mockGlobalStateManager);

                // Add TV (priority 2) with Z name
                addDiscoveredDevice(createMockDevice({
                    serialNumber: 'tv-1',
                    ip: '192.168.1.101',
                    deviceInfo: {
                        'default-device-name': 'ZZZ TV',
                        'is-tv': 'true',
                        'is-stick': 'false'
                    }
                }));

                // Add stick (priority 0) with A name
                addDiscoveredDevice(createMockDevice({
                    serialNumber: 'stick-1',
                    ip: '192.168.1.102',
                    deviceInfo: {
                        'default-device-name': 'AAA Stick',
                        'is-tv': 'false',
                        'is-stick': 'true'
                    }
                }));

                const result = manager.getAllDevices();

                // Stick first (lower form factor priority), then TV
                expect(result[0].serialNumber).to.equal('stick-1');
                expect(result[1].serialNumber).to.equal('tv-1');
            });
        });

        describe('loadConfiguredDevices', () => {
            it('converts removed configured device to discovered-only when it was resolved', async () => {
                // Configure the existing stub to return empty config
                (vscode.workspace.getConfiguration as sinon.SinonStub).returns({
                    inspect: () => ({
                        workspaceValue: [],
                        globalValue: []
                    }),
                    deviceDiscovery: {
                        enabled: false
                    }
                });

                manager = new DeviceManager(vscode.context, mockGlobalStateManager);

                // Add configured device with real device info (was resolved from network)
                addDevice(createMockDevice({
                    serialNumber: 'real-serial-123',
                    ip: '192.168.1.100',
                    isConfigured: true,
                    isDiscovered: true, // NEW: Was discovered
                    configuredName: 'My Roku',
                    deviceInfo: {
                        'device-id': 'device-123', // Real devices have device-id
                        'serial-number': 'real-serial-123',
                        'default-device-name': 'Roku Express'
                    }
                }));

                await manager['loadConfiguredDevices']();

                // Device should be kept as discovered-only
                expect(manager.getAllDevices().length).to.equal(1);
                const serial = manager.getAllDevices()[0].serialNumber;
                expect(serial).to.equal('real-serial-123');
                expect(manager.getAllDevices()[0].isConfigured).to.be.false;
                expect(manager.getAllDevices()[0].isDiscovered).to.be.true; // NEW
                expect(manager.getAllDevices()[0].configuredName).to.be.undefined;
                expect(manager.getAllDevices()[0].configuredPassword).to.be.undefined;
            });

            it('removes unresolved configured device when removed from config', async () => {
                // Configure the existing stub to return empty config
                (vscode.workspace.getConfiguration as sinon.SinonStub).returns({
                    inspect: () => ({
                        workspaceValue: [],
                        globalValue: []
                    }),
                    deviceDiscovery: {
                        enabled: false
                    }
                });

                manager = new DeviceManager(vscode.context, mockGlobalStateManager);

                // Add configured device that was never resolved (no serial)
                addConfiguredDevice(createMockDevice({
                    serialNumber: null, // CHANGED: null instead of IP
                    ip: '192.168.1.100',
                    isConfigured: true,
                    isDiscovered: false, // NEW: Not discovered
                    configuredName: 'My Roku',
                    deviceInfo: {
                        'serial-number': undefined
                    }
                }));

                await manager['loadConfiguredDevices']();

                // Device should be completely removed
                expect(manager.getAllDevices().length).to.equal(0);
            });

            it('shows separate entries when same IP has different serials in config', async () => {
                // Two config entries pointing to same IP with different serials
                // Since serial is primary key, these are treated as different devices
                (vscode.workspace.getConfiguration as sinon.SinonStub).returns({
                    inspect: () => ({
                        workspaceValue: [],
                        globalValue: [
                            { host: '192.168.1.100', serialNumber: 'ABC', name: 'First Entry' },
                            { host: '192.168.1.100', serialNumber: 'XYZ', name: 'Second Entry' }
                        ]
                    }),
                    deviceDiscovery: {
                        enabled: false
                    }
                });

                manager = new DeviceManager(vscode.context, mockGlobalStateManager);

                await manager['loadConfiguredDevices']();

                // Should have two devices (different serials = different devices, even at same IP)
                const devices = manager.getAllDevices();
                expect(devices.length).to.equal(2);

                const firstDevice = devices.find(d => d.serialNumber === 'ABC');
                const secondDevice = devices.find(d => d.serialNumber === 'XYZ');

                expect(firstDevice).to.exist;
                expect(firstDevice.ip).to.equal('192.168.1.100');
                expect(firstDevice.configuredName).to.equal('First Entry');
                expect(firstDevice.isConfigured).to.equal(true);

                expect(secondDevice).to.exist;
                expect(secondDevice.ip).to.equal('192.168.1.100');
                expect(secondDevice.configuredName).to.equal('Second Entry');
                expect(secondDevice.isConfigured).to.equal(true);
            });

            it('marks other configured device offline when health check finds different serial at same IP', async () => {
                // Two config entries pointing to same IP with different serials
                (vscode.workspace.getConfiguration as sinon.SinonStub).returns({
                    inspect: () => ({
                        workspaceValue: [],
                        globalValue: [
                            { host: '192.168.1.100', serialNumber: 'ABC', name: 'First Entry' },
                            { host: '192.168.1.100', serialNumber: 'XYZ', name: 'Second Entry' }
                        ]
                    }),
                    deviceDiscovery: {
                        enabled: false
                    }
                });

                manager = new DeviceManager(vscode.context, mockGlobalStateManager);
                sinon.stub(manager as any, 'randomDelay').resolves();

                await manager['loadConfiguredDevices']();

                // Health check finds ABC at the IP
                sinon.stub(rokuDeploy, 'getDeviceInfo').resolves({
                    'serial-number': 'ABC',
                    'serialNumber': 'ABC',
                    'device-id': 'ABC',
                    'default-device-name': 'Roku Express'
                } as any);

                await manager['resolveDevice']({ ip: '192.168.1.100' });

                const devices = manager.getAllDevices();
                expect(devices.length).to.equal(2);

                // ABC should be online (it's the device at the IP)
                const abcDevice = devices.find(d => d.serialNumber === 'ABC');
                expect(abcDevice).to.exist;
                expect(abcDevice.deviceState).to.equal('online');

                // XYZ should be offline (different device is at its configured IP)
                const xyzDevice = devices.find(d => d.serialNumber === 'XYZ');
                expect(xyzDevice).to.exist;
                expect(xyzDevice.deviceState).to.equal('offline');
            });

            it('clears configuredName when name is removed from config', async () => {
                // Initial config with a name
                const configStub = vscode.workspace.getConfiguration as sinon.SinonStub;
                configStub.returns({
                    inspect: () => ({
                        workspaceValue: [],
                        globalValue: [
                            { host: '192.168.1.100', name: 'My Roku' }
                        ]
                    }),
                    deviceDiscovery: {
                        enabled: false
                    }
                });

                manager = new DeviceManager(vscode.context, mockGlobalStateManager);
                await manager['loadConfiguredDevices']();

                expect(manager.getAllDevices().length).to.equal(1);
                expect(manager.getAllDevices()[0].configuredName).to.equal('My Roku');

                // Simulate config change: name is removed
                configStub.returns({
                    inspect: () => ({
                        workspaceValue: [],
                        globalValue: [
                            { host: '192.168.1.100' } // no name
                        ]
                    }),
                    deviceDiscovery: {
                        enabled: false
                    }
                });

                await manager['loadConfiguredDevices']();

                // Name should be cleared
                expect(manager.getAllDevices().length).to.equal(1);
                expect(manager.getAllDevices()[0].configuredName).to.equal(undefined);
            });
        });

        describe('loadLastSeenDevices', () => {
            it('preserves configured devices and removes discovered-only', () => {
                manager = new DeviceManager(vscode.context, mockGlobalStateManager);

                // Add configured device
                addConfiguredDevice(createMockDevice({
                    serialNumber: 'configured-1',
                    ip: '192.168.1.101',
                    isConfigured: true
                }));

                // Add discovered device
                addDiscoveredDevice(createMockDevice({
                    serialNumber: 'discovered-1',
                    ip: '192.168.1.102'
                }));

                manager['loadLastSeenDevices']();

                // Only configured device should remain (state unchanged - reset happens in network change handler)
                expect(manager.getAllDevices().length).to.equal(1);
                const serial = manager.getAllDevices()[0].serialNumber;
                expect(serial).to.equal('configured-1');
                expect(manager.getAllDevices()[0].deviceState).to.equal('online');
            });
        });

        describe('resolveDevice', () => {
            it('preserves isConfigured after successful resolution', async () => {
                manager = new DeviceManager(vscode.context, mockGlobalStateManager);

                const device = createMockDevice({
                    serialNumber: 'device-123',
                    ip: '192.168.1.100',
                    isConfigured: true,
                    configuredName: 'My Roku',
                    deviceState: 'pending'
                });
                addDevice(device);

                sinon.stub(rokuDeploy, 'getDeviceInfo').resolves({
                    'device-id': 'device-123',
                    'default-device-name': 'Roku Express'
                } as any);

                await manager['resolveDevice'](device);

                expect(manager.getAllDevices()[0].deviceState).to.equal('online');
                expect(manager.getAllDevices()[0].isConfigured).to.equal(true);
                expect(manager.getAllDevices()[0].configuredName).to.equal('My Roku');
            });
        });
        describe('clearAllCache', () => {
            it('records lastState on configured entries before resetting to unknown', () => {
                manager = new DeviceManager(vscode.context, mockGlobalStateManager);

                // Stub the async health check so it doesn't immediately flip state back to 'pending'
                sinon.stub(manager as any, 'healthCheckAllDevices').resolves();

                manager['configuredDevices'].push({ host: '192.168.1.100', serialNumber: 'ABC123' } as any);
                manager['setDeviceState']({ ip: '192.168.1.100', serialNumber: 'ABC123' }, 'online');

                manager.clearAllCache();

                const entry = manager['configuredDevices'][0];
                expect(entry.state).to.equal('unknown');
                expect(entry.lastState).to.equal('online');
            });

            describe('timestamp clearing', () => {
                it('resets lastScanDate to null', () => {
                    manager = new DeviceManager(vscode.context, mockGlobalStateManager);

                    // Simulate a scan having occurred
                    manager['lastScanDate'] = new Date();
                    expect(manager['lastScanDate']).to.not.be.null;

                    manager.clearAllCache();

                    expect(manager['lastScanDate']).to.be.null;
                });

                it('makes timeSinceLastScan return Infinity after clear', () => {
                    manager = new DeviceManager(vscode.context, mockGlobalStateManager);

                    // Simulate a scan having occurred
                    manager['lastScanDate'] = new Date();
                    expect(manager['timeSinceLastScan']).to.be.lessThan(1000);

                    manager.clearAllCache();

                    expect(manager['timeSinceLastScan']).to.equal(Infinity);
                });

                it('clears globalStateManager device cache (enables fresh fetch)', async () => {
                    manager = new DeviceManager(vscode.context, mockGlobalStateManager);

                    const device = createMockDevice();
                    addDevice(device);

                    const getDeviceInfoStub = sinon.stub(rokuDeploy, 'getDeviceInfo').resolves({
                        'device-id': 'device-123',
                        'serial-number': 'device-123',
                        'default-device-name': 'Roku Express'
                    } as any);

                    // Stub random delay to be instant
                    sinon.stub(manager as any, 'randomDelay').resolves();

                    // Perform health check to populate cache
                    await manager.healthCheckDevice(device);
                    expect(getDeviceInfoStub.calledOnce).to.be.true;

                    // Second call should use cache (no new network call)
                    await manager.healthCheckDevice(device);
                    expect(getDeviceInfoStub.calledOnce).to.be.true; // Still just one call

                    // Clear cache (clears globalStateManager.deviceCache and IP→serial mappings)
                    manager.clearAllCache();

                    // Re-add the device (clearAllCache removes discovered devices)
                    addDevice(device);

                    // Now health check should hit network again (cache was cleared)
                    await manager.healthCheckDevice(device);
                    expect(getDeviceInfoStub.calledTwice).to.be.true;
                });

                it('clears resolveDeviceSequence map', () => {
                    manager = new DeviceManager(vscode.context, mockGlobalStateManager);

                    const device = createMockDevice();

                    // Populate sequence map
                    manager['resolveDeviceSequence'].set(device.ip, 5);
                    expect(manager['resolveDeviceSequence'].get(device.ip)).to.equal(5);

                    manager.clearAllCache();

                    expect(manager['resolveDeviceSequence'].has(device.ip)).to.be.false;
                });
            });

            describe('scan state handling', () => {
                it('calls finder.stop() to handle any in-progress scan', () => {
                    manager = new DeviceManager(vscode.context, mockGlobalStateManager);

                    const finderStopSpy = sinon.spy(manager['finder'], 'stop');

                    manager.clearAllCache();

                    expect(finderStopSpy.calledOnce).to.be.true;
                });
            });

            describe('functionality verification', () => {
                it('allows immediate rescan after clear', () => {
                    const clock = sinon.useFakeTimers();
                    try {
                        manager = new DeviceManager(vscode.context, mockGlobalStateManager);

                        // Simulate recent scan
                        manager['lastScanDate'] = new Date();
                        sinon.stub(manager['finder'], 'scan');

                        // discoverAll should return false (scan not needed)
                        let scanStarted = manager['discoverAll'](false);
                        expect(scanStarted).to.be.false;

                        // Clear cache
                        manager.clearAllCache();

                        // Now scan should be allowed (lastScanDate is null, timeSinceLastScan is Infinity)
                        scanStarted = manager['discoverAll'](false);
                        expect(scanStarted).to.be.true;
                    } finally {
                        clock.restore();
                    }
                });

                it('health check runs immediately after clear', async () => {
                    manager = new DeviceManager(vscode.context, mockGlobalStateManager);

                    const device = createMockDevice();
                    const resolveDeviceSpy = sinon.stub(manager as any, 'resolveDevice').returns(Promise.resolve(true));

                    // First health check
                    await manager.healthCheckDevice(device);
                    expect(resolveDeviceSpy.calledOnce).to.be.true;

                    // Clear cache (should clear cooldown)
                    manager.clearAllCache();

                    // Health check should run immediately (no cooldown)
                    await manager.healthCheckDevice(device);
                    expect(resolveDeviceSpy.calledTwice).to.be.true;
                });

                it('ignores concurrent health check results after clear', async () => {
                    manager = new DeviceManager(vscode.context, mockGlobalStateManager);

                    const device = createMockDevice();

                    // Start a health check but don't let it complete
                    let resolvePromise: ((value: boolean) => void) | undefined;
                    const healthCheckPromise = new Promise<boolean>((resolve) => {
                        resolvePromise = resolve;
                    });
                    sinon.stub(manager as any, 'resolveDevice').returns(healthCheckPromise);

                    const healthCheckCall = manager.healthCheckDevice(device);

                    // Clear cache while health check is in flight
                    manager.clearAllCache();

                    // Sequence should be cleared
                    expect(manager['resolveDeviceSequence'].has(device.ip)).to.be.false;

                    // Complete the health check
                    if (resolvePromise) {
                        resolvePromise(true);
                    }
                    await healthCheckCall;

                    // Result should be ignored (sequence mismatch)
                    // The device state should not be updated by the stale health check
                });

                it('handles multiple rapid clears safely', () => {
                    manager = new DeviceManager(vscode.context, mockGlobalStateManager);

                    manager['lastScanDate'] = new Date();

                    // Multiple rapid clears
                    expect(() => {
                        manager.clearAllCache();
                        manager.clearAllCache();
                        manager.clearAllCache();
                    }).to.not.throw();

                    expect(manager['lastScanDate']).to.be.null;
                });
            });

            describe('integration with globalStateManager', () => {
                it('calls globalStateManager.clearLastSeenDevices', () => {
                    manager = new DeviceManager(vscode.context, mockGlobalStateManager);

                    mockGlobalStateManager.clearLastSeenDevices = sinon.stub();

                    manager.clearAllCache();

                    expect(mockGlobalStateManager.clearLastSeenDevices.calledOnce).to.be.true;
                });

                it('calls globalStateManager.clearDeviceCache', () => {
                    manager = new DeviceManager(vscode.context, mockGlobalStateManager);

                    mockGlobalStateManager.clearDeviceCache = sinon.stub();

                    manager.clearAllCache();

                    expect(mockGlobalStateManager.clearDeviceCache.calledOnce).to.be.true;
                });
            });
        });
    });

    describe('device key encoding/decoding', () => {
        describe('key encoding', () => {
            it('uses serial-based key (s:...) when serial exists', () => {
                manager = new DeviceManager(vscode.context, mockGlobalStateManager);

                const device = createMockDevice({
                    serialNumber: 'ABC123',
                    ip: '192.168.1.100',
                    deviceInfo: { 'serial-number': 'ABC123' }
                });
                addDevice(device);

                const result = manager.getDevice({ ip: '192.168.1.100' });

                expect(result?.key).to.equal('s:ABC123');
            });

            it('uses IP-based key (i:...) when no serial exists', () => {
                manager = new DeviceManager(vscode.context, mockGlobalStateManager);

                // Create device without serial - manually add to discovered array
                manager['discoveredDevices'].push({
                    ip: '192.168.1.100',
                    serialNumber: undefined
                });
                manager['setDeviceState']({ ip: '192.168.1.100' }, 'online');

                const result = manager.getDevice({ ip: '192.168.1.100' });

                expect(result?.key).to.equal('i:192.168.1.100');
            });

            it('includes key in getAllDevices() results', () => {
                manager = new DeviceManager(vscode.context, mockGlobalStateManager);

                const device = createMockDevice({
                    serialNumber: 'DEF456',
                    ip: '192.168.1.101',
                    deviceInfo: { 'serial-number': 'DEF456' }
                });
                addDevice(device);

                const devices = manager.getAllDevices();

                expect(devices[0].key).to.equal('s:DEF456');
            });
        });

        describe('key decoding/lookup', () => {
            it('getDevice("s:ABC123") finds device by serial', () => {
                manager = new DeviceManager(vscode.context, mockGlobalStateManager);

                const device = createMockDevice({
                    serialNumber: 'ABC123',
                    ip: '192.168.1.100',
                    deviceInfo: { 'serial-number': 'ABC123' }
                });
                addDevice(device);

                const result = manager.getDevice('s:ABC123');

                expect(result).to.exist;
                expect(result?.ip).to.equal('192.168.1.100');
                expect(result?.serialNumber).to.equal('ABC123');
            });

            it('getDevice("i:192.168.1.100") finds device by IP', () => {
                manager = new DeviceManager(vscode.context, mockGlobalStateManager);

                const device = createMockDevice({
                    serialNumber: 'XYZ789',
                    ip: '192.168.1.100',
                    deviceInfo: { 'serial-number': 'XYZ789' }
                });
                addDevice(device);

                const result = manager.getDevice('i:192.168.1.100');

                expect(result).to.exist;
                expect(result?.ip).to.equal('192.168.1.100');
                expect(result?.serialNumber).to.equal('XYZ789');
            });

            it('IP-based lookup still works after device gains serial (stale key)', () => {
                manager = new DeviceManager(vscode.context, mockGlobalStateManager);

                // Device initially added by IP, then gains serial
                const device = createMockDevice({
                    serialNumber: 'NEWSERIAL',
                    ip: '192.168.1.100',
                    deviceInfo: { 'serial-number': 'NEWSERIAL' }
                });
                addDevice(device);

                // Old UI component might still have "i:192.168.1.100" key
                const result = manager.getDevice('i:192.168.1.100');

                expect(result).to.exist;
                expect(result?.ip).to.equal('192.168.1.100');
                // Device now has serial, so key should be serial-based
                expect(result?.key).to.equal('s:NEWSERIAL');
            });
        });

        describe('edge cases', () => {
            it('returns undefined for unprefixed string (rejects invalid format)', () => {
                manager = new DeviceManager(vscode.context, mockGlobalStateManager);

                const device = createMockDevice({
                    serialNumber: 'ABC123',
                    ip: '192.168.1.100'
                });
                addDevice(device);

                // Unprefixed strings should be rejected
                const result = manager.getDevice('192.168.1.100');

                expect(result).to.be.undefined;
            });

            it('returns undefined for empty key after prefix', () => {
                manager = new DeviceManager(vscode.context, mockGlobalStateManager);

                const device = createMockDevice({
                    serialNumber: 'ABC123',
                    ip: '192.168.1.100'
                });
                addDevice(device);

                expect(manager.getDevice('s:')).to.be.undefined;
                expect(manager.getDevice('i:')).to.be.undefined;
            });

            it('returns undefined for empty string', () => {
                manager = new DeviceManager(vscode.context, mockGlobalStateManager);

                const result = manager.getDevice('');

                expect(result).to.be.undefined;
            });

            it('returns undefined for unknown serial key', () => {
                manager = new DeviceManager(vscode.context, mockGlobalStateManager);

                const device = createMockDevice({
                    serialNumber: 'ABC123',
                    ip: '192.168.1.100'
                });
                addDevice(device);

                const result = manager.getDevice('s:UNKNOWN');

                expect(result).to.be.undefined;
            });

            it('returns undefined for unknown IP key', () => {
                manager = new DeviceManager(vscode.context, mockGlobalStateManager);

                const device = createMockDevice({
                    serialNumber: 'ABC123',
                    ip: '192.168.1.100'
                });
                addDevice(device);

                const result = manager.getDevice('i:192.168.1.999');

                expect(result).to.be.undefined;
            });
        });

        describe('key transition', () => {
            it('device key changes from IP-based to serial-based when re-set with serial', () => {
                manager = new DeviceManager(vscode.context, mockGlobalStateManager);

                // Start with device that has no serial
                manager['discoveredDevices'].push({
                    ip: '192.168.1.100',
                    serialNumber: undefined
                });
                manager['setDeviceState']({ ip: '192.168.1.100' }, 'online');

                // Initially should have IP-based key
                let result = manager.getDevice('i:192.168.1.100');
                expect(result?.key).to.equal('i:192.168.1.100');

                // Simulate device resolution - update discovered entry with serial
                // (this is what resolveDevice does when it successfully fetches deviceInfo)
                manager['setDiscoveredDevice']('192.168.1.100', 'NEWSERIAL');

                // Device now has serial-based key
                result = manager.getDevice({ serialNumber: 'NEWSERIAL' });
                expect(result?.key).to.equal('s:NEWSERIAL');
                expect(result?.serialNumber).to.equal('NEWSERIAL');
            });
        });
    });

    describe('serial-based deduplication (DHCP IP change)', () => {
        describe('setDiscoveredDevice', () => {
            it('removes old entry when same serial discovered at new IP', () => {
                manager = new DeviceManager(vscode.context, mockGlobalStateManager);

                // Device exists at old IP
                const oldDevice = createMockDevice({
                    serialNumber: 'ABC123',
                    ip: '192.168.1.100',
                    deviceState: 'online',
                    isDiscovered: true
                });
                addDevice(oldDevice);

                // SSDP discovers same serial at new IP
                manager['setDiscoveredDevice']('192.168.1.200', 'ABC123');

                // Should have exactly one device at new IP
                expect(manager.getAllDevices().length).to.equal(1);
                expect(manager.getAllDevices()[0].ip).to.equal('192.168.1.200');
                expect(manager.getAllDevices()[0].serialNumber).to.equal('ABC123');
            });

            it('preserves configured properties when device changes IP', () => {
                manager = new DeviceManager(vscode.context, mockGlobalStateManager);

                // Configured device exists at old IP
                const oldDevice = createMockDevice({
                    serialNumber: 'ABC123',
                    ip: '192.168.1.100',
                    deviceState: 'online',
                    isConfigured: true,
                    isDiscovered: true,
                    configuredName: 'Living Room Roku',
                    configuredPassword: 'secret123'
                });
                addDevice(oldDevice);

                // SSDP discovers same serial at new IP
                manager['setDiscoveredDevice']('192.168.1.200', 'ABC123');

                // Should preserve configured properties (from configuredDevices array)
                expect(manager.getAllDevices().length).to.equal(1);
                expect(manager.getAllDevices()[0].ip).to.equal('192.168.1.200');
                expect(manager.getAllDevices()[0].isConfigured).to.equal(true);
                expect(manager.getAllDevices()[0].configuredName).to.equal('Living Room Roku');
                expect(manager.getAllDevices()[0].configuredPassword).to.equal('secret123');
            });

            it('transfers lastUsedDeviceIp when device changes IP', () => {
                manager = new DeviceManager(vscode.context, mockGlobalStateManager);

                // Device exists at old IP and is the last used device
                const oldDevice = createMockDevice({
                    serialNumber: 'ABC123',
                    ip: '192.168.1.100',
                    deviceState: 'online',
                    isDiscovered: true
                });
                addDevice(oldDevice);
                manager.setLastUsedDeviceIp('192.168.1.100');

                // SSDP discovers same serial at new IP
                manager['setDiscoveredDevice']('192.168.1.200', 'ABC123');

                // lastUsedDeviceIp should transfer to new IP
                expect(manager.getLastUsedDeviceIp()).to.equal('192.168.1.200');
            });
        });

        describe('resolveDevice', () => {
            it('removes old entry when same serial resolved at new IP', async () => {
                manager = new DeviceManager(vscode.context, mockGlobalStateManager);
                sinon.stub(manager as any, 'randomDelay').resolves();

                // Device exists at old IP
                const oldDevice = createMockDevice({
                    serialNumber: 'ABC123',
                    ip: '192.168.1.100',
                    deviceState: 'online',
                    isDiscovered: true
                });
                addDevice(oldDevice);

                // New device at different IP (e.g., from config or cache)
                const newDevice = createMockDevice({
                    serialNumber: null, // Not yet resolved
                    ip: '192.168.1.200',
                    deviceState: 'pending',
                    isConfigured: true,
                    isDiscovered: false
                });
                addDevice(newDevice);

                // Resolve returns same serial as old device
                sinon.stub(rokuDeploy, 'getDeviceInfo').resolves({
                    'serial-number': 'ABC123',
                    'device-id': 'ABC123',
                    'default-device-name': 'Roku Express',
                    'developer-enabled': 'true'
                } as any);

                await manager['resolveDevice'](newDevice);

                // Should have exactly one device at new IP
                expect(manager.getAllDevices().length).to.equal(1);
                expect(manager.getAllDevices()[0].ip).to.equal('192.168.1.200');
                expect(manager.getAllDevices()[0].serialNumber).to.equal('ABC123');
            });

            it('preserves configured properties when resolving at new IP', async () => {
                manager = new DeviceManager(vscode.context, mockGlobalStateManager);
                sinon.stub(manager as any, 'randomDelay').resolves();

                // Configured device exists at old IP
                const oldDevice = createMockDevice({
                    serialNumber: 'ABC123',
                    ip: '192.168.1.100',
                    deviceState: 'offline',
                    isConfigured: true,
                    isDiscovered: false,
                    configuredName: 'My Roku',
                    configuredPassword: 'pass123'
                });
                addDevice(oldDevice);

                // New device at different IP discovered via SSDP (no serial yet)
                const newDevice = createMockDevice({
                    serialNumber: null,
                    ip: '192.168.1.200',
                    deviceState: 'pending',
                    isDiscovered: true
                });
                addDevice(newDevice);

                // Resolve returns same serial as configured device
                sinon.stub(rokuDeploy, 'getDeviceInfo').resolves({
                    'serial-number': 'ABC123',
                    'device-id': 'ABC123',
                    'default-device-name': 'Roku Express',
                    'developer-enabled': 'true'
                } as any);

                await manager['resolveDevice'](newDevice);

                // Should preserve configured properties
                expect(manager.getAllDevices().length).to.equal(1);
                expect(manager.getAllDevices()[0].ip).to.equal('192.168.1.200');
                expect(manager.getAllDevices()[0].isConfigured).to.equal(true);
                expect(manager.getAllDevices()[0].configuredName).to.equal('My Roku');
                expect(manager.getAllDevices()[0].configuredPassword).to.equal('pass123');
            });
        });

        describe('same serial configured at multiple IPs', () => {
            it('collapses to single entry when resolved', async () => {
                manager = new DeviceManager(vscode.context, mockGlobalStateManager);
                sinon.stub(manager as any, 'randomDelay').resolves();

                // Two configured entries for same serial at different IPs
                // (user misconfiguration or device moved)
                const device1 = createMockDevice({
                    serialNumber: 'ABC123',
                    ip: '192.168.1.100',
                    deviceState: 'offline',
                    isConfigured: true,
                    configuredName: 'Old Location'
                });
                const device2 = createMockDevice({
                    serialNumber: 'ABC123',
                    ip: '192.168.1.200',
                    deviceState: 'pending',
                    isConfigured: true,
                    configuredName: 'New Location'
                });
                addDevice(device1);
                addDevice(device2);

                // Resolve the second device (at new IP)
                sinon.stub(rokuDeploy, 'getDeviceInfo').resolves({
                    'serial-number': 'ABC123',
                    'device-id': 'ABC123',
                    'default-device-name': 'Roku Express',
                    'developer-enabled': 'true'
                } as any);

                await manager['resolveDevice'](device2);

                // Should have exactly one device - the one that was just resolved
                expect(manager.getAllDevices().length).to.equal(1);
                expect(manager.getAllDevices()[0].ip).to.equal('192.168.1.200');
                expect(manager.getAllDevices()[0].serialNumber).to.equal('ABC123');
            });
        });

        describe('cross-state preservation', () => {
            it('keeps discovered IP when config has stale IP for same serial', () => {
                manager = new DeviceManager(vscode.context, mockGlobalStateManager);

                // Device discovered at IP1 (real network location)
                addDiscoveredDevice(createMockDevice({
                    serialNumber: 'ABC123',
                    ip: '192.168.1.100',
                    deviceState: 'online'
                }));

                // Config has same serial at different IP (stale config)
                manager['configuredDevices'].push({
                    host: '192.168.1.200', // stale IP from config
                    resolvedIp: '192.168.1.200',
                    serialNumber: 'ABC123',
                    name: 'My Configured Roku',
                    password: 'secret'
                });
                manager['setDeviceState']({ ip: '192.168.1.200', serialNumber: 'ABC123' }, 'pending');

                // Should have ONE device at the DISCOVERED IP (not the configured IP)
                expect(manager.getAllDevices().length).to.equal(1);
                expect(manager.getAllDevices()[0].ip).to.equal('192.168.1.100'); // discovered IP preserved
                expect(manager.getAllDevices()[0].isDiscovered).to.equal(true);
                expect(manager.getAllDevices()[0].isConfigured).to.equal(true);
                expect(manager.getAllDevices()[0].configuredName).to.equal('My Configured Roku');
                expect(manager.getAllDevices()[0].configuredPassword).to.equal('secret');
            });

            it('preserves isConfigured when configured device gets discovered at new IP', () => {
                manager = new DeviceManager(vscode.context, mockGlobalStateManager);

                // Configured-only device at old IP (not yet discovered on network)
                const oldDevice = createMockDevice({
                    serialNumber: 'ABC123',
                    ip: '192.168.1.100',
                    deviceState: 'offline',
                    isDiscovered: false,
                    isConfigured: true,
                    configuredName: 'Living Room Roku',
                    configuredPassword: 'secret'
                });
                addDevice(oldDevice);

                // SSDP discovers same serial at new IP
                manager['setDiscoveredDevice']('192.168.1.200', 'ABC123');

                // Should have one device with BOTH isDiscovered and isConfigured
                expect(manager.getAllDevices().length).to.equal(1);
                expect(manager.getAllDevices()[0].ip).to.equal('192.168.1.200');
                expect(manager.getAllDevices()[0].isDiscovered).to.equal(true);
                expect(manager.getAllDevices()[0].isConfigured).to.equal(true);
                expect(manager.getAllDevices()[0].configuredName).to.equal('Living Room Roku');
                expect(manager.getAllDevices()[0].configuredPassword).to.equal('secret');
            });

            it('shows online when configured at wrong IP and discovered at correct IP resolve concurrently', async () => {
                manager = new DeviceManager(vscode.context, mockGlobalStateManager);
                sinon.stub(manager as any, 'randomDelay').resolves();
                sinon.stub(manager as any, 'broadcast');
                sinon.stub(manager as any, 'reconcile');

                // Configured device XYZ at wrong IP (192.168.1.100)
                const configuredDevice = createMockDevice({
                    serialNumber: 'XYZ',
                    ip: '192.168.1.100',
                    isConfigured: true,
                    isDiscovered: false,
                    configuredName: 'My Roku'
                });
                addDevice(configuredDevice);

                // Discovered device XYZ at correct IP (192.168.1.50)
                const discoveredDevice = createMockDevice({
                    serialNumber: 'XYZ',
                    ip: '192.168.1.50',
                    isConfigured: false,
                    isDiscovered: true
                });
                addDevice(discoveredDevice);

                // Stub: IP .100 fails (wrong IP), IP .50 succeeds (correct IP)
                const getDeviceInfoStub = sinon.stub(rokuDeploy, 'getDeviceInfo');
                getDeviceInfoStub.withArgs(sinon.match({ host: '192.168.1.100' })).rejects(new Error('Unreachable'));
                getDeviceInfoStub.withArgs(sinon.match({ host: '192.168.1.50' })).resolves({
                    'serial-number': 'XYZ',
                    'device-id': 'XYZ',
                    'default-device-name': 'Roku Express'
                } as any);

                // Resolve both concurrently (simulating race condition)
                await Promise.all([
                    manager['resolveDevice']({ ip: '192.168.1.100', serialNumber: 'XYZ', isDiscovered: false } as any),
                    manager['resolveDevice']({ ip: '192.168.1.50', serialNumber: 'XYZ', isDiscovered: true } as any)
                ]);

                // Should have ONE merged device showing ONLINE (discovered state wins)
                const devices = manager.getAllDevices();
                expect(devices.length).to.equal(1);
                expect(devices[0].serialNumber).to.equal('XYZ');
                expect(devices[0].deviceState).to.equal('online');
                expect(devices[0].ip).to.equal('192.168.1.50'); // discovered IP wins
                expect(devices[0].configuredName).to.equal('My Roku'); // configured name preserved
            });

            it('shows online regardless of which concurrent health check completes first', async () => {
                manager = new DeviceManager(vscode.context, mockGlobalStateManager);
                sinon.stub(manager as any, 'randomDelay').resolves();
                sinon.stub(manager as any, 'broadcast');
                sinon.stub(manager as any, 'reconcile');

                // Same setup: configured at wrong IP, discovered at correct IP
                addDevice(createMockDevice({
                    serialNumber: 'XYZ',
                    ip: '192.168.1.100',
                    isConfigured: true,
                    isDiscovered: false
                }));
                addDevice(createMockDevice({
                    serialNumber: 'XYZ',
                    ip: '192.168.1.50',
                    isConfigured: false,
                    isDiscovered: true
                }));

                const getDeviceInfoStub = sinon.stub(rokuDeploy, 'getDeviceInfo');
                getDeviceInfoStub.withArgs(sinon.match({ host: '192.168.1.100' })).rejects(new Error('Unreachable'));
                getDeviceInfoStub.withArgs(sinon.match({ host: '192.168.1.50' })).resolves({
                    'serial-number': 'XYZ',
                    'device-id': 'XYZ',
                    'default-device-name': 'Roku Express'
                } as any);

                // Resolve in OPPOSITE order: wrong IP first, then correct IP
                await manager['resolveDevice']({ ip: '192.168.1.100', serialNumber: 'XYZ', isDiscovered: false } as any);
                await manager['resolveDevice']({ ip: '192.168.1.50', serialNumber: 'XYZ', isDiscovered: true } as any);

                // Should still show online
                expect(manager.getAllDevices().length).to.equal(1);
                expect(manager.getAllDevices()[0].deviceState).to.equal('online');

                // Now test the reverse order: correct IP first, then wrong IP
                getDeviceInfoStub.reset();
                getDeviceInfoStub.withArgs(sinon.match({ host: '192.168.1.100' })).rejects(new Error('Unreachable'));
                getDeviceInfoStub.withArgs(sinon.match({ host: '192.168.1.50' })).resolves({
                    'serial-number': 'XYZ',
                    'device-id': 'XYZ',
                    'default-device-name': 'Roku Express'
                } as any);

                await manager['resolveDevice']({ ip: '192.168.1.50', serialNumber: 'XYZ', isDiscovered: true } as any);
                await manager['resolveDevice']({ ip: '192.168.1.100', serialNumber: 'XYZ', isDiscovered: false } as any);

                // Should still show online (discovered state wins, not affected by configured failure)
                expect(manager.getAllDevices().length).to.equal(1);
                expect(manager.getAllDevices()[0].deviceState).to.equal('online');
            });
        });

        describe('edge cases', () => {
            it('does not dedupe when serial is undefined', () => {
                manager = new DeviceManager(vscode.context, mockGlobalStateManager);

                // Device without serial at old IP
                const oldDevice = createMockDevice({
                    serialNumber: null,
                    ip: '192.168.1.100',
                    deviceState: 'online',
                    isDiscovered: true
                });
                addDevice(oldDevice);

                // Discover device at new IP, also without serial
                manager['setDiscoveredDevice']('192.168.1.200', undefined);

                // Should have two devices (no deduplication without serial)
                expect(manager.getAllDevices().length).to.equal(2);
            });

            it('does not remove device at same IP (not a duplicate)', () => {
                manager = new DeviceManager(vscode.context, mockGlobalStateManager);

                // Device exists with fresh cache (deviceInfo provided populates cache)
                const device = createMockDevice({
                    serialNumber: 'ABC123',
                    ip: '192.168.1.100',
                    deviceState: 'pending',
                    isDiscovered: true,
                    deviceInfo: { 'developer-enabled': 'true' } // Populate cache for fresh state determination
                });
                addDevice(device);

                // Re-discover at same IP (normal refresh scenario)
                manager['setDiscoveredDevice']('192.168.1.100', 'ABC123');

                // Should still have exactly one device (merged, not duplicated)
                expect(manager.getAllDevices().length).to.equal(1);
                expect(manager.getAllDevices()[0].ip).to.equal('192.168.1.100');
                // With fresh cache, device should be online
                expect(manager.getAllDevices()[0].deviceState).to.equal('online');
            });
        });
    });

    describe('serial mismatch detection', () => {
        describe('checkForSerialMismatch', () => {
            it('returns false when no new serial is provided', () => {
                manager = new DeviceManager(vscode.context, mockGlobalStateManager);

                const result = manager['checkForSerialMismatch']('192.168.1.100', undefined);
                expect(result).to.be.false;
            });

            it('returns false when no stored serial exists for IP', () => {
                manager = new DeviceManager(vscode.context, mockGlobalStateManager);
                mockGlobalStateManager.getSerialNumberForIp.returns(undefined);

                const result = manager['checkForSerialMismatch']('192.168.1.100', 'NEW-SERIAL');
                expect(result).to.be.false;
            });

            it('returns false when stored serial matches new serial', () => {
                manager = new DeviceManager(vscode.context, mockGlobalStateManager);
                mockGlobalStateManager.getSerialNumberForIp.returns('ABC123');

                const result = manager['checkForSerialMismatch']('192.168.1.100', 'ABC123');
                expect(result).to.be.false;
            });

            it('returns true when stored serial differs from new serial', () => {
                manager = new DeviceManager(vscode.context, mockGlobalStateManager);
                mockGlobalStateManager.getSerialNumberForIp.returns('OLD-SERIAL');

                const result = manager['checkForSerialMismatch']('192.168.1.100', 'NEW-SERIAL');
                expect(result).to.be.true;
            });

            it('returns false when configured device has different serial (avoids reload loop)', () => {
                manager = new DeviceManager(vscode.context, mockGlobalStateManager);
                mockGlobalStateManager.getSerialNumberForIp.returns(undefined);

                // Add configured device with serial - this is a user misconfiguration
                // We intentionally don't trigger mismatch here because reloading
                // won't fix the config and would cause an infinite loop
                manager['configuredDevices'].push({
                    host: '192.168.1.100',
                    resolvedIp: '192.168.1.100',
                    serialNumber: 'CONFIGURED-SERIAL'
                });

                const result = manager['checkForSerialMismatch']('192.168.1.100', 'NEW-SERIAL');
                expect(result).to.be.false;
            });

            it('returns true when discovered device has different serial', () => {
                manager = new DeviceManager(vscode.context, mockGlobalStateManager);
                mockGlobalStateManager.getSerialNumberForIp.returns(undefined);

                // Add discovered device with serial
                manager['discoveredDevices'].push({
                    ip: '192.168.1.100',
                    serialNumber: 'DISCOVERED-SERIAL'
                });

                const result = manager['checkForSerialMismatch']('192.168.1.100', 'NEW-SERIAL');
                expect(result).to.be.true;
            });
        });

        describe('config reload on mismatch', () => {
            it('reloads configured devices when resolveDevice detects serial mismatch', async () => {
                manager = new DeviceManager(vscode.context, mockGlobalStateManager);
                sinon.stub(manager as any, 'randomDelay').resolves();

                // Set up: stored serial for this IP
                mockGlobalStateManager.getSerialNumberForIp.returns('OLD-SERIAL');

                // Spy on loadConfiguredDevices
                const loadConfigSpy = sinon.spy(manager as any, 'loadConfiguredDevices');

                // Mock getDeviceInfo to return a different serial
                sinon.stub(rokuDeploy, 'getDeviceInfo').resolves({
                    'serial-number': 'NEW-SERIAL',
                    'device-id': 'NEW-SERIAL',
                    'default-device-name': 'Roku Express'
                } as any);

                // Add discovered device at IP (mismatch detection happens in setDiscoveredDevice
                // which is only called when isDiscovered is true)
                const device = createMockDevice({
                    ip: '192.168.1.100',
                    isDiscovered: true
                });
                addDiscoveredDevice(device);

                // Resolve device
                await manager['resolveDevice'](device);

                // Should have called loadConfiguredDevices
                expect(loadConfigSpy.calledOnce).to.be.true;
            });

            it('reloads configured devices when SSDP finds device with different serial at known IP', () => {
                manager = new DeviceManager(vscode.context, mockGlobalStateManager);

                // Set up: stored serial for this IP
                mockGlobalStateManager.getSerialNumberForIp.returns('OLD-SERIAL');

                // Spy on loadConfiguredDevices
                const loadConfigSpy = sinon.spy(manager as any, 'loadConfiguredDevices');

                // Simulate SSDP finding a different device at the same IP
                manager['finder'].emit('found', '192.168.1.100', { serialNumber: 'NEW-SERIAL' });

                // Should have called loadConfiguredDevices
                expect(loadConfigSpy.calledOnce).to.be.true;
            });

            it('does not reload when serial matches', async () => {
                manager = new DeviceManager(vscode.context, mockGlobalStateManager);
                sinon.stub(manager as any, 'randomDelay').resolves();

                // Set up: stored serial for this IP
                mockGlobalStateManager.getSerialNumberForIp.returns('SAME-SERIAL');

                // Spy on loadConfiguredDevices
                const loadConfigSpy = sinon.spy(manager as any, 'loadConfiguredDevices');

                // Mock getDeviceInfo to return the same serial
                sinon.stub(rokuDeploy, 'getDeviceInfo').resolves({
                    'serial-number': 'SAME-SERIAL',
                    'device-id': 'SAME-SERIAL',
                    'default-device-name': 'Roku Express'
                } as any);

                // Resolve device
                await manager['resolveDevice']({ ip: '192.168.1.100' });

                // Should NOT have called loadConfiguredDevices
                expect(loadConfigSpy.called).to.be.false;
            });
        });

        describe('configured device with mismatched serial at IP', () => {
            let ipToSerialMap: Map<string, string>;

            beforeEach(() => {
                // Reset the IP→serial tracking map and restore callsFake behavior
                ipToSerialMap = new Map();
                mockGlobalStateManager.getSerialNumberForIp.callsFake((ip: string, networkId: string) => {
                    return ipToSerialMap.get(`${networkId}:${ip}`);
                });
                mockGlobalStateManager.setSerialNumberForIp.callsFake((networkId: string, ip: string, serial: string) => {
                    ipToSerialMap.set(`${networkId}:${ip}`, serial);
                });
            });

            it('shows two devices when configured serial differs from device at IP', async () => {
                manager = new DeviceManager(vscode.context, mockGlobalStateManager);
                sinon.stub(manager as any, 'randomDelay').resolves();

                // User configured device with serial ABC at this IP
                manager['configuredDevices'].push({
                    host: '192.168.1.100',
                    serialNumber: 'CONFIGURED-ABC',
                    name: 'My Living Room Roku'
                });

                // But device XYZ is actually at that IP
                // Note: rokuDeploy.getDeviceInfo returns both serialNumber (camelCase) and 'serial-number' (kebab)
                sinon.stub(rokuDeploy, 'getDeviceInfo').resolves({
                    'serial-number': 'ACTUAL-XYZ',
                    'serialNumber': 'ACTUAL-XYZ',
                    'device-id': 'ACTUAL-XYZ',
                    'default-device-name': 'Roku Express'
                } as any);

                // Simulate SSDP discovering a device at the configured IP (no serial known yet)
                // setDiscoveredDevice is only called when isDiscovered is true, which creates
                // the discovered device entry after resolution
                const device = createMockDevice({
                    ip: '192.168.1.100',
                    serialNumber: null, // No serial known yet from SSDP
                    isDiscovered: true,
                    deviceState: 'pending' // Unresolved device starts as pending
                });
                addDiscoveredDevice(device);

                // Resolve the discovered device - this will find XYZ serial
                await manager['resolveDevice'](device);

                // Get the devices
                const devices = manager.getAllDevices();

                // Expected: TWO devices - configured device offline, discovered device online
                expect(devices).to.have.lengthOf(2);

                // Find the configured device (serial ABC) - offline because a different device is at its IP
                const configuredDevice = devices.find(d => d.serialNumber === 'CONFIGURED-ABC');
                expect(configuredDevice).to.exist;
                expect(configuredDevice.configuredName).to.equal('My Living Room Roku');
                expect(configuredDevice.isConfigured).to.be.true;
                expect(configuredDevice.isDiscovered).to.be.false;
                expect(configuredDevice.deviceState).to.equal('offline');

                // Find the discovered device (serial XYZ)
                const discoveredDevice = devices.find(d => d.serialNumber === 'ACTUAL-XYZ');
                expect(discoveredDevice).to.exist;
                expect(discoveredDevice.configuredName).to.be.undefined;
                expect(discoveredDevice.isConfigured).to.be.false;
                expect(discoveredDevice.isDiscovered).to.be.true;
                expect(discoveredDevice.deviceState).to.equal('online');
            });
        });
    });

    describe('defaultPassword', () => {
        function stubConfig(defaultDevicePassword: string | undefined) {
            (vscode.workspace.getConfiguration as sinon.SinonStub).returns({
                get: () => undefined,
                inspect: () => ({ workspaceValue: [], globalValue: [] }),
                deviceDiscovery: {
                    enabled: false,
                    showInfoMessages: false
                },
                defaultDevicePassword: defaultDevicePassword
            } as any);
        }

        it('returns undefined when setting is missing', () => {
            stubConfig(undefined);
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);
            expect(manager.getDefaultPassword()).to.be.undefined;
        });

        it('returns undefined when setting is an empty string', () => {
            stubConfig('');
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);
            expect(manager.getDefaultPassword()).to.be.undefined;
        });

        it('returns the configured value when setting is a non-empty string', () => {
            stubConfig('hunter2');
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);
            expect(manager.getDefaultPassword()).to.equal('hunter2');
        });

        describe('getDevice fallback', () => {
            it('applies defaultPassword to a device missing configuredPassword', () => {
                stubConfig('hunter2');
                manager = new DeviceManager(vscode.context, mockGlobalStateManager);

                manager['discoveredDevices'].push({
                    serialNumber: 'abc',
                    ip: '10.0.0.5'
                });
                manager['setDeviceState']({ serialNumber: 'abc', ip: '10.0.0.5' }, 'online');

                const device = manager.getDevice({ ip: '10.0.0.5' });
                expect(device?.configuredPassword).to.equal('hunter2');
            });

            it('preserves a device-specific configuredPassword over defaultPassword', () => {
                stubConfig('hunter2');
                manager = new DeviceManager(vscode.context, mockGlobalStateManager);

                // Add a configured device with a specific password
                manager['configuredDevices'].push({
                    host: '10.0.0.5',
                    password: 'specific'
                } as any);
                manager['setDeviceState']({ ip: '10.0.0.5' }, 'online');

                const device = manager.getDevice({ ip: '10.0.0.5' });
                expect(device?.configuredPassword).to.equal('specific');
            });

            it('leaves configuredPassword undefined when no default and no per-device password', () => {
                stubConfig(undefined);
                manager = new DeviceManager(vscode.context, mockGlobalStateManager);

                manager['discoveredDevices'].push({
                    serialNumber: 'abc',
                    ip: '10.0.0.5'
                });
                manager['setDeviceState']({ serialNumber: 'abc', ip: '10.0.0.5' }, 'online');

                const device = manager.getDevice({ ip: '10.0.0.5' });
                expect(device?.configuredPassword).to.be.undefined;
            });
        });

        describe('getAllDevices fallback', () => {
            it('applies defaultPassword to every device missing a per-device password', () => {
                stubConfig('hunter2');
                manager = new DeviceManager(vscode.context, mockGlobalStateManager);

                // Discovered device without password
                manager['discoveredDevices'].push({
                    serialNumber: 'no-pw',
                    ip: '10.0.0.5'
                });
                manager['setDeviceState']({ serialNumber: 'no-pw', ip: '10.0.0.5' }, 'online');
                // Configured device with specific password
                manager['configuredDevices'].push({
                    host: '10.0.0.6',
                    password: 'specific',
                    serialNumber: 'has-pw'
                } as any);
                manager['setDeviceState']({ serialNumber: 'has-pw', ip: '10.0.0.6' }, 'online');

                const devices = manager.getAllDevices();
                const withoutPw = devices.find(d => d.serialNumber === 'no-pw');
                const withPw = devices.find(d => d.serialNumber === 'has-pw');
                expect(withoutPw?.configuredPassword).to.equal('hunter2');
                expect(withPw?.configuredPassword).to.equal('specific');
            });

            it('does not mutate the underlying device entry when applying the fallback', () => {
                stubConfig('hunter2');
                manager = new DeviceManager(vscode.context, mockGlobalStateManager);

                manager['discoveredDevices'].push({
                    serialNumber: 'abc',
                    ip: '10.0.0.5'
                });
                manager['setDeviceState']({ serialNumber: 'abc', ip: '10.0.0.5' }, 'online');

                manager.getAllDevices();

                // Internal discoveredDevices entry should not have configuredPassword field
                expect((manager['discoveredDevices'][0] as any).configuredPassword).to.be.undefined;
            });
        });
    });

    describe('getDeviceDisplayName', () => {
        function makeDevice(overrides: Partial<RokuDevice> & { deviceInfo?: Record<string, any> } = {}): RokuDevice {
            const { deviceInfo: deviceInfoOverrides, ...rest } = overrides;
            return {
                ip: '192.168.1.100',
                serialNumber: 'abc',
                key: 's:abc',
                deviceState: 'online',
                isConfigured: false,
                isDiscovered: true,
                ...rest,
                deviceInfo: {
                    'model-number': '4660X',
                    'user-device-name': 'Living Room',
                    'software-version': '12.5.0',
                    ...(deviceInfoOverrides ?? {})
                }
            } as RokuDevice;
        }

        beforeEach(() => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);
        });

        it('joins model, name, and OS version with en-dashes', () => {
            const device = makeDevice();
            expect(manager.getDeviceDisplayName(device)).to.equal('4660X – Living Room – OS 12.5.0');
        });

        it('prefers configuredName over user-device-name', () => {
            const device = makeDevice({ configuredName: 'My Custom Name' });
            expect(manager.getDeviceDisplayName(device)).to.equal('4660X – My Custom Name – OS 12.5.0');
        });

        it('falls back to user-device-name when configuredName is missing', () => {
            const device = makeDevice({ configuredName: undefined });
            expect(manager.getDeviceDisplayName(device)).to.equal('4660X – Living Room – OS 12.5.0');
        });

        it('falls back to user-device-name when configuredName is empty string', () => {
            const device = makeDevice({ configuredName: '' });
            expect(manager.getDeviceDisplayName(device)).to.equal('4660X – Living Room – OS 12.5.0');
        });

        it('omits model-number when missing', () => {
            const device = makeDevice({ deviceInfo: { 'model-number': undefined } });
            expect(manager.getDeviceDisplayName(device)).to.equal('Living Room – OS 12.5.0');
        });

        it('omits name when both configuredName and user-device-name are missing', () => {
            const device = makeDevice({ deviceInfo: { 'user-device-name': undefined } });
            expect(manager.getDeviceDisplayName(device)).to.equal('4660X – OS 12.5.0');
        });

        it('omits OS version when software-version is missing', () => {
            const device = makeDevice({ deviceInfo: { 'software-version': undefined } });
            expect(manager.getDeviceDisplayName(device)).to.equal('4660X – Living Room');
        });

        it('prefixes software-version with "OS "', () => {
            const device = makeDevice({ deviceInfo: { 'software-version': '11.0' } });
            expect(manager.getDeviceDisplayName(device)).to.equal('4660X – Living Room – OS 11.0');
        });

        it('returns just the IP when no other info is available', () => {
            const device = makeDevice({
                ip: '10.0.0.42',
                deviceInfo: {
                    'model-number': undefined,
                    'user-device-name': undefined,
                    'software-version': undefined
                }
            });
            expect(manager.getDeviceDisplayName(device)).to.equal('10.0.0.42');
        });

        it('does not append IP by default when other info exists', () => {
            const device = makeDevice({ ip: '10.0.0.42' });
            expect(manager.getDeviceDisplayName(device)).to.equal('4660X – Living Room – OS 12.5.0');
        });

        it('appends IP when includeIp=true', () => {
            const device = makeDevice({ ip: '10.0.0.42' });
            expect(manager.getDeviceDisplayName(device, true)).to.equal('4660X – Living Room – OS 12.5.0 – 10.0.0.42');
        });

        it('appends IP when includeIp=true even with partial info', () => {
            const device = makeDevice({
                ip: '10.0.0.42',
                deviceInfo: {
                    'model-number': undefined,
                    'software-version': undefined
                }
            });
            expect(manager.getDeviceDisplayName(device, true)).to.equal('Living Room – 10.0.0.42');
        });

        it('returns IP when includeIp=true and no other info exists', () => {
            const device = makeDevice({
                ip: '10.0.0.42',
                deviceInfo: {
                    'model-number': undefined,
                    'user-device-name': undefined,
                    'software-version': undefined
                }
            });
            // parts has only the ip in it (from the includeIp push), joined produces the ip
            expect(manager.getDeviceDisplayName(device, true)).to.equal('10.0.0.42');
        });

        it('does not append IP when includeIp=true but ip is missing', () => {
            const device = makeDevice({ ip: '' });
            expect(manager.getDeviceDisplayName(device, true)).to.equal('4660X – Living Room – OS 12.5.0');
        });

        it('treats whitespace-only model, name, and version as missing (no "– – OS – ip" garbage)', () => {
            const device = makeDevice({
                ip: '192.168.1.31',
                configuredName: '   ',
                deviceInfo: {
                    'model-number': '   ',
                    'user-device-name': '   ',
                    'software-version': '   '
                }
            });
            // Without the fix, this would render as "   –    – OS    – 192.168.1.31"
            // which displays as "– – OS – 192.168.1.31"
            expect(manager.getDeviceDisplayName(device, true)).to.equal('192.168.1.31');
            expect(manager.getDeviceDisplayName(device, false)).to.equal('192.168.1.31');
        });

        it('treats whitespace-only model-number as missing', () => {
            const device = makeDevice({ deviceInfo: { 'model-number': '   ' } });
            expect(manager.getDeviceDisplayName(device)).to.equal('Living Room – OS 12.5.0');
        });

        it('treats whitespace-only software-version as missing (no bare "OS" segment)', () => {
            const device = makeDevice({ deviceInfo: { 'software-version': '   ' } });
            expect(manager.getDeviceDisplayName(device)).to.equal('4660X – Living Room');
        });

        it('treats whitespace-only configuredName as missing and falls back to user-device-name', () => {
            const device = makeDevice({ configuredName: '   ' });
            expect(manager.getDeviceDisplayName(device)).to.equal('4660X – Living Room – OS 12.5.0');
        });

        it('treats whitespace-only configuredName AND user-device-name as missing', () => {
            const device = makeDevice({
                configuredName: '   ',
                deviceInfo: { 'user-device-name': '   ' }
            });
            expect(manager.getDeviceDisplayName(device)).to.equal('4660X – OS 12.5.0');
        });

        it('treats null fields the same as missing', () => {
            const device = makeDevice({
                configuredName: null as any,
                deviceInfo: {
                    'model-number': null,
                    'user-device-name': null,
                    'software-version': null
                }
            });
            expect(manager.getDeviceDisplayName(device, true)).to.equal('192.168.1.100');
        });

        it('trims surrounding whitespace from non-empty values', () => {
            const device = makeDevice({
                configuredName: '  My TV  ',
                deviceInfo: {
                    'model-number': '  4660X  ',
                    'software-version': '  12.5.0  '
                }
            });
            expect(manager.getDeviceDisplayName(device)).to.equal('4660X – My TV – OS 12.5.0');
        });

        it('returns empty string when both ip and all fields are blank', () => {
            const device = makeDevice({
                ip: '   ',
                configuredName: '   ',
                deviceInfo: {
                    'model-number': '   ',
                    'user-device-name': '   ',
                    'software-version': '   '
                }
            });
            expect(manager.getDeviceDisplayName(device, true)).to.equal('');
            expect(manager.getDeviceDisplayName(device, false)).to.equal('');
        });
    });
});
