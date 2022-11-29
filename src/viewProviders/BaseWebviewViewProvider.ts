import * as vscode from 'vscode';
import * as path from 'path';
import * as chokidar from 'chokidar';

import { util } from '../util';

export abstract class BaseWebviewViewProvider implements vscode.WebviewViewProvider, vscode.Disposable {
    constructor(context: vscode.ExtensionContext) {
        this.webviewBasePath = path.join(context.extensionPath, 'dist', 'webviews');
        context.subscriptions.push(this);
    }

    /**
     * The ID of the view. This should be the same as the id in the `views` contribution in package.json, and the same name
     * as the view in the webviews client-side code
     */
    public readonly abstract id: string;

    protected view?: vscode.WebviewView;
    protected webviewBasePath: string;
    private svelteWatcher: chokidar.FSWatcher;
    private viewReady = false;
    private queuedMessages = [];

    public dispose() {
        void this.svelteWatcher?.close();
    }

    protected postMessage(message) {
        this.view?.webview.postMessage(message).then(null, (reason) => {
            console.log('postMessage failed: ', reason);
        });
    }

    private postQueuedMessages() {
        for (const queuedMessage of this.queuedMessages) {
            this.postMessage(queuedMessage);
        }
    }

    protected postOrQueueMessage(message) {
        if (this.viewReady) {
            this.postMessage(message);
        } else {
            this.queuedMessages.push(message);
        }
    }

    private setupViewMessageObserver(webview: vscode.Webview) {
        webview.onDidReceiveMessage(async (message) => {
            try {
                const command = message.command;

                if (command === 'viewReady') {
                    this.viewReady = true;
                    this.onViewReady();
                    this.postQueuedMessages();
                } else {
                    await this.handleViewMessage(message);
                }
            } catch (e) {
                this.postMessage({
                    ...message,
                    error: e.message
                });
            }
        });
    }

    protected handleViewMessage(message): Promise<boolean> | boolean {
        return false;
    }

    protected onViewReady() { }

    /** Adds ability to add additional script contents to the main webview html */
    protected additionalScriptContents(): string[] {
        return [];
    }

    protected getHtmlForWebview() {
        if (util.isExtensionHostRunning()) {
            // If we're developing we want to add a watcher to allow hot reload :)
            // Index.js always gets updated so don't have to worry about observing the css file
            this.svelteWatcher = chokidar.watch(path.join(this.webviewBasePath, 'index.js'));
            this.svelteWatcher.on('change', () => {
                // We have to change this to get it to update so we store it first and set it back after
                const html = this.view.webview.html;
                this.view.webview.html = '';
                this.view.webview.html = html;
            });
        }
        const scriptUri = vscode.Uri.file(path.join(this.webviewBasePath, 'index.js')).with({ scheme: 'vscode-resource' });
        const styleUri = vscode.Uri.file(path.join(this.webviewBasePath, 'bundle.css')).with({ scheme: 'vscode-resource' });

        return `<!DOCTYPE html>
            <html lang="en">
                <head>
                    <meta charset='utf-8'>
                    <link rel="stylesheet" type="text/css" href="${styleUri}">
                    <base href="${vscode.Uri.file(this.webviewBasePath).with({ scheme: 'vscode-resource' })}/">
                    <script>
                        viewName = '${this.id}';
                        ${this.additionalScriptContents().join('\n                        ')}
                    </script>
                    <script defer src="${scriptUri}"></script>
                </head>
                <body style="padding: 0"></body>
            </html>`;
    }

    public resolveWebviewView(
        view: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ) {
        this.view = view;
        const webview = view.webview;
        this.setupViewMessageObserver(webview);

        webview.options = {
            // Allow scripts in the webview
            enableScripts: true,

            localResourceRoots: [
                vscode.Uri.file(this.webviewBasePath)
            ]
        };
        webview.html = this.getHtmlForWebview();
    }
}
