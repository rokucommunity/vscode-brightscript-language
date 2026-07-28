import * as vscode from 'vscode';
import * as path from 'path';
import type { RceVideoSignalingConfig, RceVideoSignalingClientOptions } from 'roku-deploy';
import { RceVideoSignalingClient } from 'roku-deploy';
import { VscodeCommand } from '../commands/VscodeCommand';
import { ViewProviderCommand } from '../viewProviders/ViewProviderCommand';
import { RceStreamSession } from '../viewProviders/RceStreamSession';
import { buildWebviewIndexHtml } from '../viewProviders/webviewHtml';
import type { RceManager } from './RceManager';

/**
 * Owns the Cloud Emulator video editor tabs: one WebviewPanel per device, each rendering that
 * device's live video stream through its own independent Janus signaling session (the gateway
 * allows concurrent watchers, so these coexist with the Roku Device View's stream). Registers the
 * internal rceWatchDeviceInEditor command that the RCE panel's Watch button and the Roku Device
 * View's pop-out button both invoke.
 */
export class RceVideoEditorManager implements vscode.Disposable {
    constructor(
        private extensionContext: vscode.ExtensionContext,
        private rceManager: RceManager
    ) {
        this.webviewBasePath = path.join(extensionContext.extensionPath, 'dist', 'webviews');
        extensionContext.subscriptions.push(
            vscode.commands.registerCommand(VscodeCommand.rceWatchDeviceInEditor, async (deviceId: number, deviceName?: string) => {
                await this.open(deviceId, deviceName);
            })
        );

        //restore video tabs across window reloads: VS Code only resurrects webview panels whose
        //viewType has a serializer, handing back the state the webview saved (its device id),
        //which is everything needed to renegotiate the stream. Optional-called because the test
        //mock's window does not implement it.
        const registerSerializer = vscode.window.registerWebviewPanelSerializer?.bind(vscode.window);
        if (registerSerializer) {
            extensionContext.subscriptions.push(registerSerializer(RceVideoEditorManager.panelViewType, {
                deserializeWebviewPanel: async (panel: vscode.WebviewPanel, state: { deviceId?: number }) => {
                    if (state?.deviceId === undefined || state.deviceId === null) {
                        //no way to know which device this tab was for
                        panel.dispose();
                        return;
                    }
                    await this.restore(panel, Number(state.deviceId));
                }
            }));
        }
    }

    private webviewBasePath: string;
    private editorPanelsByDeviceId = new Map<number, RceVideoEditorPanel>();

    public dispose() {
        for (const editorPanel of this.editorPanelsByDeviceId.values()) {
            editorPanel.dispose();
        }
        this.editorPanelsByDeviceId.clear();
    }

    /**
     * Open the video editor tab for a device and start its stream. When the device already has a
     * tab, it is revealed as-is (it is either already streaming or showing its own error with a
     * Retry action). Stream failures render inside the tab rather than throwing.
     */
    public async open(deviceId: number, deviceName?: string): Promise<void> {
        const existingPanel = this.editorPanelsByDeviceId.get(deviceId);
        if (existingPanel) {
            existingPanel.reveal();
            return;
        }

        const editorPanel = this.attachPanel(this.createWebviewPanel(deviceName ?? `Cloud Emulator device ${deviceId}`), deviceId);
        await editorPanel.watch();
    }

    /**
     * Re-adopt a video editor tab that VS Code restored across a window reload: rebuild its html
     * (webview content is never persisted) and negotiate a fresh stream for its device.
     */
    public async restore(panel: vscode.WebviewPanel, deviceId: number): Promise<void> {
        panel.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                vscode.Uri.file(this.webviewBasePath)
            ]
        };
        panel.webview.html = buildWebviewIndexHtml({
            webview: panel.webview,
            webviewBasePath: this.webviewBasePath,
            viewName: RceVideoEditorManager.panelViewType
        });
        const editorPanel = this.attachPanel(panel, deviceId);
        await editorPanel.watch();
    }

    private attachPanel(panel: vscode.WebviewPanel, deviceId: number): RceVideoEditorPanel {
        const editorPanel = new RceVideoEditorPanel(
            panel,
            deviceId,
            this.rceManager,
            (config, options) => this.createSignalingClient(config, options)
        );
        this.editorPanelsByDeviceId.set(deviceId, editorPanel);
        editorPanel.onDidDispose(() => {
            this.editorPanelsByDeviceId.delete(deviceId);
        });
        return editorPanel;
    }

    /**
     * Create the underlying vscode webview panel. Protected so tests can substitute a fake.
     */
    protected createWebviewPanel(title: string): vscode.WebviewPanel {
        const panel = vscode.window.createWebviewPanel(
            RceVideoEditorManager.panelViewType,
            title,
            vscode.ViewColumn.Beside,
            {
                enableScripts: true,
                //the peer connection and its video keep playing while the tab is backgrounded
                retainContextWhenHidden: true,
                localResourceRoots: [
                    vscode.Uri.file(this.webviewBasePath)
                ]
            }
        );
        panel.iconPath = vscode.Uri.file(path.join(this.extensionContext.extensionPath, 'images', 'icons', 'rce-logo.svg'));
        panel.webview.html = buildWebviewIndexHtml({
            webview: panel.webview,
            webviewBasePath: this.webviewBasePath,
            viewName: RceVideoEditorManager.panelViewType
        });
        return panel;
    }

    /**
     * Create the Janus signaling client for a stream request. Protected so tests can substitute a
     * fake, the same seam as RokuDeviceViewViewProvider's.
     */
    protected createSignalingClient(config: RceVideoSignalingConfig, options?: RceVideoSignalingClientOptions): RceVideoSignalingClient {
        return new RceVideoSignalingClient(config, options);
    }

    /** The panel viewType, which must also match the view registered in webviews/src/main.ts */
    private static readonly panelViewType = 'rceVideoView';
}

