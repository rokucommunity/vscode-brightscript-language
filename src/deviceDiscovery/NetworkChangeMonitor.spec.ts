import { expect } from 'chai';
import * as sinon from 'sinon';
import * as os from 'os';
import { NetworkChangeMonitor, getNetworkHash } from './NetworkChangeMonitor';

const IDLE_INTERVAL = 3 * 60 * 1_000; // 3 minutes
const ALERT_TIER_1_INTERVAL = 1_000;
const ALERT_TIER_1_DURATION = 30_000;
const ALERT_TIER_2_INTERVAL = 5_000;
const ALERT_TIER_2_DURATION = 30_000;
const ALERT_TIER_3_INTERVAL = 15_000;
const ALERT_TIER_3_DURATION = 180_000;
const VERIFYING_INTERVAL = 1_000;
const VERIFYING_REQUIRED_COUNT = 3;

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
            monitor?.dispose();
            clock.restore();
        });

        describe('constructor', () => {
            it('takes initial IP snapshot without calling callback', () => {
                monitor = new NetworkChangeMonitor(callback);
                expect(callback.called).to.be.false;
            });

            it('initializes in idle state', () => {
                monitor = new NetworkChangeMonitor(callback);
                expect(monitor.getState()).to.equal('idle');
            });
        });

        describe('idle state', () => {
            it('fires callback when network changes', () => {
                monitor = new NetworkChangeMonitor(callback);
                monitor.start();

                // Change the network
                networkInterfacesStub.returns({
                    'en0': [{
                        address: '10.0.0.50',
                        netmask: '255.255.255.0',
                        family: 'IPv4',
                        internal: false
                    }]
                });

                clock.tick(IDLE_INTERVAL);

                expect(callback.calledOnce).to.be.true;
                expect(monitor.getState()).to.equal('idle');
            });

            it('does not fire callback when network unchanged', () => {
                monitor = new NetworkChangeMonitor(callback);
                monitor.start();

                clock.tick(IDLE_INTERVAL);
                clock.tick(IDLE_INTERVAL);
                clock.tick(IDLE_INTERVAL);

                expect(callback.called).to.be.false;
            });

            it('does not fire callback when network becomes no-network', () => {
                monitor = new NetworkChangeMonitor(callback);
                monitor.start();

                // Network goes down
                networkInterfacesStub.returns({
                    'lo0': [{
                        address: '127.0.0.1',
                        netmask: '255.0.0.0',
                        family: 'IPv4',
                        internal: true
                    }]
                });

                clock.tick(IDLE_INTERVAL);

                expect(callback.called).to.be.false;
            });

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

                clock.tick(IDLE_INTERVAL);

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

                clock.tick(IDLE_INTERVAL);

                expect(callback.calledOnce).to.be.true;
            });
        });

        describe('sleep detection', () => {
            it('enters alert state when sleep is simulated', () => {
                monitor = new NetworkChangeMonitor(callback);
                monitor.start();

                expect(monitor.getState()).to.equal('idle');

                // Simulate sleep detection
                monitor.simulateSleep();

                expect(monitor.getState()).to.equal('alert');
                expect(monitor.getAlertTier()).to.equal(1);
            });
        });

        describe('alert state', () => {
            beforeEach(() => {
                monitor = new NetworkChangeMonitor(callback);
                monitor.start();
                // Simulate sleep to enter alert state
                monitor.simulateSleep();
                expect(monitor.getState()).to.equal('alert');
            });

            it('broadcasts and enters verifying when network detected with different hash', () => {
                // Change network
                networkInterfacesStub.returns({
                    'en0': [{
                        address: '10.0.0.50',
                        netmask: '255.255.255.0',
                        family: 'IPv4',
                        internal: false
                    }]
                });

                clock.tick(ALERT_TIER_1_INTERVAL);

                expect(callback.calledOnce).to.be.true;
                expect(monitor.getState()).to.equal('verifying');
            });

            it('enters verifying without broadcast when network detected with same hash', () => {
                // Network unchanged (same as initial)
                clock.tick(ALERT_TIER_1_INTERVAL);

                expect(callback.called).to.be.false;
                expect(monitor.getState()).to.equal('verifying');
            });

            it('advances from tier 1 to tier 2 on timeout with no network', () => {
                // Simulate no network
                networkInterfacesStub.returns({
                    'lo0': [{
                        address: '127.0.0.1',
                        netmask: '255.0.0.0',
                        family: 'IPv4',
                        internal: true
                    }]
                });

                // Tick through tier 1 duration
                for (let elapsed = 0; elapsed < ALERT_TIER_1_DURATION; elapsed += ALERT_TIER_1_INTERVAL) {
                    clock.tick(ALERT_TIER_1_INTERVAL);
                }

                expect(monitor.getState()).to.equal('alert');
                expect(monitor.getAlertTier()).to.equal(2);
            });

            it('advances from tier 2 to tier 3 on timeout with no network', () => {
                // Simulate no network
                networkInterfacesStub.returns({
                    'lo0': [{
                        address: '127.0.0.1',
                        netmask: '255.0.0.0',
                        family: 'IPv4',
                        internal: true
                    }]
                });

                // Tick through tier 1
                for (let elapsed = 0; elapsed < ALERT_TIER_1_DURATION; elapsed += ALERT_TIER_1_INTERVAL) {
                    clock.tick(ALERT_TIER_1_INTERVAL);
                }
                expect(monitor.getAlertTier()).to.equal(2);

                // Tick through tier 2
                for (let elapsed = 0; elapsed < ALERT_TIER_2_DURATION; elapsed += ALERT_TIER_2_INTERVAL) {
                    clock.tick(ALERT_TIER_2_INTERVAL);
                }
                expect(monitor.getAlertTier()).to.equal(3);
            });

            it('returns to idle when tier 3 times out (gave up)', () => {
                // Simulate no network throughout
                networkInterfacesStub.returns({
                    'lo0': [{
                        address: '127.0.0.1',
                        netmask: '255.0.0.0',
                        family: 'IPv4',
                        internal: true
                    }]
                });

                // Tick through all tiers
                for (let elapsed = 0; elapsed < ALERT_TIER_1_DURATION; elapsed += ALERT_TIER_1_INTERVAL) {
                    clock.tick(ALERT_TIER_1_INTERVAL);
                }
                expect(monitor.getAlertTier()).to.equal(2);

                for (let elapsed = 0; elapsed < ALERT_TIER_2_DURATION; elapsed += ALERT_TIER_2_INTERVAL) {
                    clock.tick(ALERT_TIER_2_INTERVAL);
                }
                expect(monitor.getAlertTier()).to.equal(3);

                for (let elapsed = 0; elapsed < ALERT_TIER_3_DURATION; elapsed += ALERT_TIER_3_INTERVAL) {
                    clock.tick(ALERT_TIER_3_INTERVAL);
                }

                expect(monitor.getState()).to.equal('idle');
                // Should NOT have broadcast (gave up without finding network)
                expect(callback.called).to.be.false;
            });
        });

        describe('verifying state', () => {
            beforeEach(() => {
                monitor = new NetworkChangeMonitor(callback);
                monitor.start();
                // Simulate sleep then detect network to enter verifying
                monitor.simulateSleep();
                clock.tick(ALERT_TIER_1_INTERVAL); // Detect network, enter verifying
                expect(monitor.getState()).to.equal('verifying');
            });

            it('returns to idle after 3 consecutive matching polls', () => {
                // Tick through verifying checks
                for (let i = 0; i < VERIFYING_REQUIRED_COUNT; i++) {
                    clock.tick(VERIFYING_INTERVAL);
                }

                expect(monitor.getState()).to.equal('idle');
            });

            it('goes back to alert when hash changes (unstable)', () => {
                clock.tick(VERIFYING_INTERVAL); // First verifying check passes

                // Network changes during verifying
                networkInterfacesStub.returns({
                    'en0': [{
                        address: '10.0.0.99',
                        netmask: '255.255.255.0',
                        family: 'IPv4',
                        internal: false
                    }]
                });

                clock.tick(VERIFYING_INTERVAL);

                expect(monitor.getState()).to.equal('alert');
            });

            it('goes back to alert when no-network detected', () => {
                clock.tick(VERIFYING_INTERVAL); // First verifying check passes

                // Network goes down
                networkInterfacesStub.returns({
                    'lo0': [{
                        address: '127.0.0.1',
                        netmask: '255.0.0.0',
                        family: 'IPv4',
                        internal: true
                    }]
                });

                clock.tick(VERIFYING_INTERVAL);

                expect(monitor.getState()).to.equal('alert');
            });
        });

        describe('full scenarios', () => {
            it('sleep → no-network → network found → verifying passes → idle', () => {
                monitor = new NetworkChangeMonitor(callback);
                monitor.start();

                // Start with network down (simulating sleep disconnect)
                networkInterfacesStub.returns({
                    'lo0': [{
                        address: '127.0.0.1',
                        netmask: '255.0.0.0',
                        family: 'IPv4',
                        internal: true
                    }]
                });

                // Sleep detected
                monitor.simulateSleep();
                expect(monitor.getState()).to.equal('alert');

                // Poll a few times with no network
                clock.tick(ALERT_TIER_1_INTERVAL);
                clock.tick(ALERT_TIER_1_INTERVAL);
                expect(monitor.getState()).to.equal('alert');

                // Network comes back (different from initial)
                networkInterfacesStub.returns({
                    'en0': [{
                        address: '10.0.0.50',
                        netmask: '255.255.255.0',
                        family: 'IPv4',
                        internal: false
                    }]
                });

                clock.tick(ALERT_TIER_1_INTERVAL);
                expect(callback.calledOnce).to.be.true; // Broadcast!
                expect(monitor.getState()).to.equal('verifying');

                // Verifying checks pass
                for (let i = 0; i < VERIFYING_REQUIRED_COUNT; i++) {
                    clock.tick(VERIFYING_INTERVAL);
                }

                expect(monitor.getState()).to.equal('idle');
            });

            it('wake on same network → no broadcast, quick verifying', () => {
                monitor = new NetworkChangeMonitor(callback);
                monitor.start();

                // Sleep detected
                monitor.simulateSleep();
                expect(monitor.getState()).to.equal('alert');

                // Network still same
                clock.tick(ALERT_TIER_1_INTERVAL);
                expect(callback.called).to.be.false; // No broadcast
                expect(monitor.getState()).to.equal('verifying');

                // Verifying passes
                for (let i = 0; i < VERIFYING_REQUIRED_COUNT; i++) {
                    clock.tick(VERIFYING_INTERVAL);
                }

                expect(monitor.getState()).to.equal('idle');
                expect(callback.called).to.be.false; // Still no broadcast
            });

            it('flaky WiFi: broadcasts on each change, verifying fails, retries from alert', () => {
                monitor = new NetworkChangeMonitor(callback);
                monitor.start();

                // Sleep detected
                monitor.simulateSleep();
                expect(monitor.getState()).to.equal('alert');

                // Network comes back (changed)
                networkInterfacesStub.returns({
                    'en0': [{
                        address: '10.0.0.50',
                        netmask: '255.255.255.0',
                        family: 'IPv4',
                        internal: false
                    }]
                });
                clock.tick(ALERT_TIER_1_INTERVAL);
                expect(callback.callCount).to.equal(1);
                expect(monitor.getState()).to.equal('verifying');

                // Flaky: network changes again during verifying
                networkInterfacesStub.returns({
                    'en0': [{
                        address: '10.0.0.51',
                        netmask: '255.255.255.0',
                        family: 'IPv4',
                        internal: false
                    }]
                });
                clock.tick(VERIFYING_INTERVAL);
                expect(monitor.getState()).to.equal('alert'); // Back to alert

                // New network detected → broadcast
                clock.tick(ALERT_TIER_1_INTERVAL);
                expect(callback.callCount).to.equal(2);
                expect(monitor.getState()).to.equal('verifying');
            });
        });

        describe('start/stop', () => {
            it('stop prevents future checks', () => {
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

                clock.tick(IDLE_INTERVAL);
                clock.tick(IDLE_INTERVAL);

                expect(callback.called).to.be.false;
            });

            it('stop is safe to call when not started', () => {
                monitor = new NetworkChangeMonitor(callback);
                expect(() => monitor.stop()).to.not.throw();
            });

            it('handles restart after being stopped longer than the interval', () => {
                monitor = new NetworkChangeMonitor(callback);
                monitor.start();

                // Let it run for one full interval
                clock.tick(IDLE_INTERVAL);
                expect(callback.called).to.be.false; // No network change

                // Stop the monitor
                monitor.stop();

                // Advance time well past another interval
                clock.tick(IDLE_INTERVAL * 2);

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
                expect(callback.calledOnce).to.be.true;
            });
        });
    });
});
