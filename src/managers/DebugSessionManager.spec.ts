import { expect } from 'chai';
import { createSandbox } from 'sinon';
let Module = require('module');

import { vscode } from '../mockVscode.spec';

// Override the "require" call to mock vscode — must run before the SUT is imported, since
// DebugSessionManager value-imports vscode (for EventEmitter) at module load.
const { require: oldRequire } = Module.prototype;
Module.prototype.require = function hijacked(file) {
    if (file === 'vscode') {
        return vscode;
    } else {
        return oldRequire.apply(this, arguments);
    }
};

import { DebugSessionManager } from './DebugSessionManager';

const sinon = createSandbox();

/** Build a fake DebugSession with just the fields the manager reads. */
function makeSession(id: string, type: string, options: { parentSession?: any; configuration?: any } = {}) {
    return {
        id: id,
        type: type,
        name: id,
        parentSession: options.parentSession,
        configuration: options.configuration ?? {},
        customRequest: () => Promise.resolve()
    } as any;
}

/** A brightscript session + its auto-attached JS session + the JS session's CDP child. */
function makeDualSession(suffix = '1') {
    const brightScript = makeSession(`brs${suffix}`, 'brightscript');
    const js = makeSession(`js${suffix}`, 'pwa-node', {
        configuration: { _isBrightscriptJsSession: true, _brightscriptParentSessionId: brightScript.id }
    });
    const jsChild = makeSession(`child${suffix}`, 'pwa-node', { parentSession: js });
    return { brightScript: brightScript, js: js, jsChild: jsChild };
}

