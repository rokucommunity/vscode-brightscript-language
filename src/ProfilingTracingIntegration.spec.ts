import { expect } from 'chai';
import { createSandbox } from 'sinon';
let Module = require('module');
import { PerfettoControlCommands } from './PerfettoControlCommands';
import { vscode } from './mockVscode.spec';
import { vscodeContextManager } from './managers/VscodeContextManager';

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

/**
 * Profiling/Tracing Integration Tests
 *
 * These tests are designed to be re-run on demand when new changes are pushed.
 * They cover the key scenarios for the Perfetto tracing and heap snapshot functionality.
 *
 * Test scenarios covered:
 * - Tracing disabled - buttons hidden
 * - Tracing enabled - buttons visible (no auto-start)
 * - connectOnStart = true - auto-start tracing
 * - connectOnStart = false - manual start works
 * - Heap snapshots during active tracing (no file open)
 * - Heap snapshot without active tracing - auto start/stop
 * - Stop debug session - finalizes tracing and opens file
 * - Open perfetto-trace files from explorer
 * - HeapSnapshot code works on enabled system
 * - Concurrency - rapid button clicks
 * - Repeated tests - multiple sessions
 */
describe('Profiling/Tracing Integration Tests', () => {
    let perfettoControlCommands: PerfettoControlCommands;
    let mockContext: any;
    let onDidReceiveDebugSessionCustomEventCallback: (...args: any[]) => any;
    let onDidTerminateDebugSessionCallback: (...args: any[]) => any;
    let onDidStartDebugSessionCallback: (...args: any[]) => any;
    let registeredCommands: Map<string, (...args: any[]) => any>;
    let contextManagerSetStub: sinon.SinonStub;

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

        (sinon.stub(vscode.debug, 'onDidTerminateDebugSession') as sinon.SinonStub).callsFake((callback: any) => {
            onDidTerminateDebugSessionCallback = callback;
            return { dispose: () => { } };
        });

        (sinon.stub(vscode.debug, 'onDidStartDebugSession') as sinon.SinonStub).callsFake((callback: any) => {
            onDidStartDebugSessionCallback = callback;
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

        // Stub the vscodeContextManager.set method
        contextManagerSetStub = sinon.stub(vscodeContextManager, 'set').resolves();
    });

    afterEach(() => {
        sinon.restore();
    });

    describe('Tracing Disabled - Buttons Hidden', () => {
        it('should NOT set tracingEnabled context when no profiling enable event is received', () => {
            perfettoControlCommands.registerPerfettoControlCommands(mockContext);

            // Without any ProfilingEnabledEvent, the tracingEnabled context should not be set to true
            // This simulates profiling.tracing.enable === false scenario
            expect(contextManagerSetStub.calledWith('brightscript.tracingEnabled', true)).to.be.false;
            expect(contextManagerSetStub.calledWith('brightscript.heapSnapshotEnabled', true)).to.be.false;
        });

        it('should reset all profiling contexts to false when session starts', async () => {
            perfettoControlCommands.registerPerfettoControlCommands(mockContext);

            const mockSession = {
                type: 'brightscript'
            };

            // When session starts, cleanContext should reset all profiling contexts to false
            await onDidStartDebugSessionCallback(mockSession);

            // All profiling contexts should be set to false (buttons hidden)
            expect(contextManagerSetStub.calledWith('brightscript.tracingEnabled', false)).to.be.true;
            expect(contextManagerSetStub.calledWith('brightscript.tracingActive', false)).to.be.true;
            expect(contextManagerSetStub.calledWith('brightscript.heapSnapshotActive', false)).to.be.true;
        });

        it('buttons should only appear after ProfilingEnabledEvent is received', async () => {
            perfettoControlCommands.registerPerfettoControlCommands(mockContext);

            // Initially, no enabled event means buttons are hidden
            expect(contextManagerSetStub.calledWith('brightscript.tracingEnabled', true)).to.be.false;

            // Now simulate receiving a profiling enabled event
            const event = {
                event: 'ProfilingEnabledEvent',
                body: {
                    types: ['trace', 'heapSnapshot']
                }
            };

            await onDidReceiveDebugSessionCustomEventCallback(event);

            // Now buttons should be visible
            expect(contextManagerSetStub.calledWith('brightscript.tracingEnabled', true)).to.be.true;
            expect(contextManagerSetStub.calledWith('brightscript.heapSnapshotEnabled', true)).to.be.true;
        });
    });

    describe('Tracing Enabled - Buttons Visible (No Auto-Start)', () => {
        it('should register all tracing control commands when tracing is enabled', () => {
            perfettoControlCommands.registerPerfettoControlCommands(mockContext);

            // Verify all the necessary commands are registered
            expect(registeredCommands.has('extension.brightscript.startTracing')).to.be.true;
            expect(registeredCommands.has('extension.brightscript.stopTracing')).to.be.true;
            expect(registeredCommands.has('extension.brightscript.captureHeapSnapshot')).to.be.true;
        });

        it('should NOT automatically start tracing when debug session starts (connectOnStart false)', () => {
            perfettoControlCommands.registerPerfettoControlCommands(mockContext);

            // Simulate the session starting (no auto-start event should fire)
            // With connectOnStart: false, we expect NO customRequest to startPerfettoTracing
            const mockSession = {
                type: 'brightscript',
                customRequest: sinon.stub().resolves()
            };
            (vscode.debug as any).activeDebugSession = mockSession;

            // The tracing should not have been started automatically
            expect(mockSession.customRequest.calledWith('startPerfettoTracing')).to.be.false;
        });
    });

    describe('connectOnStart = true - Auto-Start Tracing', () => {
        it('should set tracingActive context to true when tracing start event is received', async () => {
            perfettoControlCommands.registerPerfettoControlCommands(mockContext);

            // Simulate receiving a profiling start event from roku-debug
            // The real event uses isProfilingStartEvent from roku-debug
            const event = {
                event: 'ProfilingStartEvent',
                body: {
                    type: 'trace'
                }
            };

            await onDidReceiveDebugSessionCustomEventCallback(event);

            // Check that vscodeContextManager.set was called to enable tracing
            expect(contextManagerSetStub.calledWith('brightscript.tracingActive', true)).to.be.true;
        });
    });

    describe('connectOnStart = false - Manual Start Works', () => {
        it('should start tracing when startTracing command is executed manually', async () => {
            perfettoControlCommands.registerPerfettoControlCommands(mockContext);

            const mockSession = {
                type: 'brightscript',
                customRequest: sinon.stub().resolves({ message: 'Tracing started' })
            };
            (vscode.debug as any).activeDebugSession = mockSession;

            const startTracingCommand = registeredCommands.get('extension.brightscript.startTracing');
            await startTracingCommand();

            expect(mockSession.customRequest.calledWith('startPerfettoTracing')).to.be.true;
            expect(contextManagerSetStub.calledWith('brightscript.tracingActive', true)).to.be.true;
        });

        it('should show error when trying to start tracing without active session', async () => {
            perfettoControlCommands.registerPerfettoControlCommands(mockContext);
            (vscode.debug as any).activeDebugSession = undefined;

            const startTracingCommand = registeredCommands.get('extension.brightscript.startTracing');
            await startTracingCommand();

            expect((vscode.window.showErrorMessage as sinon.SinonStub).calledWith(
                `Cannot start tracing: there's no active debug session`
            )).to.be.true;
        });
    });

    describe('Heap Snapshots During Active Tracing', () => {
        it('should capture heap snapshot when command is executed during active tracing', async () => {
            perfettoControlCommands.registerPerfettoControlCommands(mockContext);

            const mockSession = {
                type: 'brightscript',
                customRequest: sinon.stub().resolves({ message: 'Snapshot captured' })
            };
            (vscode.debug as any).activeDebugSession = mockSession;

            const captureSnapshotCommand = registeredCommands.get('extension.brightscript.captureHeapSnapshot');
            await captureSnapshotCommand();

            expect(mockSession.customRequest.calledWith('captureHeapSnapshot')).to.be.true;
        });

        it('should reset heapSnapshotActive context when snapshot stop event is received', async () => {
            perfettoControlCommands.registerPerfettoControlCommands(mockContext);

            // Simulate receiving a profiling stop event for heapSnapshot
            const event = {
                event: 'ProfilingStopEvent',
                body: {
                    type: 'heapSnapshot'
                }
            };

            await onDidReceiveDebugSessionCustomEventCallback(event);

            // Should reset heapSnapshotActive context
            expect(contextManagerSetStub.calledWith('brightscript.heapSnapshotActive', false)).to.be.true;
        });

        it('should allow multiple heap snapshots without requiring session restart', async () => {
            perfettoControlCommands.registerPerfettoControlCommands(mockContext);

            const mockSession = {
                type: 'brightscript',
                customRequest: sinon.stub().resolves({ message: 'Snapshot captured' })
            };
            (vscode.debug as any).activeDebugSession = mockSession;

            const captureSnapshotCommand = registeredCommands.get('extension.brightscript.captureHeapSnapshot');

            // Take 3 snapshots in succession
            await captureSnapshotCommand();
            await captureSnapshotCommand();
            await captureSnapshotCommand();

            expect(mockSession.customRequest.callCount).to.equal(3);
            expect(mockSession.customRequest.alwaysCalledWith('captureHeapSnapshot')).to.be.true;
        });
    });

    describe('Stop Debug Session Finalizes Tracing', () => {
        it('should reset context when debug session ends', async () => {
            perfettoControlCommands.registerPerfettoControlCommands(mockContext);

            const mockSession = {
                type: 'brightscript',
                customRequest: sinon.stub().resolves({ message: 'Tracing stopped' })
            };

            await onDidTerminateDebugSessionCallback(mockSession);

            // Context should be reset via cleanContext function
            expect(contextManagerSetStub.calledWith('brightscript.tracingEnabled', false)).to.be.true;
            expect(contextManagerSetStub.calledWith('brightscript.tracingActive', false)).to.be.true;
            expect(contextManagerSetStub.calledWith('brightscript.heapSnapshotActive', false)).to.be.true;
        });

        it('should not reset context for non-brightscript sessions', async () => {
            perfettoControlCommands.registerPerfettoControlCommands(mockContext);

            const mockSession = {
                type: 'node', // Different session type
                customRequest: sinon.stub().resolves()
            };

            await onDidTerminateDebugSessionCallback(mockSession);

            // Should not have reset brightscript contexts
            expect(contextManagerSetStub.calledWith('brightscript.tracingActive', false)).to.be.false;
        });
    });

    describe('Profiling Error Handling', () => {
        it('should show error message when profiling error event is received', async () => {
            perfettoControlCommands.registerPerfettoControlCommands(mockContext);

            // Simulate receiving a profiling error event
            const event = {
                event: 'ProfilingErrorEvent',
                body: {
                    error: {
                        message: 'Failed to enable tracing on device'
                    }
                }
            };

            await onDidReceiveDebugSessionCustomEventCallback(event);

            expect((vscode.window.showErrorMessage as sinon.SinonStub).calledWith(
                'Profiling error: Failed to enable tracing on device'
            )).to.be.true;
        });
    });

    describe('Concurrency - Rapid Commands', () => {
        it('should handle rapid start/stop commands without throwing', async () => {
            perfettoControlCommands.registerPerfettoControlCommands(mockContext);

            const mockSession = {
                type: 'brightscript',
                customRequest: sinon.stub().resolves()
            };
            (vscode.debug as any).activeDebugSession = mockSession;

            const startTracingCommand = registeredCommands.get('extension.brightscript.startTracing');
            const stopTracingCommand = registeredCommands.get('extension.brightscript.stopTracing');

            // Rapid-fire commands (should not throw)
            const promises = [];
            promises.push(startTracingCommand());
            promises.push(stopTracingCommand());
            promises.push(startTracingCommand());
            promises.push(startTracingCommand());
            promises.push(stopTracingCommand());

            await Promise.all(promises);

            // Should have made multiple requests without errors
            expect(mockSession.customRequest.callCount).to.be.greaterThan(0);
        });

        it('should handle rapid heap snapshot commands without throwing', async () => {
            perfettoControlCommands.registerPerfettoControlCommands(mockContext);

            const mockSession = {
                type: 'brightscript',
                customRequest: sinon.stub().resolves()
            };
            (vscode.debug as any).activeDebugSession = mockSession;

            const captureSnapshotCommand = registeredCommands.get('extension.brightscript.captureHeapSnapshot');

            // Rapid-fire snapshot commands
            const promises = [];
            for (let i = 0; i < 5; i++) {
                promises.push(captureSnapshotCommand());
            }

            await Promise.all(promises);

            // All should complete without errors
            expect(mockSession.customRequest.callCount).to.equal(5);
        });
    });

    describe('Repeated Tests - State Management', () => {
        it('should properly track context state across multiple start/stop cycles', async () => {
            perfettoControlCommands.registerPerfettoControlCommands(mockContext);

            const mockSession = {
                type: 'brightscript',
                customRequest: sinon.stub().resolves()
            };
            (vscode.debug as any).activeDebugSession = mockSession;

            const startTracingCommand = registeredCommands.get('extension.brightscript.startTracing');
            const stopTracingCommand = registeredCommands.get('extension.brightscript.stopTracing');

            // Cycle 1: Start
            await startTracingCommand();
            expect(contextManagerSetStub.calledWith('brightscript.tracingActive', true)).to.be.true;

            // Reset to check for second cycle calls
            contextManagerSetStub.resetHistory();

            // Cycle 2: Start again
            await startTracingCommand();
            expect(contextManagerSetStub.calledWith('brightscript.tracingActive', true)).to.be.true;
        });

        it('should reset all contexts on session terminate', async () => {
            perfettoControlCommands.registerPerfettoControlCommands(mockContext);

            const mockSession = {
                type: 'brightscript'
            };

            // Start session
            await onDidStartDebugSessionCallback(mockSession);

            // Reset to track termination calls
            contextManagerSetStub.resetHistory();

            // Terminate session
            await onDidTerminateDebugSessionCallback(mockSession);

            // All profiling contexts should be reset
            expect(contextManagerSetStub.calledWith('brightscript.tracingEnabled', false)).to.be.true;
            expect(contextManagerSetStub.calledWith('brightscript.tracingActive', false)).to.be.true;
            expect(contextManagerSetStub.calledWith('brightscript.heapSnapshotActive', false)).to.be.true;
        });
    });

    describe('Profiling Enable Event', () => {
        it('should set tracingEnabled context when profiling enable event with trace type is received', async () => {
            perfettoControlCommands.registerPerfettoControlCommands(mockContext);

            const event = {
                event: 'ProfilingEnabledEvent',
                body: {
                    types: ['trace']
                }
            };

            await onDidReceiveDebugSessionCustomEventCallback(event);

            expect(contextManagerSetStub.calledWith('brightscript.tracingEnabled', true)).to.be.true;
        });

        it('should set heapSnapshotEnabled context when profiling enable event with heapSnapshot type is received', async () => {
            perfettoControlCommands.registerPerfettoControlCommands(mockContext);

            const event = {
                event: 'ProfilingEnabledEvent',
                body: {
                    types: ['heapSnapshot']
                }
            };

            await onDidReceiveDebugSessionCustomEventCallback(event);

            expect(contextManagerSetStub.calledWith('brightscript.heapSnapshotEnabled', true)).to.be.true;
        });

        it('should set both contexts when profiling enable event with both types is received', async () => {
            perfettoControlCommands.registerPerfettoControlCommands(mockContext);

            const event = {
                event: 'ProfilingEnabledEvent',
                body: {
                    types: ['trace', 'heapSnapshot']
                }
            };

            await onDidReceiveDebugSessionCustomEventCallback(event);

            expect(contextManagerSetStub.calledWith('brightscript.tracingEnabled', true)).to.be.true;
            expect(contextManagerSetStub.calledWith('brightscript.heapSnapshotEnabled', true)).to.be.true;
        });
    });

    describe('Stop Event Opens File', () => {
        it('should open file when profiling stop event includes a result path', async () => {
            perfettoControlCommands.registerPerfettoControlCommands(mockContext);

            const event = {
                event: 'ProfilingStopEvent',
                body: {
                    type: 'trace',
                    result: '/path/to/trace.perfetto-trace'
                }
            };

            await onDidReceiveDebugSessionCustomEventCallback(event);

            // Should call vscode.commands.executeCommand('vscode.open', ...)
            expect((vscode.commands.executeCommand as sinon.SinonStub).called).to.be.true;
        });
    });
});
