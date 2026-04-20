import { expect } from 'chai';
import * as sinon from 'sinon';
import { rokuDeploy } from 'roku-deploy';
import { vscode } from '../mockVscode.spec';
import type { RokuDevice } from './DeviceManager';
import { DeviceManager } from './DeviceManager';
import * as NetworkChangeMonitorModule from './NetworkChangeMonitor';
import { util } from '../util';

describe('DeviceManager', () => {
    let manager: DeviceManager;
    let mockGlobalStateManager: any;

    function createMockDevice(overrides: Partial<RokuDevice> & { deviceInfo?: any; serialNumber?: string | null } = {}): RokuDevice {
        const serialNumber = overrides.serialNumber ?? 'device-123';
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
            serialNumber: device.serialNumber,
            deviceState: device.deviceState === 'offline' ? 'pending' : (device.deviceState as 'pending' | 'online')
        });
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
            deviceState: device.deviceState,
            configuredIn: device.configuredIn
        });
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
            clearDeviceCache: sinon.stub(),
            clearSerialNumberByIpForNetwork: sinon.stub(),
            clearExpiredEntriesSerialNumberByIpForNetwork: sinon.stub()
        };

        // Mock vscode configuration
        sinon.stub(vscode.workspace, 'getConfiguration').returns({
            get: () => undefined,
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

    describe('setScanNeeded', () => {
        it('emits event when scanNeeded is false', () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);

            const eventSpy = sinon.spy();
            manager.on('scanNeeded-changed', eventSpy);

            manager['setScanNeeded']();

            expect(eventSpy.calledOnce).to.be.true;
        });

        it('does not emit event when scanNeeded is already true', () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);
            manager['setScanNeeded'](); // Set to true first

            const eventSpy = sinon.spy();
            manager.on('scanNeeded-changed', eventSpy);

            manager['setScanNeeded'](); // Set to true again

            expect(eventSpy.called).to.be.false;
        });

    });

    describe('timeSinceLastScan', () => {
        it('returns Infinity when no scan has occurred', () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);
            expect(manager['timeSinceLastScan']).to.equal(Infinity);
        });

        it('returns elapsed time after refresh', () => {
            const clock = sinon.useFakeTimers();
            try {
                manager = new DeviceManager(vscode.context, mockGlobalStateManager);

                manager.refresh(true);

                clock.tick(5_000);

                expect(manager['timeSinceLastScan']).to.be.greaterThanOrEqual(5_000);
            } finally {
                clock.restore();
            }
        });
    });

    describe('on', () => {
        it('registers handler and returns unsubscribe function', () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);

            const handler = sinon.spy();
            const unsubscribe = manager.on('scanNeeded-changed', handler);

            manager['setScanNeeded']();
            expect(handler.calledOnce).to.be.true;

            unsubscribe();

            // Reset via refresh and try again
            manager.refresh(true);
            manager['setScanNeeded']();
            expect(handler.calledOnce).to.be.true; // Still just one call (unsubscribed)
        });

        it('adds to disposables array if provided', () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);

            const disposables: any[] = [];
            manager.on('scanNeeded-changed', () => { }, disposables);

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

    describe('refresh', () => {
        it('resets scanNeeded flag (allows event to fire again)', () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);

            const eventSpy = sinon.spy();
            manager.on('scanNeeded-changed', eventSpy);

            manager['setScanNeeded']();
            expect(eventSpy.calledOnce).to.be.true;

            // Before refresh, calling setScanNeeded again should not emit
            manager['setScanNeeded']();
            expect(eventSpy.calledOnce).to.be.true;

            // After refresh, the flag is reset so event should fire again
            manager.refresh(true);
            manager['setScanNeeded']();
            expect(eventSpy.calledTwice).to.be.true;
        });

        it('sets lastScanDate', () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);

            expect(manager['timeSinceLastScan']).to.equal(Infinity);

            manager.refresh(true);

            // After refresh, timeSinceLastScan should be very small (just happened)
            expect(manager['timeSinceLastScan']).to.be.lessThan(100);
        });

        it('calls checkDevicesHealth with force flag', () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);

            const checkDevicesHealthSpy = sinon.stub(manager as any, 'checkDevicesHealth').resolves();

            manager.refresh(true);
            expect(checkDevicesHealthSpy.calledWith(true)).to.be.true;

            manager.refresh(false);
            expect(checkDevicesHealthSpy.calledWith(false)).to.be.true;

            manager.refresh(); // defaults to false
            expect(checkDevicesHealthSpy.calledWith(false)).to.be.true;
        });
    });

    describe('scan', () => {
        it('triggers discovery without health checking', () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);

            const discoverAllSpy = sinon.spy(manager as any, 'discoverAll');
            const checkDevicesHealthSpy = sinon.spy(manager as any, 'checkDevicesHealth');

            manager.scan(true);

            expect(discoverAllSpy.calledOnce).to.be.true;
            expect(checkDevicesHealthSpy.called).to.be.false;
        });

        it('respects deviceDiscoveryEnabled when force=false', () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);
            sinon.stub(manager as any, 'deviceDiscoveryEnabled').get(() => false);

            const discoverAllSpy = sinon.spy(manager as any, 'discoverAll');

            const result = manager.scan(false);

            expect(result).to.be.false;
            expect(discoverAllSpy.called).to.be.false;
        });

        it('ignores deviceDiscoveryEnabled when force=true', () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);
            sinon.stub(manager as any, 'deviceDiscoveryEnabled').get(() => false);

            const discoverAllSpy = sinon.spy(manager as any, 'discoverAll');

            const result = manager.scan(true);

            expect(result).to.be.true;
            expect(discoverAllSpy.calledOnce).to.be.true;
        });

        it('emits scan-started event', () => {
            const clock = sinon.useFakeTimers();
            try {
                manager = new DeviceManager(vscode.context, mockGlobalStateManager);

                const scanStartedSpy = sinon.spy();
                manager.on('scan-started', scanStartedSpy);

                manager.scan(true);

                expect(scanStartedSpy.calledOnce).to.be.true;
            } finally {
                clock.restore();
            }
        });
    });

    describe('checkDevicesHealth', () => {
        it('sets all devices to pending and checks all when force=true', async () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);

            const device1 = createMockDevice({ serialNumber: 'device-1', ip: '192.168.1.101' });
            const device2 = createMockDevice({ serialNumber: 'device-2', ip: '192.168.1.102' });
            addDevice(device1);
            addDevice(device2);

            const resolveDeviceSpy = sinon.stub(manager as any, 'resolveDevice').returns(Promise.resolve(true) as any);

            await (manager as any).checkDevicesHealth(true);

            expect(resolveDeviceSpy.calledTwice).to.be.true;
        });

        it('only checks stale devices when force=false', async () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);

            const device1 = createMockDevice({ serialNumber: 'device-1', ip: '192.168.1.101' });
            const device2 = createMockDevice({ serialNumber: 'device-2', ip: '192.168.1.102' });
            addDevice(device1);
            addDevice(device2);

            // Mark device1 as recently checked (not stale)
            (manager as any).lastHealthCheckTime.set('192.168.1.101', Date.now());

            const resolveDeviceSpy = sinon.stub(manager as any, 'resolveDevice').returns(Promise.resolve(true) as any);

            await (manager as any).checkDevicesHealth(false);

            // Only device2 should be checked (device1 is not stale)
            expect(resolveDeviceSpy.calledOnce).to.be.true;
            expect(resolveDeviceSpy.firstCall.args[0].serialNumber).to.equal('device-2');
        });

        it('sets devices to pending before checking when force=false', async () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);

            const device = createMockDevice();
            addDevice(device);

            let stateWhenResolveCalled: string;
            sinon.stub(manager as any, 'resolveDevice').callsFake(() => {
                // Check the state from getAllDevices() during the health check
                stateWhenResolveCalled = manager.getAllDevices()[0].deviceState;
                return Promise.resolve(true);
            });

            await (manager as any).checkDevicesHealth(false);

            expect(stateWhenResolveCalled).to.equal('pending');
        });

        it('skips check when no devices are stale', async () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);

            const device = createMockDevice();
            addDevice(device);

            // Mark device as recently checked
            (manager as any).lastHealthCheckTime.set(device.ip, Date.now());

            const resolveDeviceSpy = sinon.stub(manager as any, 'resolveDevice').returns(Promise.resolve(true));

            await (manager as any).checkDevicesHealth(false);

            expect(resolveDeviceSpy.called).to.be.false;
        });
    });

    describe('checkDeviceHealth with force=false (cooldown)', () => {
        it('skips check if within cooldown period', async () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);

            const device = createMockDevice();
            const resolveDeviceSpy = sinon.stub(manager as any, 'resolveDevice').returns(Promise.resolve(true));

            // First call - should check
            await manager.checkDeviceHealth(device);
            expect(resolveDeviceSpy.calledOnce).to.be.true;

            // Second call immediately - should skip due to cooldown
            await manager.checkDeviceHealth(device);
            expect(resolveDeviceSpy.calledOnce).to.be.true; // Still just one call
        });

        it('checks again after cooldown expires', async () => {
            const clock = sinon.useFakeTimers(Date.now());
            try {
                manager = new DeviceManager(vscode.context, mockGlobalStateManager);

                const device = createMockDevice();
                const resolveDeviceSpy = sinon.stub(manager as any, 'resolveDevice').returns(Promise.resolve(true));

                // First call
                await manager.checkDeviceHealth(device);
                expect(resolveDeviceSpy.calledOnce).to.be.true;

                // Advance past cooldown (5 minutes)
                clock.tick((5 * 60 * 1_000) + 1);

                // Second call - should check again
                await manager.checkDeviceHealth(device);
                expect(resolveDeviceSpy.calledTwice).to.be.true;
            } finally {
                clock.restore();
            }
        });

        it('always checks when force=true regardless of cooldown', async () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);

            const device = createMockDevice();
            const resolveDeviceSpy = sinon.stub(manager as any, 'resolveDevice').returns(Promise.resolve(true));

            // First call with force
            await manager.checkDeviceHealth(device, true);
            expect(resolveDeviceSpy.calledOnce).to.be.true;

            // Second call immediately with force - should still check
            await manager.checkDeviceHealth(device, true);
            expect(resolveDeviceSpy.calledTwice).to.be.true;
        });
    });

    describe('scan events', () => {
        it('emits scan-started when scan begins', () => {
            const clock = sinon.useFakeTimers();
            try {
                manager = new DeviceManager(vscode.context, mockGlobalStateManager);

                const scanStartedSpy = sinon.spy();
                manager.on('scan-started', scanStartedSpy);

                manager.refresh(true);

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

                manager.refresh(true);

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

                manager.refresh(true);
                expect(scanStartedSpy.calledOnce).to.be.true;

                // Try to start another scan while one is in progress
                manager.refresh(true);
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

                manager.refresh(true);
                expect(scanStartedSpy.calledOnce).to.be.true;

                // Complete the scan
                clock.tick(3_000); // min + settle both complete
                expect(scanEndedSpy.calledOnce).to.be.true;

                // Now can start a new scan
                manager.refresh(true);
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
                manager['setDiscoveredDevice']('192.168.1.100', 'serial-123', 'online');
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

                manager['removeDevice'](device.ip);

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
                manager['setDiscoveredDevice']('192.168.1.101', 'device-1', 'online');
                manager['emitDevicesChanged']();
                expect(devicesChangedSpy.calledOnce).to.be.true;

                // Subsequent calls within throttle window are queued
                clock.tick(10);
                manager['setDiscoveredDevice']('192.168.1.102', 'device-2', 'online');
                manager['emitDevicesChanged']();
                clock.tick(10);
                manager['setDiscoveredDevice']('192.168.1.103', 'device-3', 'online');
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

    describe('checkDeviceHealth', () => {
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

            const checkPromise = manager.checkDeviceHealth(device, true);

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

            const result = await manager.checkDeviceHealth(device, true);

            expect(result).to.be.false;
            expect(manager.getAllDevices().length).to.equal(0);
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

            const result = await manager.checkDeviceHealth(device, true);

            expect(result).to.be.true;
        });

        it('ignores stale health check response when newer check completes first', async () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);
            (vscode.window as any).state = { focused: true };

            const device = createMockDevice({ serialNumber: 'device-123' });
            addDevice(device);

            // Stub refresh to prevent cascade of health checks
            sinon.stub(manager, 'refresh');

            // Create two controllable promises for the health checks
            let rejectSlowCheck: (err: Error) => void;
            let resolveFastCheck: (value: any) => void;
            const slowCheckPromise = new Promise<any>((_resolve, reject) => {
                rejectSlowCheck = reject;
            });
            const fastCheckPromise = new Promise<any>(resolve => {
                resolveFastCheck = resolve;
            });

            const getDeviceInfoStub = sinon.stub(rokuDeploy, 'getDeviceInfo');
            getDeviceInfoStub.onFirstCall().returns(slowCheckPromise);
            getDeviceInfoStub.onSecondCall().returns(fastCheckPromise);

            // Start first (slow) health check - will return unhealthy
            const slowResult = manager.checkDeviceHealth(device, true);

            // Start second (fast) health check - will return healthy
            const fastResult = manager.checkDeviceHealth(device, true);

            // Fast check completes first with healthy result
            resolveFastCheck({
                'device-id': 'device-123',
                'serial-number': 'device-123',
                'default-device-name': 'Roku Express'
            });
            await fastResult;

            // Device should be online (fast check succeeded)
            expect(manager.getAllDevices().length).to.equal(1);
            expect(manager.getAllDevices()[0].deviceState).to.equal('online');

            // Slow check completes later with unhealthy result
            rejectSlowCheck(new Error('Device not responding'));
            await slowResult;

            // Device should STILL be online - slow check result was ignored (stale)
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

            // Stub refresh to prevent cascade of health checks
            sinon.stub(manager, 'refresh');

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
            const result1 = manager.checkDeviceHealth(device1, true);
            const result2 = manager.checkDeviceHealth(device2, true);

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

    describe('removeDevice', () => {
        it('clears lastUsedDeviceIp when removed device matches', () => {
            const clock = sinon.useFakeTimers();
            try {
                manager = new DeviceManager(vscode.context, mockGlobalStateManager);
                (vscode.window as any).state = { focused: true };

                const device = createMockDevice();
                addDevice(device);
                manager.setLastUsedDeviceIp(device.ip);

                expect(manager.getLastUsedDeviceIp()).to.equal(device.ip);

                manager['removeDevice'](device.ip);

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

                manager['removeDevice'](device2.ip);

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

                manager['removeDevice'](device.ip);

                expect(mockGlobalStateManager.removeLastSeenDevice.calledWith('test-network-hash', device.serialNumber)).to.be.true;
            } finally {
                clock.restore();
            }
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

            expect(manager['devices'][0].deviceState).to.equal('online');
        });

        it('loads cached devices as pending when cache is stale (older than 5 minutes)', () => {
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

            expect(manager.getAllDevices()[0].deviceState).to.equal('pending');
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

    describe('processDiscoveredIp', () => {
        const mockDeviceInfo = {
            'device-id': 'test-device-123',
            'serial-number': 'YN00AB123456',
            'default-device-name': 'Roku Express',
            'developer-enabled': 'true',
            'is-stick': 'false',
            'is-tv': 'false'
        };

        it('fetches device info and upserts device using serial number', async () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);

            sinon.stub(rokuDeploy, 'getDeviceInfo').resolves(mockDeviceInfo as any);

            await manager['processDiscoveredIp']('192.168.1.100');

            expect(manager.getAllDevices().length).to.equal(1);
            expect(manager.getAllDevices()[0].ip).to.equal('192.168.1.100');
            expect(manager.getAllDevices()[0].serialNumber).to.equal('YN00AB123456');
            expect(manager.getAllDevices()[0].deviceState).to.equal('online');
        });

        it('uses serial from deviceInfo (not SSDP hint)', async () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);

            sinon.stub(rokuDeploy, 'getDeviceInfo').resolves(mockDeviceInfo as any);

            // SSDP provides a hint, but deviceInfo is the source of truth
            await manager['processDiscoveredIp']('192.168.1.100', 'SSDP-SERIAL-123');

            expect(manager.getAllDevices().length).to.equal(1);
            // Should use deviceInfo's serial, not SSDP hint
            expect(manager.getAllDevices()[0].serialNumber).to.equal('YN00AB123456');
        });

        it('falls back to deviceInfo serial when SSDP serial not provided', async () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);

            sinon.stub(rokuDeploy, 'getDeviceInfo').resolves(mockDeviceInfo as any);

            await manager['processDiscoveredIp']('192.168.1.100');

            expect(manager.getAllDevices()[0].serialNumber).to.equal('YN00AB123456');
        });

        it('filters non-developer devices by default', async () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);

            sinon.stub(rokuDeploy, 'getDeviceInfo').resolves({
                ...mockDeviceInfo,
                'developer-enabled': 'false'
            } as any);

            await manager['processDiscoveredIp']('192.168.1.100');

            expect(manager.getAllDevices().length).to.equal(0);
        });

        it('includes non-developer devices when setting enabled', async () => {
            (vscode.workspace.getConfiguration as sinon.SinonStub).returns({
                get: () => undefined,
                deviceDiscovery: {
                    enabled: false,
                    showInfoMessages: false,
                    includeNonDeveloperDevices: true
                }
            } as any);

            manager = new DeviceManager(vscode.context, mockGlobalStateManager);

            sinon.stub(rokuDeploy, 'getDeviceInfo').resolves({
                ...mockDeviceInfo,
                'developer-enabled': 'false'
            } as any);

            await manager['processDiscoveredIp']('192.168.1.100');

            expect(manager.getAllDevices().length).to.equal(1);
        });

        it('handles string "true" for developer-enabled', async () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);

            sinon.stub(rokuDeploy, 'getDeviceInfo').resolves({
                ...mockDeviceInfo,
                'developer-enabled': 'true'
            } as any);

            await manager['processDiscoveredIp']('192.168.1.100');

            expect(manager.getAllDevices().length).to.equal(1);
        });

        it('handles network errors gracefully', async () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);

            sinon.stub(rokuDeploy, 'getDeviceInfo').rejects(new Error('Network error'));

            // Should not throw
            await manager['processDiscoveredIp']('192.168.1.100');

            expect(manager.getAllDevices().length).to.equal(0);
        });

        it('processDiscoveredIp does not show notifications', async () => {
            (vscode.workspace.getConfiguration as sinon.SinonStub).returns({
                get: () => undefined,
                deviceDiscovery: {
                    enabled: false,
                    showInfoMessages: true
                }
            } as any);

            manager = new DeviceManager(vscode.context, mockGlobalStateManager);

            sinon.stub(rokuDeploy, 'getDeviceInfo').resolves(mockDeviceInfo as any);
            const showTimedStub = sinon.stub(util, 'showTimedNotification').resolves();

            await manager['processDiscoveredIp']('192.168.1.100');

            expect(showTimedStub.called).to.be.false;
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
                deviceDiscovery: {
                    enabled: false,
                    showInfoMessages: true
                }
            } as any);

            manager = new DeviceManager(vscode.context, mockGlobalStateManager);
            sinon.stub(manager as any, 'randomDelay').resolves();

            sinon.stub(rokuDeploy, 'getDeviceInfo').resolves(mockDeviceInfo as any);
            const showTimedStub = sinon.stub(util, 'showTimedNotification').resolves();

            // First, add device to cache
            await manager['processDiscoveredIp']('192.168.1.100', 'ABC123');

            // Now trigger device-online
            manager['handleDeviceOnline']('192.168.1.100', 'ABC123');
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
                deviceDiscovery: {
                    enabled: false,
                    showInfoMessages: true
                }
            } as any);

            manager = new DeviceManager(vscode.context, mockGlobalStateManager);
            sinon.stub(manager as any, 'randomDelay').resolves();

            sinon.stub(rokuDeploy, 'getDeviceInfo').resolves(mockDeviceInfo as any);
            const showTimedStub = sinon.stub(util, 'showTimedNotification').resolves();

            // Add device to cache
            await manager['processDiscoveredIp']('192.168.1.100', 'ABC123');

            // First device-online
            manager['handleDeviceOnline']('192.168.1.100', 'ABC123');
            clock.tick(1_000);
            await Promise.resolve();

            expect(showTimedStub.calledOnce).to.be.true;

            // Second device-online from same device - should still show notification
            manager['handleDeviceOnline']('192.168.1.100', 'ABC123');
            clock.tick(1_000);
            await Promise.resolve();

            expect(showTimedStub.calledTwice).to.be.true;
        });
    });

    describe('fetchDeviceInfo', () => {
        it('only makes one network call for rapid successive requests', async () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);

            const getDeviceInfoStub = sinon.stub(rokuDeploy, 'getDeviceInfo').resolves({
                'device-id': 'device-123',
                'serial-number': 'device-123',
                'default-device-name': 'Roku Express'
            } as any);

            // Call twice in rapid succession
            await manager['fetchDeviceInfo']('192.168.1.100', 8060);
            await manager['fetchDeviceInfo']('192.168.1.100', 8060);

            // Should only have made one actual network call
            expect(getDeviceInfoStub.callCount).to.equal(1);
        });

        it('makes a new network call after cache TTL expires', async () => {
            const clock = sinon.useFakeTimers();
            try {
                manager = new DeviceManager(vscode.context, mockGlobalStateManager);

                const getDeviceInfoStub = sinon.stub(rokuDeploy, 'getDeviceInfo').resolves({
                    'device-id': 'device-123',
                    'default-device-name': 'Roku Express'
                } as any);

                // First call - should hit network
                await manager['fetchDeviceInfo']('192.168.1.100', 8060);
                expect(getDeviceInfoStub.callCount).to.equal(1);

                // Advance past TTL (5 seconds)
                clock.tick(6_000);

                // Second call - cache expired, should hit network again
                await manager['fetchDeviceInfo']('192.168.1.100', 8060);
                expect(getDeviceInfoStub.callCount).to.equal(2);
            } finally {
                clock.restore();
            }
        });

        it('caches different IPs separately', async () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);

            const getDeviceInfoStub = sinon.stub(rokuDeploy, 'getDeviceInfo').resolves({
                'device-id': 'device-123',
                'serial-number': 'device-123',
                'default-device-name': 'Roku Express'
            } as any);

            // Call for two different IPs
            await manager['fetchDeviceInfo']('192.168.1.100', 8060);
            await manager['fetchDeviceInfo']('192.168.1.101', 8060);

            // Should make two network calls (different IPs)
            expect(getDeviceInfoStub.callCount).to.equal(2);

            // But calling same IPs again should use cache
            await manager['fetchDeviceInfo']('192.168.1.100', 8060);
            await manager['fetchDeviceInfo']('192.168.1.101', 8060);

            // Still only two calls
            expect(getDeviceInfoStub.callCount).to.equal(2);
        });

        it('clears cache after inactivity timeout', async () => {
            const clock = sinon.useFakeTimers();
            try {
                manager = new DeviceManager(vscode.context, mockGlobalStateManager);

                const getDeviceInfoStub = sinon.stub(rokuDeploy, 'getDeviceInfo').resolves({
                    'device-id': 'device-123',
                    'default-device-name': 'Roku Express'
                } as any);

                // First call - populates cache
                await manager['fetchDeviceInfo']('192.168.1.100', 8060);
                expect(getDeviceInfoStub.callCount).to.equal(1);

                // Call again within TTL - should use cache
                clock.tick(2_000);
                await manager['fetchDeviceInfo']('192.168.1.100', 8060);
                expect(getDeviceInfoStub.callCount).to.equal(1);

                // Advance past cleanup delay (10 seconds of inactivity)
                clock.tick(11_000);

                // Cache should be cleared, next call hits network
                await manager['fetchDeviceInfo']('192.168.1.100', 8060);
                expect(getDeviceInfoStub.callCount).to.equal(2);
            } finally {
                clock.restore();
            }
        });

        it('clears cache on network change', async () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);

            const getDeviceInfoStub = sinon.stub(rokuDeploy, 'getDeviceInfo').resolves({
                'device-id': 'device-123',
                'serial-number': 'device-123',
                'default-device-name': 'Roku Express'
            } as any);

            // Populate cache
            await manager['fetchDeviceInfo']('192.168.1.100', 8060);
            expect(getDeviceInfoStub.callCount).to.equal(1);

            // Verify cache is working
            await manager['fetchDeviceInfo']('192.168.1.100', 8060);
            expect(getDeviceInfoStub.callCount).to.equal(1);

            // Simulate network change by changing the stub's return value to a different hash
            (NetworkChangeMonitorModule.getNetworkHash as sinon.SinonStub).returns('new-network-hash');

            // Simulate network change by calling the networkChangeMonitor callback
            // (now handlePotentialNetworkChange will see the different hash)
            manager['networkChangeMonitor']['onNetworkChanged']();

            // Wait for the async handlePotentialNetworkChange to complete
            await util.sleep(10);

            // Cache should be cleared, next call hits network
            await manager['fetchDeviceInfo']('192.168.1.100', 8060);
            expect(getDeviceInfoStub.callCount).to.equal(2);
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
            manager['devices'].push(createMockDevice({
                serialNumber: 'device-123',
                ip: '192.168.1.100',
                isDiscovered: true
            }));
            expect(manager['devices'].length).to.equal(1);

            // Change the network hash
            (NetworkChangeMonitorModule.getNetworkHash as sinon.SinonStub).returns('new-network-hash');

            // Trigger the network change callback directly
            manager['networkChangeMonitor']['onNetworkChanged']();

            // Discovered device should be removed (loadLastSeenDevices clears non-configured)
            expect(manager['devices'].length).to.equal(0);
        });

        it('clears fetchDeviceThrottleData when network changes', () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);

            // Populate the cache
            manager['fetchDeviceThrottleData'].set('192.168.1.100', {
                info: { 'serial-number': 'device-123' } as any,
                timestamp: Date.now()
            });
            expect(manager['fetchDeviceThrottleData'].size).to.equal(1);

            // Change the network hash
            (NetworkChangeMonitorModule.getNetworkHash as sinon.SinonStub).returns('new-network-hash');

            // Trigger the network change callback directly
            manager['networkChangeMonitor']['onNetworkChanged']();

            expect(manager['fetchDeviceThrottleData'].size).to.equal(0);
        });

        it('calls setScanNeeded when network changes', () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);

            const setScanNeededSpy = sinon.spy(manager as any, 'setScanNeeded');

            // Change the network hash
            (NetworkChangeMonitorModule.getNetworkHash as sinon.SinonStub).returns('new-network-hash');

            // Trigger the network change callback directly
            manager['networkChangeMonitor']['onNetworkChanged']();

            expect(setScanNeededSpy.calledOnce).to.be.true;
        });

        it('clears devices array when network changes', () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);

            // Add multiple devices
            manager['devices'].push(createMockDevice({
                serialNumber: 'device-123',
                ip: '192.168.1.100',
                isDiscovered: true
            }));
            manager['devices'].push(createMockDevice({
                serialNumber: 'device-456',
                ip: '192.168.1.101',
                isConfigured: true
            }));
            expect(manager['devices'].length).to.equal(2);

            // Change the network hash
            (NetworkChangeMonitorModule.getNetworkHash as sinon.SinonStub).returns('new-network-hash');

            // Trigger the network change callback directly
            manager['networkChangeMonitor']['onNetworkChanged']();

            // Devices array should be cleared (both discovered and configured)
            expect(manager['devices'].length).to.equal(0);
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
                    deviceState: 'pending',
                    serialNumber: undefined
                });

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

        describe('checkDeviceHealth with failed network calls', () => {
            it('marks configured device as offline when health check fails and cache exists', async () => {
                manager = new DeviceManager(vscode.context, mockGlobalStateManager);
                sinon.stub(manager as any, 'randomDelay').resolves();
                sinon.stub(manager as any, 'refresh').resolves();

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

                const result = await manager.checkDeviceHealth(device, true);

                expect(result).to.be.false;
                expect(manager.getAllDevices().length).to.equal(1);
                expect(manager.getAllDevices()[0].deviceState).to.equal('offline');
            });

            it('marks configured device as offline when health check fails and no cache exists', async () => {
                manager = new DeviceManager(vscode.context, mockGlobalStateManager);
                sinon.stub(manager as any, 'randomDelay').resolves();
                sinon.stub(manager as any, 'refresh').resolves();

                const device = createMockDevice({
                    serialNumber: 'device-123',
                    isConfigured: true
                });
                addDevice(device);

                // Simulate no cache - view layer uses hasDeviceCache() to show warning icon
                mockGlobalStateManager.getCachedDevice.returns(undefined);

                // Stub to simulate network failure
                sinon.stub(rokuDeploy, 'getDeviceInfo').rejects(new Error('Device not responding'));

                const result = await manager.checkDeviceHealth(device, true);

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
                sinon.stub(manager as any, 'refresh').resolves();

                const device = createMockDevice({
                    serialNumber: 'device-123',
                    isConfigured: false
                });
                addDevice(device);

                // Stub to simulate network failure
                sinon.stub(rokuDeploy, 'getDeviceInfo').rejects(new Error('Device not responding'));

                const result = await manager.checkDeviceHealth(device, true);

                expect(result).to.be.false;
                expect(manager.getAllDevices().length).to.equal(0);
            });
        });

        describe('isDiscovered flag', () => {
            it('sets isDiscovered true when device comes from discovery', async () => {
                manager = new DeviceManager(vscode.context, mockGlobalStateManager);
                sinon.stub(rokuDeploy, 'getDeviceInfo').resolves({
                    'device-id': 'device-123',
                    'serial-number': 'ABC123',
                    'default-device-name': 'Roku Express',
                    'developer-enabled': 'true'
                } as any);

                await manager['processDiscoveredIp']('192.168.1.100', 'ABC123');

                const device = manager.getAllDevices().find(d => d.ip === '192.168.1.100');
                expect(device?.isDiscovered).to.be.true;
            });

            it('sets isDiscovered false when health check fails on configured device', async () => {
                manager = new DeviceManager(vscode.context, mockGlobalStateManager);
                sinon.stub(manager as any, 'randomDelay').resolves();
                sinon.stub(manager as any, 'refresh').resolves();

                const device = createMockDevice({
                    ip: '192.168.1.100',
                    serialNumber: 'ABC123',
                    isConfigured: true,
                    isDiscovered: true
                });
                addDevice(device);

                sinon.stub(rokuDeploy, 'getDeviceInfo').rejects(new Error('Offline'));

                await manager.checkDeviceHealth(device, true);

                // Device kept (configured) but not discovered
                expect(manager.getAllDevices().length).to.equal(1);
                expect(manager.getAllDevices()[0].isDiscovered).to.be.false;
                expect(manager.getAllDevices()[0].deviceState).to.equal('offline');
            });

            it('removes discovered-only device when health check fails', async () => {
                manager = new DeviceManager(vscode.context, mockGlobalStateManager);
                sinon.stub(manager as any, 'randomDelay').resolves();
                sinon.stub(manager as any, 'refresh').resolves();

                const device = createMockDevice({
                    ip: '192.168.1.100',
                    serialNumber: 'ABC123',
                    isConfigured: false, // Not configured
                    isDiscovered: true // Only discovered
                });
                addDevice(device);

                sinon.stub(rokuDeploy, 'getDeviceInfo').rejects(new Error('Offline'));

                await manager.checkDeviceHealth(device, true);

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
                    })
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
                    })
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

            it('merges config entries with same IP but different serials (last wins)', async () => {
                // Two config entries pointing to same IP with different serials
                // This is a misconfiguration, but we should handle it gracefully
                (vscode.workspace.getConfiguration as sinon.SinonStub).returns({
                    inspect: () => ({
                        workspaceValue: [],
                        globalValue: [
                            { host: '192.168.1.100', serialNumber: 'ABC', name: 'First Entry' },
                            { host: '192.168.1.100', serialNumber: 'XYZ', name: 'Second Entry' }
                        ]
                    })
                });

                manager = new DeviceManager(vscode.context, mockGlobalStateManager);

                await manager['loadConfiguredDevices']();

                // Should have exactly one device (merged by IP, second entry wins)
                expect(manager.getAllDevices().length).to.equal(1);
                expect(manager.getAllDevices()[0].ip).to.equal('192.168.1.100');
                expect(manager.getAllDevices()[0].configuredName).to.equal('Second Entry');
                expect(manager.getAllDevices()[0].isConfigured).to.equal(true);
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
                    })
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
                    })
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

                // Only configured device should remain
                expect(manager.getAllDevices().length).to.equal(1);
                const serial = manager.getAllDevices()[0].serialNumber;
                expect(serial).to.equal('configured-1');
                expect(manager.getAllDevices()[0].deviceState).to.equal('pending');
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

                it('clears lastHealthCheckTime map', async () => {
                    manager = new DeviceManager(vscode.context, mockGlobalStateManager);

                    const device = createMockDevice();
                    const resolveDeviceSpy = sinon.stub(manager as any, 'resolveDevice').returns(Promise.resolve(true));

                    // Perform health check to populate cooldown
                    await manager.checkDeviceHealth(device);
                    expect(resolveDeviceSpy.calledOnce).to.be.true;

                    // Second call should be skipped due to cooldown
                    await manager.checkDeviceHealth(device);
                    expect(resolveDeviceSpy.calledOnce).to.be.true; // Still just one call

                    // Clear cache
                    manager.clearAllCache();

                    // Now health check should work immediately
                    await manager.checkDeviceHealth(device);
                    expect(resolveDeviceSpy.calledTwice).to.be.true; // Cooldown was cleared
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

            describe('timer clearing', () => {
                it('clears fetchDeviceInfoThrottleTimer', () => {
                    const clock = sinon.useFakeTimers();
                    try {
                        manager = new DeviceManager(vscode.context, mockGlobalStateManager);

                        // Trigger cache cleanup timer by resetting it
                        manager['resetCacheCleanupTimer']();
                        expect(manager['fetchDeviceInfoThrottleTimer']).to.not.be.null;

                        manager.clearAllCache();

                        expect(manager['fetchDeviceInfoThrottleTimer']).to.be.null;
                    } finally {
                        clock.restore();
                    }
                });

                it('does not throw if fetchDeviceInfoThrottleTimer is already null', () => {
                    manager = new DeviceManager(vscode.context, mockGlobalStateManager);

                    manager['fetchDeviceInfoThrottleTimer'] = null;

                    expect(() => manager.clearAllCache()).to.not.throw();
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
                    await manager.checkDeviceHealth(device);
                    expect(resolveDeviceSpy.calledOnce).to.be.true;

                    // Clear cache (should clear cooldown)
                    manager.clearAllCache();

                    // Health check should run immediately (no cooldown)
                    await manager.checkDeviceHealth(device);
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

                    const healthCheckCall = manager.checkDeviceHealth(device);

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
                    serialNumber: undefined,
                    deviceState: 'online'
                });

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
                    serialNumber: undefined,
                    deviceState: 'online'
                });

                // Initially should have IP-based key
                let result = manager.getDevice('i:192.168.1.100');
                expect(result?.key).to.equal('i:192.168.1.100');

                // Simulate device resolution - update discovered entry with serial
                // (this is what resolveDevice does when it successfully fetches deviceInfo)
                manager['setDiscoveredDevice']('192.168.1.100', 'NEWSERIAL', 'online');

                // Device now has serial-based key
                result = manager.getDevice({ serialNumber: 'NEWSERIAL' });
                expect(result?.key).to.equal('s:NEWSERIAL');
                expect(result?.serialNumber).to.equal('NEWSERIAL');
            });
        });
    });

    describe('serial-based deduplication (DHCP IP change)', () => {
        describe('processDiscoveredIp', () => {
            it('removes old entry when same serial discovered at new IP', async () => {
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
                sinon.stub(rokuDeploy, 'getDeviceInfo').resolves({
                    'serial-number': 'ABC123',
                    'device-id': 'ABC123',
                    'default-device-name': 'Roku Express',
                    'developer-enabled': 'true'
                } as any);

                await manager['processDiscoveredIp']('192.168.1.200', 'ABC123');

                // Should have exactly one device at new IP
                expect(manager.getAllDevices().length).to.equal(1);
                expect(manager.getAllDevices()[0].ip).to.equal('192.168.1.200');
                expect(manager.getAllDevices()[0].serialNumber).to.equal('ABC123');
            });

            it('preserves configured properties when device changes IP', async () => {
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
                sinon.stub(rokuDeploy, 'getDeviceInfo').resolves({
                    'serial-number': 'ABC123',
                    'device-id': 'ABC123',
                    'default-device-name': 'Roku Express',
                    'developer-enabled': 'true'
                } as any);

                await manager['processDiscoveredIp']('192.168.1.200', 'ABC123');

                // Should preserve configured properties on new entry
                expect(manager.getAllDevices().length).to.equal(1);
                expect(manager.getAllDevices()[0].ip).to.equal('192.168.1.200');
                expect(manager.getAllDevices()[0].isConfigured).to.equal(true);
                expect(manager.getAllDevices()[0].configuredName).to.equal('Living Room Roku');
                expect(manager.getAllDevices()[0].configuredPassword).to.equal('secret123');
            });

            it('transfers lastUsedDeviceIp when device changes IP', async () => {
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
                sinon.stub(rokuDeploy, 'getDeviceInfo').resolves({
                    'serial-number': 'ABC123',
                    'device-id': 'ABC123',
                    'default-device-name': 'Roku Express',
                    'developer-enabled': 'true'
                } as any);

                await manager['processDiscoveredIp']('192.168.1.200', 'ABC123');

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

                // New device at different IP being resolved
                const newDevice = createMockDevice({
                    serialNumber: null,
                    ip: '192.168.1.200',
                    deviceState: 'pending',
                    isDiscovered: false
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
                    deviceState: 'pending',
                    name: 'My Configured Roku',
                    password: 'secret'
                });

                // Should have ONE device at the DISCOVERED IP (not the configured IP)
                expect(manager.getAllDevices().length).to.equal(1);
                expect(manager.getAllDevices()[0].ip).to.equal('192.168.1.100'); // discovered IP preserved
                expect(manager.getAllDevices()[0].isDiscovered).to.equal(true);
                expect(manager.getAllDevices()[0].isConfigured).to.equal(true);
                expect(manager.getAllDevices()[0].configuredName).to.equal('My Configured Roku');
                expect(manager.getAllDevices()[0].configuredPassword).to.equal('secret');
            });

            it('preserves isConfigured when configured device gets discovered at new IP', async () => {
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
                sinon.stub(rokuDeploy, 'getDeviceInfo').resolves({
                    'serial-number': 'ABC123',
                    'device-id': 'ABC123',
                    'default-device-name': 'Roku Express',
                    'developer-enabled': 'true'
                } as any);

                await manager['processDiscoveredIp']('192.168.1.200', 'ABC123');

                // Should have one device with BOTH isDiscovered and isConfigured
                expect(manager.getAllDevices().length).to.equal(1);
                expect(manager.getAllDevices()[0].ip).to.equal('192.168.1.200');
                expect(manager.getAllDevices()[0].isDiscovered).to.equal(true);
                expect(manager.getAllDevices()[0].isConfigured).to.equal(true);
                expect(manager.getAllDevices()[0].configuredName).to.equal('Living Room Roku');
                expect(manager.getAllDevices()[0].configuredPassword).to.equal('secret');
            });
        });

        describe('edge cases', () => {
            it('does not dedupe when serial is undefined', async () => {
                manager = new DeviceManager(vscode.context, mockGlobalStateManager);

                // Device without serial at old IP
                const oldDevice = createMockDevice({
                    serialNumber: null,
                    ip: '192.168.1.100',
                    deviceState: 'online',
                    isDiscovered: true
                });
                addDevice(oldDevice);

                // Discover device at new IP, also without serial in response
                sinon.stub(rokuDeploy, 'getDeviceInfo').resolves({
                    'device-id': 'some-id',
                    'default-device-name': 'Roku Express',
                    'developer-enabled': 'true'
                    // No serial-number field
                } as any);

                await manager['processDiscoveredIp']('192.168.1.200');

                // Should have two devices (no deduplication without serial)
                expect(manager.getAllDevices().length).to.equal(2);
            });

            it('does not remove device at same IP (not a duplicate)', async () => {
                manager = new DeviceManager(vscode.context, mockGlobalStateManager);

                // Device exists
                const device = createMockDevice({
                    serialNumber: 'ABC123',
                    ip: '192.168.1.100',
                    deviceState: 'pending',
                    isDiscovered: false
                });
                addDevice(device);

                // Re-discover at same IP (normal refresh scenario)
                sinon.stub(rokuDeploy, 'getDeviceInfo').resolves({
                    'serial-number': 'ABC123',
                    'device-id': 'ABC123',
                    'default-device-name': 'Roku Express',
                    'developer-enabled': 'true'
                } as any);

                await manager['processDiscoveredIp']('192.168.1.100', 'ABC123');

                // Should still have exactly one device (merged, not duplicated)
                expect(manager.getAllDevices().length).to.equal(1);
                expect(manager.getAllDevices()[0].ip).to.equal('192.168.1.100');
                expect(manager.getAllDevices()[0].deviceState).to.equal('online');
            });
        });
    });
});
