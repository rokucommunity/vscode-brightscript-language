import * as vscode from 'vscode';
import * as path from 'path';
import * as fsExtra from 'fs-extra';
import type { RequestType } from 'roku-test-automation';
import type { AsyncSubscription, Event } from '@parcel/watcher';
import type { ChannelPublishedEvent } from 'roku-debug';
import { vscodeContextManager } from '../managers/VscodeContextManager';
import type { WebviewViewProviderManager } from '../managers/WebviewViewProviderManager';
import { ViewProviderEvent } from './ViewProviderEvent';
import { ViewProviderCommand } from './ViewProviderCommand';
import type { VscodeCommand } from '../commands/VscodeCommand';
import type { RtaManager } from '../managers/RtaManager';
import type { BrightScriptCommands } from '../BrightScriptCommands';

export abstract class BaseWebviewViewProvider implements vscode.WebviewViewProvider, vscode.Disposable {
    constructor(
        protected extensionContext: vscode.ExtensionContext,
        protected dependencies: {
            rtaManager: RtaManager;
            brightscriptCommands: BrightScriptCommands;
        }
    ) {
        this.webviewBasePath = path.join(extensionContext.extensionPath, 'dist', 'webviews');
        extensionContext.subscriptions.push(this);
        this.extensionContext = extensionContext;
    }

    /**
     * The ID of the view. This should be the same as the id in the `views` contribution in package.json, and the same name
     * as the view in the webviews client-side code
     */
    public readonly abstract id: string;

    protected panel?: vscode.WebviewPanel;
    protected view?: vscode.WebviewView;
    protected webviewBasePath: string;
    private outDirWatcher: AsyncSubscription;
    private viewReady = false;
    private queuedMessages = [];
    private webviewViewProviderManager: WebviewViewProviderManager;
    private messageCommandCallbacks = {} as Record<ViewProviderCommand, (message) => Promise<boolean>>;

    public dispose() {
        void this.outDirWatcher?.unsubscribe();
    }

    public setWebviewViewProviderManager(manager: WebviewViewProviderManager) {
        this.webviewViewProviderManager = manager;
    }

    public onDidStartDebugSession(e: vscode.DebugSession) {
        // Can be overwritten in a child to notify on debug session start
    }

    public onDidTerminateDebugSession(e: vscode.DebugSession) {
        // Can be overwritten in a child to notify on debug session end
    }

    public onChannelPublishedEvent(e: ChannelPublishedEvent) {
        // Can be overwritten in a child to notify on channel publish
    }

    public createCommandMessage(command: VscodeCommand | ViewProviderCommand, context = {}) {
        const message = {
            command: command,
            context: context
        };
        return message;
    }

    public createEventMessage(event: ViewProviderEvent, context = {}) {
        const message = {
            event: event,
            context: context
        };
        return message;
    }

    public createResponseMessage(incomingMessage, response = undefined, error = undefined) {
        const message = {
            ...incomingMessage,
            response: response,
            error: error
        };

        return message;
    }

    public postOrQueueMessage(message) {
        if (this.viewReady) {
            this.postMessage(message);
        } else {
            this.queuedMessages.push(message);
        }
    }

    protected postMessage(message) {
        this.view?.webview.postMessage(message).then(null, (reason) => {
            console.log('postMessage failed: ', reason);
        });

        this.panel?.webview.postMessage(message).then(null, (reason) => {
            console.log('postMessage failed: ', reason);
        });
    }

    private postQueuedMessages() {
        for (const queuedMessage of this.queuedMessages) {
            this.postMessage(queuedMessage);
        }
    }

    protected addMessageCommandCallback(command: ViewProviderCommand | VscodeCommand | RequestType, callback: (message) => Promise<boolean>) {
        this.messageCommandCallbacks[command] = callback;
    }

    private setupViewMessageObserver(webview: vscode.Webview) {
        webview.onDidReceiveMessage(async (message) => {
            try {
                const command = message.command;

                if (command === ViewProviderCommand.viewReady) {
                    this.viewReady = true;
                    this.onViewReady();
                    this.postQueuedMessages();
                } else if (command === ViewProviderCommand.setVscodeContext) {
                    const context = message.context;
                    await vscodeContextManager.set(context.key, context.value);
                } else if (command === ViewProviderCommand.getVscodeContext) {
                    const context = message.context;
                    const value = vscodeContextManager.get(context.key);
                    this.postOrQueueMessage(this.createResponseMessage(message, {
                        value: value
                    }));
                } else if (command === ViewProviderCommand.sendMessageToWebviews) {
                    const context = message.context;
                    this.webviewViewProviderManager.sendMessageToWebviews(context.viewIds, context.message);
                } else if (command === ViewProviderCommand.updateWorkspaceState) {
                    const context = message.context;
                    await this.extensionContext.workspaceState.update(context.key, context.value);
                    this.postOrQueueMessage(this.createResponseMessage(message));
                } else if (command === ViewProviderCommand.getWorkspaceState) {
                    const context = message.context;
                    const response = await this.extensionContext.workspaceState.get(context.key, context.defaultValue);
                    this.postOrQueueMessage(this.createResponseMessage(message, response));
                } else {
                    const callback = this.messageCommandCallbacks[command];
                    if (!callback || !await callback(message)) {
                        console.warn('Did not handle message', message);
                    }
                }
            } catch (e) {
                this.postMessage({
                    ...message,
                    error: {
                        message: e.message,
                        stack: e.stack
                    }
                });
            }
        });
    }

