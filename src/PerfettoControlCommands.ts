import * as vscode from 'vscode';

export class PerfettoControlCommands {

    public registerPerfettoControlCommands(
        context: vscode.ExtensionContext
    ) {
        // Auto-start tracing after the channel is published (app is deployed and ready)
        context.subscriptions.push(
            vscode.debug.onDidReceiveDebugSessionCustomEvent(async (event) => {

                // Handle Perfetto tracing events (started, stopped, errors, unexpected close, etc.)
                if (event.event === 'PerfettoTracingEvent') {
                    const { status, message } = event.body;
                    if (status === 'started') {
                        await vscode.commands.executeCommand(
                            'setContext',
                            'brightscript.tracingActive',
                            true
                        );
                    } else if (status === 'error' || status === 'closed') {
                        void vscode.window.showWarningMessage(`Perfetto tracing ${status}: ${message}`);
                        await vscode.commands.executeCommand(
                            'setContext',
                            'brightscript.tracingActive',
                            false
                        );
                    }
                }
            })
        );

        // Auto-stop tracing when debug session ends
        context.subscriptions.push(
            vscode.debug.onDidTerminateDebugSession(async (session) => {
                if (session.type === 'brightscript') {
                    try {
                        await session.customRequest('stopTracing');
                    } catch (e) {
                        console.log('Could not stop tracing on session end:', e);
                    }
                    await vscode.commands.executeCommand(
                        'setContext',
                        'brightscript.tracingActive',
                        false
                    );
                }
            })
        );

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
                        await session.customRequest('startTracing');
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
                        await session.customRequest('stopTracing');
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
    }

    /**
     * Open URL in VS Code's built-in Simple Browser (new tab inside VS Code)
     */
    private openInSimpleBrowser(url: string): void {
        void vscode.commands.executeCommand('simpleBrowser.show', url);
    }
}

export const perfettoControlCommands = new PerfettoControlCommands();
