import { expect } from 'chai';
import { GlobalStateManager } from './GlobalStateManager';

describe('GlobalStateManager', () => {
    let manager: GlobalStateManager;
    let mockContext: any;
    let storage: Record<string, any>;

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
            expect(manager.knownDeviceIpsByNetwork).to.deep.equal([]);
        });

        it('adds a new IP', () => {
            manager.addKnownDeviceIp('192.168.1.100');
            expect(manager.knownDeviceIpsByNetwork).to.deep.equal(['192.168.1.100']);
        });

        it('does not add duplicate IPs', () => {
            manager.addKnownDeviceIp('192.168.1.100');
            manager.addKnownDeviceIp('192.168.1.100');
            expect(manager.knownDeviceIpsByNetwork).to.deep.equal(['192.168.1.100']);
        });

        it('removes an IP', () => {
            manager.addKnownDeviceIp('192.168.1.100');
            manager.addKnownDeviceIp('192.168.1.101');
            manager.removeKnownDeviceIp('192.168.1.100');
            expect(manager.knownDeviceIpsByNetwork).to.deep.equal(['192.168.1.101']);
        });
    });
});
