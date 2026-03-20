import { expect } from 'chai';
import * as sinon from 'sinon';
import { RokuFinder } from './RokuFinder';

describe('RokuFinder', () => {
    let finder: RokuFinder;

    afterEach(() => {
        finder?.stop();
        finder?.removeAllListeners();
        sinon.restore();
    });

    describe('constructor', () => {
        it('creates without error', () => {
            expect(() => {
                finder = new RokuFinder();
            }).to.not.throw();
        });
    });

    describe('start/stop', () => {
        it('start sets running to true', async () => {
            finder = new RokuFinder();
            await finder.start();
            expect(finder['running']).to.be.true;
        });

        it('stop sets running to false', async () => {
            finder = new RokuFinder();
            await finder.start();
            finder.stop();
            expect(finder['running']).to.be.false;
        });

        it('start is idempotent', async () => {
            finder = new RokuFinder();
            await finder.start();
            await finder.start();
            expect(finder['running']).to.be.true;
        });

        it('stop is idempotent', async () => {
            finder = new RokuFinder();
            await finder.start();
            finder.stop();
            expect(() => finder.stop()).to.not.throw();
        });
    });

    describe('scan', () => {
        it('sends multiple search requests', () => {
            const clock = sinon.useFakeTimers();
            try {
                finder = new RokuFinder();
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
            finder = new RokuFinder();

            const foundSpy = sinon.spy();
            finder.on('found', foundSpy);

            // Simulate SSDP response
            (finder['client'] as any).emit('response', {
                ST: 'roku:ecp',
                LOCATION: 'http://192.168.1.100:8060'
            });

            expect(foundSpy.calledOnce).to.be.true;
            const ip = foundSpy.firstCall.args[0];
            const options = foundSpy.firstCall.args[1];
            expect(ip).to.equal('192.168.1.100');
            expect(options.isAlive).to.be.false;
        });

        it('ignores non-Roku devices', () => {
            finder = new RokuFinder();

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
            finder = new RokuFinder();
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
        it('emits "found" with IP string and isAlive true on ssdp:alive', async () => {
            finder = new RokuFinder();
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
            expect(options.isAlive).to.be.true;
        });

        it('emits "lost" on ssdp:byebye', async () => {
            finder = new RokuFinder();
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
            finder = new RokuFinder();
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
            finder = new RokuFinder();
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
                finder = new RokuFinder();
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
            finder = new RokuFinder();
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
                finder = new RokuFinder();
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

});
