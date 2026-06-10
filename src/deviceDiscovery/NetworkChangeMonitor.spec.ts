import { expect } from 'chai';
import * as sinon from 'sinon';
import * as os from 'os';
import { NetworkChangeMonitor, getNetworkHash } from './NetworkChangeMonitor';

const ALERT_INTERVAL = 1_000; // 1 second
const NORMAL_INTERVAL = 15_000; // 15 seconds
const ALERT_THRESHOLD = 30;

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

        it('excludes IPv6 link-local addresses (fe80::/10)', () => {
            // Real interface
            networkInterfacesStub.returns({
                'en0': [{
                    address: '192.168.1.100',
                    netmask: '255.255.255.0',
                    family: 'IPv4',
                    internal: false
                }]
            });
            const hashRealOnly = getNetworkHash();

            // Same real interface plus a bunch of link-local-only interfaces
            // (VPN tunnels, AirDrop, etc.) — should produce the same hash.
            networkInterfacesStub.returns({
                'en0': [{
                    address: '192.168.1.100',
                    netmask: '255.255.255.0',
                    family: 'IPv4',
                    internal: false
                }],
                'awdl0': [{
                    address: 'fe80::2c21:e0ff:fe03:9ee5',
                    netmask: 'ffff:ffff:ffff:ffff::',
                    family: 'IPv6',
                    internal: false
                }],
                'utun0': [{
                    address: 'fe80::c295:9871:8607:4b6f',
                    netmask: 'ffff:ffff:ffff:ffff::',
                    family: 'IPv6',
                    internal: false
                }]
            });
            const hashWithLinkLocal = getNetworkHash();

            expect(hashRealOnly).to.equal(hashWithLinkLocal);
        });

        it('excludes IPv4 link-local addresses (169.254/16)', () => {
            networkInterfacesStub.returns({
                'en0': [{
                    address: '192.168.1.100',
                    netmask: '255.255.255.0',
                    family: 'IPv4',
                    internal: false
                }]
            });
            const hashRealOnly = getNetworkHash();

            networkInterfacesStub.returns({
                'en0': [{
                    address: '192.168.1.100',
                    netmask: '255.255.255.0',
                    family: 'IPv4',
                    internal: false
                }],
                'en1': [{
                    address: '169.254.42.17',
                    netmask: '255.255.0.0',
                    family: 'IPv4',
                    internal: false
                }]
            });
            const hashWithApipa = getNetworkHash();

            expect(hashRealOnly).to.equal(hashWithApipa);
        });

        it('keeps non-link-local IPv6 addresses (e.g. ULA)', () => {
            // A hard-coded device IP could be an IPv6 ULA, so we must hash these.
            networkInterfacesStub.returns({
                'en0': [{
                    address: 'fd1b:f33d:a9f:30d5:1842:621b:8739:48d7',
                    netmask: 'ffff:ffff:ffff:ffff::',
                    family: 'IPv6',
                    internal: false
                }]
            });
            const hash1 = getNetworkHash();

            networkInterfacesStub.returns({
                'en0': [{
                    address: 'fd1b:f33d:a9f:30d5:aaaa:bbbb:cccc:dddd',
                    netmask: 'ffff:ffff:ffff:ffff::',
                    family: 'IPv6',
                    internal: false
                }]
            });
            const hash2 = getNetworkHash();

            expect(hash1).to.not.equal(hash2);
            expect(hash1).to.not.equal('no-network');
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

            it('starts with alertCounter at 0', () => {
                monitor = new NetworkChangeMonitor(callback);
                expect(monitor.getAlertCounter()).to.equal(0);
            });

            it('starts in alert mode', () => {
                monitor = new NetworkChangeMonitor(callback);
                expect(monitor.isInAlertMode()).to.be.true;
            });
        });

        describe('network change detection', () => {
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

                clock.tick(ALERT_INTERVAL);

                expect(callback.calledOnce).to.be.true;
            });

            it('does not fire callback when network unchanged', () => {
                monitor = new NetworkChangeMonitor(callback);
                monitor.start();

                clock.tick(ALERT_INTERVAL);
                clock.tick(ALERT_INTERVAL);
                clock.tick(ALERT_INTERVAL);

                expect(callback.called).to.be.false;
            });

            it('fires callback when network becomes no-network', () => {
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

                clock.tick(ALERT_INTERVAL);

                expect(callback.calledOnce).to.be.true;
            });

            it('fires callback when reconnecting to same network after being disconnected', () => {
                monitor = new NetworkChangeMonitor(callback);
                monitor.start();

                // Start on a network
                clock.tick(ALERT_INTERVAL);
                expect(callback.called).to.be.false;

                // Network goes down
                networkInterfacesStub.returns({
                    'lo0': [{
                        address: '127.0.0.1',
                        netmask: '255.0.0.0',
                        family: 'IPv4',
                        internal: true
                    }]
                });
                clock.tick(ALERT_INTERVAL);
                expect(callback.calledOnce).to.be.true; // callback fires for going to no-network

                // Same network comes back
                networkInterfacesStub.returns({
                    'en0': [{
                        address: '192.168.1.100',
                        netmask: '255.255.255.0',
                        family: 'IPv4',
                        internal: false
                    }]
                });
                clock.tick(ALERT_INTERVAL);

                // Should broadcast again because network changed back
                expect(callback.calledTwice).to.be.true;
            });
        });

        describe('alert mode behavior', () => {
            it('uses 1 second interval when in alert mode', () => {
                monitor = new NetworkChangeMonitor(callback);
                monitor.start();

                expect(monitor.isInAlertMode()).to.be.true;

                // Should increment counter after 1 second
                clock.tick(ALERT_INTERVAL);
                expect(monitor.getAlertCounter()).to.equal(1);

                clock.tick(ALERT_INTERVAL);
                expect(monitor.getAlertCounter()).to.equal(2);
            });

            it('transitions to normal mode after threshold polls', () => {
                monitor = new NetworkChangeMonitor(callback);
                monitor.start();

                expect(monitor.isInAlertMode()).to.be.true;

                // Poll until threshold
                for (let i = 0; i < ALERT_THRESHOLD; i++) {
                    clock.tick(ALERT_INTERVAL);
                }

                expect(monitor.isInAlertMode()).to.be.false;
                expect(monitor.getAlertCounter()).to.equal(ALERT_THRESHOLD);
            });

            it('uses 15 second interval in normal mode', () => {
                monitor = new NetworkChangeMonitor(callback);
                monitor.start();

                // Get to normal mode
                for (let i = 0; i < ALERT_THRESHOLD; i++) {
                    clock.tick(ALERT_INTERVAL);
                }

                expect(monitor.isInAlertMode()).to.be.false;
                const counterAtThreshold = monitor.getAlertCounter();

                // Now should use 15 second interval
                clock.tick(NORMAL_INTERVAL);
                expect(monitor.getAlertCounter()).to.equal(counterAtThreshold + 1);
            });
        });

        describe('sleep detection', () => {
            it('resets counter to 0 when sleep is simulated', () => {
                monitor = new NetworkChangeMonitor(callback);
                monitor.start();

                // Get past threshold into normal mode
                for (let i = 0; i < ALERT_THRESHOLD + 5; i++) {
                    clock.tick(ALERT_INTERVAL);
                }

                expect(monitor.isInAlertMode()).to.be.false;

                // Simulate sleep
                monitor.simulateSleep();

                expect(monitor.getAlertCounter()).to.equal(0);
                expect(monitor.isInAlertMode()).to.be.true;
            });

            it('returns to fast polling after sleep', () => {
                monitor = new NetworkChangeMonitor(callback);
                monitor.start();

                // Get to normal mode
                for (let i = 0; i < ALERT_THRESHOLD; i++) {
                    clock.tick(ALERT_INTERVAL);
                }
                expect(monitor.isInAlertMode()).to.be.false;

                // Simulate sleep - this resets counter and triggers immediate poll
                monitor.simulateSleep();

                // Should be back in alert mode with fast polling
                expect(monitor.isInAlertMode()).to.be.true;

                // Tick to trigger the next poll (first one happens immediately on simulateSleep)
                clock.tick(ALERT_INTERVAL);

                // Counter should be incrementing with fast 1s interval
                const counterAfterFirstTick = monitor.getAlertCounter();
                clock.tick(ALERT_INTERVAL);
                expect(monitor.getAlertCounter()).to.equal(counterAfterFirstTick + 1);
            });
        });

        describe('full scenario', () => {
            it('sleep → fast polling → detects network change → broadcasts', () => {
                monitor = new NetworkChangeMonitor(callback);
                monitor.start();

                // Get to normal mode
                for (let i = 0; i < ALERT_THRESHOLD; i++) {
                    clock.tick(ALERT_INTERVAL);
                }
                expect(monitor.isInAlertMode()).to.be.false;

                // Simulate sleep (going from home to work)
                monitor.simulateSleep();
                expect(monitor.isInAlertMode()).to.be.true;

                // Network changes (now at work)
                networkInterfacesStub.returns({
                    'en0': [{
                        address: '10.0.0.50',
                        netmask: '255.255.255.0',
                        family: 'IPv4',
                        internal: false
                    }]
                });

                // Fast polling should detect it within 1 second
                clock.tick(ALERT_INTERVAL);

                expect(callback.calledOnce).to.be.true;
            });

            it('wake on same network → no broadcast', () => {
                monitor = new NetworkChangeMonitor(callback);
                monitor.start();

                // Get to normal mode
                for (let i = 0; i < ALERT_THRESHOLD; i++) {
                    clock.tick(ALERT_INTERVAL);
                }

                // Simulate sleep
                monitor.simulateSleep();

                // Network unchanged
                clock.tick(ALERT_INTERVAL);

                expect(callback.called).to.be.false;
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

                clock.tick(ALERT_INTERVAL);
                clock.tick(ALERT_INTERVAL);

                expect(callback.called).to.be.false;
            });

            it('stop is safe to call when not started', () => {
                monitor = new NetworkChangeMonitor(callback);
                expect(() => monitor.stop()).to.not.throw();
            });

            it('handles restart after being stopped longer than the interval', () => {
                monitor = new NetworkChangeMonitor(callback);
                monitor.start();

                // Let it run for a bit
                clock.tick(ALERT_INTERVAL);

                // Stop the monitor
                monitor.stop();

                // Advance time
                clock.tick(ALERT_INTERVAL * 10);

                // Change the network while stopped
                networkInterfacesStub.returns({
                    'en0': [{
                        address: '10.0.0.50',
                        netmask: '255.255.255.0',
                        family: 'IPv4',
                        internal: false
                    }]
                });

                // Restart the monitor - should detect change immediately
                monitor.start();

                expect(callback.calledOnce).to.be.true;
            });
        });
    });
});
