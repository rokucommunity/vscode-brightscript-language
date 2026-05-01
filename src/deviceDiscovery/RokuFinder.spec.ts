import { expect } from 'chai';
import * as sinon from 'sinon';
import { RokuFinder } from './RokuFinder';
import type { GlobalStateManager } from '../GlobalStateManager';

describe('RokuFinder', () => {
    let finder: RokuFinder;
    let mockGlobalStateManager: GlobalStateManager;

    beforeEach(() => {
        const timestampStore = new Map<string, number>();
        mockGlobalStateManager = {
            getLastAliveTimestamp: (key: string) => timestampStore.get(key),
            setLastAliveTimestamp: (key: string, ts: number) => timestampStore.set(key, ts)
        } as any;
    });

    afterEach(() => {
        finder?.stop();
        finder?.removeAllListeners();
        sinon.restore();
    });

    describe('constructor', () => {
        it('creates without error', () => {
            expect(() => {
                finder = new RokuFinder(mockGlobalStateManager);
            }).to.not.throw();
        });
    });

    describe('start/stop', () => {
        it('start sets running to true', async () => {
            finder = new RokuFinder(mockGlobalStateManager);
            await finder.start();
            expect(finder['running']).to.be.true;
        });

        it('stop sets running to false', async () => {
            finder = new RokuFinder(mockGlobalStateManager);
            await finder.start();
            finder.stop();
            expect(finder['running']).to.be.false;
        });

        it('start is idempotent', async () => {
            finder = new RokuFinder(mockGlobalStateManager);
            await finder.start();
            await finder.start();
            expect(finder['running']).to.be.true;
        });

        it('stop is idempotent', async () => {
            finder = new RokuFinder(mockGlobalStateManager);
            await finder.start();
            finder.stop();
            expect(() => finder.stop()).to.not.throw();
        });
    });

    describe('scan', () => {
        it('sends multiple search requests', () => {
            const clock = sinon.useFakeTimers();
            try {
                finder = new RokuFinder(mockGlobalStateManager);
                const searchStub = sinon.stub(finder['client'], 'search');

                finder.scan();

                // Immediate search
                expect(searchStub.calledOnce).to.be.true;
                expect(searchStub.calledWith('roku:ecp')).to.be.true;

                // After 100ms
                clock.tick(100);
                expect(searchStub.calledTwice).to.be.true;

                // After 200ms
                clock.tick(100);
                expect(searchStub.calledThrice).to.be.true;
            } finally {
                clock.restore();
            }
        });
    });

    describe('SSDP response handling', () => {
        it('emits "found" with IP string for Roku devices', () => {
            finder = new RokuFinder(mockGlobalStateManager);

            const foundSpy = sinon.spy();
            finder.on('found', foundSpy);

            // Simulate SSDP response
            (finder['client'] as any).emit('response', {
                ST: 'roku:ecp',
                LOCATION: 'http://192.168.1.100:8060',
                USN: 'uuid:roku:ecp:ABC123'
            });

            expect(foundSpy.calledOnce).to.be.true;
            const ip = foundSpy.firstCall.args[0];
            const options = foundSpy.firstCall.args[1];
            expect(ip).to.equal('192.168.1.100');
            expect(options.serialNumber).to.equal('ABC123');
        });

        it('extracts serial number from USN header', () => {
            finder = new RokuFinder(mockGlobalStateManager);

            const foundSpy = sinon.spy();
            finder.on('found', foundSpy);

            (finder['client'] as any).emit('response', {
                ST: 'roku:ecp',
                LOCATION: 'http://192.168.1.100:8060',
                USN: 'uuid:roku:ecp:YN00AB123456'
            });

            expect(foundSpy.firstCall.args[1].serialNumber).to.equal('YN00AB123456');
        });

        it('handles missing USN gracefully', () => {
            finder = new RokuFinder(mockGlobalStateManager);

            const foundSpy = sinon.spy();
            finder.on('found', foundSpy);

            (finder['client'] as any).emit('response', {
                ST: 'roku:ecp',
                LOCATION: 'http://192.168.1.100:8060'
                // No USN header
            });

            expect(foundSpy.calledOnce).to.be.true;
            expect(foundSpy.firstCall.args[1].serialNumber).to.be.undefined;
        });

        it('ignores non-Roku devices', () => {
            finder = new RokuFinder(mockGlobalStateManager);

            const foundSpy = sinon.spy();
            finder.on('found', foundSpy);

            // Simulate non-Roku SSDP response
            (finder['client'] as any).emit('response', {
                ST: 'upnp:rootdevice',
                LOCATION: 'http://192.168.1.100:8060'
            });

            expect(foundSpy.called).to.be.false;
        });

        it('processes scan responses even when passive listener not started', () => {
            finder = new RokuFinder(mockGlobalStateManager);
            // Don't call start() - passive listener is off, but scans should still work

            const foundSpy = sinon.spy();
            finder.on('found', foundSpy);

            (finder['client'] as any).emit('response', {
                ST: 'roku:ecp',
                LOCATION: 'http://192.168.1.100:8060'
            });

            // Scan responses should work regardless of passive listener state
            expect(foundSpy.calledOnce).to.be.true;
            expect(foundSpy.firstCall.args[0]).to.equal('192.168.1.100');
        });
    });

    describe('SSDP notify handling', () => {
        it('emits "found" with IP string and serial number on ssdp:alive', async () => {
            finder = new RokuFinder(mockGlobalStateManager);
            await finder.start();

            const foundSpy = sinon.spy();
            finder.on('found', foundSpy);

            (finder['server'] as any).emit('advertise-alive', {
                NT: 'roku:ecp',
                NTS: 'ssdp:alive',
                LOCATION: 'http://192.168.1.100:8060',
                USN: 'uuid:roku:ecp:ABC123'
            });

            expect(foundSpy.calledOnce).to.be.true;
            const ip = foundSpy.firstCall.args[0];
            const options = foundSpy.firstCall.args[1];
            expect(ip).to.equal('192.168.1.100');
            expect(options.serialNumber).to.equal('ABC123');
        });

        it('emits "device-online" with IP and serial number the first time a device is seen', async () => {
            finder = new RokuFinder(mockGlobalStateManager);
            await finder.start();

            const deviceOnlineSpy = sinon.spy();
            finder.on('device-online', deviceOnlineSpy);

            (finder['server'] as any).emit('advertise-alive', {
                NT: 'roku:ecp',
                NTS: 'ssdp:alive',
                LOCATION: 'http://192.168.1.100:8060',
                USN: 'uuid:roku:ecp:ABC123'
            });

            expect(deviceOnlineSpy.calledOnce).to.be.true;
            expect(deviceOnlineSpy.firstCall.args[0]).to.equal('192.168.1.100');
            expect(deviceOnlineSpy.firstCall.args[1]).to.equal('ABC123');
        });

        it('suppresses "device-online" for a routine ~20-minute heartbeat', () => {
            const clock = sinon.useFakeTimers();
            try {
                finder = new RokuFinder(mockGlobalStateManager);
                finder['running'] = true;

                const deviceOnlineSpy = sinon.spy();
                finder.on('device-online', deviceOnlineSpy);

                const aliveMessage = {
                    NT: 'roku:ecp',
                    NTS: 'ssdp:alive',
                    LOCATION: 'http://192.168.1.100:8060',
                    USN: 'uuid:roku:ecp:ABC123'
                };

                // First alive — fires (first time seen)
                (finder['server'] as any).emit('advertise-alive', aliveMessage);
                expect(deviceOnlineSpy.calledOnce).to.be.true;

                // Exactly 20 minutes later — routine heartbeat, suppressed
                clock.tick(20 * 60 * 1_000);
                (finder['server'] as any).emit('advertise-alive', aliveMessage);
                expect(deviceOnlineSpy.calledOnce).to.be.true;
            } finally {
                clock.restore();
            }
        });

        it('suppresses "device-online" when alive arrives within ±5s of 20-minute schedule', () => {
            const clock = sinon.useFakeTimers();
            try {
                finder = new RokuFinder(mockGlobalStateManager);
                finder['running'] = true;

                const deviceOnlineSpy = sinon.spy();
                finder.on('device-online', deviceOnlineSpy);

                const aliveMessage = {
                    NT: 'roku:ecp',
                    NTS: 'ssdp:alive',
                    LOCATION: 'http://192.168.1.100:8060',
                    USN: 'uuid:roku:ecp:ABC123'
                };

                // First alive
                (finder['server'] as any).emit('advertise-alive', aliveMessage);
                expect(deviceOnlineSpy.calledOnce).to.be.true;

                // 4 seconds early (within ±5s tolerance) — suppressed
                clock.tick(20 * 60 * 1_000 - 4_000);
                (finder['server'] as any).emit('advertise-alive', aliveMessage);
                expect(deviceOnlineSpy.calledOnce).to.be.true;

                // 4 seconds late from that timestamp (within ±5s tolerance) — suppressed
                clock.tick(20 * 60 * 1_000 + 4_000);
                (finder['server'] as any).emit('advertise-alive', aliveMessage);
                expect(deviceOnlineSpy.calledOnce).to.be.true;
            } finally {
                clock.restore();
            }
        });

        it('emits "device-online" again when alive arrives off the 20-minute schedule (e.g. reboot)', () => {
            const clock = sinon.useFakeTimers();
            try {
                finder = new RokuFinder(mockGlobalStateManager);
                finder['running'] = true;

                const deviceOnlineSpy = sinon.spy();
                finder.on('device-online', deviceOnlineSpy);

                const aliveMessage = {
                    NT: 'roku:ecp',
                    NTS: 'ssdp:alive',
                    LOCATION: 'http://192.168.1.100:8060',
                    USN: 'uuid:roku:ecp:ABC123'
                };

                // First alive — fires
                (finder['server'] as any).emit('advertise-alive', aliveMessage);
                expect(deviceOnlineSpy.calledOnce).to.be.true;

                // 10 seconds later — not on 20-min schedule, fires again (reboot scenario)
                clock.tick(10_000);
                (finder['server'] as any).emit('advertise-alive', aliveMessage);
                expect(deviceOnlineSpy.calledTwice).to.be.true;
            } finally {
                clock.restore();
            }
        });

        it('resets the heartbeat clock on wake so the next 20-minute heartbeat is suppressed', () => {
            const clock = sinon.useFakeTimers();
            try {
                finder = new RokuFinder(mockGlobalStateManager);
                finder['running'] = true;

                const deviceOnlineSpy = sinon.spy();
                finder.on('device-online', deviceOnlineSpy);

                const aliveMessage = {
                    NT: 'roku:ecp',
                    NTS: 'ssdp:alive',
                    LOCATION: 'http://192.168.1.100:8060',
                    USN: 'uuid:roku:ecp:ABC123'
                };

                // First heartbeat
                (finder['server'] as any).emit('advertise-alive', aliveMessage);
                expect(deviceOnlineSpy.calledOnce).to.be.true;

                // Device reboots 10 minutes into the cycle — fires device-online
                clock.tick(10 * 60 * 1_000);
                (finder['server'] as any).emit('advertise-alive', aliveMessage);
                expect(deviceOnlineSpy.calledTwice).to.be.true;

                // 20 minutes after the reboot — routine heartbeat, clock was reset from wake time
                clock.tick(20 * 60 * 1_000);
                (finder['server'] as any).emit('advertise-alive', aliveMessage);
                expect(deviceOnlineSpy.calledTwice).to.be.true; // suppressed
            } finally {
                clock.restore();
            }
        });

        it('emits "device-online" again after a missed heartbeat (host was asleep)', () => {
            const clock = sinon.useFakeTimers();
            try {
                finder = new RokuFinder(mockGlobalStateManager);
                finder['running'] = true;

                const deviceOnlineSpy = sinon.spy();
                finder.on('device-online', deviceOnlineSpy);

                const aliveMessage = {
                    NT: 'roku:ecp',
                    NTS: 'ssdp:alive',
                    LOCATION: 'http://192.168.1.100:8060',
                    USN: 'uuid:roku:ecp:ABC123'
                };

                // First alive
                (finder['server'] as any).emit('advertise-alive', aliveMessage);
                expect(deviceOnlineSpy.calledOnce).to.be.true;

                // Routine 20-minute heartbeat — suppressed
                clock.tick(20 * 60 * 1_000);
                (finder['server'] as any).emit('advertise-alive', aliveMessage);
                expect(deviceOnlineSpy.calledOnce).to.be.true;

                // Host was asleep for 3 days — next alive is way off schedule, fires again
                clock.tick(3 * 24 * 60 * 60 * 1_000);
                (finder['server'] as any).emit('advertise-alive', aliveMessage);
                expect(deviceOnlineSpy.calledTwice).to.be.true;
            } finally {
                clock.restore();
            }
        });

        it('uses serial number (not IP) as the heartbeat key so IP changes do not reset the clock', () => {
            const clock = sinon.useFakeTimers();
            try {
                finder = new RokuFinder(mockGlobalStateManager);
                finder['running'] = true;

                const deviceOnlineSpy = sinon.spy();
                finder.on('device-online', deviceOnlineSpy);

                const aliveOldIp = {
                    NT: 'roku:ecp',
                    NTS: 'ssdp:alive',
                    LOCATION: 'http://192.168.1.100:8060',
                    USN: 'uuid:roku:ecp:ABC123'
                };
                const aliveNewIp = {
                    NT: 'roku:ecp',
                    NTS: 'ssdp:alive',
                    LOCATION: 'http://192.168.1.200:8060',
                    USN: 'uuid:roku:ecp:ABC123'
                };

                // First alive on old IP
                (finder['server'] as any).emit('advertise-alive', aliveOldIp);
                expect(deviceOnlineSpy.calledOnce).to.be.true;

                // Routine heartbeat on new IP — same serial, should still be suppressed
                clock.tick(20 * 60 * 1_000);
                (finder['server'] as any).emit('advertise-alive', aliveNewIp);
                expect(deviceOnlineSpy.calledOnce).to.be.true;
            } finally {
                clock.restore();
            }
        });

        it('tracks heartbeat independently per device', () => {
            const clock = sinon.useFakeTimers();
            try {
                finder = new RokuFinder(mockGlobalStateManager);
                finder['running'] = true;

                const deviceOnlineSpy = sinon.spy();
                finder.on('device-online', deviceOnlineSpy);

                const alive1 = {
                    NT: 'roku:ecp',
                    NTS: 'ssdp:alive',
                    LOCATION: 'http://192.168.1.100:8060',
                    USN: 'uuid:roku:ecp:ABC123'
                };
                const alive2 = {
                    NT: 'roku:ecp',
                    NTS: 'ssdp:alive',
                    LOCATION: 'http://192.168.1.101:8060',
                    USN: 'uuid:roku:ecp:DEF456'
                };

                // Both devices seen for the first time
                (finder['server'] as any).emit('advertise-alive', alive1);
                (finder['server'] as any).emit('advertise-alive', alive2);
                expect(deviceOnlineSpy.calledTwice).to.be.true;

                // Both send routine 20-min heartbeat — both suppressed
                clock.tick(20 * 60 * 1_000);
                (finder['server'] as any).emit('advertise-alive', alive1);
                (finder['server'] as any).emit('advertise-alive', alive2);
                expect(deviceOnlineSpy.calledTwice).to.be.true;
            } finally {
                clock.restore();
            }
        });

        it('emits "lost" on ssdp:byebye', async () => {
            finder = new RokuFinder(mockGlobalStateManager);
            await finder.start();

            const lostSpy = sinon.spy();
            finder.on('lost', lostSpy);

            (finder['server'] as any).emit('advertise-bye', {
                NT: 'roku:ecp',
                NTS: 'ssdp:byebye',
                LOCATION: 'http://192.168.1.100:8060',
                USN: 'uuid:roku:ecp:ABC123'
            });

            expect(lostSpy.calledOnce).to.be.true;
            expect(lostSpy.firstCall.args[0]).to.equal('192.168.1.100');
        });

        it('ignores non-Roku notifications', async () => {
            finder = new RokuFinder(mockGlobalStateManager);
            await finder.start();

            const foundSpy = sinon.spy();
            const lostSpy = sinon.spy();
            finder.on('found', foundSpy);
            finder.on('lost', lostSpy);

            (finder['server'] as any).emit('advertise-alive', {
                NT: 'upnp:rootdevice',
                NTS: 'ssdp:alive',
                LOCATION: 'http://192.168.1.100:8060',
                USN: 'uuid:upnp:rootdevice:XYZ'
            });

            expect(foundSpy.called).to.be.false;
            expect(lostSpy.called).to.be.false;
        });

        it('debounces rapid ssdp:alive messages from same IP', async () => {
            finder = new RokuFinder(mockGlobalStateManager);
            await finder.start();

            const foundSpy = sinon.spy();
            finder.on('found', foundSpy);

            const aliveMessage = {
                NT: 'roku:ecp',
                NTS: 'ssdp:alive',
                LOCATION: 'http://192.168.1.100:8060',
                USN: 'uuid:roku:ecp:ABC123'
            };

            // Send multiple rapid messages
            (finder['server'] as any).emit('advertise-alive', aliveMessage);
            (finder['server'] as any).emit('advertise-alive', aliveMessage);
            (finder['server'] as any).emit('advertise-alive', aliveMessage);

            // Should only emit once due to debounce
            expect(foundSpy.calledOnce).to.be.true;
        });

        it('allows ssdp:alive after debounce period expires', async () => {
            const clock = sinon.useFakeTimers();
            try {
                finder = new RokuFinder(mockGlobalStateManager);
                await finder.start();

                const foundSpy = sinon.spy();
                finder.on('found', foundSpy);

                const aliveMessage = {
                    NT: 'roku:ecp',
                    NTS: 'ssdp:alive',
                    LOCATION: 'http://192.168.1.100:8060',
                    USN: 'uuid:roku:ecp:ABC123'
                };

                // First message
                (finder['server'] as any).emit('advertise-alive', aliveMessage);
                expect(foundSpy.calledOnce).to.be.true;

                // Wait for debounce period to expire
                clock.tick(500);

                // Second message after debounce
                (finder['server'] as any).emit('advertise-alive', aliveMessage);
                expect(foundSpy.calledTwice).to.be.true;
            } finally {
                clock.restore();
            }
        });

        it('debounces independently per IP address', async () => {
            finder = new RokuFinder(mockGlobalStateManager);
            await finder.start();

            const foundSpy = sinon.spy();
            finder.on('found', foundSpy);

            const aliveMessage1 = {
                NT: 'roku:ecp',
                NTS: 'ssdp:alive',
                LOCATION: 'http://192.168.1.100:8060',
                USN: 'uuid:roku:ecp:ABC123'
            };

            const aliveMessage2 = {
                NT: 'roku:ecp',
                NTS: 'ssdp:alive',
                LOCATION: 'http://192.168.1.101:8060',
                USN: 'uuid:roku:ecp:DEF456'
            };

            // Send messages from two different IPs
            (finder['server'] as any).emit('advertise-alive', aliveMessage1);
            (finder['server'] as any).emit('advertise-alive', aliveMessage2);
            (finder['server'] as any).emit('advertise-alive', aliveMessage1); // duplicate, should be ignored
            (finder['server'] as any).emit('advertise-alive', aliveMessage2); // duplicate, should be ignored

            // Should emit twice - once per unique IP
            expect(foundSpy.calledTwice).to.be.true;
            expect(foundSpy.firstCall.args[0]).to.equal('192.168.1.100');
            expect(foundSpy.secondCall.args[0]).to.equal('192.168.1.101');
        });

        it('cleans up stale debounce entries after 5 minutes', async () => {
            const clock = sinon.useFakeTimers();
            try {
                finder = new RokuFinder(mockGlobalStateManager);
                await finder.start();

                const aliveMessage = {
                    NT: 'roku:ecp',
                    NTS: 'ssdp:alive',
                    LOCATION: 'http://192.168.1.100:8060',
                    USN: 'uuid:roku:ecp:ABC123'
                };

                // First message - adds entry to map
                (finder['server'] as any).emit('advertise-alive', aliveMessage);
                expect(finder['aliveDebounceMap'].size).to.equal(1);

                // Advance past cleanup interval (5 minutes)
                clock.tick((5 * 60 * 1000) + 1);

                // Next message triggers cleanup and removes stale entry, then adds fresh one
                (finder['server'] as any).emit('advertise-alive', aliveMessage);
                expect(finder['aliveDebounceMap'].size).to.equal(1);

                // Verify the entry is fresh (timestamp should be current time)
                const timestamp = finder['aliveDebounceMap'].get('192.168.1.100');
                expect(timestamp).to.equal(Date.now());
            } finally {
                clock.restore();
            }
        });
    });

    describe('scan orchestration', () => {
        it('emits scan-started when scan begins', () => {
            finder = new RokuFinder(mockGlobalStateManager);

            const scanStartedSpy = sinon.spy();
            finder.on('scan-started', scanStartedSpy);

            finder.scan();

            expect(scanStartedSpy.calledOnce).to.be.true;
        });

        it('emits scan-ended after min duration and settle time', () => {
            const clock = sinon.useFakeTimers();
            try {
                finder = new RokuFinder(mockGlobalStateManager);

                const scanEndedSpy = sinon.spy();
                finder.on('scan-ended', scanEndedSpy);

                finder.scan();

                // Before min duration (3s)
                clock.tick(2_000);
                expect(scanEndedSpy.called).to.be.false;

                // After min duration and settle time (3s + 1.5s = 4.5s)
                clock.tick(2_500);
                expect(scanEndedSpy.calledOnce).to.be.true;
            } finally {
                clock.restore();
            }
        });

        it('waits for settle timer even after min duration', () => {
            const clock = sinon.useFakeTimers();
            try {
                finder = new RokuFinder(mockGlobalStateManager);

                const scanEndedSpy = sinon.spy();
                finder.on('scan-ended', scanEndedSpy);

                finder.scan();

                // Trigger device found at 2.9s to reset settle timer (before min time fires at 3s)
                clock.tick(2_900);
                (finder['client'] as any).emit('response', {
                    ST: 'roku:ecp',
                    LOCATION: 'http://192.168.1.100:8060',
                    USN: 'uuid:roku:ecp:ABC123'
                });

                // Min timer fires at 3s, but settle timer was reset to 2.9s + 1.5s = 4.4s
                clock.tick(100); // Now at 3s
                expect(scanEndedSpy.called).to.be.false; // Still waiting for settle

                // Advance to just before new settle timer fires
                clock.tick(1_400); // Now at 4.4s
                expect(scanEndedSpy.calledOnce).to.be.true; // Settle fired, scan ends
            } finally {
                clock.restore();
            }
        });

        it('does not start new scan if already scanning', () => {
            const clock = sinon.useFakeTimers();
            try {
                finder = new RokuFinder(mockGlobalStateManager);

                const scanStartedSpy = sinon.spy();
                finder.on('scan-started', scanStartedSpy);

                finder.scan();
                expect(scanStartedSpy.calledOnce).to.be.true;

                // Try to scan again while already scanning
                finder.scan();
                expect(scanStartedSpy.calledOnce).to.be.true; // Still just one

                // Complete the scan
                clock.tick(5_000);

                // Now we can scan again
                finder.scan();
                expect(scanStartedSpy.calledTwice).to.be.true;
            } finally {
                clock.restore();
            }
        });

        it('resets settle timer when device found via ssdp:alive', () => {
            const clock = sinon.useFakeTimers();
            try {
                finder = new RokuFinder(mockGlobalStateManager);
                finder['running'] = true; // Simulate started

                const scanEndedSpy = sinon.spy();
                finder.on('scan-ended', scanEndedSpy);

                finder.scan();

                // Device found via SSDP alive at 2.9s
                clock.tick(2_900);
                (finder['server'] as any).emit('advertise-alive', {
                    NT: 'roku:ecp',
                    NTS: 'ssdp:alive',
                    LOCATION: 'http://192.168.1.100:8060',
                    USN: 'uuid:roku:ecp:ABC123'
                });

                // Min timer fires at 3s, but settle was reset to 4.4s
                clock.tick(100); // Now at 3s
                expect(scanEndedSpy.called).to.be.false;

                // Settle timer fires at 4.4s
                clock.tick(1_400); // Now at 4.4s
                expect(scanEndedSpy.calledOnce).to.be.true;
            } finally {
                clock.restore();
            }
        });
    });

});
