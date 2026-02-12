import { expect } from 'chai';
import * as sinon from 'sinon';
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
                'is-stick': false,
                'is-tv': false,
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

        it('emits event again after refresh resets the flag', () => {
            manager = new DeviceManager(mockGlobalStateManager);

            const eventSpy = sinon.spy();
            manager.on('scanNeeded-changed', eventSpy);

            manager.setScanNeeded();
            expect(eventSpy.calledOnce).to.be.true;

            // refresh() clears the scanNeeded flag internally
            manager.refresh(true);

            manager.setScanNeeded();
            expect(eventSpy.calledTwice).to.be.true;
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

    describe('timeSinceLastDiscoveredDevice', () => {
        it('returns 0 when no device has been discovered', () => {
            manager = new DeviceManager(mockGlobalStateManager);
            expect(manager.timeSinceLastDiscoveredDevice).to.equal(0);
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
                deviceInfo: { 'default-device-name': 'Roku TV', 'is-tv': true, 'is-stick': false }
            });
            const stick = createMockDevice({
                id: 'stick-1',
                deviceInfo: { 'default-device-name': 'Roku Stick', 'is-tv': false, 'is-stick': true }
            });
            const box = createMockDevice({
                id: 'box-1',
                deviceInfo: { 'default-device-name': 'Roku Express', 'is-tv': false, 'is-stick': false }
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
                deviceInfo: { 'default-device-name': 'Roku B', 'is-tv': false, 'is-stick': false }
            });
            const boxA = createMockDevice({
                id: 'box-a',
                deviceInfo: { 'default-device-name': 'Roku A', 'is-tv': false, 'is-stick': false }
            });
            const boxC = createMockDevice({
                id: 'box-c',
                deviceInfo: { 'default-device-name': 'Roku C', 'is-tv': false, 'is-stick': false }
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

        it('returns true without checking if within cooldown', async () => {
            manager = new DeviceManager(mockGlobalStateManager);

            const device = createMockDevice();
            sinon.stub(manager, 'checkDeviceHealth').resolves(false);

            // First call - actually checks, returns false
            const result1 = await manager.checkDeviceHealthIfStale(device);
            expect(result1).to.be.false;

            // Second call - skips check, returns true (assumes healthy)
            const result2 = await manager.checkDeviceHealthIfStale(device);
            expect(result2).to.be.true;
        });
    });

    describe('STALE_SCAN_THRESHOLD_MS', () => {
        it('is 30 minutes', () => {
            expect(DeviceManager.STALE_SCAN_THRESHOLD_MS).to.equal(30 * 60 * 1_000);
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

                // Advance past debounce time (100ms)
                clock.tick(100);
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

                // Advance past debounce time
                clock.tick(100);
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
                clock.tick(50); // 50ms - within debounce window
                manager['upsertDevice'](createMockDevice({ id: 'device-2' }));
                clock.tick(50); // 100ms total, but debounce reset at 50ms
                manager['upsertDevice'](createMockDevice({ id: 'device-3' }));

                // Still within debounce window from last upsert
                expect(devicesChangedSpy.called).to.be.false;

                // Advance past debounce time from last upsert
                clock.tick(100);
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
});
