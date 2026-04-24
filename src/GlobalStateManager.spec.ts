import { expect } from 'chai';
import { GlobalStateManager } from './GlobalStateManager';

describe('GlobalStateManager', () => {
    let manager: GlobalStateManager;
    let mockContext: any;
    let storage: Record<string, any>;
    const testNetwork = 'test-network-hash';

    beforeEach(() => {
        storage = {};
        mockContext = {
            globalState: {
                get: (key: string) => storage[key],
                update: (key: string, value: any) => {
                    storage[key] = value;
                }
            }
        };
        manager = new GlobalStateManager(mockContext);
    });

    describe('lastSeenDevices', () => {
        it('returns empty array when no devices stored', () => {
            expect(manager.getLastSeenDevices(testNetwork)).to.deep.equal([]);
        });

        it('adds a new device', () => {
            manager.addLastSeenDevice(testNetwork, 'device-123');
            expect(manager.getLastSeenDevices(testNetwork)).to.deep.equal(['device-123']);
        });

        it('does not add duplicate devices', () => {
            manager.addLastSeenDevice(testNetwork, 'device-123');
            manager.addLastSeenDevice(testNetwork, 'device-123');
            expect(manager.getLastSeenDevices(testNetwork)).to.deep.equal(['device-123']);
        });

        it('removes a device', () => {
            manager.addLastSeenDevice(testNetwork, 'device-123');
            manager.addLastSeenDevice(testNetwork, 'device-456');
            manager.removeLastSeenDevice(testNetwork, 'device-123');
            expect(manager.getLastSeenDevices(testNetwork)).to.deep.equal(['device-456']);
        });

        it('keeps devices separate by network', () => {
            const network1 = 'network-1';
            const network2 = 'network-2';
            manager.addLastSeenDevice(network1, 'device-123');
            manager.addLastSeenDevice(network2, 'device-456');
            expect(manager.getLastSeenDevices(network1)).to.deep.equal(['device-123']);
            expect(manager.getLastSeenDevices(network2)).to.deep.equal(['device-456']);
        });
    });

    describe('deviceCache', () => {
        const testDevice = {
            serialNumber: 'device-123',
            deviceInfo: {
                'device-id': 'device-123',
                'default-device-name': 'Roku Express'
            },
            createdAt: Date.now()
        };

        it('returns undefined when device not cached', () => {
            expect(manager.getCachedDevice('device-123')).to.be.undefined;
        });

        it('caches and retrieves a device', () => {
            manager.setCachedDevice('device-123', testDevice);
            expect(manager.getCachedDevice('device-123')).to.deep.equal(testDevice);
        });

        it('removes a cached device', () => {
            manager.setCachedDevice('device-123', testDevice);
            manager.removeCachedDevice('device-123');
            expect(manager.getCachedDevice('device-123')).to.be.undefined;
        });

        it('keeps devices separate by serial number', () => {
            const device1 = { ...testDevice, serialNumber: 'device-123' };
            const device2 = { ...testDevice, serialNumber: 'device-456' };
            manager.setCachedDevice('device-123', device1);
            manager.setCachedDevice('device-456', device2);
            expect(manager.getCachedDevice('device-123')).to.deep.equal(device1);
            expect(manager.getCachedDevice('device-456')).to.deep.equal(device2);
        });
    });

    describe('clearExpiredDevices', () => {
        const testDevice = {
            serialNumber: 'device-123',
            deviceInfo: {
                'device-id': 'device-123',
                'default-device-name': 'Roku Express'
            },
            createdAt: Date.now()
        };

        beforeEach(() => {
            // Use a short expiration for testing (1 second)
            (manager as any).LAST_SEEN_NETWORK_EXPIRATION = 1_000;
        });

        it('keeps devices that are not expired', () => {
            manager.setCachedDevice('device-123', { ...testDevice, createdAt: Date.now() });
            manager.clearExpiredDevices();
            expect(manager.getCachedDevice('device-123')).to.not.be.undefined;
        });

        it('removes devices that are expired', () => {
            manager.setCachedDevice('device-123', { ...testDevice, createdAt: Date.now() - 2_000 });
            manager.clearExpiredDevices();
            expect(manager.getCachedDevice('device-123')).to.be.undefined;
        });

        it('removes only expired devices and keeps fresh ones', () => {
            manager.setCachedDevice('old-device', { ...testDevice, serialNumber: 'old-device', createdAt: Date.now() - 2_000 });
            manager.setCachedDevice('new-device', { ...testDevice, serialNumber: 'new-device', createdAt: Date.now() });
            manager.clearExpiredDevices();
            expect(manager.getCachedDevice('old-device')).to.be.undefined;
            expect(manager.getCachedDevice('new-device')).to.not.be.undefined;
        });

        it('handles empty cache', () => {
            manager.clearExpiredDevices();
            expect(manager.getCachedDevice('device-123')).to.be.undefined;
        });
    });

    describe('setSerialNumberForIp', () => {
        it('stores IP to serial mapping', () => {
            manager.setSerialNumberForIp(testNetwork, '192.168.1.100', 'serial-123');
            expect(manager.getSerialNumberForIp('192.168.1.100', testNetwork)).to.equal('serial-123');
        });

        it('removes old IP entry when serial moves to new IP', () => {
            manager.setSerialNumberForIp(testNetwork, '192.168.1.100', 'serial-123');
            manager.setSerialNumberForIp(testNetwork, '192.168.1.200', 'serial-123');

            // Old IP should no longer have the serial
            expect(manager.getSerialNumberForIp('192.168.1.100', testNetwork)).to.be.undefined;
            // New IP should have the serial
            expect(manager.getSerialNumberForIp('192.168.1.200', testNetwork)).to.equal('serial-123');
        });

        it('allows same serial at same IP (update timestamp)', () => {
            manager.setSerialNumberForIp(testNetwork, '192.168.1.100', 'serial-123');
            manager.setSerialNumberForIp(testNetwork, '192.168.1.100', 'serial-123');

            // IP should still have the serial
            expect(manager.getSerialNumberForIp('192.168.1.100', testNetwork)).to.equal('serial-123');
        });

        it('allows different serials at different IPs', () => {
            manager.setSerialNumberForIp(testNetwork, '192.168.1.100', 'serial-123');
            manager.setSerialNumberForIp(testNetwork, '192.168.1.200', 'serial-456');

            expect(manager.getSerialNumberForIp('192.168.1.100', testNetwork)).to.equal('serial-123');
            expect(manager.getSerialNumberForIp('192.168.1.200', testNetwork)).to.equal('serial-456');
        });

        it('replaces serial at same IP', () => {
            manager.setSerialNumberForIp(testNetwork, '192.168.1.100', 'serial-123');
            manager.setSerialNumberForIp(testNetwork, '192.168.1.100', 'serial-456');

            expect(manager.getSerialNumberForIp('192.168.1.100', testNetwork)).to.equal('serial-456');
        });
    });
});
