import * as vscode from 'vscode';
import { vscodeContextManager } from './managers/VscodeContextManager';
import { isProfilingEnabledEvent, isProfilingStartEvent, isProfilingStopEvent, isProfilingErrorEvent } from 'roku-debug';

export class PerfettoControlCommands {

    public registerPerfettoControlCommands(
        context: vscode.ExtensionContext
    ) {
        context.subscriptions.push(
            vscode.debug.onDidReceiveDebugSessionCustomEvent(async (event: unknown) => {
                //set various context keys based on profiling events to control visibility and state of UI elements (buttons, status bar items, etc.)
                if (isProfilingEnabledEvent(event)) {
                    if (event.body.types.includes('trace')) {
                        void vscodeContextManager.set('brightscript.tracingEnabled', true);
                    }
                    if (event.body.types.includes('heapSnapshot')) {
                        void vscodeContextManager.set('brightscript.heapSnapshotEnabled', true);
                    }
                } else if (isProfilingStartEvent(event)) {
                    if (event.body.type === 'trace') {
                        await vscodeContextManager.set('brightscript.tracingActive', true);
                    } else if (event.body.type === 'heapSnapshot') {
                        await vscodeContextManager.set('brightscript.heapSnapshotActive', true);
                    }

                } else if (isProfilingStopEvent(event)) {
                    if (event.body.type === 'trace') {
                        await vscodeContextManager.set('brightscript.tracingActive', false);

                    } else if (event.body.type === 'heapSnapshot') {
                        void vscodeContextManager.set('brightscript.heapSnapshotActive', false);
                    }
                    //open the profile in an editor
                    if (event.body.result) {
                        void vscode.commands.executeCommand('vscode.open', vscode.Uri.file(event.body.result));
                    }

                } else if (isProfilingErrorEvent(event)) {
                    void vscode.window.showErrorMessage(`Profiling error: ${event.body.error.message}`);
                }
            })
        );

        function cleanContext(session: vscode.DebugSession) {
            if (session.type === 'brightscript') {
                void vscodeContextManager.set('brightscript.tracingEnabled', false);
                void vscodeContextManager.set('brightscript.tracingActive', false);
                void vscodeContextManager.set('brightscript.heapSnapshotActive', false);
            }
        }
        //hide profiling-related buttons at the start and end of the session
        context.subscriptions.push(vscode.debug.onDidStartDebugSession(cleanContext));
        context.subscriptions.push(vscode.debug.onDidTerminateDebugSession(cleanContext));

        // Start tracing
        context.subscriptions.push(
            vscode.commands.registerCommand('extension.brightscript.startTracing',
                async () => {
                    const session = vscode.debug.activeDebugSession;

                    if (!session) {
                        void vscode.window.showErrorMessage(`Cannot start tracing: there's no active debug session`);
                        return;
                    }

                    try {
                        await session.customRequest('startPerfettoTracing');
                        await vscodeContextManager.set('brightscript.tracingActive', true);
                    } catch (e) {
                        console.error(`Failed to start tracing`, e);
                    }
                }
            )
        );

        // Stop tracing
        context.subscriptions.push(
            vscode.commands.registerCommand('extension.brightscript.stopTracing',
                async () => {
                    const session = vscode.debug.activeDebugSession;
                    if (!session) {
                        return;
                    }

                    try {
                        await session.customRequest('stopPerfettoTracing');
                    } catch (e) {
                        console.error(`Failed to stop tracing:`, e);
                    }
                }
            )
        );

        async function captureHeapSnapshot() {
            const session = vscode.debug.activeDebugSession;

            if (!session) {
                void vscode.window.showErrorMessage(`Cannot capture heap snapshot: there's no active debug session`);
                return;
            }

            try {
                await session.customRequest('captureHeapSnapshot');
            } catch (e) {
                console.error(`Failed to capture snapshot:`, e);
            }
        }

        // Start capturing snapshot
        context.subscriptions.push(
            vscode.commands.registerCommand('extension.brightscript.captureHeapSnapshot', captureHeapSnapshot)
        );

        // Register capturing snapshot button (disabled, shows "Capturing snapshot..." tooltip when clicked)
        context.subscriptions.push(
            vscode.commands.registerCommand('extension.brightscript.heapSnapshotActive', captureHeapSnapshot)
        );
    }
}

export const perfettoControlCommands = new PerfettoControlCommands();
