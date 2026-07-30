import { expect } from 'chai';
import { createSandbox } from 'sinon';
import * as rta from 'roku-test-automation';
import { RtaManager } from './RtaManager';
import { vscode } from '../mockVscode.spec';

const sinon = createSandbox();
const Module = require('module');

//override the "require" call to mock certain items
const { require: oldRequire } = Module.prototype;
Module.prototype.require = function hijacked(file) {
    if (file === 'vscode') {
        return vscode;
    } else {
        return oldRequire.apply(this, arguments);
    }
};

describe('RtaManager', () => {

    let rtaManager: RtaManager;
    let odcSetConfigStub: ReturnType<typeof sinon.stub>;

    beforeEach(() => {
        rtaManager = new RtaManager(vscode.context as any);
        //RTA setup pushes device availability to the webview providers; none exist in these tests
        rtaManager.setWebviewViewProviderManager({ getWebviewViewProviders: () => [] } as any);
        odcSetConfigStub = sinon.stub(rta.odc, 'setConfig');
        sinon.stub(rta.ecp, 'setConfig');
    });

    afterEach(() => {
        sinon.restore();
    });

    describe('setupRtaWithConfig', () => {
        it('sets up RTA from a local device config, ignoring the top-level host field', () => {
            rtaManager.setupRtaWithConfig({ device: { host: '1.2.3.4' }, host: '9.9.9.9', password: 'aaaa' } as any);

            expect(odcSetConfigStub.calledOnce).to.be.true;
            expect(odcSetConfigStub.firstCall.args[0].RokuDevice.devices[0].host).to.equal('1.2.3.4');
            expect(rtaManager.device).to.exist;
        });

        it('sets up RTA from the bare host when no device config is present (the RDB manual-ip flow)', () => {
            rtaManager.setupRtaWithConfig({ host: '1.2.3.4', password: 'aaaa' } as any);

            expect(odcSetConfigStub.calledOnce).to.be.true;
            expect(odcSetConfigStub.firstCall.args[0].RokuDevice.devices[0].host).to.equal('1.2.3.4');
        });

        it('skips RTA setup for a cloud emulator device config', () => {
            rtaManager.setupRtaWithConfig({ device: { id: '83' }, host: '', password: 'aaaa' } as any);

            expect(odcSetConfigStub.called).to.be.false;
            expect(rtaManager.device).to.be.undefined;
        });

        it('skips RTA setup for a device-registry name, even when a raw host field is present', () => {
            //a non-local session's raw `host` can hold an unresolved placeholder like ${promptForHost},
            //so it must never be used when the session addresses the device through `device`
            rtaManager.setupRtaWithConfig({ device: 'my-registry-device', host: '${promptForHost}', password: 'aaaa' } as any);

            expect(odcSetConfigStub.called).to.be.false;
            expect(rtaManager.device).to.be.undefined;
        });
    });
});
