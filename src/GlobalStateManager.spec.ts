import { expect } from 'chai';
let Module = require('module');
import { vscode } from './mockVscode.spec';

//override the "require" call to mock certain items (specifically 'vscode')
const { require: oldRequire } = Module.prototype;
Module.prototype.require = function hijacked(file) {
    if (file === 'vscode') {
        return vscode;
    } else {
        return oldRequire.apply(this, arguments);
    }
};

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

    describe('serialNumberByIpForNetwork', () => {
        const network1 = 'network-hash-1';
        const network2 = 'network-hash-2';
        const serial1 = 'SERIAL001';
        const serial2 = 'SERIAL002';

        it('stores a new IP→serial mapping', () => {
            manager.setSerialNumberForIp(network1, '192.168.1.10', serial1);
            expect(manager.getSerialNumberForIp('192.168.1.10', network1)).to.equal(serial1);
        });

        it('returns undefined for unknown IP', () => {
            expect(manager.getSerialNumberForIp('10.0.0.1', network1)).to.be.undefined;
        });

        it('removes old IP entry when same serial is seen at a new IP on the same network', () => {
            manager.setSerialNumberForIp(network1, '192.168.1.10', serial1);
            manager.setSerialNumberForIp(network1, '192.168.1.20', serial1);

            // New IP should resolve correctly
            expect(manager.getSerialNumberForIp('192.168.1.20', network1)).to.equal(serial1);
            // Old IP should no longer exist in the cache
            expect(manager.getSerialNumberForIp('192.168.1.10', network1)).to.be.undefined;
        });

        it('purges all stale entries when a serial accumulates multiple old IPs on the same network', () => {
            // Simulate a Roku that changed IPs several times
            manager.setSerialNumberForIp(network1, '192.168.1.10', serial1);
            manager.setSerialNumberForIp(network1, '192.168.1.11', serial1);
            manager.setSerialNumberForIp(network1, '192.168.1.12', serial1);
            // Now it moves to a new IP
            manager.setSerialNumberForIp(network1, '192.168.1.99', serial1);

            // Only the latest IP survives
            expect(manager.getSerialNumberForIp('192.168.1.99', network1)).to.equal(serial1);
            expect(manager.getSerialNumberForIp('192.168.1.10', network1)).to.be.undefined;
            expect(manager.getSerialNumberForIp('192.168.1.11', network1)).to.be.undefined;
            expect(manager.getSerialNumberForIp('192.168.1.12', network1)).to.be.undefined;
        });

        it('does not affect entries for a different serial on the same network', () => {
            manager.setSerialNumberForIp(network1, '192.168.1.10', serial1);
            manager.setSerialNumberForIp(network1, '192.168.1.20', serial2);
            // Move serial1 to a new IP
            manager.setSerialNumberForIp(network1, '192.168.1.30', serial1);

            expect(manager.getSerialNumberForIp('192.168.1.30', network1)).to.equal(serial1);
            // serial2 entry is untouched
            expect(manager.getSerialNumberForIp('192.168.1.20', network1)).to.equal(serial2);
        });

        it('does not remove entries for the same serial on a different network', () => {
            manager.setSerialNumberForIp(network1, '192.168.1.10', serial1);
            manager.setSerialNumberForIp(network2, '10.0.0.5', serial1);
            // Update serial1 on network1 only
            manager.setSerialNumberForIp(network1, '192.168.1.50', serial1);

            expect(manager.getSerialNumberForIp('192.168.1.50', network1)).to.equal(serial1);
            expect(manager.getSerialNumberForIp('192.168.1.10', network1)).to.be.undefined;
            // network2 entry should be untouched
            expect(manager.getSerialNumberForIp('10.0.0.5', network2)).to.equal(serial1);
        });

        it('getIpForSerial returns the most recent IP after deduplication', () => {
            manager.setSerialNumberForIp(network1, '192.168.1.10', serial1);
            manager.setSerialNumberForIp(network1, '192.168.1.20', serial1);

            expect(manager.getIpForSerial(serial1, network1)).to.equal('192.168.1.20');
        });

        it('overwrites mapping when the same IP is re-used by the same serial', () => {
            manager.setSerialNumberForIp(network1, '192.168.1.10', serial1);
            manager.setSerialNumberForIp(network1, '192.168.1.10', serial1);

            expect(manager.getSerialNumberForIp('192.168.1.10', network1)).to.equal(serial1);
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

    describe('getIpForSerial', () => {
        const networkA = 'network-hash-aaaaaa';
        const networkB = 'network-hash-bbbbbb';
        const networkC = 'network-hash-cccccc';

        it('returns undefined when no mappings exist', () => {
            expect(manager.getIpForSerial('ABC123')).to.be.undefined;
        });

        it('returns the IP when found in current network', () => {
            manager.setSerialNumberForIp(networkA, '10.0.1.100', 'ABC123');
            expect(manager.getIpForSerial('ABC123', networkA)).to.equal('10.0.1.100');
        });

        it('returns undefined when serial is not in current network and no other networks', () => {
            manager.setSerialNumberForIp(networkA, '10.0.1.100', 'ABC123');
            expect(manager.getIpForSerial('OTHER999', networkA)).to.be.undefined;
        });

        it('falls back to another network when serial not found in current network', () => {
            manager.setSerialNumberForIp(networkB, '10.0.2.200', 'ABC123');
            // networkA has no entry for ABC123
            expect(manager.getIpForSerial('ABC123', networkA)).to.equal('10.0.2.200');
        });

        it('returns the most recently updated IP across multiple networks', () => {
            const now = Date.now();
            // Manually inject entries with specific timestamps to control ordering
            const key = 'serialNumberByIpForNetwork';
            storage[key] = {
                [networkA]: {
                    '10.0.1.100': { serialNumber: 'ABC123', timestamp: now - 5_000 }
                },
                [networkB]: {
                    '10.0.2.200': { serialNumber: 'ABC123', timestamp: now - 1_000 }
                },
                [networkC]: {
                    '10.0.3.300': { serialNumber: 'ABC123', timestamp: now - 3_000 }
                }
            };

            // Should pick the most recently updated IP (from networkB)
            expect(manager.getIpForSerial('ABC123')).to.equal('10.0.2.200');
        });

        it('returns current network IP even if another network has a more recent timestamp', () => {
            const now = Date.now();
            const key = 'serialNumberByIpForNetwork';
            storage[key] = {
                [networkA]: {
                    '10.0.1.100': { serialNumber: 'ABC123', timestamp: now - 10_000 }
                },
                [networkB]: {
                    '10.0.2.200': { serialNumber: 'ABC123', timestamp: now - 1_000 }
                }
            };

            // Current network A has an older timestamp, but it should be preferred
            expect(manager.getIpForSerial('ABC123', networkA)).to.equal('10.0.1.100');
        });

        it('returns the most recently updated IP when same serial appears in multiple networks with no current network', () => {
            const now = Date.now();
            const key = 'serialNumberByIpForNetwork';
            storage[key] = {
                [networkA]: {
                    '10.0.1.100': { serialNumber: 'ABC123', timestamp: now - 9_000 },
                    '10.0.1.101': { serialNumber: 'XYZ789', timestamp: now - 2_000 }
                },
                [networkB]: {
                    '10.0.2.200': { serialNumber: 'ABC123', timestamp: now - 500 }
                }
            };

            // No current network specified - should return most recent across all networks
            expect(manager.getIpForSerial('ABC123')).to.equal('10.0.2.200');
        });

        it('does not confuse different serial numbers in the same network', () => {
            manager.setSerialNumberForIp(networkA, '10.0.1.100', 'ABC123');
            manager.setSerialNumberForIp(networkA, '10.0.1.101', 'XYZ789');

            expect(manager.getIpForSerial('ABC123', networkA)).to.equal('10.0.1.100');
            expect(manager.getIpForSerial('XYZ789', networkA)).to.equal('10.0.1.101');
        });
    });

    describe('getSerialNumberForIp', () => {
        const networkA = 'network-hash-aaaaaa';
        const networkB = 'network-hash-bbbbbb';
        const networkC = 'network-hash-cccccc';

        it('returns undefined when no mappings exist', () => {
            expect(manager.getSerialNumberForIp('10.0.1.100')).to.be.undefined;
        });

        it('returns the serial number when found in current network', () => {
            manager.setSerialNumberForIp(networkA, '10.0.1.100', 'ABC123');
            expect(manager.getSerialNumberForIp('10.0.1.100', networkA)).to.equal('ABC123');
        });

        it('falls back to another network when IP not found in current network', () => {
            manager.setSerialNumberForIp(networkB, '10.0.2.200', 'XYZ789');
            // networkA has no entry for this IP
            expect(manager.getSerialNumberForIp('10.0.2.200', networkA)).to.equal('XYZ789');
        });

        it('returns the most recently updated serial across multiple networks', () => {
            const now = Date.now();
            const key = 'serialNumberByIpForNetwork';
            storage[key] = {
                [networkA]: {
                    '10.0.1.100': { serialNumber: 'OLD123', timestamp: now - 5_000 }
                },
                [networkB]: {
                    '10.0.1.100': { serialNumber: 'NEW456', timestamp: now - 1_000 }
                },
                [networkC]: {
                    '10.0.1.100': { serialNumber: 'MID789', timestamp: now - 3_000 }
                }
            };

            // No current network - should return most recent by timestamp
            expect(manager.getSerialNumberForIp('10.0.1.100')).to.equal('NEW456');
        });

        it('returns current network serial even if another network has a more recent entry for the same IP', () => {
            const now = Date.now();
            const key = 'serialNumberByIpForNetwork';
            storage[key] = {
                [networkA]: {
                    '10.0.1.100': { serialNumber: 'LOCAL123', timestamp: now - 10_000 }
                },
                [networkB]: {
                    '10.0.1.100': { serialNumber: 'REMOTE456', timestamp: now - 1_000 }
                }
            };

            // Current network A preferred over the more recent networkB entry
            expect(manager.getSerialNumberForIp('10.0.1.100', networkA)).to.equal('LOCAL123');
        });
    });
});
