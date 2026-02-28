import { expect } from 'chai';
import * as sinon from 'sinon';
import { rokuDeploy } from 'roku-deploy';
import { vscode } from '../mockVscode.spec';
import { RokuFinder } from './RokuFinder';

describe('RokuFinder', () => {
    let finder: RokuFinder;
    let getDeviceInfoStub: sinon.SinonStub;
    let getConfigurationStub: sinon.SinonStub;

    const mockDeviceInfo = {
        'device-id': 'ABC123',
        'default-device-name': 'Roku Express',
        'developer-enabled': 'true',
        'is-stick': 'false',
        'is-tv': 'false'
    };

    // Helper to flush pending promises
    function flushPromises() {
        return new Promise<void>(resolve => {
            process.nextTick(resolve);
        });
    }

    beforeEach(() => {
        getDeviceInfoStub = sinon.stub(rokuDeploy, 'getDeviceInfo').resolves(mockDeviceInfo as any);
        sinon.stub(rokuDeploy, 'normalizeDeviceInfoFieldValue').callsFake((val) => val);

        getConfigurationStub = sinon.stub(vscode.workspace, 'getConfiguration').returns({
            get: () => undefined,
            deviceDiscovery: {
                includeNonDeveloperDevices: false
            }
        } as any);
    });

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

        it('starts in focused state', () => {
            finder = new RokuFinder();
            expect(finder['focused']).to.be.true;
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
        it('emits "found" for Roku devices', async () => {
            finder = new RokuFinder();
            await finder.start();

            const foundSpy = sinon.spy();
            finder.on('found', foundSpy);

            // Simulate SSDP response
            (finder['client'] as any).emit('response', {
                ST: 'roku:ecp',
                LOCATION: 'http://192.168.1.100:8060'
            });

            await flushPromises();

            expect(foundSpy.calledOnce).to.be.true;
            const device = foundSpy.firstCall.args[0];
            expect(device.ip).to.equal('192.168.1.100');
        });

        it('ignores non-Roku devices', async () => {
            finder = new RokuFinder();
            await finder.start();

            const foundSpy = sinon.spy();
            finder.on('found', foundSpy);

            // Simulate non-Roku SSDP response
            (finder['client'] as any).emit('response', {
                ST: 'upnp:rootdevice',
                LOCATION: 'http://192.168.1.100:8060'
            });

            await flushPromises();

            expect(foundSpy.called).to.be.false;
        });

        it('processes scan responses even when passive listener not started', async () => {
            finder = new RokuFinder();
            // Don't call start() - passive listener is off, but scans should still work

            // Stub fetchDeviceDetails to return a device directly
            const mockDevice = {
                location: 'http://192.168.1.100:8060',
                ip: '192.168.1.100',
                id: 'ABC123',
                deviceState: 'online' as const,
                deviceInfo: mockDeviceInfo
            };
            sinon.stub(finder as any, 'fetchDeviceDetails').returns(Promise.resolve(mockDevice));

            const foundSpy = sinon.spy();
            finder.on('found', foundSpy);

            (finder['client'] as any).emit('response', {
                ST: 'roku:ecp',
                LOCATION: 'http://192.168.1.100:8060'
            });

            await flushPromises();

            // Scan responses should work regardless of passive listener state
            expect(foundSpy.calledOnce).to.be.true;
        });
    });

    describe('SSDP notify handling', () => {
        it('emits "found" on ssdp:alive', async () => {
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

            await flushPromises();

            expect(foundSpy.calledOnce).to.be.true;
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

            await flushPromises();

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

            await flushPromises();

            expect(foundSpy.called).to.be.false;
            expect(lostSpy.called).to.be.false;
        });
    });

    describe('device filtering', () => {
        it('filters out non-developer devices by default', async () => {
            getDeviceInfoStub.resolves({
                ...mockDeviceInfo,
                'developer-enabled': 'false'
            });

            finder = new RokuFinder();
            await finder.start();

            const foundSpy = sinon.spy();
            finder.on('found', foundSpy);

            (finder['client'] as any).emit('response', {
                ST: 'roku:ecp',
                LOCATION: 'http://192.168.1.100:8060'
            });

            await flushPromises();

            expect(foundSpy.called).to.be.false;
        });

        it('includes non-developer devices when setting is enabled', async () => {
            getDeviceInfoStub.resolves({
                ...mockDeviceInfo,
                'developer-enabled': 'false'
            });

            getConfigurationStub.returns({
                get: () => undefined,
                deviceDiscovery: {
                    includeNonDeveloperDevices: true
                }
            } as any);

            finder = new RokuFinder();
            await finder.start();

            const foundSpy = sinon.spy();
            finder.on('found', foundSpy);

            (finder['client'] as any).emit('response', {
                ST: 'roku:ecp',
                LOCATION: 'http://192.168.1.100:8060'
            });

            await flushPromises();

            expect(foundSpy.calledOnce).to.be.true;
        });

        it('handles network errors gracefully', async () => {
            getDeviceInfoStub.rejects(new Error('Network error'));

            finder = new RokuFinder();
            await finder.start();

            const foundSpy = sinon.spy();
            finder.on('found', foundSpy);

            (finder['client'] as any).emit('response', {
                ST: 'roku:ecp',
                LOCATION: 'http://192.168.1.100:8060'
            });

            await flushPromises();

            expect(foundSpy.called).to.be.false;
        });
    });

    describe('focus queuing', () => {
        it('emits immediately when focused', async () => {
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

            await flushPromises();

            expect(foundSpy.calledOnce).to.be.true;
        });

        it('queues notifications when unfocused', async () => {
            finder = new RokuFinder();
            await finder.start();

            const foundSpy = sinon.spy();
            finder.on('found', foundSpy);

            finder.onFocusLost();

            (finder['server'] as any).emit('advertise-alive', {
                NT: 'roku:ecp',
                NTS: 'ssdp:alive',
                LOCATION: 'http://192.168.1.100:8060',
                USN: 'uuid:roku:ecp:ABC123'
            });

            await flushPromises();

            expect(foundSpy.called).to.be.false;
            expect(finder['queuedNotifications'].length).to.equal(1);
        });

        it('replays queued notifications on focus gain', async () => {
            finder = new RokuFinder();
            await finder.start();

            const foundSpy = sinon.spy();
            finder.on('found', foundSpy);

            finder.onFocusLost();

            (finder['server'] as any).emit('advertise-alive', {
                NT: 'roku:ecp',
                NTS: 'ssdp:alive',
                LOCATION: 'http://192.168.1.100:8060',
                USN: 'uuid:roku:ecp:ABC123'
            });

            await flushPromises();
            expect(foundSpy.called).to.be.false;

            finder.onFocusGain();

            expect(foundSpy.calledOnce).to.be.true;
            expect(finder['queuedNotifications'].length).to.equal(0);
        });

        it('replaces duplicate notifications for same hostname', async () => {
            finder = new RokuFinder();
            await finder.start();

            const foundSpy = sinon.spy();
            const lostSpy = sinon.spy();
            finder.on('found', foundSpy);
            finder.on('lost', lostSpy);

            finder.onFocusLost();

            // First: device found
            (finder['server'] as any).emit('advertise-alive', {
                NT: 'roku:ecp',
                NTS: 'ssdp:alive',
                LOCATION: 'http://192.168.1.100:8060',
                USN: 'uuid:roku:ecp:ABC123'
            });

            await flushPromises();

            // Second: same device lost
            (finder['server'] as any).emit('advertise-bye', {
                NT: 'roku:ecp',
                NTS: 'ssdp:byebye',
                LOCATION: 'http://192.168.1.100:8060',
                USN: 'uuid:roku:ecp:ABC123'
            });

            await flushPromises();

            // Only one notification queued (the latest one)
            expect(finder['queuedNotifications'].length).to.equal(1);
            expect(finder['queuedNotifications'][0].type).to.equal('lost');

            finder.onFocusGain();

            expect(foundSpy.called).to.be.false;
            expect(lostSpy.calledOnce).to.be.true;
        });
    });

});