    protected registerCommandWithWebViewNotifier(command: string, callback: (() => any) | undefined = undefined) {
        this.registerCommand(command, async () => {
            if (callback) {
                await callback();
            }
            const message = this.createEventMessage(ViewProviderEvent.onVscodeCommandReceived, {
                commandName: command
            });

            this.postOrQueueMessage(message);
        });
    }

    protected registerCommand(command: string, callback: (...args: any[]) => any) {
        this.extensionContext.subscriptions.push(vscode.commands.registerCommand(command, callback));
    }

    protected onViewReady() { }

    /** Adds ability to add additional script contents to the main webview html */
    protected additionalScriptContents(): string[] {
        return [];
    }

    protected async getHtmlForWebview() {
        try {
            let watcher;
            try {
                // eslint-disable-next-line @typescript-eslint/no-require-imports
                watcher = require('@parcel/watcher');
            } catch (e) {
                // Doing nothing if watcher does not exist
            }

            if (watcher && !this.outDirWatcher) {
                // When in dev mode, spin up a watcher to auto-reload the webview whenever the files have changed.
                this.outDirWatcher = await watcher.subscribe(this.webviewBasePath, (err, events: Event[]) => {
                    //only refresh when the index.html page is changed. Since vite rewrites the file on every build, this is enough to know to reload the page
                    if (
                        events.find(x => (x.type === 'create' || x.type === 'update') && x.path?.toLowerCase()?.endsWith('index.html'))
                    ) {
                        this.view.webview.html = '';
                        this.view.webview.html = this.getIndexHtml();
                    }
                });
            }
        } catch (e) {
            console.error(e);
        }
        return this.getIndexHtml();
    }

    /**
    * Get a webview-supported URI for the given path
    */
    private asWebviewUri(...parts: string[]) {
        return this.view?.webview?.asWebviewUri?.(
            vscode.Uri.file(
                path.join(...parts)
            )
        );
    }

    private getIndexHtml() {
        let html: string;
        try {
            html = fsExtra.readFileSync(this.webviewBasePath + '/index.html').toString();
        } catch (e) {
            console.error(e);
            html = '<h1>Error loading webview</h1>';
        }
        //the data that will be replaced in the index.html
        const data = {
            viewName: this.id,
            baseHref: `${this.asWebviewUri(this.webviewBasePath)}/`,
            additionalScriptContents: this.additionalScriptContents().join('\n                        ')
        };
        /**
         * replace placeholders in the html, in one of these formats:
         * <!--{{thing1}}-->
         * //{{thing2}}
         * {{thing3}}
         */
        html = html.replace(/(\/\/{{(\w+)}})|({{(\w+)}})|(<!--{{(\w+)}})/gm, (...match: string[]) => {
            const [, , key1, , key2, , key3] = match;
            return data[key1] ?? data[key2] ?? data[key3] ?? match[0];
        });
        // remove leading slash for css/js urls so we can make them relative to the baseHref
        html = html.replace(/((?:href|src)\s*=\s*["'])(\/.*")/g, (...match: string[]) => {
            return match[1] + match[2]?.replace(/^\/+/, '');
        });
        return html;
    }

    public async resolveWebviewView(
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
        webview.html = await this.getHtmlForWebview();
    }

    protected async createOrRevealWebviewPanel() {
        // See if we need to make the panel or not
        let createPanel = false;
        if (!this.panel) {
            createPanel = true;
        } else {
            try {
                if (!this.panel.active) {
                    // If we still exist and aren't active then reveal the panel
                    this.panel.reveal();
                }
            } catch (e) {
                createPanel = true;
            }
        }

        if (createPanel) {
            this.panel = vscode.window.createWebviewPanel(
                this.id,
                await this.getViewNameById(this.id),
                vscode.ViewColumn.Active,
                {
                    // Enable javascript in the webview
                    enableScripts: true,
                    localResourceRoots: [
                        vscode.Uri.file(this.webviewBasePath)
                    ]
                }
            );

            this.setupViewMessageObserver(this.panel.webview);

            const html = await this.getHtmlForWebview();
            this.panel.webview.html = html;
        }
    }

    private async getViewNameById(viewId) {
        const packageJsonPath = path.join(this.extensionContext.extensionPath, 'package.json');
        const packageJson = JSON.parse(await fsExtra.readFile(packageJsonPath, 'utf8'));

        for (const view of [...packageJson.contributes.views.debug, ...packageJson.contributes.views['vscode-brightscript-language']]) {
            if (view.id === viewId) {
                return view.name;
            }
        }

        return null;
    }
}
