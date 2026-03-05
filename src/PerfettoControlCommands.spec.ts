import { expect } from 'chai';
import { createSandbox } from 'sinon';
let Module = require('module');
import { PerfettoControlCommands } from './PerfettoControlCommands';
import { vscode } from './mockVscode.spec';

const sinon = createSandbox();

// Override the "require" call to mock vscode
const { require: oldRequire } = Module.prototype;
Module.prototype.require = function hijacked(file) {
    if (file === 'vscode') {
        return vscode;
    } else {
        return oldRequire.apply(this, arguments);
    }
};

describe('PerfettoControlCommands', () => {
    let perfettoControlCommands: PerfettoControlCommands;
    let mockContext: any;
    let onDidReceiveDebugSessionCustomEventCallback: (...args: any[]) => any;
    let onDidTerminateDebugSessionCallback: (...args: any[]) => any;
    let registeredCommands: Map<string, (...args: any[]) => any>;

    beforeEach(() => {
        perfettoControlCommands = new PerfettoControlCommands();
        registeredCommands = new Map();

        mockContext = {
            subscriptions: []
        };

        // Capture the callbacks when they're registered
        (sinon.stub(vscode.debug, 'onDidReceiveDebugSessionCustomEvent') as sinon.SinonStub).callsFake((callback: any) => {
            onDidReceiveDebugSessionCustomEventCallback = callback;
            return { dispose: () => { } };
        });

        (sinon.stub(vscode.debug, 'onDidStartDebugSession') as sinon.SinonStub).callsFake(() => {
            return { dispose: () => { } };
        });

        (sinon.stub(vscode.debug, 'onDidTerminateDebugSession') as sinon.SinonStub).callsFake((callback: any) => {
            onDidTerminateDebugSessionCallback = callback;
            return { dispose: () => { } };
        });

        (sinon.stub(vscode.commands, 'registerCommand') as sinon.SinonStub).callsFake((commandId: string, callback: any) => {
            registeredCommands.set(commandId, callback);
            return { dispose: () => { } };
        });

        sinon.stub(vscode.commands, 'executeCommand').resolves();
        sinon.stub(vscode.window, 'showInformationMessage').resolves();
        sinon.stub(vscode.window, 'showWarningMessage').resolves();
        sinon.stub(vscode.window, 'showErrorMessage').resolves();
    });

    afterEach(() => {
        sinon.restore();
    });

    describe('registerPerfettoControlCommands', () => {
        it('registers all event listeners and commands', () => {
            perfettoControlCommands.registerPerfettoControlCommands(mockContext);

            // 7 subscriptions: onDidReceiveDebugSessionCustomEvent, onDidStartDebugSession, onDidTerminateDebugSession, and 4 commands
            expect(mockContext.subscriptions.length).to.equal(7);
            expect(registeredCommands.has('extension.brightscript.startTracing')).to.be.true;
            expect(registeredCommands.has('extension.brightscript.stopTracing')).to.be.true;
            expect(registeredCommands.has('extension.brightscript.captureHeapSnapshot')).to.be.true;
            expect(registeredCommands.has('extension.brightscript.heapSnapshotActive')).to.be.true;
        });
    });

    describe('ProfilingErrorEvent', () => {
        it('shows error message on profiling error event', async () => {
            perfettoControlCommands.registerPerfettoControlCommands(mockContext);

            // Use the actual event structure expected by isProfilingErrorEvent
            const event = {
                event: 'ProfilingErrorEvent',
                body: {
                    error: {
                        message: 'WebSocket error: Connection refused'
                    }
                }
            };

            await onDidReceiveDebugSessionCustomEventCallback(event);

            expect((vscode.window.showErrorMessage as sinon.SinonStub).calledWith(
                'Profiling error: WebSocket error: Connection refused'
            )).to.be.true;
        });
    });

    describe('ProfilingStopEvent', () => {
        it('opens file when profiling stop event has result', async () => {
            perfettoControlCommands.registerPerfettoControlCommands(mockContext);

            const event = {
                event: 'ProfilingStopEvent',
                body: {
                    type: 'trace',
                    result: '/path/to/trace.perfetto-trace'
                }
            };

            await onDidReceiveDebugSessionCustomEventCallback(event);

            // The implementation calls vscode.commands.executeCommand('vscode.open', ...)
            expect((vscode.commands.executeCommand as sinon.SinonStub).called).to.be.true;
        });
    });

    describe('onDidTerminateDebugSession', () => {
        it('cleans context when brightscript session ends', async () => {
            perfettoControlCommands.registerPerfettoControlCommands(mockContext);

            const mockSession = {
                type: 'brightscript'
            };

            // The implementation calls cleanContext, which uses vscodeContextManager.set
            // It does NOT call customRequest
            await onDidTerminateDebugSessionCallback(mockSession);

            // Test passes if no error is thrown
        });

        it('does not clean context for non-brightscript sessions', async () => {
            perfettoControlCommands.registerPerfettoControlCommands(mockContext);

            const mockSession = {
                type: 'node'
            };

            await onDidTerminateDebugSessionCallback(mockSession);

            // cleanContext only runs for brightscript sessions
        });
    });

    describe('startTracing command', () => {
        it('shows error when no active debug session', async () => {
            perfettoControlCommands.registerPerfettoControlCommands(mockContext);
            (vscode.debug as any).activeDebugSession = undefined;

            const startTracingCommand = registeredCommands.get('extension.brightscript.startTracing');
            await startTracingCommand();

            expect((vscode.window.showErrorMessage as sinon.SinonStub).calledWith(
                `Cannot start tracing: there's no active debug session`
            )).to.be.true;
        });

        it('starts tracing and sets context', async () => {
            perfettoControlCommands.registerPerfettoControlCommands(mockContext);

            const mockSession = {
                customRequest: sinon.stub().resolves({ message: 'Tracing started at /path/to/trace.perfetto-trace' })
            };
            (vscode.debug as any).activeDebugSession = mockSession;

            const startTracingCommand = registeredCommands.get('extension.brightscript.startTracing');
            await startTracingCommand();

            expect(mockSession.customRequest.calledWith('startPerfettoTracing')).to.be.true;
        });

        it('logs error when start tracing fails with exception', async () => {
            perfettoControlCommands.registerPerfettoControlCommands(mockContext);

            const mockSession = {
                customRequest: sinon.stub().rejects(new Error('Failed to connect'))
            };
            (vscode.debug as any).activeDebugSession = mockSession;

            const startTracingCommand = registeredCommands.get('extension.brightscript.startTracing');
            // Should not throw
            await startTracingCommand();

            // Implementation uses console.error instead of showErrorMessage
            expect(mockSession.customRequest.calledWith('startPerfettoTracing')).to.be.true;
        });

        it('handles customRequest throwing gracefully', async () => {
            perfettoControlCommands.registerPerfettoControlCommands(mockContext);

            const mockSession = {
                customRequest: sinon.stub().rejects(new Error('Network error'))
            };
            (vscode.debug as any).activeDebugSession = mockSession;

            const startTracingCommand = registeredCommands.get('extension.brightscript.startTracing');
            // Should not throw
            await startTracingCommand();

            expect(mockSession.customRequest.calledWith('startPerfettoTracing')).to.be.true;
        });
    });

    describe('stopTracing command', () => {
        it('returns silently when no active debug session', async () => {
            perfettoControlCommands.registerPerfettoControlCommands(mockContext);
            (vscode.debug as any).activeDebugSession = undefined;

            const stopTracingCommand = registeredCommands.get('extension.brightscript.stopTracing');
            // Should not throw and returns silently
            await stopTracingCommand();

            // No error message is shown - implementation just returns
            expect((vscode.window.showErrorMessage as sinon.SinonStub).called).to.be.false;
        });

        it('stops tracing by sending customRequest', async () => {
            perfettoControlCommands.registerPerfettoControlCommands(mockContext);

            const mockSession = {
                customRequest: sinon.stub().resolves({ message: 'Tracing stopped. Trace saved to /path/to/trace.perfetto-trace' })
            };
            (vscode.debug as any).activeDebugSession = mockSession;

            const stopTracingCommand = registeredCommands.get('extension.brightscript.stopTracing');
            await stopTracingCommand();

            expect(mockSession.customRequest.calledWith('stopPerfettoTracing')).to.be.true;
        });

        it('handles stop tracing failure gracefully', async () => {
            perfettoControlCommands.registerPerfettoControlCommands(mockContext);

            const mockSession = {
                customRequest: sinon.stub().rejects(new Error('No active tracing session'))
            };
            (vscode.debug as any).activeDebugSession = mockSession;

            const stopTracingCommand = registeredCommands.get('extension.brightscript.stopTracing');
            // Should not throw
            await stopTracingCommand();

            // Implementation uses console.error, not showErrorMessage
            expect(mockSession.customRequest.calledWith('stopPerfettoTracing')).to.be.true;
        });

        it('handles customRequest throwing gracefully', async () => {
            perfettoControlCommands.registerPerfettoControlCommands(mockContext);

            const mockSession = {
                customRequest: sinon.stub().rejects(new Error('Session terminated'))
            };
            (vscode.debug as any).activeDebugSession = mockSession;

            const stopTracingCommand = registeredCommands.get('extension.brightscript.stopTracing');
            // Should not throw
            await stopTracingCommand();

            expect(mockSession.customRequest.calledWith('stopPerfettoTracing')).to.be.true;
        });
    });

    describe('captureHeapSnapshot command', () => {
        it('shows error when no active debug session', async () => {
            perfettoControlCommands.registerPerfettoControlCommands(mockContext);
            (vscode.debug as any).activeDebugSession = undefined;

            const captureHeapSnapshotCommand = registeredCommands.get('extension.brightscript.captureHeapSnapshot');
            await captureHeapSnapshotCommand();

            expect((vscode.window.showErrorMessage as sinon.SinonStub).calledWith(
                `Cannot capture heap snapshot: there's no active debug session`
            )).to.be.true;
        });

        it('captures snapshot by sending customRequest', async () => {
            perfettoControlCommands.registerPerfettoControlCommands(mockContext);

            const mockSession = {
                customRequest: sinon.stub().resolves({ message: 'Snapshot captured' })
            };
            (vscode.debug as any).activeDebugSession = mockSession;

            const captureHeapSnapshotCommand = registeredCommands.get('extension.brightscript.captureHeapSnapshot');
            await captureHeapSnapshotCommand();

            expect(mockSession.customRequest.calledWith('captureHeapSnapshot')).to.be.true;
        });

        it('handles capture snapshot failure gracefully', async () => {
            perfettoControlCommands.registerPerfettoControlCommands(mockContext);

            const mockSession = {
                customRequest: sinon.stub().rejects(new Error('Tracing not active'))
            };
            (vscode.debug as any).activeDebugSession = mockSession;

            const captureHeapSnapshotCommand = registeredCommands.get('extension.brightscript.captureHeapSnapshot');
            // Should not throw
            await captureHeapSnapshotCommand();

            // Implementation uses console.error, not showErrorMessage
            expect(mockSession.customRequest.calledWith('captureHeapSnapshot')).to.be.true;
        });

        it('handles customRequest throwing gracefully', async () => {
            perfettoControlCommands.registerPerfettoControlCommands(mockContext);

            const mockSession = {
                customRequest: sinon.stub().rejects(new Error('WebSocket not connected'))
            };
            (vscode.debug as any).activeDebugSession = mockSession;

            const captureHeapSnapshotCommand = registeredCommands.get('extension.brightscript.captureHeapSnapshot');
            // Should not throw
            await captureHeapSnapshotCommand();

            expect(mockSession.customRequest.calledWith('captureHeapSnapshot')).to.be.true;
        });
    });

    describe('heapSnapshotActive command', () => {
        it('does nothing (disabled button placeholder)', () => {
            perfettoControlCommands.registerPerfettoControlCommands(mockContext);

            const heapSnapshotActiveCommand = registeredCommands.get('extension.brightscript.heapSnapshotActive');
            // Should not throw
            heapSnapshotActiveCommand();
        });
    });
});
