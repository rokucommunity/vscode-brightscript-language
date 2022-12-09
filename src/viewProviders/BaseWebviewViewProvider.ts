import * as vscode from 'vscode';
import * as path from 'path';
import * as chokidar from 'chokidar';
import * as fsExtra from 'fs-extra';

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
                const context = message.context;
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
            this.svelteWatcher = chokidar.watch(this.webviewBasePath + '/**/*');
            this.svelteWatcher.on('change', () => {
                // We have to change this to get it to update so we store it first and set it back after
                const html = this.view.webview.html;
                this.view.webview.html = '';
                this.view.webview.html = this.getIndexHtml();
            });
        }
        return this.getIndexHtml();
    }

    private getIndexHtml() {
        let html = fsExtra.readFileSync(this.webviewBasePath + '/index.html').toString();
        //the data that will be replaced in the index.html
        const data = {
            scriptUri: vscode.Uri.file(path.join(this.webviewBasePath, 'index.js')).with({ scheme: 'vscode-resource' }),
            styleUri: vscode.Uri.file(path.join(this.webviewBasePath, 'bundle.css')).with({ scheme: 'vscode-resource' }),
            baseHref: vscode.Uri.file(this.webviewBasePath).with({ scheme: 'vscode-resource' }),
            additionalScriptContents: this.additionalScriptContents().join('\n                        ')
        };
        //replace placeholders with the above data
        html.replace(/(\/\/{{(\w+)}})|({{(\w+)}})|(<!--{{(\w+)}})/gm, (...match: string[]) => {
            const [, , key1, , key2, , key3] = match;
            return data[key1] ?? data[key2] ?? data[key3] ?? match[0];
        });
        return html;
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
