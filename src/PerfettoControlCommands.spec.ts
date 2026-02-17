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

            expect(mockContext.subscriptions.length).to.equal(4);
            expect(registeredCommands.has('extension.brightscript.startTracing')).to.be.true;
            expect(registeredCommands.has('extension.brightscript.stopTracing')).to.be.true;
        });
    });

    describe('PerfettoTracingEvent', () => {
        it('shows warning and resets context on error status', async () => {
            perfettoControlCommands.registerPerfettoControlCommands(mockContext);

            const event = {
                event: 'PerfettoTracingEvent',
                body: {
                    status: 'error',
                    message: 'WebSocket error: Connection refused'
                }
            };

            await onDidReceiveDebugSessionCustomEventCallback(event);

            expect((vscode.window.showWarningMessage as sinon.SinonStub).calledWith(
                'Perfetto tracing error: WebSocket error: Connection refused'
            )).to.be.true;
            expect((vscode.commands.executeCommand as sinon.SinonStub).calledWith(
                'setContext',
                'brightscript.tracingActive',
                false
            )).to.be.true;
        });

        it('shows warning and resets context on closed status', async () => {
            perfettoControlCommands.registerPerfettoControlCommands(mockContext);

            const event = {
                event: 'PerfettoTracingEvent',
                body: {
                    status: 'closed',
                    message: 'WebSocket closed unexpectedly'
                }
            };

            await onDidReceiveDebugSessionCustomEventCallback(event);

            expect((vscode.window.showWarningMessage as sinon.SinonStub).calledWith(
                'Perfetto tracing closed: WebSocket closed unexpectedly'
            )).to.be.true;
        });
    });

    describe('onDidTerminateDebugSession', () => {
        it('stops tracing and resets context when brightscript session ends', async () => {
            perfettoControlCommands.registerPerfettoControlCommands(mockContext);

            const mockSession = {
                type: 'brightscript',
                customRequest: sinon.stub().resolves({ message: 'Tracing stopped' })
            };

            await onDidTerminateDebugSessionCallback(mockSession);

            expect(mockSession.customRequest.calledWith('stopTracing')).to.be.true;
            expect((vscode.commands.executeCommand as sinon.SinonStub).calledWith(
                'setContext',
                'brightscript.tracingActive',
                false
            )).to.be.true;
        });

        it('handles errors gracefully when stopping tracing fails', async () => {
            perfettoControlCommands.registerPerfettoControlCommands(mockContext);

            const mockSession = {
                type: 'brightscript',
                customRequest: sinon.stub().rejects(new Error('Session already terminated'))
            };

            // Should not throw
            await onDidTerminateDebugSessionCallback(mockSession);

            expect((vscode.commands.executeCommand as sinon.SinonStub).calledWith(
                'setContext',
                'brightscript.tracingActive',
                false
            )).to.be.true;
        });

        it('does not stop tracing for non-brightscript sessions', async () => {
            perfettoControlCommands.registerPerfettoControlCommands(mockContext);

            const mockSession = {
                type: 'node',
                customRequest: sinon.stub().resolves({ message: 'Tracing stopped' })
            };

            await onDidTerminateDebugSessionCallback(mockSession);

            expect(mockSession.customRequest.called).to.be.false;
        });
    });

    describe('startTracing command', () => {
        it('shows error when no active debug session', async () => {
            perfettoControlCommands.registerPerfettoControlCommands(mockContext);
            (vscode.debug as any).activeDebugSession = undefined;

            const startTracingCommand = registeredCommands.get('extension.brightscript.startTracing');
            await startTracingCommand();

            expect((vscode.window.showErrorMessage as sinon.SinonStub).calledWith(
                'No active debug session'
            )).to.be.true;
        });

        it('starts tracing and shows success message', async () => {
            perfettoControlCommands.registerPerfettoControlCommands(mockContext);

            const mockSession = {
                customRequest: sinon.stub().resolves({ message: 'Tracing started at /path/to/trace.perfetto-trace' })
            };
            (vscode.debug as any).activeDebugSession = mockSession;

            const startTracingCommand = registeredCommands.get('extension.brightscript.startTracing');
            await startTracingCommand();

            expect(mockSession.customRequest.calledWith('startTracing')).to.be.true;
            expect((vscode.commands.executeCommand as sinon.SinonStub).calledWith(
                'setContext',
                'brightscript.tracingActive',
                true
            )).to.be.true;
        });

        it('shows error when start tracing fails with exception', async () => {
            perfettoControlCommands.registerPerfettoControlCommands(mockContext);

            const mockSession = {
                customRequest: sinon.stub().rejects(new Error('Failed to connect'))
            };
            (vscode.debug as any).activeDebugSession = mockSession;

            const startTracingCommand = registeredCommands.get('extension.brightscript.startTracing');
            await startTracingCommand();

            expect((vscode.window.showErrorMessage as sinon.SinonStub).calledWith(
                'Failed to start tracing: Failed to connect'
            )).to.be.true;
        });

        it('shows error when customRequest throws', async () => {
            perfettoControlCommands.registerPerfettoControlCommands(mockContext);

            const mockSession = {
                customRequest: sinon.stub().rejects(new Error('Network error'))
            };
            (vscode.debug as any).activeDebugSession = mockSession;

            const startTracingCommand = registeredCommands.get('extension.brightscript.startTracing');
            await startTracingCommand();

            expect((vscode.window.showErrorMessage as sinon.SinonStub).calledWith(
                'Failed to start tracing: Network error'
            )).to.be.true;
        });
    });

    describe('stopTracing command', () => {
        it('shows error when no active debug session', async () => {
            perfettoControlCommands.registerPerfettoControlCommands(mockContext);
            (vscode.debug as any).activeDebugSession = undefined;

            const stopTracingCommand = registeredCommands.get('extension.brightscript.stopTracing');
            await stopTracingCommand();

            expect((vscode.window.showErrorMessage as sinon.SinonStub).calledWith(
                'No active debug session'
            )).to.be.true;
        });

        it('stops tracing, shows success message, and opens Perfetto UI', async () => {
            perfettoControlCommands.registerPerfettoControlCommands(mockContext);

            const mockSession = {
                customRequest: sinon.stub().resolves({ message: 'Tracing stopped. Trace saved to /path/to/trace.perfetto-trace' })
            };
            (vscode.debug as any).activeDebugSession = mockSession;

            const stopTracingCommand = registeredCommands.get('extension.brightscript.stopTracing');
            await stopTracingCommand();

            expect(mockSession.customRequest.calledWith('stopTracing')).to.be.true;
            expect((vscode.commands.executeCommand as sinon.SinonStub).calledWith(
                'setContext',
                'brightscript.tracingActive',
                false
            )).to.be.true;
            expect((vscode.commands.executeCommand as sinon.SinonStub).calledWith(
                'simpleBrowser.show',
                'https://ui.perfetto.dev/#!'
            )).to.be.true;
        });

        it('shows error when stop tracing fails with exception', async () => {
            perfettoControlCommands.registerPerfettoControlCommands(mockContext);

            const mockSession = {
                customRequest: sinon.stub().rejects(new Error('No active tracing session'))
            };
            (vscode.debug as any).activeDebugSession = mockSession;

            const stopTracingCommand = registeredCommands.get('extension.brightscript.stopTracing');
            await stopTracingCommand();

            expect((vscode.window.showErrorMessage as sinon.SinonStub).calledWith(
                'Failed to stop tracing: No active tracing session'
            )).to.be.true;
        });

        it('shows error when customRequest throws', async () => {
            perfettoControlCommands.registerPerfettoControlCommands(mockContext);

            const mockSession = {
                customRequest: sinon.stub().rejects(new Error('Session terminated'))
            };
            (vscode.debug as any).activeDebugSession = mockSession;

            const stopTracingCommand = registeredCommands.get('extension.brightscript.stopTracing');
            await stopTracingCommand();

            expect((vscode.window.showErrorMessage as sinon.SinonStub).calledWith(
                'Failed to stop tracing: Session terminated'
            )).to.be.true;
        });
    });
});
