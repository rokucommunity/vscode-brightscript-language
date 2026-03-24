import { expect } from 'chai';
import { createSandbox } from 'sinon';
let Module = require('module');
import { ProfilingCommands } from './ProfilingCommands';
import { vscode } from '../mockVscode.spec';
import { vscodeContextManager } from '../managers/VscodeContextManager';

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

describe('ProfilingCommands', () => {
    let commands: ProfilingCommands;
    let mockContext: any;
    let onDidReceiveDebugSessionCustomEventCallback: (...args: any[]) => any;
    let onDidTerminateDebugSessionCallback: (...args: any[]) => any;
    let onDidStartDebugSessionCallback: (...args: any[]) => any;
    let registeredCommands: Map<string, (...args: any[]) => any>;
    let contextManagerSetStub: sinon.SinonStub;

    beforeEach(() => {
        commands = new ProfilingCommands();
        registeredCommands = new Map();

        mockContext = {
            subscriptions: []
        };

        // Capture the callbacks when they're registered
        (sinon.stub(vscode.debug, 'onDidReceiveDebugSessionCustomEvent') as sinon.SinonStub).callsFake((callback: any) => {
            onDidReceiveDebugSessionCustomEventCallback = callback;
            return { dispose: () => { } };
        });

        (sinon.stub(vscode.debug, 'onDidStartDebugSession') as sinon.SinonStub).callsFake((callback: any) => {
            onDidStartDebugSessionCallback = callback;
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

        // Stub the vscodeContextManager.set method
        contextManagerSetStub = sinon.stub(vscodeContextManager, 'set').resolves();
    });

    afterEach(() => {
        sinon.restore();
    });

    describe('registerPerfettoControlCommands', () => {
        it('registers all event listeners and commands', () => {
            commands.register(mockContext);

            // 7 subscriptions: onDidReceiveDebugSessionCustomEvent, onDidStartDebugSession, onDidTerminateDebugSession, and 4 commands
            expect(mockContext.subscriptions.length).to.equal(7);
            expect(registeredCommands.has('extension.brightscript.startTracing')).to.be.true;
            expect(registeredCommands.has('extension.brightscript.stopTracing')).to.be.true;
            expect(registeredCommands.has('extension.brightscript.captureHeapSnapshot')).to.be.true;
            expect(registeredCommands.has('extension.brightscript.heapSnapshotActive')).to.be.true;
        });
    });

    describe('ProfilingEnabledEvent', () => {
        it('should NOT set tracingEnabled context when no profiling enable event is received', () => {
            commands.register(mockContext);

            expect(contextManagerSetStub.calledWith('brightscript.tracingEnabled', true)).to.be.false;
            expect(contextManagerSetStub.calledWith('brightscript.heapSnapshotEnabled', true)).to.be.false;
        });

        it('should set tracingEnabled context when profiling enable event with trace type is received', async () => {
            commands.register(mockContext);

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
            commands.register(mockContext);

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
            commands.register(mockContext);

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

        it('buttons should only appear after ProfilingEnabledEvent is received', async () => {
            commands.register(mockContext);

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

    describe('ProfilingErrorEvent', () => {
        it('shows error message on profiling error event', async () => {
            commands.register(mockContext);

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

    describe('ProfilingStartEvent', () => {
        it('should set tracingActive context to true when tracing start event is received', async () => {
            commands.register(mockContext);

            const event = {
                event: 'ProfilingStartEvent',
                body: {
                    type: 'trace'
                }
            };

            await onDidReceiveDebugSessionCustomEventCallback(event);

            expect(contextManagerSetStub.calledWith('brightscript.tracingActive', true)).to.be.true;
        });
    });

    describe('ProfilingStopEvent', () => {
        it('opens file when profiling stop event has result', async () => {
            commands.register(mockContext);

            const event = {
                event: 'ProfilingStopEvent',
                body: {
                    type: 'trace',
                    result: '/path/to/trace.perfetto-trace'
                }
            };

            await onDidReceiveDebugSessionCustomEventCallback(event);

            expect((vscode.commands.executeCommand as sinon.SinonStub).called).to.be.true;
        });

        it('should reset heapSnapshotActive context when snapshot stop event is received', async () => {
            commands.register(mockContext);

            const event = {
                event: 'ProfilingStopEvent',
                body: {
                    type: 'heapSnapshot'
                }
            };

            await onDidReceiveDebugSessionCustomEventCallback(event);

            expect(contextManagerSetStub.calledWith('brightscript.heapSnapshotActive', false)).to.be.true;
        });
    });

    describe('onDidStartDebugSession', () => {
        it('should reset all profiling contexts to false when session starts', async () => {
            commands.register(mockContext);

            const mockSession = {
                type: 'brightscript'
            };

            await onDidStartDebugSessionCallback(mockSession);

            expect(contextManagerSetStub.calledWith('brightscript.tracingEnabled', false)).to.be.true;
            expect(contextManagerSetStub.calledWith('brightscript.tracingActive', false)).to.be.true;
            expect(contextManagerSetStub.calledWith('brightscript.heapSnapshotActive', false)).to.be.true;
        });

        it('should NOT automatically start tracing when debug session starts (connectOnStart false)', () => {
            commands.register(mockContext);

            const mockSession = {
                type: 'brightscript',
                customRequest: sinon.stub().resolves()
            };
            (vscode.debug as any).activeDebugSession = mockSession;

            expect(mockSession.customRequest.calledWith('startPerfettoTracing')).to.be.false;
        });
    });

    describe('onDidTerminateDebugSession', () => {
        it('resets context when brightscript session ends', async () => {
            commands.register(mockContext);

            const mockSession = {
                type: 'brightscript'
            };

            await onDidTerminateDebugSessionCallback(mockSession);

            expect(contextManagerSetStub.calledWith('brightscript.tracingEnabled', false)).to.be.true;
            expect(contextManagerSetStub.calledWith('brightscript.tracingActive', false)).to.be.true;
            expect(contextManagerSetStub.calledWith('brightscript.heapSnapshotActive', false)).to.be.true;
        });

        it('does not reset context for non-brightscript sessions', async () => {
            commands.register(mockContext);

            const mockSession = {
                type: 'node'
            };

            await onDidTerminateDebugSessionCallback(mockSession);

            expect(contextManagerSetStub.calledWith('brightscript.tracingActive', false)).to.be.false;
        });
    });

    describe('startTracing command', () => {
        it('shows error when no active debug session', async () => {
            commands.register(mockContext);
            (vscode.debug as any).activeDebugSession = undefined;

            const startTracingCommand = registeredCommands.get('extension.brightscript.startTracing');
            await startTracingCommand();

            expect((vscode.window.showErrorMessage as sinon.SinonStub).calledWith(
                `Cannot start tracing: there's no active debug session`
            )).to.be.true;
        });

        it('starts tracing and sets context', async () => {
            commands.register(mockContext);

            const mockSession = {
                customRequest: sinon.stub().resolves({ message: 'Tracing started at /path/to/trace.perfetto-trace' })
            };
            (vscode.debug as any).activeDebugSession = mockSession;

            const startTracingCommand = registeredCommands.get('extension.brightscript.startTracing');
            await startTracingCommand();

            expect(mockSession.customRequest.calledWith('startPerfettoTracing')).to.be.true;
            expect(contextManagerSetStub.calledWith('brightscript.tracingActive', true)).to.be.true;
        });

        it('handles start tracing failure gracefully', async () => {
            commands.register(mockContext);

            const mockSession = {
                customRequest: sinon.stub().rejects(new Error('Failed to connect'))
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
            commands.register(mockContext);
            (vscode.debug as any).activeDebugSession = undefined;

            const stopTracingCommand = registeredCommands.get('extension.brightscript.stopTracing');
            await stopTracingCommand();

            expect((vscode.window.showErrorMessage as sinon.SinonStub).called).to.be.false;
        });

        it('stops tracing by sending customRequest', async () => {
            commands.register(mockContext);

            const mockSession = {
                customRequest: sinon.stub().resolves({ message: 'Tracing stopped. Trace saved to /path/to/trace.perfetto-trace' })
            };
            (vscode.debug as any).activeDebugSession = mockSession;

            const stopTracingCommand = registeredCommands.get('extension.brightscript.stopTracing');
            await stopTracingCommand();

            expect(mockSession.customRequest.calledWith('stopPerfettoTracing')).to.be.true;
        });

        it('handles stop tracing failure gracefully', async () => {
            commands.register(mockContext);

            const mockSession = {
                customRequest: sinon.stub().rejects(new Error('No active tracing session'))
            };
            (vscode.debug as any).activeDebugSession = mockSession;

            const stopTracingCommand = registeredCommands.get('extension.brightscript.stopTracing');
            await stopTracingCommand();

            expect(mockSession.customRequest.calledWith('stopPerfettoTracing')).to.be.true;
        });
    });

    describe('captureHeapSnapshot command', () => {
        it('shows error when no active debug session', async () => {
            commands.register(mockContext);
            (vscode.debug as any).activeDebugSession = undefined;

            const captureHeapSnapshotCommand = registeredCommands.get('extension.brightscript.captureHeapSnapshot');
            await captureHeapSnapshotCommand();

            expect((vscode.window.showErrorMessage as sinon.SinonStub).calledWith(
                `Cannot capture heap snapshot: there's no active debug session`
            )).to.be.true;
        });

        it('captures snapshot by sending customRequest', async () => {
            commands.register(mockContext);

            const mockSession = {
                customRequest: sinon.stub().resolves({ message: 'Snapshot captured' })
            };
            (vscode.debug as any).activeDebugSession = mockSession;

            const captureHeapSnapshotCommand = registeredCommands.get('extension.brightscript.captureHeapSnapshot');
            await captureHeapSnapshotCommand();

            expect(mockSession.customRequest.calledWith('captureHeapSnapshot')).to.be.true;
        });

        it('handles capture snapshot failure gracefully', async () => {
            commands.register(mockContext);

            const mockSession = {
                customRequest: sinon.stub().rejects(new Error('Tracing not active'))
            };
            (vscode.debug as any).activeDebugSession = mockSession;

            const captureHeapSnapshotCommand = registeredCommands.get('extension.brightscript.captureHeapSnapshot');
            await captureHeapSnapshotCommand();

            expect(mockSession.customRequest.calledWith('captureHeapSnapshot')).to.be.true;
        });

        it('should allow multiple heap snapshots without requiring session restart', async () => {
            commands.register(mockContext);

            const mockSession = {
                customRequest: sinon.stub().resolves({ message: 'Snapshot captured' })
            };
            (vscode.debug as any).activeDebugSession = mockSession;

            const captureSnapshotCommand = registeredCommands.get('extension.brightscript.captureHeapSnapshot');

            await captureSnapshotCommand();
            await captureSnapshotCommand();
            await captureSnapshotCommand();

            expect(mockSession.customRequest.callCount).to.equal(3);
            expect(mockSession.customRequest.alwaysCalledWith('captureHeapSnapshot')).to.be.true;
        });
    });

    describe('heapSnapshotActive command', () => {
        it('does nothing (disabled button placeholder)', () => {
            commands.register(mockContext);

            const heapSnapshotActiveCommand = registeredCommands.get('extension.brightscript.heapSnapshotActive');
            heapSnapshotActiveCommand();
        });
    });

    describe('Concurrency - Rapid Commands', () => {
        it('should handle rapid start/stop commands without throwing', async () => {
            commands.register(mockContext);

            const mockSession = {
                type: 'brightscript',
                customRequest: sinon.stub().resolves()
            };
            (vscode.debug as any).activeDebugSession = mockSession;

            const startTracingCommand = registeredCommands.get('extension.brightscript.startTracing');
            const stopTracingCommand = registeredCommands.get('extension.brightscript.stopTracing');

            const promises = [];
            promises.push(startTracingCommand());
            promises.push(stopTracingCommand());
            promises.push(startTracingCommand());
            promises.push(startTracingCommand());
            promises.push(stopTracingCommand());

            await Promise.all(promises);

            expect(mockSession.customRequest.callCount).to.be.greaterThan(0);
        });

        it('should handle rapid heap snapshot commands without throwing', async () => {
            commands.register(mockContext);

            const mockSession = {
                type: 'brightscript',
                customRequest: sinon.stub().resolves()
            };
            (vscode.debug as any).activeDebugSession = mockSession;

            const captureSnapshotCommand = registeredCommands.get('extension.brightscript.captureHeapSnapshot');

            const promises = [];
            for (let i = 0; i < 5; i++) {
                promises.push(captureSnapshotCommand());
            }

            await Promise.all(promises);

            expect(mockSession.customRequest.callCount).to.equal(5);
        });
    });

    describe('State Management - Multiple Cycles', () => {
        it('should properly track context state across multiple start/stop cycles', async () => {
            commands.register(mockContext);

            const mockSession = {
                type: 'brightscript',
                customRequest: sinon.stub().resolves()
            };
            (vscode.debug as any).activeDebugSession = mockSession;

            const startTracingCommand = registeredCommands.get('extension.brightscript.startTracing');

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
            commands.register(mockContext);

            const mockSession = {
                type: 'brightscript'
            };

            // Start session
            await onDidStartDebugSessionCallback(mockSession);

            // Reset to track termination calls
            contextManagerSetStub.resetHistory();

            // Terminate session
            await onDidTerminateDebugSessionCallback(mockSession);

            expect(contextManagerSetStub.calledWith('brightscript.tracingEnabled', false)).to.be.true;
            expect(contextManagerSetStub.calledWith('brightscript.tracingActive', false)).to.be.true;
            expect(contextManagerSetStub.calledWith('brightscript.heapSnapshotActive', false)).to.be.true;
        });
    });
});
