import { Uri, Position, Range } from 'vscode';
import * as vscode from 'vscode';
import { extension } from '../extension';
import { util } from '../util';
import * as path from 'path';
import * as querystring from 'querystring';
import { SourceMapConsumer } from 'brighterscript/node_modules/source-map';

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
            if (this.isWatchingUri(e.document.uri)) {
                let uri = this.getBsPreviewUri(e.document.uri);
                this.keyedDebounce(uri.fsPath, () => {
                    this.onDidChangeEmitter.fire(uri);
                }, 500);
            }
        });

        // sync the preview and the source doc on mouse click
        vscode.window.onDidChangeTextEditorSelection((e) => {
            let uri = e.textEditor.document.uri;
            //if this is one of our source files
            if (this.activePreviews[uri.fsPath]) {
                //convert the source location into the transpiled location
                this.activePreviews[uri.fsPath].sourceDocRange = e.selections[0];

                this.syncPreviewLocation(uri);
            }
        });

        //whenever the source file is closed, dispose of our preview
        vscode.workspace.onDidCloseTextDocument(async (e) => {
            let activePreview = this.activePreviews[e?.uri?.fsPath];
            if (activePreview) {
                //close the preview by showing it and then closing the active editor
                await vscode.window.showTextDocument(activePreview.previewEditor.document.uri, { preview: true, preserveFocus: false });
                await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
                delete this.activePreviews[e.uri.fsPath];
            }
        });
    }

    private syncPreviewLocation(uri: vscode.Uri) {
        this.syncPreviewLocationDebounce(uri.fsPath, async () => {
            let activePreview = this.activePreviews[uri.fsPath];
            if (activePreview && activePreview.sourceMap && activePreview.sourceDocRange) {
                try {
                    let previewRange = await SourceMapConsumer.with(activePreview.sourceMap, null, (consumer) => {
                        let start = consumer.generatedPositionFor({
                            source: uri.fsPath,
                            line: activePreview.sourceDocRange.start.line + 1,
                            column: activePreview.sourceDocRange.start.character,
                            bias: SourceMapConsumer.LEAST_UPPER_BOUND
                        });
                        let end = consumer.generatedPositionFor({
                            source: uri.fsPath,
                            line: activePreview.sourceDocRange.end.line + 1,
                            column: activePreview.sourceDocRange.end.character,
                            bias: SourceMapConsumer.LEAST_UPPER_BOUND
                        });
                        return new Range(
                            start.line - 1,
                            start.column,
                            end.line - 1,
                            end.column
                        );
                    });

                    //scroll the preview editor to the source's clicked location
                    activePreview.previewEditor.revealRange(previewRange, vscode.TextEditorRevealType.InCenter);
                    activePreview.previewEditor.selection = new vscode.Selection(previewRange.start, previewRange.end);
                } catch (e) {
                    console.error(e);
                }
            }
        }, 300);
    }
    private syncPreviewLocationDebounce = util.keyedDebounce();

    private isWatchingUri(uri: vscode.Uri) {
        if (
            //we are watching this file
            this.activePreviews[uri.fsPath] &&
            //the file is not our preview scheme (this prevents an infinite loop)
            uri.scheme !== FILE_SCHEME) {
            return true;
        } else {
            return false;
        }
    }

    private activePreviews = {} as {
        [fsPath: string]: {
            sourceDoc: vscode.TextDocument,
            /**
             * The editor that contains the preview doc
             */
            previewEditor: vscode.TextEditor,
            /**
             * the latest source map for the preview.
             */
            sourceMap: any,
            sourceDocRange: Range,
            previewDocPosition: Position
        }
    };

    /**
     * The handler for the command. Creates a custom URI so we can open it
     * with our TextDocumentContentProvider to show the transpiled code
     */
    public async openPreview(uri: Uri, showToSide: boolean) {
        let previewDoc: vscode.TextDocument;
        if (!this.activePreviews[uri.fsPath]) {
            this.activePreviews[uri.fsPath] = {} as any;
            let customUri = this.getBsPreviewUri(uri);
            previewDoc = await vscode.workspace.openTextDocument(customUri);
        }
        this.activePreviews[uri.fsPath].previewEditor = await vscode.window.showTextDocument(previewDoc, {
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
        this.activePreviews[fsPath].sourceMap = result.map;
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