/**
 * One device's video editor tab: a WebviewPanel plus the stream session rendering into it. Handles
 * its webview's message plumbing itself (a mini version of BaseWebviewViewProvider's, since these
 * panels exist per device rather than as registered view providers).
 */
class RceVideoEditorPanel implements vscode.Disposable {
    constructor(
        private panel: vscode.WebviewPanel,
        private deviceId: number,
        private rceManager: RceManager,
        createSignalingClient: (config: RceVideoSignalingConfig, options?: RceVideoSignalingClientOptions) => RceVideoSignalingClient
    ) {
        this.deviceName = panel.title;
        this.session = new RceStreamSession({
            getApiToken: () => this.rceManager.getToken(),
            postEvent: (event, context) => this.postOrQueueMessage({ event: event, context: context }),
            isViewReady: () => this.viewReady,
            createSignalingClient: createSignalingClient
        });

        panel.webview.onDidReceiveMessage(async (message) => {
            try {
                await this.handleWebviewMessage(message);
            } catch (e) {
                this.panel.webview.postMessage({
                    ...message,
                    error: {
                        message: (e as Error).message,
                        stack: (e as Error).stack
                    }
                }).then(null, () => { });
            }
        });

        panel.onDidDispose(() => {
            this.session.stop();
            for (const listener of this.disposeListeners) {
                listener();
            }
        });
    }

    private session: RceStreamSession;
    private deviceName: string;
    private viewReady = false;
    private queuedMessages = [];
    private disposeListeners: Array<() => void> = [];

    public onDidDispose(listener: () => void) {
        this.disposeListeners.push(listener);
    }

    public reveal() {
        this.panel.reveal();
    }

    public dispose() {
        this.panel.dispose();
    }

    /**
     * Resolve the device's current stream details and start (or restart) the session. Failures of
     * any kind (device not running, account trouble) render in the tab's stream error banner, which
     * carries a Retry action that comes back through here.
     */
    public async watch(): Promise<void> {
        try {
            const streamRequest = await this.rceManager.resolveStreamRequest(this.deviceId);
            this.deviceName = streamRequest.deviceName;
            this.panel.title = streamRequest.deviceName;
            await this.session.start(streamRequest);
        } catch (e) {
            this.session.postError(
                `Failed to start the video stream for device '${this.deviceName}': ${(e as Error).message}`,
                this.deviceId,
                this.deviceName
            );
        }
    }

    private async handleWebviewMessage(message): Promise<void> {
        const command = message.command;
        if (command === ViewProviderCommand.viewReady) {
            this.viewReady = true;
            //a reloaded webview (the tab moved to another window, or the webview otherwise
            //restarted) has no peer connection left for an already-delivered offer, so this stops
            //that stale session; a queued-but-undelivered offer is instead marked delivered and
            //flushed just below
            const wasActive = this.session.isActive;
            this.session.handleViewReady();
            this.postQueuedMessages();
            //...and when that reconciliation just stopped a stale session, the fresh webview needs
            //a new one negotiated or it would sit blank forever. A session that never started (the
            //initial watch failed, leaving its error banner with a Retry action) stays stopped.
            if (wasActive && !this.session.isActive) {
                await this.watch();
            }
        } else if (command === ViewProviderCommand.sendRceStreamAnswer) {
            await this.session.sendAnswer(message.context.jsep);
        } else if (command === ViewProviderCommand.sendRceStreamIceCandidate) {
            this.session.handleIceCandidate(message.context);
        } else if (command === ViewProviderCommand.stopRceStream) {
            //this tab exists only to show the stream, so stopping it closes the tab
            this.panel.dispose();
        } else if (command === ViewProviderCommand.watchRceDevice) {
            await this.watch();
        } else {
            console.warn('Did not handle rce video editor message', message);
        }
    }

    private postOrQueueMessage(message) {
        if (this.viewReady) {
            this.postMessage(message);
        } else {
            this.queuedMessages.push(message);
        }
    }

    private postMessage(message) {
        this.panel.webview.postMessage(message).then(null, (reason) => {
            console.log('postMessage failed: ', reason);
        });
    }

    private postQueuedMessages() {
        //hand off (and clear) the queue before posting, the same exactly-once semantics as
        //BaseWebviewViewProvider.postQueuedMessages
        const messages = this.queuedMessages;
        this.queuedMessages = [];
        for (const queuedMessage of messages) {
            this.postMessage(queuedMessage);
        }
    }
}
