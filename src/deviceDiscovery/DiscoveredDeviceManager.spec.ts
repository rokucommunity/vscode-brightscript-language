import { expect } from 'chai';
import * as sinon from 'sinon';
import { DiscoveredDeviceManager } from './DiscoveredDeviceManager';

describe('DiscoveredDeviceManager', () => {
    let manager: DiscoveredDeviceManager;
    let removeLastSeenDevice: sinon.SinonStub;
    let networkId: string;

    beforeEach(() => {
        networkId = 'net-1';
        removeLastSeenDevice = sinon.stub();
        const globalStateManager = { removeLastSeenDevice: removeLastSeenDevice } as any;
        manager = new DiscoveredDeviceManager(globalStateManager, () => networkId);
    });

    describe('setDevice', () => {
        it('adds a new device', () => {
            manager.setDevice('192.168.1.100', 'AAA');
            expect(manager.getAll()).to.have.lengthOf(1);
            expect(manager.getAll()[0]).to.include({ ip: '192.168.1.100', serialNumber: 'AAA' });
        });

        it('adds a device with no serial', () => {
            manager.setDevice('192.168.1.100', undefined);
            expect(manager.getAll()[0]).to.include({ ip: '192.168.1.100' });
            expect(manager.getAll()[0].serialNumber).to.be.undefined;
        });

        it('updates an existing entry at the same IP in place, preserving state fields', () => {
            manager.setDevice('192.168.1.100', undefined);
            manager.getAll()[0].state = 'online';

            manager.setDevice('192.168.1.100', 'AAA');

            expect(manager.getAll()).to.have.lengthOf(1);
            expect(manager.getAll()[0]).to.include({ ip: '192.168.1.100', serialNumber: 'AAA', state: 'online' });
        });

        it('does not clobber a known serial with undefined on update', () => {
            manager.setDevice('192.168.1.100', 'AAA');
            manager.setDevice('192.168.1.100', undefined);
            expect(manager.getAll()[0].serialNumber).to.equal('AAA');
        });

        it('serial dedupe: removes the old-IP entry when the same serial appears at a new IP', () => {
            manager.setDevice('192.168.1.100', 'AAA');
            const result = manager.setDevice('192.168.1.200', 'AAA');

            expect(manager.getAll()).to.have.lengthOf(1);
            expect(manager.getAll()[0].ip).to.equal('192.168.1.200');
            expect(result.removedIp).to.equal('192.168.1.100');
        });

        it('returns no removedIp when there is no serial-dedupe removal', () => {
            const result = manager.setDevice('192.168.1.100', 'AAA');
            expect(result.removedIp).to.be.undefined;
        });

        it('keeps different serials at different IPs as separate entries', () => {
            manager.setDevice('192.168.1.100', 'AAA');
            manager.setDevice('192.168.1.101', 'BBB');
            expect(manager.getAll()).to.have.lengthOf(2);
        });
    });

    describe('removeDevice', () => {
        it('removes the entry at the given IP and returns it', () => {
            manager.setDevice('192.168.1.100', 'AAA');
            const removed = manager.removeDevice('192.168.1.100');
            expect(removed).to.include({ ip: '192.168.1.100', serialNumber: 'AAA' });
            expect(manager.getAll()).to.have.lengthOf(0);
        });

        it('returns undefined when no device is at that IP', () => {
            expect(manager.removeDevice('10.0.0.1')).to.be.undefined;
        });

        it('clears the last-seen hint (by serial + current network) when the entry had a serial', () => {
            manager.setDevice('192.168.1.100', 'AAA');
            manager.removeDevice('192.168.1.100');
            expect(removeLastSeenDevice.calledOnceWithExactly('net-1', 'AAA')).to.be.true;
        });

        it('uses the current network id from the provider', () => {
            manager.setDevice('192.168.1.100', 'AAA');
            networkId = 'net-2';
            manager.removeDevice('192.168.1.100');
            expect(removeLastSeenDevice.calledOnceWithExactly('net-2', 'AAA')).to.be.true;
        });

        it('does not touch the last-seen hint when the entry had no serial', () => {
            manager.setDevice('192.168.1.100', undefined);
            manager.removeDevice('192.168.1.100');
            expect(removeLastSeenDevice.called).to.be.false;
        });
    });

    describe('lookups', () => {
        beforeEach(() => {
            manager.setDevice('192.168.1.100', 'AAA');
            manager.setDevice('192.168.1.101', 'BBB');
        });

        it('findBySerial returns the matching entry', () => {
            expect(manager.findBySerial('BBB')?.ip).to.equal('192.168.1.101');
        });

        it('findByIp returns the matching entry', () => {
            expect(manager.findByIp('192.168.1.100')?.serialNumber).to.equal('AAA');
        });

        it('returns undefined for no match', () => {
            expect(manager.findBySerial('ZZZ')).to.be.undefined;
            expect(manager.findByIp('10.0.0.1')).to.be.undefined;
        });
    });

    describe('clear', () => {
        it('empties the list in place (same array reference)', () => {
            manager.setDevice('192.168.1.100', 'AAA');
            const ref = manager.getAll();
            manager.clear();
            expect(manager.getAll()).to.have.lengthOf(0);
            expect(manager.getAll()).to.equal(ref);
        });
    });
});
