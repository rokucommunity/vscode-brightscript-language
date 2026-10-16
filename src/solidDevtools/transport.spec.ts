import { expect } from 'chai';
import { createSandbox } from 'sinon';
let Module = require('module');

import { vscode } from '../mockVscode.spec';

// Override the "require" call to mock vscode — must run before the SUT is imported, since
// DebugSessionManager (imported transitively) value-imports vscode at module load.
const { require: oldRequire } = Module.prototype;
Module.prototype.require = function hijacked(file) {
    if (file === 'vscode') {
        return vscode;
    } else {
        return oldRequire.apply(this, arguments);
    }
};

import { SolidDevtoolsTransport } from './transport';
import { debugSessionManager } from '../managers/DebugSessionManager';

const sinon = createSandbox();

/** A fake DebugSession whose `evaluate` customRequest resolves to `result`. */
function makeSession(id: string, result: string) {
    return {
        id: id,
        name: id,
        customRequest: sinon.stub().resolves({ result: result })
    } as any;
}

describe('SolidDevtoolsTransport', () => {
    let transport: SolidDevtoolsTransport;

    beforeEach(() => {
        transport = new SolidDevtoolsTransport();
        sinon.stub(debugSessionManager, 'isLive').returns(true);
    });

    afterEach(() => {
        sinon.restore();
    });

    describe('ensureSession', () => {
        it('skips a candidate whose evaluate resolves to non-typeof text (e.g. a BrightScript session)', async () => {
            const brightScript = makeSession('brs1', '"invalid"');
            sinon.stub(debugSessionManager, 'getEvaluableJsSessions').returns([brightScript]);

            expect(await transport.hasBridge()).to.be.undefined;
        });

        it('accepts and caches a candidate whose evaluate resolves to a genuine typeof answer', async () => {
            const jsSession = makeSession('js1', '"object"');
            sinon.stub(debugSessionManager, 'getEvaluableJsSessions').returns([jsSession]);

            expect(await transport.hasBridge()).to.be.true;
            // one evaluate to probe the candidate inside ensureSession, one for hasBridge's own check
            expect(jsSession.customRequest.callCount).to.equal(2);

            // cached session is reused — getEvaluableJsSessions is not consulted again
            await transport.hasBridge();
            expect(jsSession.customRequest.callCount).to.equal(3);
            expect((debugSessionManager.getEvaluableJsSessions as sinon.SinonStub).callCount).to.equal(1);
        });

        it('falls through a skipped BrightScript candidate to accept the next valid one', async () => {
            const brightScript = makeSession('brs1', '"invalid"');
            const jsSession = makeSession('js1', '"object"');
            sinon.stub(debugSessionManager, 'getEvaluableJsSessions').returns([brightScript, jsSession]);

            expect(await transport.hasBridge()).to.be.true;
        });
        it('accepts a JS session whose bridge is not installed yet (typeof __SDT = "undefined")', async () => {
            const jsSession = makeSession('js1', '"undefined"');
            sinon.stub(debugSessionManager, 'getEvaluableJsSessions').returns([jsSession]);

            expect(await transport.hasBridge()).to.be.false;
            expect(jsSession.customRequest.callCount).to.equal(2);
        });

        it('skips a candidate whose evaluate rejects (e.g. js-debug parent with no CDP target)', async () => {
            const parent = { id: 'js1', name: 'js1', customRequest: sinon.stub().rejects(new Error('no execution context')) } as any;
            const child = makeSession('child1', '"object"');
            sinon.stub(debugSessionManager, 'getEvaluableJsSessions').returns([parent, child]);

            expect(await transport.hasBridge()).to.be.true;
            expect(parent.customRequest.callCount).to.equal(1);
        });

    });
});
