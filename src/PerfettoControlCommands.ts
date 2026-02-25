import * as vscode from 'vscode';
import { vscodeContextManager } from './managers/VscodeContextManager';

export class PerfettoControlCommands {

    public registerPerfettoControlCommands(
        context: vscode.ExtensionContext
    ) {
        // Auto-start tracing after the channel is published (app is deployed and ready)
        context.subscriptions.push(
            vscode.debug.onDidReceiveDebugSessionCustomEvent(async (event) => {

                // Handle Perfetto tracing events (started, stopped, errors, unexpected close, heapSnapshotCaptured, etc.)
                if (event.event === 'PerfettoTracingEvent') {
                    const { status, message } = event.body;
                    if (status === 'started') {
                        await vscodeContextManager.set('brightscript.tracingActive', true);
                    } else if (status === 'error' || status === 'closed') {
                        void vscode.window.showWarningMessage(`Perfetto tracing ${status}: ${message}`);
                        await vscodeContextManager.set('brightscript.tracingActive', false);
                    } else if (status === 'heapSnapshotCaptured') {
                        await vscodeContextManager.set('brightscript.capturingSnapshot', false);
                    } else if (status === 'enableError') {
                        void vscode.window.showErrorMessage(`Failed to enable Perfetto tracing: ${message}`);
                    }
                }
            })
        );

        context.subscriptions.push(vscode.debug.onDidStartDebugSession((e) => {
            void vscodeContextManager.set('brightscript.tracingActive', false);

            //show recording buttons in the debug bar when tracing is enabled
            if (e.configuration?.profiling?.tracing?.enable) {
                void vscodeContextManager.set('brightscript.tracingEnabled', true);
            }
        }));

        // Auto-stop tracing when debug session ends
        context.subscriptions.push(vscode.debug.onDidTerminateDebugSession(async (session) => {
            if (session.type === 'brightscript') {

                //hide recording buttons in the debug bar at end of debug session
                void vscodeContextManager.set('brightscript.tracingEnabled', false);
                void vscodeContextManager.set('brightscript.tracingActive', false);
                void vscodeContextManager.set('brightscript.capturingSnapshot', false);

                try {
                    await session.customRequest('stopPerfettoTracing');
                } catch (e) {
                    console.log('Could not stop tracing on session end:', e);
                }
            }
        }));

        // Start tracing
        context.subscriptions.push(
            vscode.commands.registerCommand(
                'extension.brightscript.startTracing',
                async () => {
                    const session = vscode.debug.activeDebugSession;

                    if (!session) {
                        void vscode.window.showErrorMessage('No active debug session');
                        return;
                    }

                    try {
                        await session.customRequest('startPerfettoTracing');
                        await vscode.commands.executeCommand(
                            'setContext',
                            'brightscript.tracingActive',
                            true
                        );
                    } catch (e) {
                        void vscode.window.showErrorMessage(`Failed to start tracing: ${e?.message || e}`);
                    }
                }
            )
        );

        // Stop tracing
        context.subscriptions.push(
            vscode.commands.registerCommand(
                'extension.brightscript.stopTracing',
                async () => {
                    const session = vscode.debug.activeDebugSession;

                    if (!session) {
                        void vscode.window.showErrorMessage('No active debug session');
                        return;
                    }

                    try {
                        await session.customRequest('stopPerfettoTracing');
                        await vscode.commands.executeCommand(
                            'setContext',
                            'brightscript.tracingActive',
                            false
                        );
                        this.openInSimpleBrowser('https://ui.perfetto.dev/#!');
                    } catch (e) {
                        void vscode.window.showErrorMessage(`Failed to stop tracing: ${e?.message || e}`);
                    }
                }
            )
        );

        // Start capturing snapshot
        context.subscriptions.push(
            vscode.commands.registerCommand(
                'extension.brightscript.captureHeapSnapshot',
                async () => {
                    const session = vscode.debug.activeDebugSession;

                    if (!session) {
                        void vscode.window.showErrorMessage('No active debug session');
                        return;
                    }

                    try {
                        await session.customRequest('captureHeapSnapshot');
                        await vscodeContextManager.set('brightscript.capturingSnapshot', true);
                    } catch (e) {
                        void vscode.window.showErrorMessage(`Failed to capture snapshot: ${e?.message || e}`);
                    }
                }
            )
        );

        // Register capturing snapshot button (disabled, shows "Capturing snapshot..." tooltip when clicked)
        context.subscriptions.push(
            vscode.commands.registerCommand(
                'extension.brightscript.capturingSnapshot',
                () => { }
            )
        );
    }

    /**
     * Open URL in VS Code's built-in Simple Browser (new tab inside VS Code)
     */
    private openInSimpleBrowser(url: string): void {
        void vscode.commands.executeCommand('simpleBrowser.show', url);
    }
}

export const perfettoControlCommands = new PerfettoControlCommands();
