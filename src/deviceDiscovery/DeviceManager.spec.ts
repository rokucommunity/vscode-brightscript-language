import { expect } from 'chai';
import * as sinon from 'sinon';
import { rokuDeploy, DeviceUnreachableError, InvalidDeviceResponseCodeError } from 'roku-deploy';
import { vscode } from '../mockVscode.spec';
import type { RokuDevice } from './DeviceManager';
import { DeviceManager } from './DeviceManager';
import * as NetworkChangeMonitorModule from './NetworkChangeMonitor';
import { util } from '../util';
import { EventEmitter } from 'eventemitter3';

describe('DeviceManager', () => {
    let manager: DeviceManager;
    let mockGlobalStateManager: any;

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
    });

    afterEach(() => {
        manager?.dispose();
        sinon.restore();
    });

    describe('orders (submit + pending sets)', () => {
        it('a broadcast order lands in the pending set and emits order-submitted with type + reason', () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);

            const eventSpy = sinon.spy();
            manager.on('order-submitted', eventSpy);

            manager.submitOrders([{ type: 'broadcast', reason: 'network' }]);

            expect(eventSpy.calledOnce).to.be.true;
            expect(eventSpy.firstCall.args[0].reason).to.equal('network');
            expect(manager.getPendingBroadcastReasons()).to.include('network');
        });

        it('a reconcile order lands in the pending set and emits order-submitted with type + reason', () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);

            const eventSpy = sinon.spy();
            manager.on('order-submitted', eventSpy);

            manager.submitOrders([{ type: 'reconcile', reason: 'config-changed' }]);

            expect(eventSpy.calledOnce).to.be.true;
            expect(eventSpy.firstCall.args[0].reason).to.equal('config-changed');
            expect(manager.getPendingReconcileReasons()).to.include('config-changed');
        });

        it('different reasons accumulate instead of replacing each other', () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);

            manager.submitOrders([{ type: 'broadcast', reason: 'sleep' }]);
            manager.submitOrders([{ type: 'broadcast', reason: 'network' }]);
            manager.submitOrders([{ type: 'broadcast', reason: 'stale' }]);

            expect(manager.getPendingBroadcastReasons()).to.have.members(['sleep', 'network', 'stale']);
        });

        it('the same reason never queues twice', () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);

            manager.submitOrders([{ type: 'broadcast', reason: 'stale' }]);
            manager.submitOrders([{ type: 'broadcast', reason: 'stale' }]);
            manager.submitOrders([{ type: 'broadcast', reason: 'stale' }]);

            expect(manager.getPendingBroadcastReasons()).to.eql(['stale']);
        });

        it('broadcast and reconcile pending sets are independent', () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);

            manager.submitOrders([{ type: 'broadcast', reason: 'network' }]);
            manager.submitOrders([{ type: 'reconcile', reason: 'config-changed' }]);

            expect(manager.getPendingBroadcastReasons()).to.include('network');
            expect(manager.getPendingReconcileReasons()).to.include('config-changed');
        });

        it('submitOrders accepts multiple orders at once', () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);

            manager.submitOrders([{ type: 'broadcast', reason: 'refresh-clicked' }, { type: 'reconcile', reason: 'refresh-clicked' }]);

            expect(manager.getPendingBroadcastReasons()).to.eql(['refresh-clicked']);
            expect(manager.getPendingReconcileReasons()).to.eql(['refresh-clicked']);
        });

        it('a reconcile-only submission leaves the broadcast set untouched', () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);

            manager.submitOrders([{ type: 'reconcile', reason: 'config-changed' }]);

            expect(manager.getPendingBroadcastReasons()).to.be.empty;
            expect(manager.getPendingReconcileReasons()).to.eql(['config-changed']);
        });

        it('a broadcast-only submission leaves the reconcile set untouched', () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);

            manager.submitOrders([{ type: 'broadcast', reason: 'unhealthy-device' }]);

            expect(manager.getPendingBroadcastReasons()).to.eql(['unhealthy-device']);
            expect(manager.getPendingReconcileReasons()).to.be.empty;
        });
    });

    describe('fulfillOrders', () => {
        beforeEach(() => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);
        });

        it('consumes and executes a pending broadcast, passing its reason through', () => {
            const broadcastStub = sinon.stub(manager as any, 'broadcast').returns(true);
            manager.submitOrders([{ type: 'broadcast', reason: 'network' }]);

            const result = manager.fulfillOrders({ types: ['broadcast'] }).length > 0;

            expect(result).to.be.true;
            expect(broadcastStub.calledOnceWith(['network'])).to.be.true;
            expect(manager.getPendingBroadcastReasons()).to.be.empty;
        });

        it('consumes all accumulated reasons in a single execution', () => {
            const broadcastStub = sinon.stub(manager as any, 'broadcast').returns(true);
            manager.submitOrders([{ type: 'broadcast', reason: 'sleep' }]);
            manager.submitOrders([{ type: 'broadcast', reason: 'network' }]);

            const result = manager.fulfillOrders({ types: ['broadcast'] }).length > 0;

            expect(result).to.be.true;
            expect(broadcastStub.calledOnce).to.be.true;
            expect(broadcastStub.firstCall.args[0]).to.have.members(['sleep', 'network']);
            expect(manager.getPendingBroadcastReasons()).to.be.empty;
        });

        it('passes a stale reason through (broadcast applies the staleness gate itself)', () => {
            const broadcastStub = sinon.stub(manager as any, 'broadcast').returns(false);
            manager.submitOrders([{ type: 'broadcast', reason: 'stale' }]);

            manager.fulfillOrders({ types: ['broadcast'] });

            expect(broadcastStub.calledOnceWith(['stale'])).to.be.true;
        });

        it('leaves except-listed reasons QUEUED instead of consuming them', () => {
            const broadcastStub = sinon.stub(manager as any, 'broadcast').returns(true);
            manager.submitOrders([{ type: 'broadcast', reason: 'stale' }]);

            const result = manager.fulfillOrders({ types: ['broadcast'], except: ['stale'] }).length > 0;

            expect(result).to.be.false;
            expect(broadcastStub.called).to.be.false;
            expect(manager.getPendingBroadcastReasons()).to.include('stale');
        });

        it('when a real reason triggers execution, the whole set is cleared — excepted reasons included', () => {
            const broadcastStub = sinon.stub(manager as any, 'broadcast').returns(true);
            manager.submitOrders([{ type: 'broadcast', reason: 'stale' }]);
            manager.submitOrders([{ type: 'broadcast', reason: 'network' }]);

            const result = manager.fulfillOrders({ types: ['broadcast'], except: ['stale'] }).length > 0;

            //the scan satisfies the stale want too, so it rides along instead of staying queued
            expect(result).to.be.true;
            expect(broadcastStub.calledOnce).to.be.true;
            expect(broadcastStub.firstCall.args[0]).to.have.members(['stale', 'network']);
            expect(manager.getPendingBroadcastReasons()).to.be.empty;
        });

        it('returns false and does nothing when no order is pending', () => {
            const broadcastStub = sinon.stub(manager as any, 'broadcast').returns(true);

            expect(manager.fulfillOrders({ types: ['broadcast'] })).to.be.empty;
            expect(broadcastStub.called).to.be.false;
        });

        it('is atomic: a second fulfillment finds the set empty', () => {
            const broadcastStub = sinon.stub(manager as any, 'broadcast').returns(true);
            manager.submitOrders([{ type: 'broadcast', reason: 'network' }]);

            expect(manager.fulfillOrders({ types: ['broadcast'] })).to.not.be.empty;
            expect(manager.fulfillOrders({ types: ['broadcast'] })).to.be.empty;
            expect(broadcastStub.calledOnce).to.be.true;
        });

        it('passes the reconcile reason through (reconcile decides cache bypass itself)', () => {
            const reconcileStub = sinon.stub(manager as any, 'reconcile');

            manager.submitOrders([{ type: 'reconcile', reason: 'config-changed' }]);
            expect(manager.fulfillOrders({ types: ['reconcile'] })).to.not.be.empty;
            expect(reconcileStub.calledOnceWith(['config-changed'])).to.be.true;

            reconcileStub.resetHistory();
            manager.submitOrders([{ type: 'reconcile', reason: 'refresh-clicked' }]);
            expect(manager.fulfillOrders({ types: ['reconcile'] })).to.not.be.empty;
            expect(reconcileStub.calledOnceWith(['refresh-clicked'])).to.be.true;
        });

        it('leaves an except-listed reconcile queued', () => {
            const reconcileStub = sinon.stub(manager as any, 'reconcile');
            manager.submitOrders([{ type: 'reconcile', reason: 'stale' }]);

            expect(manager.fulfillOrders({ types: ['reconcile'], except: ['stale'] })).to.be.empty;
            expect(reconcileStub.called).to.be.false;
            expect(manager.getPendingReconcileReasons()).to.include('stale');
        });

        it('fulfills both order types in one call, returning what was taken', () => {
            const broadcastStub = sinon.stub(manager as any, 'broadcast').returns(true);
            const reconcileStub = sinon.stub(manager as any, 'reconcile');
            manager.submitOrders([{ type: 'broadcast', reason: 'refresh-clicked' }, { type: 'reconcile', reason: 'refresh-clicked' }]);

            const result = manager.fulfillOrders({ types: ['broadcast', 'reconcile'] });

            expect(result).to.eql([
                { type: 'broadcast', reasons: ['refresh-clicked'] },
                { type: 'reconcile', reasons: ['refresh-clicked'] }
            ]);
            expect(broadcastStub.calledOnceWith(['refresh-clicked'])).to.be.true;
            expect(reconcileStub.calledOnceWith(['refresh-clicked'])).to.be.true;
            expect(manager.getPendingBroadcastReasons()).to.be.empty;
            expect(manager.getPendingReconcileReasons()).to.be.empty;
        });

        it('passes the except list to both order types', () => {
            const broadcastStub = sinon.stub(manager as any, 'broadcast').returns(true);
            const reconcileStub = sinon.stub(manager as any, 'reconcile');
            manager.submitOrders([{ type: 'broadcast', reason: 'stale' }]);
            manager.submitOrders([{ type: 'reconcile', reason: 'stale' }]);

            const result = manager.fulfillOrders({ types: ['broadcast', 'reconcile'], except: ['stale'] });

            expect(result).to.be.empty;
            expect(broadcastStub.called).to.be.false;
            expect(reconcileStub.called).to.be.false;
            expect(manager.getPendingBroadcastReasons()).to.include('stale');
            expect(manager.getPendingReconcileReasons()).to.include('stale');
        });
    });

    describe('healthCheckDevice / getDeviceInfo', () => {
        it('returns true when the device answers the direct info request', async () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);
            manager['discoveredDevices'].push({ ip: '192.168.1.50', serialNumber: 'ENG50', state: 'online' } as any);
            const getDeviceInfoStub = sinon.stub(manager, 'getDeviceInfo').resolves({ 'serial-number': 'ENG50' } as any);

            const isHealthy = await manager.healthCheckDevice({ ip: '192.168.1.50' });

            expect(isHealthy).to.be.true;
            expect(getDeviceInfoStub.calledOnceWith({ ip: '192.168.1.50' })).to.be.true;
        });

        it('returns false when the device does not answer', async () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);
            manager['discoveredDevices'].push({ ip: '192.168.1.50', serialNumber: 'ENG50', state: 'online' } as any);
            sinon.stub(manager, 'getDeviceInfo').resolves(undefined);

            expect(await manager.healthCheckDevice({ ip: '192.168.1.50' })).to.be.false;
        });

        it('getDeviceInfo resolves an encoded tree key down to the device ip', async () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);
            manager['discoveredDevices'].push({ ip: '192.168.1.60', serialNumber: 'KEY60', state: 'online' } as any);
            const rokuDeployStub = sinon.stub(rokuDeploy, 'getDeviceInfo').resolves({ 'serial-number': 'KEY60' } as any);

            const deviceInfo = await manager.getDeviceInfo('s:KEY60');

            expect(deviceInfo).to.include({ 'serial-number': 'KEY60' });
            expect(rokuDeployStub.firstCall.args[0].device).to.include({ host: '192.168.1.60' });
        });

        it('reports an unknown key as unhealthy without hitting the network', async () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);
            const rokuDeployStub = sinon.stub(rokuDeploy, 'getDeviceInfo');

            const isHealthy = await manager.healthCheckDevice('s:GONE');

            expect(isHealthy).to.be.false;
            expect(rokuDeployStub.called).to.be.false;
        });

        it('getDeviceInfo always hits the device directly and returns its info', async () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);
            const getDeviceInfoStub = sinon.stub(rokuDeploy, 'getDeviceInfo').resolves({
                'serial-number': 'RAW50',
                'user-device-name': 'living room'
            } as any);

            const deviceInfo = await manager.getDeviceInfo('192.168.1.50');

            expect(getDeviceInfoStub.calledOnce).to.be.true;
            expect(deviceInfo).to.include({ 'user-device-name': 'living room' });
            //success caches the result for future getDevice reads
            expect(mockGlobalStateManager.getCachedDevice('RAW50')).to.exist;
        });

        it('getDeviceInfo returns undefined for an unreachable device', async () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);
            sinon.stub(rokuDeploy, 'getDeviceInfo').rejects(new Error('Unreachable'));

            const deviceInfo = await manager.getDeviceInfo('192.168.1.50');

            expect(deviceInfo).to.be.undefined;
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

                clock.tick(manager['STALE_RECONCILE_INTERVAL_MS']);
                expect(manager.getPendingReconcileReasons()).to.include('stale');

                clock.tick(manager['STALE_SCAN_THRESHOLD_MS']);
                expect(manager.getPendingBroadcastReasons()).to.include('stale');

                //consume the pending orders, stop monitoring, and verify no new stale orders arrive
                manager['orders'].take({ types: ['broadcast', 'reconcile'] });
                manager['deactivateMonitoring']();

                clock.tick(manager['STALE_SCAN_THRESHOLD_MS'] * 2);
                expect(manager.getPendingBroadcastReasons()).to.be.empty;
                expect(manager.getPendingReconcileReasons()).to.be.empty;
            } finally {
                clock.restore();
            }
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

                manager['broadcast'](['refresh-clicked']);

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
            const unsubscribe = manager.on('order-submitted', handler);

            manager.submitOrders([{ type: 'broadcast', reason: 'network' }]);
            expect(handler.calledOnce).to.be.true;

            unsubscribe();

            manager.submitOrders([{ type: 'broadcast', reason: 'network' }]);
            expect(handler.calledOnce).to.be.true; // Still just one call (unsubscribed)
        });

        it('adds to disposables array if provided', () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);

            const disposables: any[] = [];
            manager.on('order-submitted', () => { }, disposables);

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
        it('sets lastScanDate via broadcast', () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);

            expect(manager['timeSinceLastScan']).to.equal(Infinity);

            manager['broadcast'](['refresh-clicked']);

            // After a broadcast, timeSinceLastScan should be very small (just happened)
            expect(manager['timeSinceLastScan']).to.be.lessThan(100);
        });

        it('demands maxAgeMs 0 (must fetch) only for refresh-clicked', () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);

            const healthCheckAllDevicesSpy = sinon.stub(manager as any, 'healthCheckAllDevices').resolves();

            manager['reconcile'](['refresh-clicked']);
            expect(healthCheckAllDevicesSpy.calledWith(0)).to.be.true;

            manager['reconcile'](['config-changed']);
            expect(healthCheckAllDevicesSpy.calledWith(undefined)).to.be.true;

            manager['reconcile'](['network']);
            expect(healthCheckAllDevicesSpy.lastCall.args[0]).to.equal(undefined);
        });
    });

    describe('broadcast', () => {
        it('triggers discovery without health checking', () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);

            const finderScanSpy = sinon.stub(manager['finder'], 'scan');
            const healthCheckAllDevicesSpy = sinon.spy(manager as any, 'healthCheckAllDevices');

            manager['broadcast'](['refresh-clicked']);

            expect(finderScanSpy.calledOnce).to.be.true;
            expect(healthCheckAllDevicesSpy.called).to.be.false;
        });

        it('a stale reason does not scan while device discovery is disabled', () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);
            sinon.stub(manager as any, 'deviceDiscoveryEnabled').get(() => false);

            const finderScanSpy = sinon.stub(manager['finder'], 'scan');

            const result = manager['broadcast'](['stale']);

            expect(result).to.be.false;
            expect(finderScanSpy.called).to.be.false;
        });

        it('a real reason scans even while device discovery is disabled (explicit user intent)', () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);
            sinon.stub(manager as any, 'deviceDiscoveryEnabled').get(() => false);

            const finderScanSpy = sinon.stub(manager['finder'], 'scan');

            const result = manager['broadcast'](['refresh-clicked']);

            expect(result).to.be.true;
            expect(finderScanSpy.calledOnce).to.be.true;
        });

        it('a stale reason is staleness-gated: no scan when the last scan is recent', () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);
            sinon.stub(manager['finder'], 'scan');

            expect(manager['broadcast'](['refresh-clicked'])).to.be.true; //sets lastScanDate
            expect(manager['broadcast'](['stale'])).to.be.false; //fresh — gate closed
        });

        it('the gate only applies when stale is the ONLY reason: stale + a real reason scans', () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);
            sinon.stub(manager['finder'], 'scan');

            expect(manager['broadcast'](['refresh-clicked'])).to.be.true; //sets lastScanDate
            expect(manager['broadcast'](['stale', 'network'])).to.be.true; //the real reason wins
        });

        it('a stale reason scans when the last scan is older than the threshold', () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);
            //the suite-wide config stub disables discovery; this test is about the staleness half of the gate
            sinon.stub(manager as any, 'deviceDiscoveryEnabled').get(() => true);
            sinon.stub(manager['finder'], 'scan');

            //backdate the last scan past the staleness threshold
            manager['lastScanDate'] = new Date(Date.now() - manager['STALE_SCAN_THRESHOLD_MS'] - 1);

            expect(manager['broadcast'](['stale'])).to.be.true;
        });

        it('emits scan-started event', () => {
            const clock = sinon.useFakeTimers();
            try {
                manager = new DeviceManager(vscode.context, mockGlobalStateManager);

                const scanStartedSpy = sinon.spy();
                manager.on('scan-started', scanStartedSpy);

                manager['broadcast'](['refresh-clicked']);

                expect(scanStartedSpy.calledOnce).to.be.true;
            } finally {
                clock.restore();
            }
        });
    });

    describe('healthCheckAllDevices', () => {
        it('sets all devices to pending and checks all when bypassing the device cache', async () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);

            const device1 = createMockDevice({ serialNumber: 'device-1', ip: '192.168.1.101' });
            const device2 = createMockDevice({ serialNumber: 'device-2', ip: '192.168.1.102' });
            addDevice(device1);
            addDevice(device2);

            const resolveDeviceSpy = sinon.stub(manager as any, 'ensureDeviceFresh').returns(Promise.resolve(true) as any);

            await (manager as any).healthCheckAllDevices(true);

            expect(resolveDeviceSpy.calledTwice).to.be.true;
        });

        it('calls ensureDeviceFresh for all devices (caching happens in ensureDeviceFresh)', async () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);

            const device1 = createMockDevice({ serialNumber: 'device-1', ip: '192.168.1.101' });
            const device2 = createMockDevice({ serialNumber: 'device-2', ip: '192.168.1.102' });
            addDevice(device1);
            addDevice(device2);

            const resolveDeviceSpy = sinon.stub(manager as any, 'ensureDeviceFresh').returns(Promise.resolve(true) as any);

            await (manager as any).healthCheckAllDevices();

            // Both devices should have ensureDeviceFresh called (caching is internal to ensureDeviceFresh)
            expect(resolveDeviceSpy.calledTwice).to.be.true;
        });

        it('ensureDeviceFresh uses cached data when recently fetched', async () => {
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

            // Pre-populate the cache by calling ensureDeviceFresh once
            await manager['ensureDeviceFresh'](device, { syntheticDelay: false });
            expect(getDeviceInfoStub.calledOnce).to.be.true;

            // Now call healthCheckAllDevices - should use cached data
            await (manager as any).healthCheckAllDevices();

            // Still only one network call (second used cache)
            expect(getDeviceInfoStub.calledOnce).to.be.true;
        });
    });

    describe('ensureDeviceFresh cooldown (cache trusted)', () => {
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
            await manager['ensureDeviceFresh'](device);
            expect(getDeviceInfoStub.calledOnce).to.be.true;

            // Second call immediately - should use cache, no new network call
            await manager['ensureDeviceFresh'](device);
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
                await manager['ensureDeviceFresh'](device);
                expect(getDeviceInfoStub.calledOnce).to.be.true;

                // Advance past cooldown (5 minutes)
                clock.tick((5 * 60 * 1_000) + 1);

                // Second call - cache expired, should fetch again
                await manager['ensureDeviceFresh'](device);
                expect(getDeviceInfoStub.calledTwice).to.be.true;
            } finally {
                clock.restore();
            }
        });

        it('healthCheckDevice always fetches regardless of cooldown (single-device checks bypass the cache)', async () => {
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

            // First engagement
            await manager.healthCheckDevice(device);
            expect(getDeviceInfoStub.calledOnce).to.be.true;

            // Second engagement immediately - should still fetch
            await manager.healthCheckDevice(device);
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

                manager['broadcast'](['refresh-clicked']);

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

                manager['broadcast'](['refresh-clicked']);

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

                manager['broadcast'](['refresh-clicked']);
                expect(scanStartedSpy.calledOnce).to.be.true;

                // Try to start another scan while one is in progress
                manager['broadcast'](['refresh-clicked']);
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

                manager['broadcast'](['refresh-clicked']);
                expect(scanStartedSpy.calledOnce).to.be.true;

                // Complete the scan
                clock.tick(3_000); // min + settle both complete
                expect(scanEndedSpy.calledOnce).to.be.true;

                // Now can start a new scan
                manager['broadcast'](['refresh-clicked']);
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

    describe('healthCheckDevice (single-device check)', () => {
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

            const checkPromise = manager['ensureDeviceFresh'](device, { maxAgeMs: 0, syntheticDelay: false });

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

            const result = await manager['ensureDeviceFresh'](device, { maxAgeMs: 0, syntheticDelay: false });

            expect(result).to.be.undefined;
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
            await manager['ensureDeviceFresh'](device, { maxAgeMs: 0, syntheticDelay: false });

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

            const result = await manager.healthCheckDevice(device);

            expect(result).to.be.true;
        });

        it('concurrent health checks of the same device share one request (the de-dupe rule)', async () => {
            // Under the de-dupe rule, concurrent checks share one in-flight request, and the
            // result is applied exactly once when that shared request settles — out-of-order
            // application is structurally impossible.
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);
            (vscode.window as any).state = { focused: true };

            const device = createMockDevice({ serialNumber: 'device-123' });
            addDevice(device);

            // Suppress the unhealthy-device order noise from failed checks
            sinon.stub(manager as any, 'submitUnhealthyDeviceBroadcast');

            let resolveFetch: (value: any) => void;
            const getDeviceInfoStub = sinon.stub(rokuDeploy, 'getDeviceInfo').returns(new Promise<any>(resolve => {
                resolveFetch = resolve;
            }) as any);

            const first = manager.healthCheckDevice(device);
            const second = manager.healthCheckDevice(device);

            resolveFetch({
                'device-id': 'device-123',
                'serial-number': 'device-123',
                'default-device-name': 'Roku Express'
            });
            const [firstResult, secondResult] = await Promise.all([first, second]);

            expect(getDeviceInfoStub.calledOnce).to.be.true;
            expect(firstResult).to.be.true;
            expect(secondResult).to.be.true;
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

            // Suppress the unhealthy-device order noise from failed checks
            sinon.stub(manager as any, 'submitUnhealthyDeviceBroadcast');

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
            const result1 = manager.healthCheckDevice(device1);
            const result2 = manager.healthCheckDevice(device2);

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
            const result = await manager.validateDevicePassword({ host: '192.168.1.100' }, 'rokudev');
            expect(result).to.equal('ok');
            expect(validateStub.firstCall.args[0]).to.deep.equal({ device: { host: '192.168.1.100' }, password: 'rokudev' });
        });

        it(`returns 'bad-password' when the device rejects the credentials`, async () => {
            validateStub.resolves(false);
            const result = await manager.validateDevicePassword({ host: '192.168.1.100' }, 'wrong');
            expect(result).to.equal('bad-password');
        });

        it(`returns 'unreachable' when roku-deploy throws DeviceUnreachableError`, async () => {
            validateStub.rejects(new DeviceUnreachableError('offline'));
            const result = await manager.validateDevicePassword({ host: '192.168.1.100' }, 'rokudev');
            expect(result).to.equal('unreachable');
        });

        it(`returns 'unreachable' on unexpected response codes`, async () => {
            validateStub.rejects(new InvalidDeviceResponseCodeError('500'));
            const result = await manager.validateDevicePassword({ host: '192.168.1.100' }, 'rokudev');
            expect(result).to.equal('unreachable');
        });

        it(`returns 'unreachable' on any other unexpected error`, async () => {
            validateStub.rejects(new Error('something weird'));
            const result = await manager.validateDevicePassword({ host: '192.168.1.100' }, 'rokudev');
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

    /* eslint-disable camelcase -- the RCE management api uses snake_case fields */
    describe('cloud emulator devices', () => {
        function rceDevice(overrides: Record<string, any> = {}) {
            return {
                id: 83,
                name: 'Chris',
                device_type: 'tv',
                serial_number: 'XY020078HH5S',
                status: 'running',
                created_at: '2026-01-01',
                running_device: {
                    instance_api_url: 'https://device.rce.roku.com/instance/abc',
                    firmware_version_id: 'rce-fw:15.2.4-tv_prod',
                    instance_uuid: 'uuid-1',
                    created_at: '2026-01-01',
                    snapshot_id: 1,
                    id: 1,
                    device_id: 83,
                    max_runtime: 3600
                },
                ...overrides
            };
        }

        it('merges rce devices into getAllDevices with mapped state and synthesized deviceInfo', () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);
            manager['onRceDevices']([rceDevice()] as any);

            const device = manager.getAllDevices().find(x => x.rce);
            expect(device.key).to.equal('s:XY020078HH5S');
            expect(device.serialNumber).to.equal('XY020078HH5S');
            expect(device.deviceState).to.equal('online');
            expect(device.deviceInfo['user-device-name']).to.equal('Chris');
            expect(device.deviceInfo['software-version']).to.equal('15.2.4');
            expect(device.rce).to.include({
                id: 83,
                status: 'running',
                instanceUrl: 'https://device.rce.roku.com/instance/abc'
            });
        });

        it('synthesizes is-tv and is-stick as raw ECP string values, not booleans', () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);
            manager['onRceDevices']([
                rceDevice(),
                rceDevice({ id: 86, serial_number: 'ESN86', device_type: 'stb', running_device: null })
            ] as any);

            const tvDevice = manager.getAllDevices().find(x => x.key === 's:XY020078HH5S');
            expect(tvDevice.deviceInfo['is-tv']).to.equal('true');
            expect(tvDevice.deviceInfo['is-stick']).to.equal('false');

            const stbDevice = manager.getAllDevices().find(x => x.key === 's:ESN86');
            expect(stbDevice.deviceInfo['is-tv']).to.equal('false');
            expect(stbDevice.deviceInfo['is-stick']).to.equal('false');
        });

        it('maps shutdown and pending statuses, and keys by id when the esn is missing', () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);
            manager['onRceDevices']([
                rceDevice({ id: 84, serial_number: null, status: 'shutdown', running_device: null }),
                rceDevice({ id: 85, serial_number: 'ESN85', status: 'pending', running_device: null })
            ] as any);

            const devices = manager.getAllDevices().filter(x => x.rce);
            const byId = devices.find(x => x.key === 'rce:84');
            expect(byId.deviceState).to.equal('offline');
            expect(byId.lastDeviceState).to.equal('offline');
            const byEsn = devices.find(x => x.key === 's:ESN85');
            expect(byEsn.deviceState).to.equal('pending');
            // a booting cloud device reports online as its last known state so the device filters
            // keep it visible alongside online devices while it starts up
            expect(byEsn.lastDeviceState).to.equal('online');
        });

        it('getAddressLabel labels rce devices as cloud emulator and LAN devices by ip', () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);
            manager['onRceDevices']([rceDevice()] as any);

            const cloudDevice = manager.getAllDevices().find(x => x.rce);
            expect(manager.getAddressLabel(cloudDevice)).to.equal('cloud emulator');
            expect(manager.getAddressLabel({ ip: '192.168.1.100' } as any)).to.equal('192.168.1.100');
        });

        it('getDevice finds rce devices by key and by serial number', () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);
            manager['onRceDevices']([rceDevice()] as any);

            expect(manager.getDevice('s:XY020078HH5S')?.rce?.id).to.equal(83);
            expect(manager.getDevice({ serialNumber: 'XY020078HH5S' })?.rce?.id).to.equal(83);

            manager['onRceDevices']([rceDevice({ serial_number: null })] as any);
            expect(manager.getDevice('rce:83')?.rce?.id).to.equal(83);
        });

        it('a key collision between a configured LAN entry and a cloud device resolves to the cloud device everywhere', () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);
            addDevice(createMockDevice({
                serialNumber: 'XY020078HH5S',
                isConfigured: true,
                isDiscovered: false,
                deviceInfo: { 'default-device-name': 'My LAN Roku' }
            }));
            manager['onRceDevices']([rceDevice()] as any);

            //one row for the key, and it is the same device the key-routed actions resolve to
            const matches = manager.getAllDevices().filter(x => x.key === 's:XY020078HH5S');
            expect(matches).to.have.length(1);
            expect(matches[0].rce).to.exist;
            expect(manager.getDevice('s:XY020078HH5S')?.rce).to.exist;
        });

        it('health checks a cloud device through a finder rescan, including one with no esn yet', async () => {
            const fakeFinder = new EventEmitter() as any;
            fakeFinder.start = () => { };
            fakeFinder.stop = () => { };
            fakeFinder.dispose = () => { };
            fakeFinder.getCachedToken = () => 'secret';
            fakeFinder.scan = sinon.stub().resolves();
            manager = new DeviceManager(vscode.context, mockGlobalStateManager, undefined, fakeFinder);

            //a just-booted device that has not reported an esn yet (keyed rce:83)
            manager['onRceDevices']([rceDevice({ serial_number: null })] as any);
            const device = manager.getAllDevices().find(x => x.rce);
            expect(device.key).to.equal('rce:83');

            expect(await manager.healthCheckDevice(device)).to.be.true;
            expect(fakeFinder.scan.called).to.be.true;

            //the same check reports unhealthy once the rescan shows the device stopped
            manager['onRceDevices']([rceDevice({ serial_number: null, status: 'shutdown', running_device: null })] as any);
            expect(await manager.healthCheckDevice(device)).to.be.false;
        });

        it('consumes the devices event from an injected RceFinder and replaces the list on every poll', () => {
            const fakeFinder = new EventEmitter() as any;
            fakeFinder.start = () => { };
            fakeFinder.stop = () => { };
            fakeFinder.dispose = () => { };
            fakeFinder.getCachedToken = () => 'secret';
            manager = new DeviceManager(vscode.context, mockGlobalStateManager, undefined, fakeFinder);

            fakeFinder.emit('devices', [rceDevice()]);
            expect(manager.getAllDevices().filter(x => x.rce).length).to.equal(1);

            //the next poll replaces the list rather than accumulating
            fakeFinder.emit('devices', []);
            expect(manager.getAllDevices().filter(x => x.rce).length).to.equal(0);
        });

        it('fetches real device-info for running devices and renders it over the synthesized info', async () => {
            const fakeFinder = new EventEmitter() as any;
            fakeFinder.start = () => { };
            fakeFinder.stop = () => { };
            fakeFinder.dispose = () => { };
            fakeFinder.getCachedToken = () => 'secret';
            const getDeviceInfoStub = sinon.stub(rokuDeploy, 'getDeviceInfo').resolves({
                'serial-number': 'XY020078HH5S',
                'friendly-model-name': 'Roku 4K TV',
                'model-number': '2910X',
                'software-version': '15.2.4',
                'user-device-name': ''
            } as any);
            manager = new DeviceManager(vscode.context, mockGlobalStateManager, undefined, fakeFinder);

            manager['onRceDevices']([rceDevice()] as any);
            await manager['resolveRceDevices']();

            //probed through roku-deploy's device option using the live instance url
            expect(getDeviceInfoStub.getCall(0).args[0].device).to.eql({
                instanceUrl: 'https://device.rce.roku.com/instance/abc',
                rceToken: 'secret'
            });

            const device = manager.getAllDevices().find(x => x.rce);
            //real device-info fields render
            expect(device.deviceInfo['model-number']).to.equal('2910X');
            expect(device.deviceInfo['friendly-model-name']).to.equal('Roku 4K TV');
            //the management-api device name still wins for display
            expect(device.deviceInfo['user-device-name']).to.equal('Chris');
        });

        it('health checks rce devices through the management api instead of a LAN probe', async () => {
            const fakeFinder = new EventEmitter() as any;
            fakeFinder.start = () => { };
            fakeFinder.stop = () => { };
            fakeFinder.dispose = () => { };
            let scanCount = 0;
            fakeFinder.scan = () => {
                scanCount++;
                return Promise.resolve();
            };
            fakeFinder.getCachedToken = () => 'secret';
            const getDeviceInfoStub = sinon.stub(rokuDeploy, 'getDeviceInfo').resolves({} as any);
            manager = new DeviceManager(vscode.context, mockGlobalStateManager, undefined, fakeFinder);
            manager['onRceDevices']([rceDevice()] as any);

            const healthy = await manager.healthCheckDevice({ serialNumber: 'XY020078HH5S' });

            expect(scanCount).to.equal(1);
            expect(healthy).to.be.true;
            //no LAN probe was attempted (there is no ip to probe); resolveRceDevices may still probe
            //the device through its precomputed RCE device option in the background
            expect(getDeviceInfoStub.getCalls().some(call => 'host' in (call.args[0].device as any))).to.be.false;
        });

        it('refreshes rce devices when health checking all devices, including with no LAN devices at all', async () => {
            const fakeFinder = new EventEmitter() as any;
            fakeFinder.start = () => { };
            fakeFinder.stop = () => { };
            fakeFinder.dispose = () => { };
            let scanCount = 0;
            fakeFinder.scan = () => {
                scanCount++;
                return Promise.resolve();
            };
            fakeFinder.getCachedToken = () => 'secret';
            manager = new DeviceManager(vscode.context, mockGlobalStateManager, undefined, fakeFinder);
            manager['onRceDevices']([rceDevice()] as any);
            sinon.stub(manager as any, 'ensureDeviceFresh').returns(Promise.resolve(undefined) as any);

            //no configured or discovered LAN devices: the no-LAN-ips early return must still scan
            await manager['healthCheckAllDevices']();
            expect(scanCount).to.equal(1);

            //with LAN devices present the scan rides alongside the LAN probes
            addDevice(createMockDevice({ serialNumber: 'device-1', ip: '192.168.1.101' }));
            await manager['healthCheckAllDevices']();
            expect(scanCount).to.equal(2);
        });

        it('ensureDeviceFresh never probes rce devices and reports their management-api state', async () => {
            const getDeviceInfoStub = sinon.stub(rokuDeploy, 'getDeviceInfo').resolves({} as any);
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);
            manager['onRceDevices']([rceDevice()] as any);
            const device = manager.getDevice('s:XY020078HH5S');

            expect(await manager['ensureDeviceFresh'](device)).to.equal(device);
            //no LAN probe was attempted (there is no ip to probe); resolveRceDevices may still probe
            //the device through its precomputed RCE device option in the background
            expect(getDeviceInfoStub.getCalls().some(call => 'host' in (call.args[0].device as any))).to.be.false;
        });

        it('skips the device-info fetch for devices that are not running or have no esn', async () => {
            const getDeviceInfoStub = sinon.stub(rokuDeploy, 'getDeviceInfo').resolves({} as any);
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);
            manager['onRceDevices']([
                rceDevice({ status: 'shutdown', running_device: null }),
                rceDevice({ id: 99, serial_number: null })
            ] as any);

            await manager['resolveRceDevices']();

            expect(getDeviceInfoStub.called).to.be.false;
        });

        it('builds a running device\'s device connection option as {instanceUrl, rceToken}', () => {
            const fakeFinder = new EventEmitter() as any;
            fakeFinder.start = () => { };
            fakeFinder.stop = () => { };
            fakeFinder.dispose = () => { };
            fakeFinder.getCachedToken = () => 'secret';
            manager = new DeviceManager(vscode.context, mockGlobalStateManager, undefined, fakeFinder);

            manager['onRceDevices']([rceDevice()] as any);

            const device = manager.getAllDevices().find(x => x.rce);
            expect(device.device).to.eql({ instanceUrl: 'https://device.rce.roku.com/instance/abc', rceToken: 'secret' });
        });

        it('builds a stopped device\'s device connection option as {id, rceToken}', () => {
            const fakeFinder = new EventEmitter() as any;
            fakeFinder.start = () => { };
            fakeFinder.stop = () => { };
            fakeFinder.dispose = () => { };
            fakeFinder.getCachedToken = () => 'secret';
            manager = new DeviceManager(vscode.context, mockGlobalStateManager, undefined, fakeFinder);

            manager['onRceDevices']([rceDevice({ id: 84, status: 'shutdown', running_device: null })] as any);

            const device = manager.getAllDevices().find(x => x.rce);
            expect(device.device).to.eql({ id: 84, rceToken: 'secret' });
        });

        it('resolveRceDevices probes through the precomputed device option without calling getDeviceConfig', async () => {
            const fakeFinder = new EventEmitter() as any;
            fakeFinder.start = () => { };
            fakeFinder.stop = () => { };
            fakeFinder.dispose = () => { };
            fakeFinder.getCachedToken = () => 'secret';
            const getDeviceConfigSpy = sinon.stub().resolves(undefined);
            fakeFinder.getDeviceConfig = getDeviceConfigSpy;
            const getDeviceInfoStub = sinon.stub(rokuDeploy, 'getDeviceInfo').resolves({} as any);
            manager = new DeviceManager(vscode.context, mockGlobalStateManager, undefined, fakeFinder);

            manager['onRceDevices']([rceDevice()] as any);
            await manager['resolveRceDevices']();

            expect(getDeviceConfigSpy.called).to.be.false;
            expect(getDeviceInfoStub.getCall(0).args[0].device).to.eql({
                instanceUrl: 'https://device.rce.roku.com/instance/abc',
                rceToken: 'secret'
            });
        });

        describe('getDeviceByDeviceConfig', () => {
            function createFakeFinderManager(): DeviceManager {
                const fakeFinder = new EventEmitter() as any;
                fakeFinder.start = () => { };
                fakeFinder.stop = () => { };
                fakeFinder.dispose = () => { };
                fakeFinder.getCachedToken = () => 'secret';
                const testManager = new DeviceManager(vscode.context, mockGlobalStateManager, undefined, fakeFinder);
                testManager['onRceDevices']([
                    rceDevice(),
                    rceDevice({ id: 84, serial_number: 'ESN84', status: 'shutdown', running_device: null })
                ] as any);
                return testManager;
            }

            it('resolves a Roku Cloud Emulator device by esn', () => {
                manager = createFakeFinderManager();

                const device = manager.getDeviceByDeviceConfig({ esn: 'ESN84', rceToken: 'secret' });

                expect(device?.rce?.id).to.equal(84);
            });

            it('resolves a Roku Cloud Emulator device by management-api id', () => {
                manager = createFakeFinderManager();

                const device = manager.getDeviceByDeviceConfig({ id: 84, rceToken: 'secret' });

                expect(device?.rce?.id).to.equal(84);
            });

            it('resolves a Roku Cloud Emulator device by instanceUrl', () => {
                manager = createFakeFinderManager();

                const device = manager.getDeviceByDeviceConfig({ instanceUrl: 'https://device.rce.roku.com/instance/abc', rceToken: 'secret' });

                expect(device?.rce?.id).to.equal(83);
            });

            it('resolves a local device by host', () => {
                manager = new DeviceManager(vscode.context, mockGlobalStateManager);
                addDiscoveredDevice(createMockDevice({ serialNumber: 'lan-device', ip: '192.168.1.55' }));

                const device = manager.getDeviceByDeviceConfig({ host: '192.168.1.55' });

                expect(device?.serialNumber).to.equal('lan-device');
            });

            it('returns undefined when nothing matches', () => {
                manager = createFakeFinderManager();

                expect(manager.getDeviceByDeviceConfig({ id: 999999 })).to.be.undefined;
                expect(manager.getDeviceByDeviceConfig({ host: '10.0.0.1' })).to.be.undefined;
            });
        });
    });
    /* eslint-enable camelcase */

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

        //NOTE: ssdp:alive deliberately does NOT trigger eager health checks — the background refresh
        //on read covers uncached devices when a view actually asks for the list (spec:
        //"Passive SSDP announcements" / "Lazy hydration on read" in the design doc)
    });

    describe('notifyFocusGained', () => {
        it('starts the network change monitor and does NOT health-check devices', () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);

            manager['discoveredDevices'].push({ ip: '192.168.1.100' });
            const startStub = sinon.stub(manager['networkChangeMonitor'], 'start');
            const resolveStub = sinon.stub(manager as any, 'ensureDeviceFresh').returns(Promise.resolve(true) as any);

            manager['notifyFocusGained']();

            expect(startStub.calledOnce).to.be.true;
            expect(resolveStub.called).to.be.false;
        });
    });

    describe('scan responders refresh via the read path (spec: "responds to an M-SEARCH — hydrate it immediately")', () => {
        function flush(): Promise<void> {
            return new Promise(resolve => {
                setTimeout(resolve, 5);
            });
        }

        it('an unknown responder with cache in the 5min–8h dead zone is refreshed on the next read', async () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);
            const rokuDeployStub = sinon.stub(rokuDeploy, 'getDeviceInfo').resolves({ 'serial-number': 'SCAN70' } as any);
            sinon.stub(manager as any, 'randomDelay').resolves();

            //cache aged past the 5-min freshness check (so the responder lands `unknown`) but
            //younger than the 8-hour read trust window — the exact gap that used to strand
            //the device grey forever
            mockGlobalStateManager.setCachedDevice('SCAN70', {
                serialNumber: 'SCAN70',
                deviceInfo: { 'serial-number': 'SCAN70' },
                createdAt: Date.now() - (10 * 60 * 1_000)
            });
            manager['finder'].emit('found', '192.168.1.70', { serialNumber: 'SCAN70' });

            //the emit above makes a visible view re-read; simulate that read
            manager.getAllDevices();
            await flush();

            expect(rokuDeployStub.calledOnce).to.be.true;
            expect(manager.getDevice({ ip: '192.168.1.70' }).deviceState).to.equal('online');
        });

        it('repeated M-SEARCH answers do not double-fetch (freshness guard)', async () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);
            const rokuDeployStub = sinon.stub(rokuDeploy, 'getDeviceInfo').resolves({ 'serial-number': 'SCAN70' } as any);
            sinon.stub(manager as any, 'randomDelay').resolves();

            manager['finder'].emit('found', '192.168.1.70', { serialNumber: 'SCAN70' });
            manager.getAllDevices();
            await flush();
            manager['finder'].emit('found', '192.168.1.70', { serialNumber: 'SCAN70' });
            manager.getAllDevices();
            await flush();

            expect(rokuDeployStub.calledOnce).to.be.true;
        });
    });

    describe('peekDevice (internal read)', () => {
        it('reads a device without scheduling any background work', () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);
            const ensureStub = sinon.stub(manager as any, 'ensureDeviceFresh');
            manager['discoveredDevices'].push({ ip: '192.168.1.90', serialNumber: 'PEEK90' });
            manager['setDeviceState']({ ip: '192.168.1.90', serialNumber: 'PEEK90' }, 'unknown');

            const device = manager['peekDevice']({ ip: '192.168.1.90' });

            //an unknown device read through getDevice would schedule a refresh; peek must not
            expect(device.serialNumber).to.equal('PEEK90');
            expect(ensureStub.called).to.be.false;
        });
    });

    describe('background refresh on read', () => {
        function flush(): Promise<void> {
            return new Promise(resolve => {
                setTimeout(resolve, 5);
            });
        }

        it('starts a background refresh for an unknown device with no cached deviceInfo', async () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);
            const resolveStub = sinon.stub(manager as any, 'ensureDeviceFresh').returns(Promise.resolve(true) as any);

            //a bare {ip, serial} entry, e.g. from ssdp:alive — no cache seeded
            manager['discoveredDevices'].push({ ip: '192.168.1.50', serialNumber: 'no-cache-1' });
            manager['setDeviceState']({ ip: '192.168.1.50', serialNumber: 'no-cache-1' }, 'unknown');

            manager.getAllDevices();
            await flush();

            expect(resolveStub.calledOnce).to.be.true;
            expect(resolveStub.firstCall.args[0]).to.include({ ip: '192.168.1.50', serialNumber: 'no-cache-1' });
            //silent background refresh: no synthetic delay, cache trusted
            expect(resolveStub.firstCall.args[1]).to.eql({ maxAgeMs: manager['ON_READ_TRUST_MS'], syntheticDelay: false });
        });

        it('does not fetch for a device whose knowledge is fresh', async () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);
            const rokuDeployStub = sinon.stub(rokuDeploy, 'getDeviceInfo');

            const device = createMockDevice({ serialNumber: 'fresh-1', ip: '192.168.1.51', deviceInfo: { 'default-device-name': 'Roku Express' } });
            addDevice(device);
            manager['lastCheckedByIp'].set('192.168.1.51', Date.now());

            manager.getAllDevices();
            await flush();

            expect(rokuDeployStub.called).to.be.false;
        });

        it('refreshes a device whose knowledge is older than the read trust window, regardless of state', async () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);
            const resolveStub = sinon.stub(manager as any, 'ensureDeviceFresh').returns(Promise.resolve(true) as any);

            const device = createMockDevice({ serialNumber: 'old-1', ip: '192.168.1.52', deviceInfo: { 'default-device-name': 'Roku Express' } });
            addDevice(device);
            //age the cache past the read trust window
            mockGlobalStateManager.setCachedDevice('old-1', {
                serialNumber: 'old-1',
                deviceInfo: { 'serial-number': 'old-1' },
                createdAt: Date.now() - (8 * 60 * 60 * 1_000) - 1
            });

            manager.getAllDevices();
            await flush();

            expect(resolveStub.calledOnce).to.be.true;
        });

        it('does not re-check a pending device (a check is already in flight)', async () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);
            const rokuDeployStub = sinon.stub(rokuDeploy, 'getDeviceInfo');

            manager['discoveredDevices'].push({ ip: '192.168.1.53', serialNumber: 'pending-1' });
            manager['setDeviceState']({ ip: '192.168.1.53', serialNumber: 'pending-1' }, 'pending');
            //a pending device always carries a fresh attempt stamp (set right before pending)
            manager['lastCheckedByIp'].set('192.168.1.53', Date.now());

            manager.getAllDevices();
            await flush();

            expect(rokuDeployStub.called).to.be.false;
        });

        it('rate-limits repeated attempts per IP (a failing device is not hammered on every read)', async () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);
            const rokuDeployStub = sinon.stub(rokuDeploy, 'getDeviceInfo').rejects(new Error('Unreachable'));

            //configured so the failing device persists in the list instead of being removed
            addConfiguredDevice(createMockDevice({ serialNumber: 'flaky-1', ip: '192.168.1.54', isConfigured: true, deviceState: 'unknown' }));

            //views re-read on every devices-changed - simulate several rapid reads
            manager.getAllDevices();
            await flush();
            manager.getAllDevices();
            manager.getAllDevices();
            await flush();

            //the failed attempt counts as knowledge, so re-reads stay off the network
            expect(rokuDeployStub.calledOnce).to.be.true;
        });

        it('getDevice (single lookup) also triggers the background refresh', async () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);
            const resolveStub = sinon.stub(manager as any, 'ensureDeviceFresh').returns(Promise.resolve(true) as any);

            manager['discoveredDevices'].push({ ip: '192.168.1.55', serialNumber: 'single-1' });
            manager['setDeviceState']({ ip: '192.168.1.55', serialNumber: 'single-1' }, 'unknown');

            manager.getDevice({ ip: '192.168.1.55' });
            await flush();

            expect(resolveStub.calledOnce).to.be.true;
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

            // Call twice SEQUENTIALLY - both should hit network (in-flight sharing only applies
            // to concurrent callers; a settled request is not reused)
            await manager.getDeviceInfo('192.168.1.100', 8060);
            await manager.getDeviceInfo('192.168.1.100', 8060);

            // fetchDeviceInfo always makes network calls (caching is in ensureDeviceFresh)
            expect(getDeviceInfoStub.callCount).to.equal(2);
        });
    });

    describe('getDeviceInfo in-flight de-dupe (the design doc\'s "de-dupe rule")', () => {
        it('shares a single HTTP request between concurrent callers for the same ip:port', async () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);

            let resolveFetch: (value: any) => void;
            const getDeviceInfoStub = sinon.stub(rokuDeploy, 'getDeviceInfo').returns(new Promise((resolve) => {
                resolveFetch = resolve;
            }) as any);

            //e.g. the broadcast response and the reconcile racing on the same device
            const first = manager.getDeviceInfo('192.168.1.10', 8060);
            const second = manager.getDeviceInfo('192.168.1.10', 8060);

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
                manager.getDeviceInfo('192.168.1.10', 8060),
                manager.getDeviceInfo('192.168.1.11', 8060)
            ]);

            expect(getDeviceInfoStub.calledTwice).to.be.true;
        });

        it('shares failures too (joiners get undefined, no unhandled rejection)', async () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);
            const getDeviceInfoStub = sinon.stub(rokuDeploy, 'getDeviceInfo').rejects(new Error('Unreachable'));

            const [first, second] = await Promise.all([
                manager.getDeviceInfo('192.168.1.10', 8060),
                manager.getDeviceInfo('192.168.1.10', 8060)
            ]);

            expect(getDeviceInfoStub.calledOnce).to.be.true;
            expect(first).to.be.undefined;
            expect(second).to.be.undefined;
        });
    });

    describe('ensureDeviceFresh caching', () => {
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

            // Call twice in rapid succession via ensureDeviceFresh
            await manager['ensureDeviceFresh'](device, { syntheticDelay: false });
            await manager['ensureDeviceFresh'](device, { syntheticDelay: false });

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
                await manager['ensureDeviceFresh'](device, { syntheticDelay: false });
                expect(getDeviceInfoStub.callCount).to.equal(1);

                // Advance past TTL (5 minutes)
                clock.tick((5 * 60 * 1_000) + 1);

                // Second call - cache expired, should hit network again
                await manager['ensureDeviceFresh'](device, { syntheticDelay: false });
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
            await manager['ensureDeviceFresh'](device1, { syntheticDelay: false });
            await manager['ensureDeviceFresh'](device2, { syntheticDelay: false });

            // Should make two network calls (different serials)
            expect(getDeviceInfoStub.callCount).to.equal(2);

            // Calling same devices again should use cache (keyed by serial)
            await manager['ensureDeviceFresh'](device1, { syntheticDelay: false });
            await manager['ensureDeviceFresh'](device2, { syntheticDelay: false });

            // Still only two calls (cache hit)
            expect(getDeviceInfoStub.callCount).to.equal(2);
        });

        it('refetches on network change when serial unknown (IP→serial mapping is network-specific)', async () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);

            // Device with unknown serial (only IP known) - like a newly discovered device
            const deviceIpOnly = { ip: '192.168.1.100' };
            manager['discoveredDevices'].push({ ip: '192.168.1.100' });

            const getDeviceInfoStub = sinon.stub(rokuDeploy, 'getDeviceInfo').resolves({
                'device-id': 'device-123',
                'serial-number': 'device-123',
                'default-device-name': 'Roku Express'
            } as any);

            // Stub random delay to be instant
            sinon.stub(manager as any, 'randomDelay').resolves();

            // First call - fetches from network (no cache, no IP→serial mapping)
            await manager['ensureDeviceFresh'](deviceIpOnly, { syntheticDelay: false });
            expect(getDeviceInfoStub.callCount).to.equal(1);

            // Now we have IP→serial mapping. Second call should use cache.
            await manager['ensureDeviceFresh'](deviceIpOnly, { syntheticDelay: false });
            expect(getDeviceInfoStub.callCount).to.equal(1);

            // Simulate network change
            (NetworkChangeMonitorModule.getNetworkHash as sinon.SinonStub).returns('new-network-hash');
            manager['networkChangeMonitor']['onNetworkChanged']();
            await util.sleep(10);

            // On new network, IP→serial mapping is cleared.
            // Resolving by IP alone should refetch since we can't look up the serial.
            await manager['ensureDeviceFresh'](deviceIpOnly, { syntheticDelay: false });
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
            await manager['ensureDeviceFresh'](device, { syntheticDelay: false });
            expect(getDeviceInfoStub.callCount).to.equal(1);

            // Verify cache is working
            await manager['ensureDeviceFresh'](device, { syntheticDelay: false });
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
            await manager['ensureDeviceFresh'](device, { syntheticDelay: false });
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

        it('submits broadcast + reconcile orders when the network changes', () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);

            // Change the network hash
            (NetworkChangeMonitorModule.getNetworkHash as sinon.SinonStub).returns('new-network-hash');

            // Trigger the network change callback directly
            manager['networkChangeMonitor']['onNetworkChanged']();

            expect(manager.getPendingBroadcastReasons()).to.include('network');
            expect(manager.getPendingReconcileReasons()).to.include('network');
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

            it('builds a roku-deploy-compatible {host} device connection option', () => {
                manager = new DeviceManager(vscode.context, mockGlobalStateManager);

                addDiscoveredDevice(createMockDevice({
                    serialNumber: 'device-456',
                    ip: '192.168.1.77',
                    deviceState: 'online'
                }));

                const device = manager.getAllDevices()[0];
                expect(device.device).to.eql({ host: '192.168.1.77' });
            });
        });

        describe('healthCheckDevice with failed network calls', () => {
            it('marks configured device as offline when health check fails and cache exists', async () => {
                manager = new DeviceManager(vscode.context, mockGlobalStateManager);
                sinon.stub(manager as any, 'randomDelay').resolves();
                sinon.stub(manager as any, 'submitUnhealthyDeviceBroadcast');

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

                const result = await manager['ensureDeviceFresh'](device, { maxAgeMs: 0, syntheticDelay: false });

                expect(result).to.be.undefined;
                expect(manager.getAllDevices().length).to.equal(1);
                expect(manager.getAllDevices()[0].deviceState).to.equal('offline');
            });

            it('marks configured device as offline when health check fails and no cache exists', async () => {
                manager = new DeviceManager(vscode.context, mockGlobalStateManager);
                sinon.stub(manager as any, 'randomDelay').resolves();
                sinon.stub(manager as any, 'submitUnhealthyDeviceBroadcast');

                const device = createMockDevice({
                    serialNumber: 'device-123',
                    isConfigured: true
                });
                addDevice(device);

                // Simulate no cache - view layer uses hasDeviceCache() to show warning icon
                mockGlobalStateManager.getCachedDevice.returns(undefined);

                // Stub to simulate network failure
                sinon.stub(rokuDeploy, 'getDeviceInfo').rejects(new Error('Device not responding'));

                const result = await manager['ensureDeviceFresh'](device, { maxAgeMs: 0, syntheticDelay: false });

                expect(result).to.be.undefined;
                expect(manager.getAllDevices().length).to.equal(1);
                // State is always 'offline' - icon logic uses cache check to distinguish
                expect(manager.getAllDevices()[0].deviceState).to.equal('offline');
                // hasDeviceCache() would return false, triggering warning icon in view
                expect(manager.hasDeviceCache('device-123')).to.equal(false);
            });

            it('removes discovered-only device when health check fails', async () => {
                manager = new DeviceManager(vscode.context, mockGlobalStateManager);
                sinon.stub(manager as any, 'randomDelay').resolves();
                sinon.stub(manager as any, 'submitUnhealthyDeviceBroadcast');

                const device = createMockDevice({
                    serialNumber: 'device-123',
                    isConfigured: false
                });
                addDevice(device);

                // Stub to simulate network failure
                sinon.stub(rokuDeploy, 'getDeviceInfo').rejects(new Error('Device not responding'));

                const result = await manager['ensureDeviceFresh'](device, { maxAgeMs: 0, syntheticDelay: false });

                expect(result).to.be.undefined;
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
                sinon.stub(manager as any, 'submitUnhealthyDeviceBroadcast');

                const device = createMockDevice({
                    ip: '192.168.1.100',
                    serialNumber: 'ABC123',
                    isConfigured: true,
                    isDiscovered: true
                });
                addDevice(device);

                sinon.stub(rokuDeploy, 'getDeviceInfo').rejects(new Error('Offline'));

                await manager['ensureDeviceFresh'](device, { maxAgeMs: 0, syntheticDelay: false });

                // Device kept (configured) but not discovered
                expect(manager.getAllDevices().length).to.equal(1);
                expect(manager.getAllDevices()[0].isDiscovered).to.be.false;
                expect(manager.getAllDevices()[0].deviceState).to.equal('offline');
            });

            it('removes discovered-only device when health check fails', async () => {
                manager = new DeviceManager(vscode.context, mockGlobalStateManager);
                sinon.stub(manager as any, 'randomDelay').resolves();
                sinon.stub(manager as any, 'submitUnhealthyDeviceBroadcast');

                const device = createMockDevice({
                    ip: '192.168.1.100',
                    serialNumber: 'ABC123',
                    isConfigured: false, // Not configured
                    isDiscovered: true // Only discovered
                });
                addDevice(device);

                sinon.stub(rokuDeploy, 'getDeviceInfo').rejects(new Error('Offline'));

                await manager['ensureDeviceFresh'](device, { maxAgeMs: 0, syntheticDelay: false });

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

                await manager['ensureDeviceFresh']({ ip: '192.168.1.100' });

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

                //record fresh knowledge so the read below doesn't queue a hydration for the fixture
                manager['lastCheckedByIp'].set('192.168.1.101', Date.now());

                // Only configured device should remain (state unchanged - reset happens in network change handler)
                expect(manager.getAllDevices().length).to.equal(1);
                const serial = manager.getAllDevices()[0].serialNumber;
                expect(serial).to.equal('configured-1');
                expect(manager.getAllDevices()[0].deviceState).to.equal('online');
            });
        });

        describe('ensureDeviceFresh', () => {
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

                await manager['ensureDeviceFresh'](device);

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
                    await manager['ensureDeviceFresh'](device);
                    expect(getDeviceInfoStub.calledOnce).to.be.true;

                    // Second call should use cache (no new network call)
                    await manager['ensureDeviceFresh'](device);
                    expect(getDeviceInfoStub.calledOnce).to.be.true; // Still just one call

                    // Clear cache (clears globalStateManager.deviceCache and IP→serial mappings)
                    manager.clearAllCache();

                    // Re-add the device (clearAllCache removes discovered devices)
                    addDevice(device);

                    // Now health check should hit network again (cache was cleared)
                    await manager['ensureDeviceFresh'](device);
                    expect(getDeviceInfoStub.calledTwice).to.be.true;
                });

                it('clears the lastCheckedByIp knowledge map', () => {
                    manager = new DeviceManager(vscode.context, mockGlobalStateManager);

                    const device = createMockDevice();
                    manager['lastCheckedByIp'].set(device.ip, Date.now());

                    manager.clearAllCache();

                    expect(manager['lastCheckedByIp'].has(device.ip)).to.be.false;
                });
            });

            describe('scan state handling', () => {
                it('ends any in-progress scan WITHOUT stopping the passive SSDP listener', () => {
                    manager = new DeviceManager(vscode.context, mockGlobalStateManager);

                    const stopScanSpy = sinon.spy(manager['finder'], 'stopScan');
                    const stopSpy = sinon.spy(manager['finder'], 'stop');

                    manager.clearAllCache();

                    expect(stopScanSpy.calledOnce).to.be.true;
                    //stopping the listener would leave the device list empty until the next
                    //explicit scan — alive/byebye announcements must keep flowing after a clear
                    expect(stopSpy.called).to.be.false;
                });
            });

            describe('functionality verification', () => {
                it('allows immediate rescan after clear', () => {
                    manager = new DeviceManager(vscode.context, mockGlobalStateManager);
                    //the suite-wide config stub disables discovery; this test is about the staleness half of the gate
                    sinon.stub(manager as any, 'deviceDiscoveryEnabled').get(() => true);

                    // Simulate recent scan
                    manager['lastScanDate'] = new Date();
                    sinon.stub(manager['finder'], 'scan');

                    // a stale broadcast is gated: the last scan is too recent
                    let scanStarted = manager['broadcast'](['stale']);
                    expect(scanStarted).to.be.false;

                    // Clear cache
                    manager.clearAllCache();

                    // Now scan should be allowed (lastScanDate is null, timeSinceLastScan is Infinity)
                    scanStarted = manager['broadcast'](['stale']);
                    expect(scanStarted).to.be.true;
                });

                it('health check runs immediately after clear', async () => {
                    manager = new DeviceManager(vscode.context, mockGlobalStateManager);

                    const device = createMockDevice();
                    const resolveDeviceSpy = sinon.stub(manager as any, 'ensureDeviceFresh').returns(Promise.resolve(true));

                    // First health check
                    await manager['ensureDeviceFresh'](device);
                    expect(resolveDeviceSpy.calledOnce).to.be.true;

                    // Clear cache (should clear cooldown)
                    manager.clearAllCache();

                    // Health check should run immediately (no cooldown)
                    await manager['ensureDeviceFresh'](device);
                    expect(resolveDeviceSpy.calledTwice).to.be.true;
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
                // (this is what ensureDeviceFresh does when it successfully fetches deviceInfo)
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

        describe('ensureDeviceFresh', () => {
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

                await manager['ensureDeviceFresh'](newDevice);

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

                await manager['ensureDeviceFresh'](newDevice);

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

                await manager['ensureDeviceFresh'](device2);

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
                sinon.stub(manager as any, 'submitUnhealthyDeviceBroadcast');

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
                getDeviceInfoStub.withArgs(sinon.match({ device: { host: '192.168.1.100' } })).rejects(new Error('Unreachable'));
                getDeviceInfoStub.withArgs(sinon.match({ device: { host: '192.168.1.50' } })).resolves({
                    'serial-number': 'XYZ',
                    'device-id': 'XYZ',
                    'default-device-name': 'Roku Express'
                } as any);

                // Resolve both concurrently (simulating race condition)
                await Promise.all([
                    manager['ensureDeviceFresh']({ ip: '192.168.1.100', serialNumber: 'XYZ', isDiscovered: false } as any),
                    manager['ensureDeviceFresh']({ ip: '192.168.1.50', serialNumber: 'XYZ', isDiscovered: true } as any)
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
                sinon.stub(manager as any, 'submitUnhealthyDeviceBroadcast');

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
                getDeviceInfoStub.withArgs(sinon.match({ device: { host: '192.168.1.100' } })).rejects(new Error('Unreachable'));
                getDeviceInfoStub.withArgs(sinon.match({ device: { host: '192.168.1.50' } })).resolves({
                    'serial-number': 'XYZ',
                    'device-id': 'XYZ',
                    'default-device-name': 'Roku Express'
                } as any);

                // Resolve in OPPOSITE order: wrong IP first, then correct IP
                await manager['ensureDeviceFresh']({ ip: '192.168.1.100', serialNumber: 'XYZ', isDiscovered: false } as any);
                await manager['ensureDeviceFresh']({ ip: '192.168.1.50', serialNumber: 'XYZ', isDiscovered: true } as any);

                // Should still show online
                expect(manager.getAllDevices().length).to.equal(1);
                expect(manager.getAllDevices()[0].deviceState).to.equal('online');

                // Now test the reverse order: correct IP first, then wrong IP
                getDeviceInfoStub.reset();
                getDeviceInfoStub.withArgs(sinon.match({ device: { host: '192.168.1.100' } })).rejects(new Error('Unreachable'));
                getDeviceInfoStub.withArgs(sinon.match({ device: { host: '192.168.1.50' } })).resolves({
                    'serial-number': 'XYZ',
                    'device-id': 'XYZ',
                    'default-device-name': 'Roku Express'
                } as any);

                await manager['ensureDeviceFresh']({ ip: '192.168.1.50', serialNumber: 'XYZ', isDiscovered: true } as any);
                await manager['ensureDeviceFresh']({ ip: '192.168.1.100', serialNumber: 'XYZ', isDiscovered: false } as any);

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
            it('reloads configured devices when ensureDeviceFresh detects serial mismatch', async () => {
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
                await manager['ensureDeviceFresh'](device);

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
                await manager['ensureDeviceFresh']({ ip: '192.168.1.100' });

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
                await manager['ensureDeviceFresh'](device);

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
