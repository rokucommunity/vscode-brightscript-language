import * as vscode from 'vscode';
import type { CancellationToken, Webview, WebviewPanel } from 'vscode';

export class PerfettoEditorProvider implements vscode.CustomReadonlyEditorProvider {
    public static register(context: vscode.ExtensionContext): vscode.Disposable {
        return vscode.window.registerCustomEditorProvider('brightscript.perfettoViewer', new PerfettoEditorProvider(), {
            webviewOptions: {
                retainContextWhenHidden: true
            }
        });
    }

    public openCustomDocument(uri: vscode.Uri, _openContext: vscode.CustomDocumentOpenContext, _token: CancellationToken): vscode.CustomDocument {
        return { uri: uri, dispose: () => { } };
    }

    public async resolveCustomEditor(document: vscode.CustomDocument, webviewPanel: WebviewPanel, _token: CancellationToken) {
        webviewPanel.webview.options = {
            enableScripts: true
        };

        // Read the trace up front so we can surface read/empty failures immediately rather than booting the
        // Perfetto UI only for it to fail with a confusing "not a recognized format" error.
        let fileData: Uint8Array;
        try {
            fileData = await vscode.workspace.fs.readFile(document.uri);
        } catch (error) {
            this.showErrorState(webviewPanel, document, {
                message: `This trace file could not be read.`,
                detail: error instanceof Error ? error.message : String(error),
                button: { label: 'Open in Text Editor', command: 'openAsText' }
            });
            return;
        }

        // An empty trace file has no data for Perfetto to parse, so show a friendly empty-state instead.
        if (fileData.length === 0) {
            this.showErrorState(webviewPanel, document, {
                message: `This trace file is empty (0 bytes), so there's nothing to display.\nNo trace data was captured before tracing stopped.`,
                button: { label: 'Open in Text Editor', command: 'openAsText' }
            });
            return;
        }

        webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview);
        const filename = document.uri.fsPath;
        let isPerfettoReady = false;
        const sendUpdate = () => {
            if (isPerfettoReady) {
                void webviewPanel.webview.postMessage({
                    type: 'update',
                    perfetto: {
                        buffer: fileData.buffer,
                        title: filename,
                        fileName: filename,
                        keepApiOpen: true
                    }
                });
            }
        };
        webviewPanel.webview.onDidReceiveMessage(message => {
            if (message.type === 'PERFETTO_READY') {
                isPerfettoReady = true;
                sendUpdate();
            }
        });
    }

    /**
     * Render an error/empty state into the webview and wire up its optional action button.
     */
    private showErrorState(webviewPanel: WebviewPanel, document: vscode.CustomDocument, options: ErrorStateOptions) {
        webviewPanel.webview.html = this.getErrorStateHtml(webviewPanel.webview, options);
        webviewPanel.webview.onDidReceiveMessage(message => {
            if (message.type === 'openAsText') {
                void vscode.commands.executeCommand('vscode.openWith', document.uri, 'default');
            }
        });
    }

    private encodeHtmlEntities(value: string): string {
        return value
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    /**
     * Error/empty state shown when a trace can't be displayed. Mirrors VS Code's own binary/unsupported-file
     * warning so the experience feels native, with an optional button to fall back to the plain text editor.
     */
    private getErrorStateHtml(webview: Webview, options: ErrorStateOptions) {
        const messageHtml = this.encodeHtmlEntities(options.message).replace(/\n/g, '<br>');
        const detailHtml = options.detail
            ? `<div class="detail">${this.encodeHtmlEntities(options.detail)}</div>`
            : '';
        const buttonHtml = options.button
            ? `<button id="action-button">${this.encodeHtmlEntities(options.button.label)}</button>`
            : '';
        const buttonScript = options.button
            ? `(function () {
                            const vscode = acquireVsCodeApi();
                            document.getElementById('action-button').addEventListener('click', () => {
                                vscode.postMessage({ type: ${JSON.stringify(options.button.command)} });
                            });
                        })();`
            : '';
        return `
            <!DOCTYPE html>
            <html lang="en">
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <meta http-equiv="Content-Security-Policy"
                            content="default-src 'none';
                                style-src ${webview.cspSource} 'unsafe-inline';
                                script-src ${webview.cspSource} 'unsafe-inline';">
                    <style>
                        body {
                            margin: 0;
                            padding: 0;
                            height: 100vh;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            background-color: var(--vscode-editor-background);
                            color: var(--vscode-foreground);
                            font-family: var(--vscode-font-family);
                        }
                        .error-state {
                            display: flex;
                            flex-direction: column;
                            align-items: center;
                            text-align: center;
                            padding: 24px;
                            max-width: 520px;
                        }
                        .error-state svg {
                            width: 48px;
                            height: 48px;
                            color: var(--vscode-notificationsWarningIcon-foreground, #cca700);
                            margin-bottom: 16px;
                        }
                        .error-state .message {
                            font-size: 13px;
                            line-height: 1.5;
                        }
                        .error-state .detail {
                            margin-top: 10px;
                            font-size: 12px;
                            line-height: 1.4;
                            opacity: 0.7;
                            word-break: break-word;
                        }
                        .error-state button {
                            margin-top: 20px;
                            color: var(--vscode-button-foreground);
                            background-color: var(--vscode-button-background);
                            border: none;
                            padding: 4px 14px;
                            border-radius: 2px;
                            cursor: pointer;
                            font-family: var(--vscode-font-family);
                            font-size: 13px;
                        }
                        .error-state button:hover {
                            background-color: var(--vscode-button-hoverBackground);
                        }
                    </style>
                    <title>Performance Trace Viewer</title>
                </head>
                <body>
                    <div class="error-state">
                        <svg viewBox="0 0 16 16" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                            <path fill-rule="evenodd" clip-rule="evenodd" d="M7.56 1.14a.5.5 0 0 1 .88 0l6.5 12A.5.5 0 0 1 14.5 14h-13a.5.5 0 0 1-.44-.74l6.5-12zM8 2.46 2.34 13h11.32L8 2.46zM7.25 6h1.5v4h-1.5V6zm0 5h1.5v1.5h-1.5V11z"/>
                        </svg>
                        <div class="message">${messageHtml}</div>
                        ${detailHtml}
                        ${buttonHtml}
                    </div>
                    <script>
                        ${buttonScript}
                    </script>
                </body>
            </html>
        `;
    }

    getHtmlForWebview(webview: Webview) {
        return `
            <!DOCTYPE html>
            <html lang="en">
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <meta http-equiv="Content-Security-Policy"
                            content="default-src 'none';
                                script-src ${webview.cspSource} https://ui.perfetto.dev 'unsafe-inline';
                                style-src ${webview.cspSource} https://ui.perfetto.dev 'unsafe-inline';
                                frame-src https://ui.perfetto.dev">
                    <style>
                        body {
                            margin: 0;
                            padding: 0;
                            overflow: hidden;
                            background-color: var(--vscode-editor-background);
                        }
                        iframe {
                            border: none;
                            width: 100vw;
                            height: 100vh;
                            position: absolute;
                            top: 0;
                        }
                        #loading-overlay {
                            position: fixed;
                            top: 0;
                            left: 0;
                            width: 100vw;
                            height: 100vh;
                            background: var(--vscode-editor-background);
                            display: flex;
                            flex-direction: column;
                            align-items: center;
                            justify-content: center;
                            z-index: 9999;
                            transition: opacity 0.4s ease-out;
                        }
                        #loading-overlay.hidden {
                            opacity: 0;
                            pointer-events: none;
                        }
                        .spinner {
                            width: 48px;
                            height: 48px;
                            border: 3px solid transparent;
                            border-radius: 50%;
                            border-top-color: var(--vscode-focusBorder);
                            animation: spin 1s ease-in-out infinite;
                        }
                        @keyframes spin {
                            to { transform: rotate(360deg); }
                        }
                        .loading-text {
                            margin-top: 16px;
                            color: var(--vscode-foreground);
                            font-family: var(--vscode-font-family);
                            font-size: 13px;
                            font-weight: 600;
                        }
                    </style>
                    <title>Performance Trace Viewer</title>
                </head>
                <body>
                    <div id="loading-overlay">
                        <div class="spinner"></div>
                        <div class="loading-text" id="loading-status">Loading Perfetto UI...</div>
                    </div>
                   <script>
                        window.onload = function () {
                            const iframe = document.createElement('iframe');
                            iframe.src = 'https://ui.perfetto.dev';
                            iframe.style.width = '100%';
                            iframe.style.height = '100vh';
                            iframe.style.border = 'none';
                            document.body.appendChild(iframe);
                            window.perfettoFrame = iframe;
                        };

                        (function () {
                            const vscode = acquireVsCodeApi();
                            let uiReady = false;
                            let traceLoaded = false;
                            let pingInterval = null;

                            const sendPing = () => {
                                perfettoFrame.contentWindow.postMessage("PING", "https://ui.perfetto.dev");
                            };

                            window.addEventListener('message', (event) => {
                                if (event.data === "PONG" && event.origin === "https://ui.perfetto.dev") {
                                    if (!uiReady) {
                                        uiReady = true;
                                        vscode.postMessage({ type: "PERFETTO_READY" });
                                        console.log("PONG: ui became ready");
                                        document.getElementById('loading-status').textContent = 'Loading trace data...';

                                        clearInterval(pingInterval);
                                        pingInterval = null;

                                    } else if (traceLoaded) {
                                        console.log("PONG: trace is loaded");
                                        clearInterval(pingInterval);
                                        pingInterval = null;
                                        const overlay = document.getElementById('loading-overlay');
                                        overlay.classList.add('hidden');
                                        setTimeout(() => overlay.remove(), 400);
                                    }
                                    return;
                                }
                                const message = event.data;

                                switch (message.type) {
                                    case 'update':
                                        document.getElementById('loading-status').textContent = 'Processing trace...';
                                        traceLoaded = true;
                                        window.perfettoFrame.contentWindow.postMessage({
                                            perfetto: message.perfetto,
                                        }, "https://ui.perfetto.dev");
                                        pingInterval = setInterval(() => sendPing(), 500);
                                        break;
                                }
                            });

                            pingInterval = setInterval(() => sendPing(), 500);
                        })();
                   </script>
                </body>
            </html>
      `;
    }
}

interface ErrorStateOptions {
    /** Primary message. Plain text; newlines are rendered as line breaks. */
    message: string;
    /** Optional secondary line, rendered smaller and dimmed (e.g. an underlying error message). */
    detail?: string;
    /** Optional action button. */
    button?: {
        label: string;
        /** Message type posted back to the extension when the button is clicked. */
        command: string;
    };
}
