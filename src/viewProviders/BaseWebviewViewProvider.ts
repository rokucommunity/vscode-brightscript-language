import * as vscode from 'vscode';
import * as path from 'path';
import * as fsExtra from 'fs-extra';
import type { RequestType } from 'roku-test-automation';
import type { AsyncSubscription, Event } from '@parcel/watcher';
import type { ChannelPublishedEvent } from 'roku-debug';
import { vscodeContextManager } from '../managers/VscodeContextManager';
import { buildWebviewIndexHtml } from './webviewHtml';
import type { WebviewViewProviderManager } from '../managers/WebviewViewProviderManager';
import { ViewProviderEvent } from './ViewProviderEvent';
import { ViewProviderCommand } from './ViewProviderCommand';
import type { VscodeCommand } from '../commands/VscodeCommand';
import type { RtaManager } from '../managers/RtaManager';
import type { BrightScriptCommands } from '../BrightScriptCommands';
import type { RceManager } from '../managers/RceManager';
import type { RceFinder } from '../deviceDiscovery/RceFinder';
import type { DeviceManager } from '../deviceDiscovery/DeviceManager';

export abstract class BaseWebviewViewProvider implements vscode.WebviewViewProvider, vscode.Disposable {
    constructor(
        protected extensionContext: vscode.ExtensionContext,
        protected dependencies: {
            rtaManager: RtaManager;
            brightscriptCommands: BrightScriptCommands;
            rceManager: RceManager;
            rceFinder: RceFinder;
            deviceManager: DeviceManager;
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

    /**
     * Whether the webview has reported in as ready (messages post directly rather than being queued)
     */
    protected isViewReady() {
        return this.viewReady;
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
        //hand off (and clear) the queue before posting: a message queued while no webview existed
        //must flush exactly once, to the webview that just reported ready - leaving it queued meant
        //every later webview instance (a closed-and-reopened view) replayed the entire history,
        //e.g. re-answering a long-dead video stream offer and hanging on 'connecting'
        const messages = this.queuedMessages;
        this.queuedMessages = [];
        for (const queuedMessage of messages) {
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
                // eslint-disable-next-line @typescript-eslint/no-require-imports, import/no-extraneous-dependencies
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

    private getIndexHtml() {
        return buildWebviewIndexHtml({
            webview: this.view?.webview ?? this.panel?.webview,
            webviewBasePath: this.webviewBasePath,
            viewName: this.id,
            additionalScriptContents: this.additionalScriptContents()
        });
    }

    public async resolveWebviewView(
        view: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ) {
        this.view = view;
        //this webview instance has not reported in yet: without this reset, a provider whose
        //previous webview already reported ready would direct-post at the new one before its
        //viewReady arrives, instead of queueing for the flush that follows it
        this.viewReady = false;
        //a hidden view destroys its webview and this provider is re-resolved with a fresh one on
        //reshow. While no webview exists, messages must queue rather than post at the disposed
        //instance, where they would be silently lost. Optional-called because provider specs
        //resolve with minimal fake views.
        view.onDidDispose?.(() => {
            //a re-resolution can land before this dispose callback fires; only clear state that
            //still belongs to this instance
            if (this.view === view) {
                this.view = undefined;
                this.viewReady = false;
            }
        });
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

        for (const viewContainerId of Object.keys(packageJson.contributes.views)) {
            for (const view of packageJson.contributes.views[viewContainerId]) {
                if (view.id === viewId) {
                    return view.name;
                }
            }
        }

        return null;
    }
}
