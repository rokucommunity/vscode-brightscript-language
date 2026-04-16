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

        describe('start after long stop', () => {
            it('handles restart after being stopped longer than the interval', () => {
                monitor = new NetworkChangeMonitor(callback);
                monitor.start();

                // Let it run for one full interval
                clock.tick(DEFAULT_TIMEOUT);
                expect(callback.called).to.be.false; // No network change

                // Stop the monitor
                monitor.stop();

                // Advance time well past another interval (e.g., 2x the interval)
                clock.tick(DEFAULT_TIMEOUT * 2);

                // Change the network while stopped
                networkInterfacesStub.returns({
                    'en0': [{
                        address: '10.0.0.50',
                        netmask: '255.255.255.0',
                        family: 'IPv4',
                        internal: false
                    }]
                });

                // Restart the monitor
                monitor.start();

                // The callback should fire immediately since we've been stopped > interval
                // and the network changed
                expect(callback.calledOnce).to.be.true;
            });

            it('computes correct remaining time when restarted within interval', () => {
                monitor = new NetworkChangeMonitor(callback);
                monitor.start();

                // Let it run for one full interval
                clock.tick(DEFAULT_TIMEOUT);

                // Stop after a short time (less than full interval)
                clock.tick(DEFAULT_TIMEOUT / 2);
                monitor.stop();

                // Advance only a small amount (still within the "remaining" time)
                clock.tick(DEFAULT_TIMEOUT / 4);

                // Restart - should NOT immediately execute since we're within the interval
                monitor.start();

                // Change network
                networkInterfacesStub.returns({
                    'en0': [{
                        address: '10.0.0.50',
                        netmask: '255.255.255.0',
                        family: 'IPv4',
                        internal: false
                    }]
                });

                // Callback should NOT have fired yet
                expect(callback.called).to.be.false;

                // Now advance to when the timer should fire
                // We should need to wait: interval - (time since last execution)
                // Last execution was at DEFAULT_TIMEOUT
                // We're now at DEFAULT_TIMEOUT + DEFAULT_TIMEOUT/2 + DEFAULT_TIMEOUT/4 = 1.75 * DEFAULT_TIMEOUT
                // Remaining should be: interval - 0.75*interval = 0.25*interval
                clock.tick((DEFAULT_TIMEOUT / 4) + 1);

                expect(callback.calledOnce).to.be.true;
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
