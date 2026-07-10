import { expect } from 'chai';
import * as sinon from 'sinon';
import { RokuCloudEmulatorClient } from './RokuCloudEmulatorClient';
import { RokuCloudEmulatorRemote, remoteButtonToEcpKey } from './RokuCloudEmulatorRemote';

describe('RokuCloudEmulatorRemote', () => {
    let client: RokuCloudEmulatorClient;
    let remote: RokuCloudEmulatorRemote;
    let emitSpy: sinon.SinonSpy;

    beforeEach(() => {
        client = new RokuCloudEmulatorClient({ apiKey: 'test-key' });
        remote = new RokuCloudEmulatorRemote(client, '83');
        emitSpy = sinon.spy();
        // inject a fake connected socket so the input methods can be exercised without a network
        (remote as any).socket = { emit: emitSpy, connected: true, removeAllListeners: () => { }, disconnect: () => { } };
    });

    it('sends a keypress verb for a tap', () => {
        remote.sendKeypress('Home');
        expect(emitSpy.firstCall.args[0]).to.equal('ecp');
        expect(emitSpy.firstCall.args[1]).to.deep.equal({ deviceId: '83', verb: 'keypress', key: 'Home' });
    });

    it('prefixes literal characters with Lit_', () => {
        remote.sendKeypress('a', true);
        expect(emitSpy.firstCall.args[1]).to.deep.equal({ deviceId: '83', verb: 'keypress', key: 'Lit_a' });
    });

    it('maps friendly button names to ECP keys', () => {
        remote.pressButton('ok');
        expect(emitSpy.firstCall.args[1].key).to.equal('Select');
        expect(remoteButtonToEcpKey.rokuChannel).to.equal('Partner45');
    });

    it('sends each character of text as a literal keypress', () => {
        remote.sendText('hi');
        expect(emitSpy.callCount).to.equal(2);
        expect(emitSpy.firstCall.args[1].key).to.equal('Lit_h');
        expect(emitSpy.secondCall.args[1].key).to.equal('Lit_i');
    });

    describe('hold and release', () => {
        it('emits keydown on hold and keyup on release', () => {
            remote.holdKey('Up');
            expect(emitSpy.firstCall.args[1]).to.deep.equal({ deviceId: '83', verb: 'keydown', key: 'Up' });
            remote.releaseHeldKey();
            expect(emitSpy.secondCall.args[1]).to.deep.equal({ deviceId: '83', verb: 'keyup', key: 'Up' });
        });

        it('releases a previously held key before holding a new one', () => {
            remote.holdKey('Up');
            remote.holdKey('Down');
            expect(emitSpy.getCall(0).args[1]).to.deep.equal({ deviceId: '83', verb: 'keydown', key: 'Up' });
            expect(emitSpy.getCall(1).args[1]).to.deep.equal({ deviceId: '83', verb: 'keyup', key: 'Up' });
            expect(emitSpy.getCall(2).args[1]).to.deep.equal({ deviceId: '83', verb: 'keydown', key: 'Down' });
        });

        it('releasing with nothing held is a no-op', () => {
            remote.releaseHeldKey();
            expect(emitSpy.called).to.be.false;
        });
    });

    it('throws when sending input before a socket exists', () => {
        const disconnected = new RokuCloudEmulatorRemote(client, '83');
        expect(() => disconnected.sendKeypress('Home')).to.throw(/before connect/);
    });
});
