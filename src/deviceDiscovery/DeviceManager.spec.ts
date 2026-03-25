import { expect } from 'chai';
import * as sinon from 'sinon';
import { rokuDeploy } from 'roku-deploy';
import { vscode } from '../mockVscode.spec';
import type { RokuDeviceDetails } from './DeviceManager';
import { DeviceManager } from './DeviceManager';
import * as NetworkChangeMonitorModule from './NetworkChangeMonitor';
import { util } from '../util';

describe('DeviceManager', () => {
    let manager: DeviceManager;
    let mockGlobalStateManager: any;

    function createMockDevice(overrides: Partial<RokuDeviceDetails> & { deviceInfo?: any; serialNumber?: string | null } = {}): RokuDeviceDetails {
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
                ip: ip,
                location: `http://${ip}:8060`,
                deviceInfo: deviceInfo,
                createdAt: Date.now()
            });
        }

        // Set up IP→serial mapping when serialNumber is provided
        if (serialNumber) {
            mockGlobalStateManager.setSerialNumberForIp('test-network-hash', ip, serialNumber);
        }

        return {
            location: `http://${ip}:8060`,
            ip: ip,
            deviceState: 'online',
            isConfigured: false, // Default to discovered-only
            isDiscovered: true, // NEW: Default to discovered
            ...deviceOverrides
        } as RokuDeviceDetails;
    }

    beforeEach(() => {
        // Map to track IP→serial mappings across the test
        const ipToSerialMap = new Map<string, string>();
        // Map to track cached devices
        const deviceCache = new Map<string, any>();

        // Mock GlobalStateManager
        mockGlobalStateManager = {
            getLastSeenDevices: sinon.stub().returns([]),
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
            })
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
            manager['devices'].push(tv);
            manager['devices'].push(box);
            manager['devices'].push(stick);

            const devices = manager.getAllDevices();

            expect(manager['getSerial'](devices[0])).to.equal('stick-1');
            expect(manager['getSerial'](devices[1])).to.equal('box-1');
            expect(manager['getSerial'](devices[2])).to.equal('tv-1');
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

            manager['devices'].push(boxB);
            manager['devices'].push(boxC);
            manager['devices'].push(boxA);

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

    describe('checkDevicesHealth', () => {
        it('sets all devices to pending and checks all when force=true', async () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);

            const device1 = createMockDevice({ serialNumber: 'device-1', ip: '192.168.1.101' });
            const device2 = createMockDevice({ serialNumber: 'device-2', ip: '192.168.1.102' });
            (manager as any).devices = [device1, device2];

            const resolveDeviceSpy = sinon.stub(manager as any, 'resolveDevice').returns(Promise.resolve(true) as any);

            await (manager as any).checkDevicesHealth(true);

            expect(resolveDeviceSpy.calledTwice).to.be.true;
        });

        it('only checks stale devices when force=false', async () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);

            const device1 = createMockDevice({ serialNumber: 'device-1', ip: '192.168.1.101' });
            const device2 = createMockDevice({ serialNumber: 'device-2', ip: '192.168.1.102' });
            (manager as any).devices = [device1, device2];

            // Mark device1 as recently checked (not stale)
            (manager as any).lastHealthCheckTime.set('192.168.1.101', Date.now());

            const resolveDeviceSpy = sinon.stub(manager as any, 'resolveDevice').returns(Promise.resolve(true) as any);

            await (manager as any).checkDevicesHealth(false);

            // Only device2 should be checked (device1 is not stale)
            expect(resolveDeviceSpy.calledOnce).to.be.true;
            expect(manager['getSerial'](resolveDeviceSpy.firstCall.args[0])).to.equal('device-2');
        });

        it('sets devices to pending before checking when force=false', async () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);

            const device = createMockDevice();
            (manager as any).devices = [device];

            let stateWhenResolveCalled: string;
            sinon.stub(manager as any, 'resolveDevice').callsFake((d: RokuDeviceDetails) => {
                stateWhenResolveCalled = d.deviceState;
                return Promise.resolve(true);
            });

            await (manager as any).checkDevicesHealth(false);

            expect(stateWhenResolveCalled).to.equal('pending');
        });

        it('skips check when no devices are stale', async () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);

            const device = createMockDevice();
            (manager as any).devices = [device];

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

                manager['setDevice'](createMockDevice());

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
                manager['devices'].push(device);

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
                manager['setDevice'](createMockDevice({ serialNumber: 'device-1' }));
                expect(devicesChangedSpy.calledOnce).to.be.true;

                // Subsequent calls within throttle window are queued
                clock.tick(10);
                manager['setDevice'](createMockDevice({ serialNumber: 'device-2' }));
                clock.tick(10);
                manager['setDevice'](createMockDevice({ serialNumber: 'device-3' }));

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
            manager['devices'].push(device);

            // Stub rokuDeploy.getDeviceInfo to delay so we can check pending state
            let resolveHealth: (value: any) => void;
            const healthPromise = new Promise<any>(resolve => {
                resolveHealth = resolve;
            });
            sinon.stub(rokuDeploy, 'getDeviceInfo').returns(healthPromise);

            const checkPromise = manager.checkDeviceHealth(device, true);

            // Device should be pending during check
            expect(manager['devices'][0].deviceState).to.equal('pending');

            // Resolve with mock deviceInfo
            resolveHealth({
                'device-id': 'device-123',
                'serial-number': 'device-123',
                'default-device-name': 'Roku Express'
            });
            await checkPromise;

            // Device should be online after successful check
            expect(manager['devices'][0].deviceState).to.equal('online');
        });

        it('removes device when health check fails', async () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);
            (vscode.window as any).state = { focused: true };

            const device = createMockDevice();
            manager['devices'].push(device);

            sinon.stub(rokuDeploy, 'getDeviceInfo').rejects(new Error('Device not responding'));

            const result = await manager.checkDeviceHealth(device, true);

            expect(result).to.be.false;
            expect(manager['devices'].length).to.equal(0);
        });

        it('returns true when device is healthy', async () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);

            const device = createMockDevice({ serialNumber: 'device-123' });
            manager['devices'].push(device);

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
            manager['devices'].push(device);

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
            expect(manager['devices'].length).to.equal(1);
            expect(manager['devices'][0].deviceState).to.equal('online');

            // Slow check completes later with unhealthy result
            rejectSlowCheck(new Error('Device not responding'));
            await slowResult;

            // Device should STILL be online - slow check result was ignored (stale)
            expect(manager['devices'].length).to.equal(1);
            expect(manager['devices'][0].deviceState).to.equal('online');
        });

        it('tracks sequence numbers independently per device', async () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);
            (vscode.window as any).state = { focused: true };

            const device1 = createMockDevice({ serialNumber: 'device-1', ip: '192.168.1.101' });
            const device2 = createMockDevice({ serialNumber: 'device-2', ip: '192.168.1.102' });
            manager['devices'].push(device1, device2);

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
            expect(manager['devices'].length).to.equal(2);
            expect(manager['devices'].find(d => d.ip === device1.ip)?.deviceState).to.equal('online');
            expect(manager['devices'].find(d => d.ip === device2.ip)?.deviceState).to.equal('online');
        });
    });

    describe('removeDevice', () => {
        it('clears lastUsedDeviceIp when removed device matches', () => {
            const clock = sinon.useFakeTimers();
            try {
                manager = new DeviceManager(vscode.context, mockGlobalStateManager);
                (vscode.window as any).state = { focused: true };

                const device = createMockDevice();
                manager['devices'].push(device);
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
                manager['devices'].push(device1, device2);
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
                manager['devices'].push(device);

                manager['removeDevice'](device.ip);

                expect(mockGlobalStateManager.removeLastSeenDevice.calledWith('test-network-hash', manager['getSerial'](device))).to.be.true;
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
            manager['devices'].push(existingDevice);

            // Setup cache to return a different device
            mockGlobalStateManager.getLastSeenDevices.returns(['cached-device']);
            mockGlobalStateManager.setCachedDevice('cached-device', {
                serialNumber: 'cached-device',
                ip: '192.168.1.200',
                location: 'http://192.168.1.200:8060',
                deviceInfo: {
                    'default-device-name': 'Cached Roku',
                    'serial-number': 'cached-device'
                }
            });
            // Set IP→serial mapping for cached device
            mockGlobalStateManager.setSerialNumberForIp('test-network-hash', '192.168.1.200', 'cached-device');

            manager['loadLastSeenDevices']();

            // Should have both devices (merges instead of clearing)
            expect(manager['devices'].length).to.equal(2);
            expect(manager['devices'].some(d => manager['getSerial'](d) === 'existing')).to.be.true;
            expect(manager['devices'].some(d => manager['getSerial'](d) === 'cached-device')).to.be.true;
        });

        it('loads cached devices as pending state', () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);

            mockGlobalStateManager.getLastSeenDevices.returns(['device-1']);
            mockGlobalStateManager.getCachedDevice.returns({
                serialNumber: 'device-1',
                ip: '192.168.1.100',
                location: 'http://192.168.1.100:8060',
                deviceInfo: {
                    'default-device-name': 'Test Roku',
                    'serial-number': 'device-1'
                }
            });

            manager['loadLastSeenDevices']();

            expect(manager['devices'][0].deviceState).to.equal('pending');
        });

        it('removes stale entries when cache returns undefined', () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);

            mockGlobalStateManager.getLastSeenDevices.returns(['stale-device']);
            mockGlobalStateManager.getCachedDevice.returns(undefined);

            manager['loadLastSeenDevices']();

            expect(manager['devices'].length).to.equal(0);
            expect(mockGlobalStateManager.removeLastSeenDevice.calledWith('test-network-hash', 'stale-device')).to.be.true;
        });
    });

    describe('getDevice', () => {
        it('returns full device with deviceInfo when found', () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);

            const device = createMockDevice({ serialNumber: 'target-device' });
            manager['devices'].push(device);

            // Mock the cache to return deviceInfo
            mockGlobalStateManager.getCachedDevice.withArgs('target-device').returns({
                serialNumber: 'target-device',
                ip: device.ip,
                location: device.location,
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

            expect(manager['devices'].length).to.equal(1);
            expect(manager['devices'][0].ip).to.equal('192.168.1.100');
            expect(manager['getSerial'](manager['devices'][0])).to.equal('YN00AB123456');
            expect(manager['devices'][0].deviceState).to.equal('online');
        });

        it('uses serial from deviceInfo (not SSDP hint)', async () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);

            sinon.stub(rokuDeploy, 'getDeviceInfo').resolves(mockDeviceInfo as any);

            // SSDP provides a hint, but deviceInfo is the source of truth
            await manager['processDiscoveredIp']('192.168.1.100', 'SSDP-SERIAL-123');

            expect(manager['devices'].length).to.equal(1);
            // Should use deviceInfo's serial, not SSDP hint
            expect(manager['getSerial'](manager['devices'][0])).to.equal('YN00AB123456');
        });

        it('falls back to deviceInfo serial when SSDP serial not provided', async () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);

            sinon.stub(rokuDeploy, 'getDeviceInfo').resolves(mockDeviceInfo as any);

            await manager['processDiscoveredIp']('192.168.1.100');

            expect(manager['getSerial'](manager['devices'][0])).to.equal('YN00AB123456');
        });

        it('filters non-developer devices by default', async () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);

            sinon.stub(rokuDeploy, 'getDeviceInfo').resolves({
                ...mockDeviceInfo,
                'developer-enabled': 'false'
            } as any);

            await manager['processDiscoveredIp']('192.168.1.100');

            expect(manager['devices'].length).to.equal(0);
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

            expect(manager['devices'].length).to.equal(1);
        });

        it('handles string "true" for developer-enabled', async () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);

            sinon.stub(rokuDeploy, 'getDeviceInfo').resolves({
                ...mockDeviceInfo,
                'developer-enabled': 'true'
            } as any);

            await manager['processDiscoveredIp']('192.168.1.100');

            expect(manager['devices'].length).to.equal(1);
        });

        it('handles network errors gracefully', async () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);

            sinon.stub(rokuDeploy, 'getDeviceInfo').rejects(new Error('Network error'));

            // Should not throw
            await manager['processDiscoveredIp']('192.168.1.100');

            expect(manager['devices'].length).to.equal(0);
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

    describe('getDeviceInfoCached', () => {
        it('only makes one network call for rapid successive requests', async () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);

            const getDeviceInfoStub = sinon.stub(rokuDeploy, 'getDeviceInfo').resolves({
                'device-id': 'device-123',
                'serial-number': 'device-123',
                'default-device-name': 'Roku Express'
            } as any);

            // Call twice in rapid succession
            await manager['getDeviceInfoCached']('192.168.1.100', 8060);
            await manager['getDeviceInfoCached']('192.168.1.100', 8060);

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
                await manager['getDeviceInfoCached']('192.168.1.100', 8060);
                expect(getDeviceInfoStub.callCount).to.equal(1);

                // Advance past TTL (5 seconds)
                clock.tick(6_000);

                // Second call - cache expired, should hit network again
                await manager['getDeviceInfoCached']('192.168.1.100', 8060);
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
            await manager['getDeviceInfoCached']('192.168.1.100', 8060);
            await manager['getDeviceInfoCached']('192.168.1.101', 8060);

            // Should make two network calls (different IPs)
            expect(getDeviceInfoStub.callCount).to.equal(2);

            // But calling same IPs again should use cache
            await manager['getDeviceInfoCached']('192.168.1.100', 8060);
            await manager['getDeviceInfoCached']('192.168.1.101', 8060);

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
                await manager['getDeviceInfoCached']('192.168.1.100', 8060);
                expect(getDeviceInfoStub.callCount).to.equal(1);

                // Call again within TTL - should use cache
                clock.tick(2_000);
                await manager['getDeviceInfoCached']('192.168.1.100', 8060);
                expect(getDeviceInfoStub.callCount).to.equal(1);

                // Advance past cleanup delay (10 seconds of inactivity)
                clock.tick(11_000);

                // Cache should be cleared, next call hits network
                await manager['getDeviceInfoCached']('192.168.1.100', 8060);
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
            await manager['getDeviceInfoCached']('192.168.1.100', 8060);
            expect(getDeviceInfoStub.callCount).to.equal(1);

            // Verify cache is working
            await manager['getDeviceInfoCached']('192.168.1.100', 8060);
            expect(getDeviceInfoStub.callCount).to.equal(1);

            // Simulate network change by calling the networkChangeMonitor callback
            manager['networkChangeMonitor']['onNetworkChanged']();

            // Cache should be cleared, next call hits network
            await manager['getDeviceInfoCached']('192.168.1.100', 8060);
            expect(getDeviceInfoStub.callCount).to.equal(2);
        });
    });

    describe('configured devices', () => {
        describe('setDevice', () => {
            it('preserves isConfigured when merging by serialNumber', () => {
                manager = new DeviceManager(vscode.context, mockGlobalStateManager);

                // Add configured device
                const configuredDevice = createMockDevice({
                    serialNumber: 'device-123',
                    ip: '192.168.1.100',
                    isConfigured: true,
                    configuredName: 'My Roku'
                });
                manager['devices'].push(configuredDevice);

                // Update same device without isConfigured (simulating discovery)
                manager['setDevice']({
                    ...createMockDevice({ serialNumber: 'device-123', ip: '192.168.1.100' }),
                    isConfigured: undefined
                });

                expect(manager['devices'].length).to.equal(1);
                expect(manager['devices'][0].isConfigured).to.equal(true);
                expect(manager['devices'][0].configuredName).to.equal('My Roku');
            });

            it('preserves isConfigured when merging by IP', () => {
                manager = new DeviceManager(vscode.context, mockGlobalStateManager);

                // Add configured device with host as serialNumber (before resolution)
                const configuredDevice = createMockDevice({
                    serialNumber: '192.168.1.100', // Using IP as serialNumber before resolution
                    ip: '192.168.1.100',
                    isConfigured: true,
                    configuredName: 'My Roku'
                });
                manager['devices'].push(configuredDevice);

                // Update with real serialNumber (simulating resolution)
                manager['setDevice']({
                    ...createMockDevice({ serialNumber: 'real-serial-number', ip: '192.168.1.100' }),
                    isConfigured: undefined
                });

                expect(manager['devices'].length).to.equal(1);
                expect(manager['getSerial'](manager['devices'][0])).to.equal('real-serial-number');
                expect(manager['devices'][0].isConfigured).to.equal(true);
                expect(manager['devices'][0].configuredName).to.equal('My Roku');
            });

            it('preserves configuredName separately from deviceInfo', () => {
                manager = new DeviceManager(vscode.context, mockGlobalStateManager);

                manager['setDevice'](createMockDevice({
                    serialNumber: 'device-123',
                    isConfigured: true,
                    configuredName: 'My Custom Name',
                    deviceInfo: { 'user-device-name': 'Discovered Name' }
                }));

                // deviceInfo should be cached - UI layer handles the fallback to configuredName
                const serial = manager['getSerial'](manager['devices'][0]);
                const cachedDevice = mockGlobalStateManager.getCachedDevice(serial);
                expect(cachedDevice.deviceInfo['user-device-name']).to.equal('Discovered Name');
                expect(manager['devices'][0].configuredName).to.equal('My Custom Name');
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
                manager['devices'].push(device);

                // Simulate cache exists
                mockGlobalStateManager.getCachedDevice.returns({
                    serialNumber: 'device-123',
                    ip: device.ip,
                    location: device.location,
                    deviceInfo: { 'serial-number': 'device-123' },
                    createdAt: Date.now()
                });

                // Stub to simulate network failure
                sinon.stub(rokuDeploy, 'getDeviceInfo').rejects(new Error('Device not responding'));

                const result = await manager.checkDeviceHealth(device, true);

                expect(result).to.be.false;
                expect(manager['devices'].length).to.equal(1);
                expect(manager['devices'][0].deviceState).to.equal('offline');
            });

            it('marks configured device as offline when health check fails and no cache exists', async () => {
                manager = new DeviceManager(vscode.context, mockGlobalStateManager);
                sinon.stub(manager as any, 'randomDelay').resolves();
                sinon.stub(manager as any, 'refresh').resolves();

                const device = createMockDevice({
                    serialNumber: 'device-123',
                    isConfigured: true
                });
                manager['devices'].push(device);

                // Simulate no cache - view layer uses hasDeviceCache() to show warning icon
                mockGlobalStateManager.getCachedDevice.returns(undefined);

                // Stub to simulate network failure
                sinon.stub(rokuDeploy, 'getDeviceInfo').rejects(new Error('Device not responding'));

                const result = await manager.checkDeviceHealth(device, true);

                expect(result).to.be.false;
                expect(manager['devices'].length).to.equal(1);
                // State is always 'offline' - icon logic uses cache check to distinguish
                expect(manager['devices'][0].deviceState).to.equal('offline');
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
                manager['devices'].push(device);

                // Stub to simulate network failure
                sinon.stub(rokuDeploy, 'getDeviceInfo').rejects(new Error('Device not responding'));

                const result = await manager.checkDeviceHealth(device, true);

                expect(result).to.be.false;
                expect(manager['devices'].length).to.equal(0);
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

                const device = manager['devices'].find(d => d.ip === '192.168.1.100');
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
                manager['devices'].push(device);

                sinon.stub(rokuDeploy, 'getDeviceInfo').rejects(new Error('Offline'));

                await manager.checkDeviceHealth(device, true);

                // Device kept (configured) but not discovered
                expect(manager['devices'].length).to.equal(1);
                expect(manager['devices'][0].isDiscovered).to.be.false;
                expect(manager['devices'][0].deviceState).to.equal('offline');
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
                manager['devices'].push(device);

                sinon.stub(rokuDeploy, 'getDeviceInfo').rejects(new Error('Offline'));

                await manager.checkDeviceHealth(device, true);

                // Device removed (not configured, not discovered)
                expect(manager['devices'].length).to.equal(0);
            });
        });

        describe('getAllDevices sorting', () => {
            it('sorts by form factor, then name, then serial number', () => {
                manager = new DeviceManager(vscode.context, mockGlobalStateManager);

                // Add TV (priority 2) with Z name
                manager['devices'].push(createMockDevice({
                    serialNumber: 'tv-1',
                    ip: '192.168.1.101',
                    deviceInfo: {
                        'default-device-name': 'ZZZ TV',
                        'is-tv': 'true',
                        'is-stick': 'false'
                    }
                }));

                // Add stick (priority 0) with A name
                manager['devices'].push(createMockDevice({
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
                expect(manager['getSerial'](result[0])).to.equal('stick-1');
                expect(manager['getSerial'](result[1])).to.equal('tv-1');
            });
        });

        describe('loadConfiguredDevices', () => {
            it('converts removed configured device to discovered-only when it was resolved', () => {
                // Configure the existing stub to return empty config
                (vscode.workspace.getConfiguration as sinon.SinonStub).returns({
                    inspect: () => ({
                        workspaceValue: [],
                        globalValue: []
                    })
                });

                manager = new DeviceManager(vscode.context, mockGlobalStateManager);

                // Add configured device with real device info (was resolved from network)
                manager['devices'].push(createMockDevice({
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

                manager['loadConfiguredDevices']();

                // Device should be kept as discovered-only
                expect(manager['devices'].length).to.equal(1);
                const serial = manager['getSerial'](manager['devices'][0]);
                expect(serial).to.equal('real-serial-123');
                expect(manager['devices'][0].isConfigured).to.be.false;
                expect(manager['devices'][0].isDiscovered).to.be.true; // NEW
                expect(manager['devices'][0].configuredName).to.be.undefined;
                expect(manager['devices'][0].configuredPassword).to.be.undefined;
            });

            it('removes unresolved configured device when removed from config', () => {
                // Configure the existing stub to return empty config
                (vscode.workspace.getConfiguration as sinon.SinonStub).returns({
                    inspect: () => ({
                        workspaceValue: [],
                        globalValue: []
                    })
                });

                manager = new DeviceManager(vscode.context, mockGlobalStateManager);

                // Add configured device that was never resolved (no serial)
                manager['devices'].push(createMockDevice({
                    serialNumber: null, // CHANGED: null instead of IP
                    ip: '192.168.1.100',
                    isConfigured: true,
                    isDiscovered: false, // NEW: Not discovered
                    configuredName: 'My Roku',
                    deviceInfo: {
                        'serial-number': undefined
                    }
                }));

                manager['loadConfiguredDevices']();

                // Device should be completely removed
                expect(manager['devices'].length).to.equal(0);
            });
        });

        describe('loadLastSeenDevices', () => {
            it('preserves configured devices and removes discovered-only', () => {
                manager = new DeviceManager(vscode.context, mockGlobalStateManager);

                // Add configured device
                manager['devices'].push(createMockDevice({
                    serialNumber: 'configured-1',
                    ip: '192.168.1.101',
                    isConfigured: true
                }));

                // Add discovered device
                manager['devices'].push(createMockDevice({
                    serialNumber: 'discovered-1',
                    ip: '192.168.1.102'
                }));

                manager['loadLastSeenDevices']();

                // Only configured device should remain
                expect(manager['devices'].length).to.equal(1);
                const serial = manager['getSerial'](manager['devices'][0]);
                expect(serial).to.equal('configured-1');
                expect(manager['devices'][0].deviceState).to.equal('pending');
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
                manager['devices'].push(device);

                sinon.stub(rokuDeploy, 'getDeviceInfo').resolves({
                    'device-id': 'device-123',
                    'default-device-name': 'Roku Express'
                } as any);

                await manager['resolveDevice'](device);

                expect(manager['devices'][0].deviceState).to.equal('online');
                expect(manager['devices'][0].isConfigured).to.equal(true);
                expect(manager['devices'][0].configuredName).to.equal('My Roku');
            });
        });
    });
});
