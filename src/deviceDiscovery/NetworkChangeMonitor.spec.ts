import { expect } from 'chai';
import * as sinon from 'sinon';
import * as os from 'os';
import { NetworkChangeMonitor, getNetworkHash } from './NetworkChangeMonitor';

const DEFAULT_TIMEOUT = 3 * 60 * 1_000; // 3 minutes

describe('NetworkChangeMonitor', () => {
    let networkInterfacesStub: sinon.SinonStub;

    beforeEach(() => {
        networkInterfacesStub = sinon.stub(os, 'networkInterfaces');
    });

    afterEach(() => {
        sinon.restore();
    });

    describe('getNetworkHash', () => {
        it('returns consistent hash for same network state', () => {
            networkInterfacesStub.returns({
                'en0': [{
                    address: '192.168.1.100',
                    netmask: '255.255.255.0',
                    family: 'IPv4',
                    internal: false
                }]
            });

            const hash1 = getNetworkHash();
            const hash2 = getNetworkHash();

            expect(hash1).to.equal(hash2);
        });

        it('returns different hash when network changes', () => {
            networkInterfacesStub.returns({
                'en0': [{
                    address: '192.168.1.100',
                    netmask: '255.255.255.0',
                    family: 'IPv4',
                    internal: false
                }]
            });
            const hash1 = getNetworkHash();

            networkInterfacesStub.returns({
                'en0': [{
                    address: '10.0.0.50',
                    netmask: '255.255.255.0',
                    family: 'IPv4',
                    internal: false
                }]
            });
            const hash2 = getNetworkHash();

            expect(hash1).to.not.equal(hash2);
        });

        it('returns "no-network" when no external interfaces', () => {
            networkInterfacesStub.returns({
                'lo0': [{
                    address: '127.0.0.1',
                    netmask: '255.0.0.0',
                    family: 'IPv4',
                    internal: true
                }]
            });

            expect(getNetworkHash()).to.equal('no-network');
        });

        it('excludes internal/loopback interfaces', () => {
            networkInterfacesStub.returns({
                'lo0': [{
                    address: '127.0.0.1',
                    netmask: '255.0.0.0',
                    family: 'IPv4',
                    internal: true
                }],
                'en0': [{
                    address: '192.168.1.100',
                    netmask: '255.255.255.0',
                    family: 'IPv4',
                    internal: false
                }]
            });
            const hashWithLoopback = getNetworkHash();

            networkInterfacesStub.returns({
                'en0': [{
                    address: '192.168.1.100',
                    netmask: '255.255.255.0',
                    family: 'IPv4',
                    internal: false
                }]
            });
            const hashWithoutLoopback = getNetworkHash();

            expect(hashWithLoopback).to.equal(hashWithoutLoopback);
        });
    });

    describe('NetworkChangeMonitor class', () => {
        let monitor: NetworkChangeMonitor;
        let callback: sinon.SinonStub;
        let clock: sinon.SinonFakeTimers;

        beforeEach(() => {
            clock = sinon.useFakeTimers();
            callback = sinon.stub();
            networkInterfacesStub.returns({
                'en0': [{
                    address: '192.168.1.100',
                    netmask: '255.255.255.0',
                    family: 'IPv4',
                    internal: false
                }]
            });
        });

        afterEach(() => {
            monitor?.stop();
            clock.restore();
        });

        describe('constructor', () => {
            it('takes initial IP snapshot without calling callback', () => {
                monitor = new NetworkChangeMonitor(callback);
                expect(callback.called).to.be.false;
            });
        });

        describe('network change detection', () => {
            it('fires callback when IP is added', () => {
                monitor = new NetworkChangeMonitor(callback);
                monitor.start();

                // Add a new IP
                networkInterfacesStub.returns({
                    'en0': [{
                        address: '192.168.1.100',
                        netmask: '255.255.255.0',
                        family: 'IPv4',
                        internal: false
                    }],
                    'en1': [{
                        address: '192.168.1.101',
                        netmask: '255.255.255.0',
                        family: 'IPv4',
                        internal: false
                    }]
                });

                clock.tick(DEFAULT_TIMEOUT); // Default interval

                expect(callback.calledOnce).to.be.true;
            });

            it('fires callback when IP is removed', () => {
                // Start with two IPs
                networkInterfacesStub.returns({
                    'en0': [{
                        address: '192.168.1.100',
                        netmask: '255.255.255.0',
                        family: 'IPv4',
                        internal: false
                    }],
                    'en1': [{
                        address: '192.168.1.101',
                        netmask: '255.255.255.0',
                        family: 'IPv4',
                        internal: false
                    }]
                });

                monitor = new NetworkChangeMonitor(callback);
                monitor.start();

                // Remove one IP
                networkInterfacesStub.returns({
                    'en0': [{
                        address: '192.168.1.100',
                        netmask: '255.255.255.0',
                        family: 'IPv4',
                        internal: false
                    }]
                });

                clock.tick(DEFAULT_TIMEOUT); // Default interval

                expect(callback.calledOnce).to.be.true;
            });

            it('does not fire callback when IPs unchanged', () => {
                monitor = new NetworkChangeMonitor(callback);
                monitor.start();

                // Same IPs
                clock.tick(DEFAULT_TIMEOUT);
                clock.tick(DEFAULT_TIMEOUT);
                clock.tick(DEFAULT_TIMEOUT);

                expect(callback.called).to.be.false;
            });

        });

        describe('stop', () => {
            it('prevents future checks', () => {
                monitor = new NetworkChangeMonitor(callback);
                monitor.start();
                monitor.stop();

                // Change the network
                networkInterfacesStub.returns({
                    'en0': [{
                        address: '10.0.0.50',
                        netmask: '255.255.255.0',
                        family: 'IPv4',
                        internal: false
                    }]
                });

                clock.tick(DEFAULT_TIMEOUT);
                clock.tick(DEFAULT_TIMEOUT);

                expect(callback.called).to.be.false;
            });

            it('is safe to call when not started', () => {
                monitor = new NetworkChangeMonitor(callback);
                expect(() => monitor.stop()).to.not.throw();
            });
        });
    });
});
