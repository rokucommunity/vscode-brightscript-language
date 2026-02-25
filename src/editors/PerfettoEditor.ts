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
                            background-color: #ffffff;
                            color: #000000;
                        }
                        iframe {
                            border: none;
                            width: 100vw;
                            height: 100vh;
                            position: absolute;
                            top: 0;
                        }
                    </style>
                    <title>Performance Trace Viewer</title>
                </head>
                <body>
                    <div id="app">Loading...</div>
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

                            // Handle messages from the extension
                            const sendPing = () => {
                                perfettoFrame.contentWindow.postMessage("PING", "https://ui.perfetto.dev");
                            };

                            window.addEventListener('message', (event) => {


                                if (event.data === "PONG" && event.origin === "https://ui.perfetto.dev") {
                                    if (!uiReady) {
                                        uiReady = true;
                                        vscode.postMessage({ type: "PERFETTO_READY" });
                                        console.log("PONG: ui became ready");

                                        clearInterval(pingInterval);
                                        pingInterval = null;

                                    } else if (traceLoaded) {
                                        console.log("PONG: trace is loaded");
                                        clearInterval(pingInterval);
                                        pingInterval = null;
                                    }
                                    return;
                                }
                                const message = event.data; // The JSON data sent by the extension

                                switch (message.type) {
                                    case 'update':
                                        window.perfettoFrame.contentWindow.postMessage({
                                            perfetto: message.perfetto,
                                        }, "https://ui.perfetto.dev");
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
