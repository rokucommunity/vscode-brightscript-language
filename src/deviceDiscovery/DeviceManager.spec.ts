import { expect } from 'chai';
import * as sinon from 'sinon';
import { rokuDeploy } from 'roku-deploy';
import { vscode } from '../mockVscode.spec';
import type { RokuDeviceDetails } from './DeviceManager';
import { DeviceManager } from './DeviceManager';
import * as NetworkChangeMonitorModule from './NetworkChangeMonitor';

describe('DeviceManager', () => {
    let manager: DeviceManager;
    let mockGlobalStateManager: any;

    function createMockDevice(overrides: Partial<RokuDeviceDetails> & { deviceInfo?: Partial<RokuDeviceDetails['deviceInfo']> } = {}): RokuDeviceDetails {
        const id = overrides.id ?? 'device-123';
        return {
            location: 'http://192.168.1.100:8060',
            ip: '192.168.1.100',
            id: id,
            deviceState: 'online',
            deviceInfo: {
                'default-device-name': 'Roku Express',
                'device-id': id,
                'is-stick': 'false',
                'is-tv': 'false',
                ...overrides.deviceInfo
            },
            ...overrides
        } as RokuDeviceDetails;
    }

    beforeEach(() => {
        // Mock GlobalStateManager
        mockGlobalStateManager = {
            getLastSeenDeviceIds: sinon.stub().returns([]),
            addLastSeenDevice: sinon.stub(),
            removeLastSeenDevice: sinon.stub(),
            setLastSeenDeviceIds: sinon.stub(),
            getCachedDevice: sinon.stub().returns(undefined),
            setCachedDevice: sinon.stub(),
            removeCachedDevice: sinon.stub(),
            clearExpiredDevices: sinon.stub(),
            getDeviceIdForIp: sinon.stub().returns(undefined),
            setDeviceIdForIp: sinon.stub()
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

            manager.setScanNeeded();

            expect(eventSpy.calledOnce).to.be.true;
        });

        it('does not emit event when scanNeeded is already true', () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);
            manager.setScanNeeded(); // Set to true first

            const eventSpy = sinon.spy();
            manager.on('scanNeeded-changed', eventSpy);

            manager.setScanNeeded(); // Set to true again

            expect(eventSpy.called).to.be.false;
        });

    });

    describe('timeSinceLastScan', () => {
        it('returns Infinity when no scan has occurred', () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);
            expect(manager.timeSinceLastScan).to.equal(Infinity);
        });

        it('returns elapsed time after refresh', () => {
            const clock = sinon.useFakeTimers();
            try {
                manager = new DeviceManager(vscode.context, mockGlobalStateManager);

                manager.refresh(true);

                clock.tick(5_000);

                expect(manager.timeSinceLastScan).to.be.greaterThanOrEqual(5_000);
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

            manager.setScanNeeded();
            expect(handler.calledOnce).to.be.true;

            unsubscribe();

            // Reset via refresh and try again
            manager.refresh(true);
            manager.setScanNeeded();
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

        it('sets firstRequestForDevices to false', () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);
            expect(manager.firstRequestForDevices).to.be.true;

            manager.getAllDevices();

            expect(manager.firstRequestForDevices).to.be.false;
        });

        it('sorts devices: sticks first, then boxes, then TVs', () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);

            const tv = createMockDevice({
                id: 'tv-1',
                deviceInfo: { 'default-device-name': 'Roku TV', 'is-tv': 'true', 'is-stick': 'false' }
            });
            const stick = createMockDevice({
                id: 'stick-1',
                deviceInfo: { 'default-device-name': 'Roku Stick', 'is-tv': 'false', 'is-stick': 'true' }
            });
            const box = createMockDevice({
                id: 'box-1',
                deviceInfo: { 'default-device-name': 'Roku Express', 'is-tv': 'false', 'is-stick': 'false' }
            });

            // Add devices in wrong order
            manager['devices'].push(tv);
            manager['devices'].push(box);
            manager['devices'].push(stick);

            const devices = manager.getAllDevices();

            expect(devices[0].id).to.equal('stick-1');
            expect(devices[1].id).to.equal('box-1');
            expect(devices[2].id).to.equal('tv-1');
        });

        it('sorts by name within same form factor', () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);

            const boxB = createMockDevice({
                id: 'box-b',
                deviceInfo: { 'default-device-name': 'Roku B', 'is-tv': 'false', 'is-stick': 'false' }
            });
            const boxA = createMockDevice({
                id: 'box-a',
                deviceInfo: { 'default-device-name': 'Roku A', 'is-tv': 'false', 'is-stick': 'false' }
            });
            const boxC = createMockDevice({
                id: 'box-c',
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

            manager.setScanNeeded();
            expect(eventSpy.calledOnce).to.be.true;

            // Before refresh, calling setScanNeeded again should not emit
            manager.setScanNeeded();
            expect(eventSpy.calledOnce).to.be.true;

            // After refresh, the flag is reset so event should fire again
            manager.refresh(true);
            manager.setScanNeeded();
            expect(eventSpy.calledTwice).to.be.true;
        });

        it('sets lastScanDate', () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);

            expect(manager.timeSinceLastScan).to.equal(Infinity);

            manager.refresh(true);

            // After refresh, timeSinceLastScan should be very small (just happened)
            expect(manager.timeSinceLastScan).to.be.lessThan(100);
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

            const device1 = createMockDevice({ id: 'device-1', ip: '192.168.1.101' });
            const device2 = createMockDevice({ id: 'device-2', ip: '192.168.1.102' });
            (manager as any).devices = [device1, device2];

            const resolveDeviceSpy = sinon.stub(manager as any, 'resolveDevice').returns(Promise.resolve(true) as any);

            await (manager as any).checkDevicesHealth(true);

            expect(resolveDeviceSpy.calledTwice).to.be.true;
        });

        it('only checks stale devices when force=false', async () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);

            const device1 = createMockDevice({ id: 'device-1', ip: '192.168.1.101' });
            const device2 = createMockDevice({ id: 'device-2', ip: '192.168.1.102' });
            (manager as any).devices = [device1, device2];

            // Mark device1 as recently checked (not stale)
            (manager as any).lastHealthCheckTime.set('device-1', Date.now());

            const resolveDeviceSpy = sinon.stub(manager as any, 'resolveDevice').returns(Promise.resolve(true) as any);

            await (manager as any).checkDevicesHealth(false);

            // Only device2 should be checked (device1 is not stale)
            expect(resolveDeviceSpy.calledOnce).to.be.true;
            expect(resolveDeviceSpy.firstCall.args[0].id).to.equal('device-2');
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
            (manager as any).lastHealthCheckTime.set(device.id, Date.now());

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

        it('waits for settle timer even after min duration', () => {
            const clock = sinon.useFakeTimers();
            try {
                manager = new DeviceManager(vscode.context, mockGlobalStateManager);
                (vscode.window as any).state = { focused: true };

                const scanEndedSpy = sinon.spy();
                manager.on('scan-ended', scanEndedSpy);

                manager.refresh(true);

                // Add device at 2.9s to reset settle timer (before min time fires at 3s)
                clock.tick(2_900);
                manager['setDevice'](createMockDevice({ id: 'new-device' }));

                // Min timer fires at 3s, but settle timer was reset to 2.9s + 1.5s = 4.4s
                clock.tick(100); // Now at 3s
                expect(scanEndedSpy.called).to.be.false; // Still waiting for settle

                // Advance to just before new settle timer fires
                clock.tick(1_400); // Now at 4.4s
                expect(scanEndedSpy.calledOnce).to.be.true; // Settle fired, scan ends
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

                manager['removeDevice'](device.id);

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
                manager['setDevice'](createMockDevice({ id: 'device-1' }));
                expect(devicesChangedSpy.calledOnce).to.be.true;

                // Subsequent calls within throttle window are queued
                clock.tick(10);
                manager['setDevice'](createMockDevice({ id: 'device-2' }));
                clock.tick(10);
                manager['setDevice'](createMockDevice({ id: 'device-3' }));

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

            resolveHealth(device.deviceInfo);
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

            const device = createMockDevice();
            manager['devices'].push(device);

            sinon.stub(rokuDeploy, 'getDeviceInfo').resolves(device.deviceInfo);

            const result = await manager.checkDeviceHealth(device, true);

            expect(result).to.be.true;
        });

        it('ignores stale health check response when newer check completes first', async () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);
            (vscode.window as any).state = { focused: true };

            const device = createMockDevice();
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
            resolveFastCheck(device.deviceInfo);
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

            const device1 = createMockDevice({ id: 'device-1' });
            const device2 = createMockDevice({ id: 'device-2' });
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
            resolveDevice2(device2.deviceInfo);
            await result2;

            // Device 1 completes second (healthy)
            resolveDevice1(device1.deviceInfo);
            await result1;

            // Both devices should be online - sequence numbers are independent
            expect(manager['devices'].length).to.equal(2);
            expect(manager['devices'].find(d => d.id === 'device-1').deviceState).to.equal('online');
            expect(manager['devices'].find(d => d.id === 'device-2').deviceState).to.equal('online');
        });
    });

    describe('removeDevice', () => {
        it('clears lastUsedDevice when removed device matches', () => {
            const clock = sinon.useFakeTimers();
            try {
                manager = new DeviceManager(vscode.context, mockGlobalStateManager);
                (vscode.window as any).state = { focused: true };

                const device = createMockDevice();
                manager['devices'].push(device);
                manager.lastUsedDevice = device;

                expect(manager.lastUsedDevice).to.equal(device);

                manager['removeDevice'](device.id);

                expect(manager.lastUsedDevice).to.be.undefined;
            } finally {
                clock.restore();
            }
        });

        it('does not clear lastUsedDevice when different device is removed', () => {
            const clock = sinon.useFakeTimers();
            try {
                manager = new DeviceManager(vscode.context, mockGlobalStateManager);
                (vscode.window as any).state = { focused: true };

                const device1 = createMockDevice({ id: 'device-1' });
                const device2 = createMockDevice({ id: 'device-2' });
                manager['devices'].push(device1, device2);
                manager.lastUsedDevice = device1;

                manager['removeDevice'](device2.id);

                expect(manager.lastUsedDevice).to.equal(device1);
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

                manager['removeDevice'](device.id);

                expect(mockGlobalStateManager.removeLastSeenDevice.calledWith('test-network-hash', device.id)).to.be.true;
            } finally {
                clock.restore();
            }
        });
    });

    describe('loadLastSeenDevices', () => {
        it('merges cached devices with existing devices', () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);

            // Add a configured device (configured devices are preserved)
            const existingDevice = createMockDevice({ id: 'existing' });
            existingDevice.configuredDevice = { host: '192.168.1.100' };
            manager['devices'].push(existingDevice);

            // Setup cache to return a different device
            mockGlobalStateManager.getLastSeenDeviceIds.returns(['cached-device']);
            mockGlobalStateManager.getCachedDevice.returns({
                id: 'cached-device',
                ip: '192.168.1.200',
                location: 'http://192.168.1.200:8060',
                deviceInfo: { 'default-device-name': 'Cached Roku' }
            });

            manager['loadLastSeenDevices']();

            // Should have both devices (merges instead of clearing)
            expect(manager['devices'].length).to.equal(2);
            expect(manager['devices'].some(d => d.id === 'existing')).to.be.true;
            expect(manager['devices'].some(d => d.id === 'cached-device')).to.be.true;
        });

        it('loads cached devices as pending state', () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);

            mockGlobalStateManager.getLastSeenDeviceIds.returns(['device-1']);
            mockGlobalStateManager.getCachedDevice.returns({
                id: 'device-1',
                ip: '192.168.1.100',
                location: 'http://192.168.1.100:8060',
                deviceInfo: { 'default-device-name': 'Test Roku' }
            });

            manager['loadLastSeenDevices']();

            expect(manager['devices'][0].deviceState).to.equal('pending');
        });

        it('removes stale entries when cache returns undefined', () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);

            mockGlobalStateManager.getLastSeenDeviceIds.returns(['stale-device']);
            mockGlobalStateManager.getCachedDevice.returns(undefined);

            manager['loadLastSeenDevices']();

            expect(manager['devices'].length).to.equal(0);
            expect(mockGlobalStateManager.removeLastSeenDevice.calledWith('test-network-hash', 'stale-device')).to.be.true;
        });
    });

    describe('getDeviceById', () => {
        it('returns device when found', () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);

            const device = createMockDevice({ id: 'target-device' });
            manager['devices'].push(device);

            const result = manager.getDeviceById('target-device');

            expect(result).to.equal(device);
        });

        it('returns undefined when not found', () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);

            const result = manager.getDeviceById('nonexistent');

            expect(result).to.be.undefined;
        });
    });

    describe('processDiscoveredIp', () => {
        const mockDeviceInfo = {
            'device-id': 'test-device-123',
            'default-device-name': 'Roku Express',
            'developer-enabled': 'true',
            'is-stick': 'false',
            'is-tv': 'false'
        };

        it('fetches device info and upserts device', async () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);

            sinon.stub(rokuDeploy, 'getDeviceInfo').resolves(mockDeviceInfo as any);

            await manager['processDiscoveredIp']('192.168.1.100', false);

            expect(manager['devices'].length).to.equal(1);
            expect(manager['devices'][0].ip).to.equal('192.168.1.100');
            expect(manager['devices'][0].id).to.equal('test-device-123');
            expect(manager['devices'][0].deviceState).to.equal('online');
        });

        it('filters non-developer devices by default', async () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);

            sinon.stub(rokuDeploy, 'getDeviceInfo').resolves({
                ...mockDeviceInfo,
                'developer-enabled': 'false'
            } as any);

            await manager['processDiscoveredIp']('192.168.1.100', false);

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

            await manager['processDiscoveredIp']('192.168.1.100', false);

            expect(manager['devices'].length).to.equal(1);
        });

        it('handles string "true" for developer-enabled', async () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);

            sinon.stub(rokuDeploy, 'getDeviceInfo').resolves({
                ...mockDeviceInfo,
                'developer-enabled': 'true'
            } as any);

            await manager['processDiscoveredIp']('192.168.1.100', false);

            expect(manager['devices'].length).to.equal(1);
        });

        it('handles network errors gracefully', async () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);

            sinon.stub(rokuDeploy, 'getDeviceInfo').rejects(new Error('Network error'));

            // Should not throw
            await manager['processDiscoveredIp']('192.168.1.100', false);

            expect(manager['devices'].length).to.equal(0);
        });

        it('shows toast for isAlive new devices when showInfoMessages enabled', async () => {
            (vscode.workspace.getConfiguration as sinon.SinonStub).returns({
                get: () => undefined,
                deviceDiscovery: {
                    enabled: false,
                    showInfoMessages: true
                }
            } as any);

            manager = new DeviceManager(vscode.context, mockGlobalStateManager);

            sinon.stub(rokuDeploy, 'getDeviceInfo').resolves(mockDeviceInfo as any);
            const showInfoStub = sinon.stub(vscode.window, 'showInformationMessage').resolves();

            await manager['processDiscoveredIp']('192.168.1.100', true);

            expect(showInfoStub.calledOnce).to.be.true;
            expect(showInfoStub.firstCall.args[0]).to.include('Roku Express');
        });

        it('does not show toast for scan responses', async () => {
            (vscode.workspace.getConfiguration as sinon.SinonStub).returns({
                get: () => undefined,
                deviceDiscovery: {
                    enabled: false,
                    showInfoMessages: true
                }
            } as any);

            manager = new DeviceManager(vscode.context, mockGlobalStateManager);

            sinon.stub(rokuDeploy, 'getDeviceInfo').resolves(mockDeviceInfo as any);
            const showInfoStub = sinon.stub(vscode.window, 'showInformationMessage').resolves();

            await manager['processDiscoveredIp']('192.168.1.100', false);

            expect(showInfoStub.called).to.be.false;
        });
    });

    describe('getDeviceInfoCached', () => {
        it('only makes one network call for rapid successive requests', async () => {
            manager = new DeviceManager(vscode.context, mockGlobalStateManager);

            const getDeviceInfoStub = sinon.stub(rokuDeploy, 'getDeviceInfo').resolves({
                'device-id': 'device-123',
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
            it('preserves configuredDevice when merging by ID', () => {
                manager = new DeviceManager(vscode.context, mockGlobalStateManager);

                // Add configured device
                const configured = { host: '192.168.1.100', name: 'My Roku' };
                const configuredDevice = createMockDevice({
                    id: 'device-123',
                    ip: '192.168.1.100',
                    configuredDevice: configured
                });
                manager['devices'].push(configuredDevice);

                // Update same device without configuredDevice (simulating discovery)
                manager['setDevice']({
                    ...createMockDevice({ id: 'device-123', ip: '192.168.1.100' }),
                    configuredDevice: undefined
                });

                expect(manager['devices'].length).to.equal(1);
                expect(manager['devices'][0].configuredDevice).to.deep.equal(configured);
            });

            it('preserves configuredDevice when merging by IP', () => {
                manager = new DeviceManager(vscode.context, mockGlobalStateManager);

                // Add configured device with host as ID (before resolution)
                const configured = { host: '192.168.1.100', name: 'My Roku' };
                const configuredDevice = createMockDevice({
                    id: '192.168.1.100', // Using IP as ID before resolution
                    ip: '192.168.1.100',
                    configuredDevice: configured
                });
                manager['devices'].push(configuredDevice);

                // Update with real device ID (simulating resolution)
                manager['setDevice']({
                    ...createMockDevice({ id: 'real-device-id', ip: '192.168.1.100' }),
                    configuredDevice: undefined
                });

                expect(manager['devices'].length).to.equal(1);
                expect(manager['devices'][0].id).to.equal('real-device-id');
                expect(manager['devices'][0].configuredDevice).to.deep.equal(configured);
            });

            it('uses configured name over discovered name', () => {
                manager = new DeviceManager(vscode.context, mockGlobalStateManager);

                const configured = { host: '192.168.1.100', name: 'My Custom Name' };
                manager['setDevice'](createMockDevice({
                    id: 'device-123',
                    configuredDevice: configured,
                    deviceInfo: { 'user-device-name': 'Discovered Name' }
                }));

                expect(manager['devices'][0].deviceInfo['user-device-name']).to.equal('My Custom Name');
            });
        });

        describe('markDeviceUnreachable', () => {
            it('marks configured device as offline when cache exists', () => {
                manager = new DeviceManager(vscode.context, mockGlobalStateManager);

                const configured = { host: '192.168.1.100' };
                manager['devices'].push(createMockDevice({
                    id: 'device-123',
                    configuredDevice: configured
                }));

                // Simulate cache exists
                mockGlobalStateManager.getCachedDevice.returns({ id: 'device-123' });

                manager['markDeviceUnreachable']('device-123');

                expect(manager['devices'].length).to.equal(1);
                expect(manager['devices'][0].deviceState).to.equal('offline');
            });

            it('marks configured device as offline when no cache exists (icon logic determines warning vs disconnect)', () => {
                manager = new DeviceManager(vscode.context, mockGlobalStateManager);

                const configured = { host: '192.168.1.100' };
                manager['devices'].push(createMockDevice({
                    id: 'device-123',
                    configuredDevice: configured
                }));

                // Simulate no cache - view layer uses hasDeviceCache() to show warning icon
                mockGlobalStateManager.getCachedDevice.returns(undefined);

                manager['markDeviceUnreachable']('device-123');

                expect(manager['devices'].length).to.equal(1);
                // State is always 'offline' - icon logic uses cache check to distinguish
                expect(manager['devices'][0].deviceState).to.equal('offline');
                // hasDeviceCache() would return false, triggering warning icon in view
                expect(manager.hasDeviceCache('device-123')).to.equal(false);
            });

            it('removes discovered-only device when unreachable', () => {
                manager = new DeviceManager(vscode.context, mockGlobalStateManager);

                // Add discovered device (no configuredDevice)
                manager['devices'].push(createMockDevice({ id: 'device-123' }));

                manager['markDeviceUnreachable']('device-123');

                expect(manager['devices'].length).to.equal(0);
            });
        });

        describe('getAllDevices sorting', () => {
            it('sorts configured devices before discovered devices', () => {
                manager = new DeviceManager(vscode.context, mockGlobalStateManager);

                // Add discovered device first
                manager['devices'].push(createMockDevice({
                    id: 'discovered-1',
                    deviceInfo: { 'default-device-name': 'AAA Discovered' }
                }));

                // Add configured device second
                manager['devices'].push(createMockDevice({
                    id: 'configured-1',
                    configuredDevice: { host: '192.168.1.200' },
                    deviceInfo: { 'default-device-name': 'ZZZ Configured' }
                }));

                const result = manager.getAllDevices();

                // Configured should be first despite alphabetical ordering
                expect(result[0].id).to.equal('configured-1');
                expect(result[1].id).to.equal('discovered-1');
            });
        });

        describe('loadLastSeenDevices', () => {
            it('preserves configured devices and removes discovered-only', () => {
                manager = new DeviceManager(vscode.context, mockGlobalStateManager);

                // Add configured device
                manager['devices'].push(createMockDevice({
                    id: 'configured-1',
                    configuredDevice: { host: '192.168.1.100' }
                }));

                // Add discovered device
                manager['devices'].push(createMockDevice({ id: 'discovered-1' }));

                manager['loadLastSeenDevices']();

                // Only configured device should remain
                expect(manager['devices'].length).to.equal(1);
                expect(manager['devices'][0].id).to.equal('configured-1');
                expect(manager['devices'][0].deviceState).to.equal('pending');
            });
        });

        describe('resolveDevice', () => {
            it('preserves configuredDevice after successful resolution', async () => {
                manager = new DeviceManager(vscode.context, mockGlobalStateManager);

                const configured = { host: '192.168.1.100', name: 'My Roku' };
                const device = createMockDevice({
                    id: 'device-123',
                    ip: '192.168.1.100',
                    configuredDevice: configured,
                    deviceState: 'pending'
                });
                manager['devices'].push(device);

                sinon.stub(rokuDeploy, 'getDeviceInfo').resolves({
                    'device-id': 'device-123',
                    'default-device-name': 'Roku Express'
                } as any);

                await manager['resolveDevice'](device);

                expect(manager['devices'][0].deviceState).to.equal('online');
                expect(manager['devices'][0].configuredDevice).to.deep.equal(configured);
            });
        });
    });
});
