import { expect } from 'chai';
import * as sinon from 'sinon';
import { vscode } from '../mockVscode.spec';
import type { RokuDeviceDetails } from './ActiveDeviceManager';
import { ActiveDeviceManager } from './ActiveDeviceManager';
import * as NetworkChangeMonitorModule from './NetworkChangeMonitor';

describe('ActiveDeviceManager', () => {
    let manager: ActiveDeviceManager;
    let mockGlobalStateManager: any;

    function createMockDevice(overrides: Partial<RokuDeviceDetails> & { deviceInfo?: Partial<RokuDeviceDetails['deviceInfo']> } = {}): RokuDeviceDetails {
        return {
            location: 'http://192.168.1.100:8060',
            ip: '192.168.1.100',
            id: 'device-123',
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
            getKnownDeviceIpsByNetwork: sinon.stub().returns([]),
            addKnownDeviceIp: sinon.stub(),
            removeKnownDeviceIp: sinon.stub()
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

    describe('needsFutureBroadcast', () => {
        it('emits event when changed from false to true', () => {
            manager = new ActiveDeviceManager(mockGlobalStateManager);

            const eventSpy = sinon.spy();
            manager.on('need-future-broadcast', eventSpy);

            manager.needsFutureBroadcast = true;

            expect(eventSpy.calledOnce).to.be.true;
        });

        it('does not emit event when changed from true to true', () => {
            manager = new ActiveDeviceManager(mockGlobalStateManager);
            manager.needsFutureBroadcast = true; // Set to true first

            const eventSpy = sinon.spy();
            manager.on('need-future-broadcast', eventSpy);

            manager.needsFutureBroadcast = true; // Set to true again

            expect(eventSpy.called).to.be.false;
        });

        it('does not emit event when changed from true to false', () => {
            manager = new ActiveDeviceManager(mockGlobalStateManager);
            manager.needsFutureBroadcast = true;

            const eventSpy = sinon.spy();
            manager.on('need-future-broadcast', eventSpy);

            manager.needsFutureBroadcast = false;

            expect(eventSpy.called).to.be.false;
        });

        it('does not emit event when changed from false to false', () => {
            manager = new ActiveDeviceManager(mockGlobalStateManager);

            const eventSpy = sinon.spy();
            manager.on('need-future-broadcast', eventSpy);

            manager.needsFutureBroadcast = false;

            expect(eventSpy.called).to.be.false;
        });
    });

    describe('timeSinceLastBroadcast', () => {
        it('returns 0 when no broadcast has occurred', () => {
            manager = new ActiveDeviceManager(mockGlobalStateManager);
            expect(manager.timeSinceLastBroadcast).to.equal(0);
        });

        it('returns elapsed time after discoverAll', () => {
            const clock = sinon.useFakeTimers();
            try {
                manager = new ActiveDeviceManager(mockGlobalStateManager);

                manager.discoverAll();

                clock.tick(5000);

                expect(manager.timeSinceLastBroadcast).to.be.greaterThanOrEqual(5000);
            } finally {
                clock.restore();
            }
        });
    });

    describe('timeSinceLastDiscoveredDevice', () => {
        it('returns 0 when no device has been discovered', () => {
            manager = new ActiveDeviceManager(mockGlobalStateManager);
            expect(manager.timeSinceLastDiscoveredDevice).to.equal(0);
        });
    });

    describe('on', () => {
        it('registers handler and returns unsubscribe function', () => {
            manager = new ActiveDeviceManager(mockGlobalStateManager);

            const handler = sinon.spy();
            const unsubscribe = manager.on('need-future-broadcast', handler);

            manager.needsFutureBroadcast = true;
            expect(handler.calledOnce).to.be.true;

            unsubscribe();

            manager.needsFutureBroadcast = false;
            manager.needsFutureBroadcast = true;
            expect(handler.calledOnce).to.be.true; // Still just one call
        });

        it('adds to disposables array if provided', () => {
            manager = new ActiveDeviceManager(mockGlobalStateManager);

            const disposables: any[] = [];
            manager.on('need-future-broadcast', () => { }, disposables);

            expect(disposables.length).to.equal(1);
            expect(disposables[0]).to.have.property('dispose');
        });
    });

    describe('getActiveDevices', () => {
        it('returns empty array when no devices', () => {
            manager = new ActiveDeviceManager(mockGlobalStateManager);
            expect(manager.getActiveDevices()).to.deep.equal([]);
        });

        it('sets firstRequestForDevices to false', () => {
            manager = new ActiveDeviceManager(mockGlobalStateManager);
            expect(manager.firstRequestForDevices).to.be.true;

            manager.getActiveDevices();

            expect(manager.firstRequestForDevices).to.be.false;
        });

        it('sorts devices: sticks first, then boxes, then TVs', () => {
            manager = new ActiveDeviceManager(mockGlobalStateManager);

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
            manager['deviceCache'].set(tv.id, tv);
            manager['deviceCache'].set(box.id, box);
            manager['deviceCache'].set(stick.id, stick);

            const devices = manager.getActiveDevices();

            expect(devices[0].id).to.equal('stick-1');
            expect(devices[1].id).to.equal('box-1');
            expect(devices[2].id).to.equal('tv-1');
        });

        it('sorts by name within same form factor', () => {
            manager = new ActiveDeviceManager(mockGlobalStateManager);

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

            manager['deviceCache'].set(boxB.id, boxB);
            manager['deviceCache'].set(boxC.id, boxC);
            manager['deviceCache'].set(boxA.id, boxA);

            const devices = manager.getActiveDevices();

            expect(devices[0].deviceInfo['default-device-name']).to.equal('Roku A');
            expect(devices[1].deviceInfo['default-device-name']).to.equal('Roku B');
            expect(devices[2].deviceInfo['default-device-name']).to.equal('Roku C');
        });
    });

    describe('discoverAll', () => {
        it('sets needsFutureBroadcast to false', () => {
            manager = new ActiveDeviceManager(mockGlobalStateManager);
            manager.needsFutureBroadcast = true;

            manager.discoverAll();

            expect(manager.needsFutureBroadcast).to.be.false;
        });

        it('sets lastBroadcastDate', () => {
            manager = new ActiveDeviceManager(mockGlobalStateManager);

            expect(manager.timeSinceLastBroadcast).to.equal(0);

            manager.discoverAll();

            // After discoverAll, timeSinceLastBroadcast should be very small (just happened)
            expect(manager.timeSinceLastBroadcast).to.be.lessThan(100);
        });
    });

    describe('checkDeviceHealthIfStale', () => {
        it('skips check if within cooldown period', async () => {
            manager = new ActiveDeviceManager(mockGlobalStateManager);

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
                manager = new ActiveDeviceManager(mockGlobalStateManager);

                const device = createMockDevice();
                const checkHealthSpy = sinon.stub(manager, 'checkDeviceHealth').resolves(true);

                // First call
                await manager.checkDeviceHealthIfStale(device);
                expect(checkHealthSpy.calledOnce).to.be.true;

                // Advance past cooldown (5 minutes)
                clock.tick((5 * 60 * 1000) + 1);

                // Second call - should check again
                await manager.checkDeviceHealthIfStale(device);
                expect(checkHealthSpy.calledTwice).to.be.true;
            } finally {
                clock.restore();
            }
        });

        it('returns true without checking if within cooldown', async () => {
            manager = new ActiveDeviceManager(mockGlobalStateManager);

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

    describe('BROADCAST_STALE_THRESHOLD_MS', () => {
        it('is 30 minutes', () => {
            expect(ActiveDeviceManager.BROADCAST_STALE_THRESHOLD_MS).to.equal(30 * 60 * 1000);
        });
    });
});
