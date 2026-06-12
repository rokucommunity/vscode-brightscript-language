import type * as vscode from 'vscode';
import { BaseWebviewViewProvider } from './BaseWebviewViewProvider';
import { ViewProviderId } from './ViewProviderId';
import { ViewProviderCommand } from './ViewProviderCommand';
import { VscodeCommand } from '../commands/VscodeCommand';
import { SolidDevtoolsTransport } from '../solidDevtools/transport';
import { vscodeContextManager } from '../managers/VscodeContextManager';
import type { SolidDevtoolsRequest, SolidDevtoolsResult } from '../solidDevtools/protocol';

/**
 * The Solid Devtools view: a live SolidJS component tree + inspector for RSG/TS apps,
 * fed by the on-device bridge this extension injects at debug staging (see
 * src/solidDevtools/). The webview half lives in webviews/src/views/SolidDevtoolsView.
 *
 * All requests are promise-style command messages (sendSolidDevtoolsRequest) handled
 * here by delegating to the transport; expected not-available states come back as
 * `{ ok: false, reason }` results the view renders as guidance.
 */
export class SolidDevtoolsViewProvider extends BaseWebviewViewProvider {
    public readonly id = ViewProviderId.solidDevtoolsView;

    constructor(context: vscode.ExtensionContext, dependencies) {
        super(context, dependencies);

        this.transport = new SolidDevtoolsTransport();
        this.transport.register(context);

        this.registerCommand(VscodeCommand.openSolidDevtoolsInPanel, async () => {
            await this.createOrRevealWebviewPanel();
        });
        // bring the panel back after a window reload (paired with the
        // onWebviewPanel:solidDevtoolsView activation event)
        this.enablePanelRestore();

        this.addMessageCommandCallback(ViewProviderCommand.sendSolidDevtoolsRequest, async (message) => {
            const result = await this.processRequest(message.context as SolidDevtoolsRequest);
            this.postOrQueueMessage(this.createResponseMessage(message, result));
            return true;
        });
    }

    private transport: SolidDevtoolsTransport;

    /** Keep tree/inspector state when the panel tab is in the background. */
    protected retainPanelContextWhenHidden = true;

    /** While the editor panel is open, hide the sidebar view (its `when` clause in
     * package.json watches this context key) — two live copies would be redundant
     * and would double the polling traffic on the evaluate channel. */
    protected onPanelAttached(panel: vscode.WebviewPanel) {
        void vscodeContextManager.set(SolidDevtoolsViewProvider.panelOpenContextKey, true);
        panel.onDidDispose(() => {
            void vscodeContextManager.set(SolidDevtoolsViewProvider.panelOpenContextKey, false);
        });
    }

    private static readonly panelOpenContextKey = 'brightscript.solidDevtoolsPanelOpen';

    public onDidTerminateDebugSession(e: vscode.DebugSession) {
        this.transport.onDidTerminateDebugSession(e);
    }

    private async processRequest(request: SolidDevtoolsRequest): Promise<SolidDevtoolsResult<unknown>> {
        try {
            switch (request.method) {
                case 'version': {
                    const version = await this.transport.getVersion();
                    return version === undefined
                        ? { ok: false, reason: 'no-session' }
                        : { ok: true, data: version };
                }
                case 'roots': {
                    return await this.resultOf(await this.transport.getRoots());
                }
                case 'children': {
                    return await this.resultOf(await this.transport.getChildren(request.id));
                }
                case 'inspect': {
                    return await this.resultOf(await this.transport.inspect(request.id));
                }
                case 'value': {
                    return await this.resultOf(await this.transport.getValue(request.ref, request.offset ?? 0));
                }
                default: {
                    return { ok: false, reason: 'error', message: `unknown method ${(request as any)?.method}` };
                }
            }
        } catch (e: any) {
            return { ok: false, reason: 'error', message: e?.message ?? String(e) };
        }
    }

    /** Wrap a lazy-fetch result; on failure, work out WHY so the view can guide the user. */
    private async resultOf<T>(data: T | undefined): Promise<SolidDevtoolsResult<T>> {
        if (data !== undefined) {
            return { ok: true, data: data };
        }
        const hasBridge = await this.transport.hasBridge();
        if (hasBridge === undefined) {
            return { ok: false, reason: 'no-session' };
        }
        if (!hasBridge) {
            return { ok: false, reason: 'no-bridge' };
        }
        // Bridge is there but the fetch produced nothing parseable — a getter threw,
        // the value was too heavy, or a drain hiccup. Surface the bridge's lastError.
        const message = await this.transport.getBridgeError();
        return { ok: false, reason: 'error', message: message || 'no response from device (value too large or a getter failed)' };
    }
}
