import { expect } from 'chai';
import { createSandbox } from 'sinon';
import * as fsExtra from 'fs-extra';
import * as os from 'os';
import * as path from 'path';
let Module = require('module');

import { vscode } from '../../mockVscode.spec';

// Override the "require" call to mock vscode — must run before the SUT is imported, since
// JsDebugPathTrace value-imports vscode at module load.
const { require: oldRequire } = Module.prototype;
Module.prototype.require = function hijacked(file) {
    if (file === 'vscode') {
        return vscode;
    } else {
        return oldRequire.apply(this, arguments);
    }
};

import { JsDebugPathTrace } from './JsDebugPathTrace';

const sinon = createSandbox();

describe('JsDebugPathTrace', () => {
    let logMessages: string[];
    let pathTrace: JsDebugPathTrace;
    let registeredFactory: any;

    function setEnabled(enabled: boolean) {
        (vscode.workspace as any)._configuration = (vscode.workspace as any)._configuration ?? {};
        (vscode.workspace as any)._configuration['brightscript.debug.jsPathTrace'] = enabled;
    }

    /** Builds a fake JS (pwa-node) child session whose parent is marked as the BRS JS session. */
    function makeJsSession() {
        return {
            id: 'js-1',
            type: 'pwa-node',
            parentSession: {
                configuration: { _isBrightscriptJsSession: true }
            }
        } as any;
    }

    beforeEach(() => {
        logMessages = [];
        registeredFactory = undefined;
        setEnabled(false);

        (sinon.stub(vscode.debug, 'registerDebugAdapterTrackerFactory') as sinon.SinonStub).callsFake((type: string, factory: any) => {
            registeredFactory = { type: type, factory: factory };
            return { dispose: () => { } };
        });

        pathTrace = new JsDebugPathTrace((message) => logMessages.push(message));
        pathTrace.register({ subscriptions: [] } as any);
    });

    afterEach(() => {
        setEnabled(false);
        sinon.restore();
    });

    describe('register', () => {
        it('only attaches a tracker to pwa-node sessions', () => {
            expect(registeredFactory.type).to.equal('pwa-node');
        });

        it('does not tap a pwa-node session whose parent is not the BRS JS session', () => {
            const session = { id: 'other', type: 'pwa-node', parentSession: { configuration: {} } } as any;
            const tracker = registeredFactory.factory.createDebugAdapterTracker(session);
            expect(tracker).to.be.undefined;
        });

        it('does not tap a pwa-node session with no parent session', () => {
            const session = { id: 'root', type: 'pwa-node', parentSession: undefined } as any;
            const tracker = registeredFactory.factory.createDebugAdapterTracker(session);
            expect(tracker).to.be.undefined;
        });
    });

    describe('DAP taps', () => {
        it('logs nothing when jsPathTrace is disabled', () => {
            setEnabled(false);
            const tracker = registeredFactory.factory.createDebugAdapterTracker(makeJsSession());

            tracker.onWillReceiveMessage({ type: 'request', command: 'setBreakpoints', arguments: { source: { path: '/foo.js' }, lines: [1] } });
            tracker.onDidSendMessage({ type: 'response', command: 'setBreakpoints', body: { breakpoints: [{ verified: true, line: 1 }] } });

            expect(logMessages).to.be.empty;
        });

        it('formats a setBreakpoints request/response pair when enabled', () => {
            setEnabled(true);
            const tracker = registeredFactory.factory.createDebugAdapterTracker(makeJsSession());

            tracker.onWillReceiveMessage({
                type: 'request',
                command: 'setBreakpoints',
                arguments: { source: { path: '/foo.js' }, lines: [10] }
            });
            expect(logMessages).to.include(`[jsPathTrace] REQ setBreakpoints -> ${JSON.stringify({ path: '/foo.js' })} lines=${JSON.stringify([10])}`);

            tracker.onDidSendMessage({
                type: 'response',
                command: 'setBreakpoints',
                body: { breakpoints: [{ verified: false, line: 10, source: { path: '/foo.js' }, message: 'Unbound breakpoint' }] }
            });
            expect(logMessages).to.include(`[jsPathTrace] RES setBreakpoints ${JSON.stringify([{ verified: false, line: 10, path: '/foo.js', message: 'Unbound breakpoint' }])}`);
        });

        it('formats a source-request failure when enabled', () => {
            setEnabled(true);
            const tracker = registeredFactory.factory.createDebugAdapterTracker(makeJsSession());

            tracker.onWillReceiveMessage({
                type: 'request',
                command: 'source',
                arguments: { source: { path: '/foo.js' } }
            });
            expect(logMessages).to.include(`[jsPathTrace] REQ source -> ${JSON.stringify({ path: '/foo.js' })}`);

            tracker.onDidSendMessage({
                type: 'response',
                command: 'source',
                success: false,
                message: 'Unable to retrieve source content'
            });
            expect(logMessages).to.include(`[jsPathTrace] RES source FAILED ${JSON.stringify('Unable to retrieve source content')}`);
        });

        it('formats a loadedSource event when enabled', () => {
            setEnabled(true);
            const tracker = registeredFactory.factory.createDebugAdapterTracker(makeJsSession());

            tracker.onDidSendMessage({
                type: 'event',
                event: 'loadedSource',
                body: { reason: 'new', source: { name: 'foo.js', path: '/foo.js' } }
            });
            expect(logMessages).to.include(`[jsPathTrace] EVT loadedSource[new] name=${JSON.stringify('foo.js')} path=${JSON.stringify('/foo.js')}`);
        });

        it('formats a stackTrace response when enabled', () => {
            setEnabled(true);
            const tracker = registeredFactory.factory.createDebugAdapterTracker(makeJsSession());

            tracker.onDidSendMessage({
                type: 'response',
                command: 'stackTrace',
                body: { stackFrames: [{ name: 'main', line: 5, source: { path: '/foo.js' } }] }
            });
            expect(logMessages).to.include(`[jsPathTrace] RES stackTrace (1 frames) ${JSON.stringify([{ name: 'main', line: 5, path: '/foo.js' }])}`);
        });
    });

    describe('getJsDebugTraceConfig', () => {
        let workspaceRootDir: string;

        beforeEach(() => {
            workspaceRootDir = path.join(os.tmpdir(), `jsDebugPathTrace-spec-${Date.now()}`);
        });

        afterEach(() => {
            fsExtra.removeSync(workspaceRootDir);
        });

        it('returns undefined when jsPathTrace is disabled', () => {
            setEnabled(false);
            expect(pathTrace.getJsDebugTraceConfig(workspaceRootDir)).to.be.undefined;
        });

        it('returns a logFile under <workspaceRoot>/logs when enabled', () => {
            setEnabled(true);
            const config = pathTrace.getJsDebugTraceConfig(workspaceRootDir);
            expect(config).to.not.be.undefined;
            expect(config.logFile).to.equal(path.join(workspaceRootDir, 'logs', config.logFile.split(/[/\\]/).pop()));
            expect(config.logFile).to.match(/js-debug-trace-\d+\.json$/);
        });
    });

    describe('logStartupSummary', () => {
        it('logs nothing when jsPathTrace is disabled', () => {
            setEnabled(false);
            pathTrace.logStartupSummary({
                platform: 'darwin',
                tsPath: '/source/compiled/main.js',
                remoteRoot: '/source/compiled',
                localRoot: '/workspace/out/.roku-deploy-staging/source/compiled',
                outFiles: ['/workspace/out/.roku-deploy-staging/source/compiled/*.js']
            });
            expect(logMessages).to.be.empty;
        });

        it('formats the derived fields when enabled', () => {
            setEnabled(true);
            pathTrace.logStartupSummary({
                platform: 'darwin',
                tsPath: '/source/compiled/main.js',
                remoteRoot: '/source/compiled',
                localRoot: '/workspace/out/.roku-deploy-staging/source/compiled',
                outFiles: ['/workspace/out/.roku-deploy-staging/source/compiled/*.js']
            });

            expect(logMessages).to.have.lengthOf(1);
            expect(logMessages[0]).to.include('[jsPathTrace] platform            = darwin');
            expect(logMessages[0]).to.include(`[jsPathTrace] tsPath (pkg:stripped)= ${JSON.stringify('/source/compiled/main.js')}`);
            expect(logMessages[0]).to.include(`[jsPathTrace] remoteRoot           = ${JSON.stringify('/source/compiled')}`);
            expect(logMessages[0]).to.include(`[jsPathTrace] localRoot            = ${JSON.stringify('/workspace/out/.roku-deploy-staging/source/compiled')}`);
            expect(logMessages[0]).to.include(`[jsPathTrace] outFiles             = ${JSON.stringify(['/workspace/out/.roku-deploy-staging/source/compiled/*.js'])}`);
            //no jsDebugTraceFile was passed, so the wire-log lines are omitted
            expect(logMessages[0]).to.not.include('js-debug wire log');
        });

        it('includes the wire-log grep hints when a jsDebugTraceFile is passed', () => {
            setEnabled(true);
            pathTrace.logStartupSummary({
                platform: 'darwin',
                tsPath: '/source/compiled/main.js',
                remoteRoot: '/source/compiled',
                localRoot: '/workspace/out/.roku-deploy-staging/source/compiled',
                outFiles: ['/workspace/out/.roku-deploy-staging/source/compiled/*.js'],
                jsDebugTraceFile: '/workspace/logs/js-debug-trace-123.json'
            });

            expect(logMessages[0]).to.include('[jsPathTrace] js-debug wire log    = /workspace/logs/js-debug-trace-123.json');
            expect(logMessages[0]).to.include(`grep it for 'setBreakpointByUrl' (expect THREE slashes: file:///source/compiled/...)`);
            expect(logMessages[0]).to.include(`and for 'runtime.sourcecreate'`);
        });
    });
});
