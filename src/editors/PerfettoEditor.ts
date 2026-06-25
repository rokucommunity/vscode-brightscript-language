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

        // An empty trace file has no data for Perfetto to parse, which surfaces a confusing "not a recognized format"
        // error inside the embedded UI. Detect that case up front and show a friendly empty-state instead.
        if (await this.isEmptyFile(document.uri)) {
            webviewPanel.webview.html = this.getEmptyStateHtml(webviewPanel.webview);
            webviewPanel.webview.onDidReceiveMessage(message => {
                if (message.type === 'openAsText') {
                    void vscode.commands.executeCommand('vscode.openWith', document.uri, 'default');
                }
            });
            return;
        }

        webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview);
        let isPerfettoReady = false;
        const sendUpdate = async () => {
            const filename = document.uri.fsPath;
            let fileData = await vscode.workspace.fs.readFile(document.uri);
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
        webviewPanel.onDidDispose(() => { });
        webviewPanel.webview.onDidReceiveMessage(message => {
            if (message.type === 'PERFETTO_READY') {
                isPerfettoReady = true;
                void sendUpdate();
            }
        });
    }

    /**
     * Determine whether the given file is empty (zero bytes). A failed stat is treated as not-empty so we fall
     * through to the normal Perfetto flow rather than masking an unrelated read error behind the empty-state.
     */
    private async isEmptyFile(uri: vscode.Uri): Promise<boolean> {
        try {
            const stat = await vscode.workspace.fs.stat(uri);
            return stat.size === 0;
        } catch {
            return false;
        }
    }

    /**
     * Empty-state shown when a trace file has no data. Mirrors VS Code's own binary/unsupported-file warning so the
     * experience feels native, with a button to fall back to the plain text editor.
     */
    getEmptyStateHtml(webview: Webview) {
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
                        .empty-state {
                            display: flex;
                            flex-direction: column;
                            align-items: center;
                            text-align: center;
                            padding: 24px;
                            max-width: 520px;
                        }
                        .empty-state svg {
                            width: 48px;
                            height: 48px;
                            color: var(--vscode-notificationsWarningIcon-foreground, #cca700);
                            margin-bottom: 16px;
                        }
                        .empty-state .message {
                            font-size: 13px;
                            line-height: 1.5;
                        }
                        .empty-state button {
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
                        .empty-state button:hover {
                            background-color: var(--vscode-button-hoverBackground);
                        }
                    </style>
                    <title>Performance Trace Viewer</title>
                </head>
                <body>
                    <div class="empty-state">
                        <svg viewBox="0 0 16 16" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                            <path fill-rule="evenodd" clip-rule="evenodd" d="M7.56 1.14a.5.5 0 0 1 .88 0l6.5 12A.5.5 0 0 1 14.5 14h-13a.5.5 0 0 1-.44-.74l6.5-12zM8 2.46 2.34 13h11.32L8 2.46zM7.25 6h1.5v4h-1.5V6zm0 5h1.5v1.5h-1.5V11z"/>
                        </svg>
                        <div class="message">
                            This trace file is empty (0&nbsp;bytes), so there's nothing to display.<br>
                            No trace data was captured before tracing stopped.
                        </div>
                        <button id="open-as-text">Open in Text Editor</button>
                    </div>
                    <script>
                        (function () {
                            const vscode = acquireVsCodeApi();
                            document.getElementById('open-as-text').addEventListener('click', () => {
                                vscode.postMessage({ type: 'openAsText' });
                            });
                        })();
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
