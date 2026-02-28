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
        return {
            location: 'http://192.168.1.100:8060',
            ip: '192.168.1.100',
            id: 'device-123',
            deviceState: 'online',
            deviceInfo: {
                'default-device-name': 'Roku Express',
                'device-id': 'device-123',
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
            getCachedDevice: sinon.stub().returns(undefined),
            setCachedDevice: sinon.stub(),
            removeCachedDevice: sinon.stub()
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
        sinon.restore();
    });

    describe('setScanNeeded', () => {
        it('emits event when scanNeeded is false', () => {
            manager = new DeviceManager(mockGlobalStateManager);

            const eventSpy = sinon.spy();
            manager.on('scanNeeded-changed', eventSpy);

            manager.setScanNeeded();

            expect(eventSpy.calledOnce).to.be.true;
        });

        it('does not emit event when scanNeeded is already true', () => {
            manager = new DeviceManager(mockGlobalStateManager);
            manager.setScanNeeded(); // Set to true first

            const eventSpy = sinon.spy();
            manager.on('scanNeeded-changed', eventSpy);

            manager.setScanNeeded(); // Set to true again

            expect(eventSpy.called).to.be.false;
        });

    });

    describe('timeSinceLastScan', () => {
        it('returns Infinity when no scan has occurred', () => {
            manager = new DeviceManager(mockGlobalStateManager);
            expect(manager.timeSinceLastScan).to.equal(Infinity);
        });

        it('returns elapsed time after refresh', () => {
            const clock = sinon.useFakeTimers();
            try {
                manager = new DeviceManager(mockGlobalStateManager);

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
            manager = new DeviceManager(mockGlobalStateManager);

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
            manager = new DeviceManager(mockGlobalStateManager);

            const disposables: any[] = [];
            manager.on('scanNeeded-changed', () => { }, disposables);

            expect(disposables.length).to.equal(1);
            expect(disposables[0]).to.have.property('dispose');
        });
    });

    describe('getActiveDevices', () => {
        it('returns empty array when no devices', () => {
            manager = new DeviceManager(mockGlobalStateManager);
            expect(manager.getActiveDevices()).to.deep.equal([]);
        });

        it('sets firstRequestForDevices to false', () => {
            manager = new DeviceManager(mockGlobalStateManager);
            expect(manager.firstRequestForDevices).to.be.true;

            manager.getActiveDevices();

            expect(manager.firstRequestForDevices).to.be.false;
        });

        it('sorts devices: sticks first, then boxes, then TVs', () => {
            manager = new DeviceManager(mockGlobalStateManager);

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

            const devices = manager.getActiveDevices();

            expect(devices[0].id).to.equal('stick-1');
            expect(devices[1].id).to.equal('box-1');
            expect(devices[2].id).to.equal('tv-1');
        });

        it('sorts by name within same form factor', () => {
            manager = new DeviceManager(mockGlobalStateManager);

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

            const devices = manager.getActiveDevices();

            expect(devices[0].deviceInfo['default-device-name']).to.equal('Roku A');
            expect(devices[1].deviceInfo['default-device-name']).to.equal('Roku B');
            expect(devices[2].deviceInfo['default-device-name']).to.equal('Roku C');
        });
    });

    describe('refresh', () => {
        it('resets scanNeeded flag (allows event to fire again)', () => {
            manager = new DeviceManager(mockGlobalStateManager);

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
            manager = new DeviceManager(mockGlobalStateManager);

            expect(manager.timeSinceLastScan).to.equal(Infinity);

            manager.refresh(true);

            // After refresh, timeSinceLastScan should be very small (just happened)
            expect(manager.timeSinceLastScan).to.be.lessThan(100);
        });
    });

    describe('checkDeviceHealthIfStale', () => {
        it('skips check if within cooldown period', async () => {
            manager = new DeviceManager(mockGlobalStateManager);

            const device = createMockDevice();
            const checkHealthSpy = sinon.stub(manager, 'checkDeviceHealth').resolves(true);

            // First call - should check
            await manager.checkDeviceHealthIfStale(device);
            expect(checkHealthSpy.calledOnce).to.be.true;

            // Second call immediately - should skip
            await manager.checkDeviceHealthIfStale(device);
            expect(checkHealthSpy.calledOnce).to.be.true; // Still just one call
        });

        it('checks again after cooldown expires', async () => {
            // Start at non-zero time so first check triggers (now - 0 > cooldown)
            const clock = sinon.useFakeTimers(Date.now());
            try {
                manager = new DeviceManager(mockGlobalStateManager);

                const device = createMockDevice();
                const checkHealthSpy = sinon.stub(manager, 'checkDeviceHealth').resolves(true);

                // First call
                await manager.checkDeviceHealthIfStale(device);
                expect(checkHealthSpy.calledOnce).to.be.true;

                // Advance past cooldown (5 minutes)
                clock.tick((5 * 60 * 1_000) + 1);

                // Second call - should check again
                await manager.checkDeviceHealthIfStale(device);
                expect(checkHealthSpy.calledTwice).to.be.true;
            } finally {
                clock.restore();
            }
        });

    });

    describe('scan events', () => {
        it('emits scan-started when scan begins', () => {
            const clock = sinon.useFakeTimers();
            try {
                manager = new DeviceManager(mockGlobalStateManager);

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
                manager = new DeviceManager(mockGlobalStateManager);

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
                manager = new DeviceManager(mockGlobalStateManager);
                (vscode.window as any).state = { focused: true };

                const scanEndedSpy = sinon.spy();
                manager.on('scan-ended', scanEndedSpy);

                manager.refresh(true);

                // Add device at 2.9s to reset settle timer (before min time fires at 3s)
                clock.tick(2_900);
                manager['upsertDevice'](createMockDevice({ id: 'new-device' }));

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
                manager = new DeviceManager(mockGlobalStateManager);

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
                manager = new DeviceManager(mockGlobalStateManager);

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
                manager = new DeviceManager(mockGlobalStateManager);
                (vscode.window as any).state = { focused: true };

                const devicesChangedSpy = sinon.spy();
                manager.on('devices-changed', devicesChangedSpy);

                manager['upsertDevice'](createMockDevice());

                // Event is debounced, so not fired immediately
                expect(devicesChangedSpy.called).to.be.false;

                // Advance past debounce time (400ms)
                clock.tick(400);
                expect(devicesChangedSpy.calledOnce).to.be.true;
            } finally {
                clock.restore();
            }
        });

        it('emits when device is removed', () => {
            const clock = sinon.useFakeTimers();
            try {
                manager = new DeviceManager(mockGlobalStateManager);
                (vscode.window as any).state = { focused: true };

                // Add a device first
                const device = createMockDevice();
                manager['devices'].push(device);

                const devicesChangedSpy = sinon.spy();
                manager.on('devices-changed', devicesChangedSpy);

                manager['removeDevice'](device.id);

                // Advance past debounce time (400ms)
                clock.tick(400);
                expect(devicesChangedSpy.calledOnce).to.be.true;
            } finally {
                clock.restore();
            }
        });

        it('debounces multiple rapid changes into single event', () => {
            const clock = sinon.useFakeTimers();
            try {
                manager = new DeviceManager(mockGlobalStateManager);
                (vscode.window as any).state = { focused: true };

                const devicesChangedSpy = sinon.spy();
                manager.on('devices-changed', devicesChangedSpy);

                // Add multiple devices rapidly
                manager['upsertDevice'](createMockDevice({ id: 'device-1' }));
                clock.tick(100); // 100ms - within 400ms debounce window
                manager['upsertDevice'](createMockDevice({ id: 'device-2' }));
                clock.tick(100); // 200ms total, but debounce reset at 100ms
                manager['upsertDevice'](createMockDevice({ id: 'device-3' }));

                // Still within debounce window from last upsert
                expect(devicesChangedSpy.called).to.be.false;

                // Advance past debounce time from last upsert (400ms)
                clock.tick(400);
                expect(devicesChangedSpy.calledOnce).to.be.true; // Only one event
            } finally {
                clock.restore();
            }
        });

        it('does not emit when window is not focused', () => {
            const clock = sinon.useFakeTimers();
            try {
                manager = new DeviceManager(mockGlobalStateManager);
                (vscode.window as any).state = { focused: false };

                const devicesChangedSpy = sinon.spy();
                manager.on('devices-changed', devicesChangedSpy);

                manager['upsertDevice'](createMockDevice());

                clock.tick(100);
                expect(devicesChangedSpy.called).to.be.false;
            } finally {
                clock.restore();
            }
        });
    });

    describe('checkDeviceHealth', () => {
        it('sets device to pending during health check', async () => {
            manager = new DeviceManager(mockGlobalStateManager);
            (vscode.window as any).state = { focused: true };

            const device = createMockDevice();
            manager['devices'].push(device);

            // Stub rokuDeploy.getDeviceInfo to delay so we can check pending state
            let resolveHealth: (value: any) => void;
            const healthPromise = new Promise<any>(resolve => {
                resolveHealth = resolve;
            });
            sinon.stub(rokuDeploy, 'getDeviceInfo').returns(healthPromise);

            const checkPromise = manager.checkDeviceHealth(device);

            // Device should be pending during check
            expect(manager['devices'][0].deviceState).to.equal('pending');

            resolveHealth(device.deviceInfo);
            await checkPromise;

            // Device should be online after successful check
            expect(manager['devices'][0].deviceState).to.equal('online');
        });

        it('removes device when health check fails', async () => {
            manager = new DeviceManager(mockGlobalStateManager);
            (vscode.window as any).state = { focused: true };

            const device = createMockDevice();
            manager['devices'].push(device);

            sinon.stub(rokuDeploy, 'getDeviceInfo').rejects(new Error('Device not responding'));

            const result = await manager.checkDeviceHealth(device);

            expect(result).to.be.false;
            expect(manager['devices'].length).to.equal(0);
        });

        it('returns true when device is healthy', async () => {
            manager = new DeviceManager(mockGlobalStateManager);

            const device = createMockDevice();
            manager['devices'].push(device);

            sinon.stub(rokuDeploy, 'getDeviceInfo').resolves(device.deviceInfo);

            const result = await manager.checkDeviceHealth(device);

            expect(result).to.be.true;
        });

        it('ignores stale health check response when newer check completes first', async () => {
            manager = new DeviceManager(mockGlobalStateManager);
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
            const slowResult = manager.checkDeviceHealth(device);

            // Start second (fast) health check - will return healthy
            const fastResult = manager.checkDeviceHealth(device);

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
            manager = new DeviceManager(mockGlobalStateManager);
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
            const result1 = manager.checkDeviceHealth(device1);
            const result2 = manager.checkDeviceHealth(device2);

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
                manager = new DeviceManager(mockGlobalStateManager);
                (vscode.window as any).state = { focused: true };

                const device = createMockDevice();
                manager['devices'].push(device);
                manager.lastUsedDevice = device;

                expect(manager.lastUsedDevice).to.equal(device);

                manager['removeDevice'](device.id);

                expect(manager.lastUsedDevice).to.be.null;
            } finally {
                clock.restore();
            }
        });

        it('does not clear lastUsedDevice when different device is removed', () => {
            const clock = sinon.useFakeTimers();
            try {
                manager = new DeviceManager(mockGlobalStateManager);
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

        it('removes device from cache and lastSeenDevices', () => {
            const clock = sinon.useFakeTimers();
            try {
                manager = new DeviceManager(mockGlobalStateManager);
                (vscode.window as any).state = { focused: true };

                const device = createMockDevice();
                manager['devices'].push(device);

                manager['removeDevice'](device.id);

                expect(mockGlobalStateManager.removeCachedDevice.calledWith(device.id)).to.be.true;
                expect(mockGlobalStateManager.removeLastSeenDevice.calledWith('test-network-hash', device.id)).to.be.true;
            } finally {
                clock.restore();
            }
        });
    });

    describe('loadLastSeenDevices', () => {
        it('clears existing devices before loading', () => {
            manager = new DeviceManager(mockGlobalStateManager);

            // Add a device manually
            const existingDevice = createMockDevice({ id: 'existing' });
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

            // Should only have the cached device, not the existing one
            expect(manager['devices'].length).to.equal(1);
            expect(manager['devices'][0].id).to.equal('cached-device');
        });

        it('loads cached devices as pending state', () => {
            manager = new DeviceManager(mockGlobalStateManager);

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
            manager = new DeviceManager(mockGlobalStateManager);

            mockGlobalStateManager.getLastSeenDeviceIds.returns(['stale-device']);
            mockGlobalStateManager.getCachedDevice.returns(undefined);

            manager['loadLastSeenDevices']();

            expect(manager['devices'].length).to.equal(0);
            expect(mockGlobalStateManager.removeLastSeenDevice.calledWith('test-network-hash', 'stale-device')).to.be.true;
        });
    });

    describe('getDeviceById', () => {
        it('returns device when found', () => {
            manager = new DeviceManager(mockGlobalStateManager);

            const device = createMockDevice({ id: 'target-device' });
            manager['devices'].push(device);

            const result = manager.getDeviceById('target-device');

            expect(result).to.equal(device);
        });

        it('returns undefined when not found', () => {
            manager = new DeviceManager(mockGlobalStateManager);

            const result = manager.getDeviceById('nonexistent');

            expect(result).to.be.undefined;
        });
    });
});
