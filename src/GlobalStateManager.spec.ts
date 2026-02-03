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
                update: (key: string, value: any) => { storage[key] = value; }
            }
        };
        manager = new GlobalStateManager(mockContext);
    });

    describe('knownDeviceIps', () => {
        it('returns empty array when no IPs stored', () => {
            expect(manager.getKnownDeviceIpsByNetwork(testNetwork)).to.deep.equal([]);
        });

        it('adds a new IP', () => {
            manager.addKnownDeviceIp(testNetwork, '192.168.1.100');
            expect(manager.getKnownDeviceIpsByNetwork(testNetwork)).to.deep.equal(['192.168.1.100']);
        });

        it('does not add duplicate IPs', () => {
            manager.addKnownDeviceIp(testNetwork, '192.168.1.100');
            manager.addKnownDeviceIp(testNetwork, '192.168.1.100');
            expect(manager.getKnownDeviceIpsByNetwork(testNetwork)).to.deep.equal(['192.168.1.100']);
        });

        it('removes an IP', () => {
            manager.addKnownDeviceIp(testNetwork, '192.168.1.100');
            manager.addKnownDeviceIp(testNetwork, '192.168.1.101');
            manager.removeKnownDeviceIp(testNetwork, '192.168.1.100');
            expect(manager.getKnownDeviceIpsByNetwork(testNetwork)).to.deep.equal(['192.168.1.101']);
        });

        it('keeps IPs separate by network', () => {
            const network1 = 'network-1';
            const network2 = 'network-2';
            manager.addKnownDeviceIp(network1, '192.168.1.100');
            manager.addKnownDeviceIp(network2, '10.0.0.100');
            expect(manager.getKnownDeviceIpsByNetwork(network1)).to.deep.equal(['192.168.1.100']);
            expect(manager.getKnownDeviceIpsByNetwork(network2)).to.deep.equal(['10.0.0.100']);
        });
    });
});
