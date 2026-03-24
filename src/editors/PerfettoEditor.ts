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

    public resolveCustomEditor(document: vscode.CustomDocument, webviewPanel: WebviewPanel, _token: CancellationToken) {
        webviewPanel.webview.options = {
            enableScripts: true
        };
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