describe('DebugSessionManager', () => {
    // Use a fresh instance per test rather than the shared singleton — the production
    // singleton accumulates listeners from other specs (e.g. extension.activate() wires
    // Extension.onDidStartDebugSession to it), and firing events through it would invoke
    // their stale handlers.
    let manager: DebugSessionManager;
    let start: (session: any) => void;
    let terminate: (session: any) => void;

    beforeEach(() => {
        (vscode.debug as any).activeDebugSession = undefined;

        (sinon.stub(vscode.debug, 'onDidStartDebugSession') as sinon.SinonStub).callsFake((cb: any) => {
            start = cb;
            return { dispose: () => { } };
        });
        (sinon.stub(vscode.debug, 'onDidTerminateDebugSession') as sinon.SinonStub).callsFake((cb: any) => {
            terminate = cb;
            return { dispose: () => { } };
        });

        manager = new DebugSessionManager();
        manager.register({ subscriptions: [] } as any);
    });

    afterEach(() => {
        (vscode.debug as any).activeDebugSession = undefined;
        sinon.restore();
    });

    describe('tracking', () => {
        it('isLive reflects start/terminate', () => {
            const { brightScript } = makeDualSession();
            expect(manager.isLive(brightScript)).to.be.false;
            start(brightScript);
            expect(manager.isLive(brightScript)).to.be.true;
            terminate(brightScript);
            expect(manager.isLive(brightScript)).to.be.false;
        });

        it('isLive is false for undefined', () => {
            expect(manager.isLive(undefined)).to.be.false;
        });
    });

    describe('groups', () => {
        it('builds one group per brightscript session, with its js + jsChildren', () => {
            const { brightScript, js, jsChild } = makeDualSession();
            start(brightScript);
            start(js);
            start(jsChild);

            const groups = manager.groups;
            expect(groups.length).to.equal(1);
            expect(groups[0].brightScript).to.equal(brightScript);
            expect(groups[0].js).to.equal(js);
            expect(groups[0].jsChildren).to.eql([jsChild]);
        });

        it('a plain brightscript session (no TS) is a group with no js', () => {
            const { brightScript } = makeDualSession();
            start(brightScript);

            const groups = manager.groups;
            expect(groups.length).to.equal(1);
            expect(groups[0].js).to.be.undefined;
            expect(groups[0].jsChildren).to.eql([]);
        });
    });

    describe('getActiveBrightScriptSession', () => {
        it('resolves the BRS session even when the JS session is active (the reported bug)', () => {
            const { brightScript, js, jsChild } = makeDualSession();
            start(brightScript);
            start(js);
            start(jsChild);

            (vscode.debug as any).activeDebugSession = js;
            expect(manager.getActiveBrightScriptSession()).to.equal(brightScript);

            (vscode.debug as any).activeDebugSession = jsChild;
            expect(manager.getActiveBrightScriptSession()).to.equal(brightScript);

            (vscode.debug as any).activeDebugSession = brightScript;
            expect(manager.getActiveBrightScriptSession()).to.equal(brightScript);
        });

        it('falls back to the only running group when an unrelated session is active', () => {
            const { brightScript, js } = makeDualSession();
            start(brightScript);
            start(js);

            (vscode.debug as any).activeDebugSession = makeSession('unrelated', 'node');
            expect(manager.getActiveBrightScriptSession()).to.equal(brightScript);
        });

        it('is undefined when nothing relevant is active and multiple groups run', () => {
            const a = makeDualSession('A');
            const b = makeDualSession('B');
            start(a.brightScript);
            start(b.brightScript);

            (vscode.debug as any).activeDebugSession = makeSession('unrelated', 'node');
            expect(manager.getActiveBrightScriptSession()).to.be.undefined;
        });

        it('picks the right group when multiple are running and the JS session of one is active', () => {
            const a = makeDualSession('A');
            const b = makeDualSession('B');
            start(a.brightScript);
            start(a.js);
            start(b.brightScript);
            start(b.js);

            (vscode.debug as any).activeDebugSession = b.js;
            expect(manager.getActiveBrightScriptSession()).to.equal(b.brightScript);
        });
    });

    describe('getEvaluableJsSessions', () => {
        it('ranks the CDP child ahead of its targetless parent', () => {
            const { brightScript, js, jsChild } = makeDualSession();
            start(brightScript);
            start(js);
            start(jsChild);

            const evaluable = manager.getEvaluableJsSessions().map(s => s.id);
            // the brightscript session is not node-ish, so it's excluded; the child comes first
            expect(evaluable).to.eql(['child1', 'js1']);
        });

        it('puts the active session first', () => {
            const { brightScript, js, jsChild } = makeDualSession();
            start(brightScript);
            start(js);
            start(jsChild);

            (vscode.debug as any).activeDebugSession = js;
            const evaluable = manager.getEvaluableJsSessions().map(s => s.id);
            expect(evaluable[0]).to.equal('js1');
        });

        it('excludes a non-node active session (the BrightScript session itself)', () => {
            const { brightScript, js, jsChild } = makeDualSession();
            start(brightScript);
            start(js);
            start(jsChild);

            (vscode.debug as any).activeDebugSession = brightScript;
            const evaluable = manager.getEvaluableJsSessions().map(s => s.id);
            expect(evaluable).to.eql(['child1', 'js1']);
        });

        it('excludes a non-node active session (e.g. pwa-chrome) while keeping nodeish ranking', () => {
            const { brightScript, js, jsChild } = makeDualSession();
            start(brightScript);
            start(js);
            start(jsChild);

            (vscode.debug as any).activeDebugSession = makeSession('chrome', 'pwa-chrome');
            const evaluable = manager.getEvaluableJsSessions().map(s => s.id);
            expect(evaluable).to.eql(['child1', 'js1']);
        });
    });

    describe('joint teardown', () => {
        it('terminating any member stops the rest of the group', () => {
            const { brightScript, js, jsChild } = makeDualSession();
            start(brightScript);
            start(js);
            start(jsChild);

            const stopStub = sinon.stub(vscode.debug, 'stopDebugging') as sinon.SinonStub;
            stopStub.resolves();
            terminate(brightScript);

            expect(stopStub.calledWith(js)).to.be.true;
            expect(stopStub.calledWith(jsChild)).to.be.true;
            // never tries to stop the session that already terminated
            expect(stopStub.calledWith(brightScript)).to.be.false;
        });

        it('terminating a confirmed JS session stops its BRS sibling', () => {
            const { brightScript, js } = makeDualSession();
            start(brightScript);
            start(js);
            //extension.ts confirms the JS session once its `startDebugging` resolves true; only
            //confirmed sessions participate in joint teardown
            manager.confirmJsSessionsFor(brightScript.id);

            const stopStub = sinon.stub(vscode.debug, 'stopDebugging') as sinon.SinonStub;
            stopStub.resolves();
            terminate(js);

            expect(stopStub.calledWith(brightScript)).to.be.true;
        });

        it('terminating an UNCONFIRMED JS session leaves its BRS sibling running', () => {
            const { brightScript, js } = makeDualSession();
            start(brightScript);
            start(js);

            const stopStub = sinon.stub(vscode.debug, 'stopDebugging') as sinon.SinonStub;
            stopStub.resolves();
            //a failed attach attempt starts-and-terminates a session without ever being
            //confirmed; it must only stop itself, not the healthy parent mid-retry-loop
            terminate(js);

            expect(stopStub.called).to.be.false;
        });

        it('an unrelated debug session tears down nothing', () => {
            const unrelated = makeSession('unrelated', 'node');
            start(unrelated);

            const stopStub = sinon.stub(vscode.debug, 'stopDebugging') as sinon.SinonStub;
            stopStub.resolves();
            terminate(unrelated);

            expect(stopStub.called).to.be.false;
        });

        it('never stops a member that already terminated', () => {
            const { brightScript, js, jsChild } = makeDualSession();
            start(brightScript);
            start(js);
            start(jsChild);

            const stopStub = sinon.stub(vscode.debug, 'stopDebugging') as sinon.SinonStub;
            stopStub.resolves();
            // the child goes away on its own first, then the brightscript session terminates;
            // the already-gone child must never be handed to stopDebugging.
            terminate(jsChild);
            terminate(brightScript);

            expect(stopStub.calledWith(jsChild)).to.be.false;
            expect(stopStub.calledWith(js)).to.be.true;
        });
    });
});
