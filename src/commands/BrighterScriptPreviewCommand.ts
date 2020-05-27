import { Uri } from 'vscode';
import * as vscode from 'vscode';
import { extension } from '../extension';
import { util } from '../util';
import * as path from 'path';
import * as querystring from 'querystring';
import { ifUrlTransferCompletionItems } from '../BrightScriptCompletionItems/ifUrlTransferCompletionItems';

export const FILE_SCHEME = 'bs-preview';

export class BrighterScriptPreviewCommand {

    /**
     * Register commands:
     * - `brighterscript.showPreview`
     * - `brighterscript.showPreviewToSide`
     *
     * Register custom TextDocumentProvider
     */
    public register(context: vscode.ExtensionContext) {

        context.subscriptions.push(vscode.commands.registerCommand('brighterscript.showPreview', async (uri: vscode.Uri) => {
            uri = uri ?? vscode.window.activeTextEditor.document.uri;
            await this.openPreview(uri, false);
        }));

        context.subscriptions.push(vscode.commands.registerCommand('brighterscript.showPreviewToSide', async (uri: vscode.Uri) => {
            uri = uri ?? vscode.window.activeTextEditor.document.uri;
            await this.openPreview(uri, true);
        }));

        //register BrighterScript transpile preview handler
        vscode.workspace.registerTextDocumentContentProvider(FILE_SCHEME, this);

        //anytime the underlying file changed, tell vscode the preview needs to be regenerated
        vscode.workspace.onDidChangeTextDocument((e) => {
            if (
                //we are watching this file
                this.activePreviews[e.document.uri.fsPath] &&
                //the file is not our preview scheme (this prevents an infinite loop)
                e.document.uri.scheme !== FILE_SCHEME
            ) {
                let uri = this.getBsPreviewUri(e.document.uri);
                this.keyedDebounce(uri.fsPath, () => {
                    this.onDidChangeEmitter.fire(uri);
                }, 500);
            }
        });

        //whenever the source file is closed, dispose of our preview
        vscode.workspace.onDidCloseTextDocument(async (e) => {
            let previewDoc = this.activePreviews[e?.uri?.fsPath];
            if (previewDoc) {
                //close the preview by showing it and then closing the active editor
                await vscode.window.showTextDocument(previewDoc.uri, { preview: true, preserveFocus: false });
                await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
                delete this.activePreviews[e.uri.fsPath];
            }
        });
    }

    private activePreviews = {} as { [fsPath: string]: vscode.TextDocument };

    /**
     * The handler for the command. Creates a custom URI so we can open it
     * with our TextDocumentContentProvider to show the transpiled code
     */
    public async openPreview(uri: Uri, showToSide: boolean) {
        if (!this.activePreviews[uri.fsPath]) {
            let customUri = this.getBsPreviewUri(uri);
            this.activePreviews[uri.fsPath] = await vscode.workspace.openTextDocument(customUri);
        }
        let doc = this.activePreviews[uri.fsPath];
        await vscode.window.showTextDocument(doc, {
            preview: true,
            preserveFocus: true,
            viewColumn: showToSide ? vscode.ViewColumn.Beside : vscode.ViewColumn.Active
        });
    }

    private keyedDebounce = util.keyedDebounce();

    // emitter and its event
    public onDidChangeEmitter = new vscode.EventEmitter<vscode.Uri>();
    public onDidChange = this.onDidChangeEmitter.event;

    public async provideTextDocumentContent(uri: vscode.Uri) {
        let fsPath = this.getPathFromUri(uri);
        let result = await extension.languageServerManager.getTranspiledFileContents(fsPath);
        return result.code;
    }

    /**
     * Get the fsPath from the uri. this handles both `file` and `bs-preview` schemes
     */
    private getPathFromUri(uri: vscode.Uri) {
        if (uri.scheme === 'file') {
            return uri.fsPath;
        } else if (uri.scheme === FILE_SCHEME) {
            let parts = querystring.parse(uri.query);
            return parts.fsPath as string;
        } else {
            throw new Error('Cannot determine fsPath for uri: ' + uri.toString());
        }
    }

    /**
     * Given a uri, compute the bs-preview URI
     */
    private getBsPreviewUri(uri: vscode.Uri) {
        let fsPath = this.getPathFromUri(uri);
        return Uri.parse(`${FILE_SCHEME}:(Transpiled) ${path.basename(fsPath)}?fsPath=${fsPath}`);
    }
}

export const brighterScriptPreviewCommand = new BrighterScriptPreviewCommand();
