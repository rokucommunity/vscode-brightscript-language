import { Uri, Position, Range } from 'vscode';
import * as vscode from 'vscode';
import { extension } from '../extension';
import { util } from '../util';
import * as path from 'path';
import * as querystring from 'querystring';
import { SourceMapConsumer } from 'source-map';
import { languageServerManager } from '../LanguageServerManager';

export const FILE_SCHEME = 'bs-preview';

export class BrighterScriptPreviewCommand {
    public static SELECTION_SYNC_DELAY = 300;

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
            await this.openPreview(uri, vscode.window.activeTextEditor, false);
        }));

        context.subscriptions.push(vscode.commands.registerCommand('brighterscript.showPreviewToSide', async (uri: vscode.Uri) => {
            uri = uri ?? vscode.window.activeTextEditor.document.uri;
            await this.openPreview(uri, vscode.window.activeTextEditor, true);
        }));

        //register BrighterScript transpile preview handler
        vscode.workspace.registerTextDocumentContentProvider(FILE_SCHEME, this);

        //anytime the underlying file changed, tell vscode the preview needs to be regenerated
        vscode.workspace.onDidChangeTextDocument((e) => {
            if (this.isWatchingUri(e.document.uri)) {
                let uri = this.getBsPreviewUri(e.document.uri);
                util.keyedDebounce(`'textdoc-change:${uri.fsPath}`, () => {
                    this.onDidChangeEmitter.fire(uri);
                }, 500);
            }
        });

        // sync the preview and the source doc on mouse click
        vscode.window.onDidChangeTextEditorSelection((e) => {
            let uri = e.textEditor.document.uri;
            //if this is one of our source files
            if (this.activePreviews[uri.fsPath]) {

                util.keyedDebounce(`sync-preview:${uri.fsPath}`, async () => {
                    this.syncPreviewLocation(uri);
                }, BrighterScriptPreviewCommand.SELECTION_SYNC_DELAY);

                //this is the preview file
            } else if (this.getSourcePathFromPreviewUri(uri)) {
                //TODO enable this once we figure out the bugs
                // util.keyedDebounce(`sync-source:${uri.fsPath}`, async () => {
                //     this.syncSourceLocation(uri);
                // }, BrighterScriptPreviewCommand.SELECTION_SYNC_DELAY);
            }
        });

        //whenever the source file is closed, dispose of our preview
        vscode.workspace.onDidCloseTextDocument(async (e) => {
            let activePreview = this.activePreviews[e?.uri?.fsPath];
            if (activePreview?.previewEditor?.document?.uri) {
                //close the preview by showing it and then closing the active editor
                await vscode.window.showTextDocument(activePreview.previewEditor.document.uri, { preview: true, preserveFocus: false });
                await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
            }
            delete this.activePreviews[e?.uri?.fsPath];
        });
    }

    /**
     * Synce a preview editor to the selected range in the source editor
     */
    private async syncPreviewLocation(uri: vscode.Uri) {
        let activePreview = this.activePreviews[uri.fsPath];
        let sourceMap = activePreview?.sourceMap;
        let sourceSelection = activePreview?.sourceEditor?.selection;

        if (sourceMap && sourceSelection) {
            try {
                let mappedRange = await SourceMapConsumer.with(sourceMap, null, (consumer) => {
                    let start = consumer.generatedPositionFor({
                        source: uri.fsPath,
                        line: sourceSelection.start.line + 1,
                        column: sourceSelection.start.character,
                        bias: SourceMapConsumer.LEAST_UPPER_BOUND
                    });
                    //if no location found, snap to the closest token
                    if (start.line === null || start.column === null) {
                        start = consumer.generatedPositionFor({
                            source: uri.fsPath,
                            line: sourceSelection.start.line + 1,
                            column: sourceSelection.start.character,
                            bias: SourceMapConsumer.GREATEST_LOWER_BOUND
                        });
                    }
                    let end = consumer.generatedPositionFor({
                        source: uri.fsPath,
                        line: sourceSelection.end.line + 1,
                        column: sourceSelection.end.character,
                        bias: SourceMapConsumer.LEAST_UPPER_BOUND
                    });
                    //if no location found, snap to the closest token
                    if (end.line === null || end.column === null) {
                        end = consumer.generatedPositionFor({
                            source: uri.fsPath,
                            line: sourceSelection.end.line + 1,
                            column: sourceSelection.end.character,
                            bias: SourceMapConsumer.GREATEST_LOWER_BOUND
                        });
                    }
                    return new Range(
                        start.line - 1,
                        start.column,
                        end.line - 1,
                        end.column
                    );
                });

                //scroll the preview editor to the source's clicked location
                activePreview.previewEditor.revealRange(mappedRange, vscode.TextEditorRevealType.InCenter);
                activePreview.previewEditor.selection = new vscode.Selection(mappedRange.start, mappedRange.end);
            } catch (e) {
                console.error(e);
            }
        }
    }

    /**
     * Sync a source editor to the selection in the preview editor
     */
    private async syncSourceLocation(uri: vscode.Uri) {
        let sourceFsPath = this.getSourcePathFromPreviewUri(uri);
        let activePreview = this.activePreviews[sourceFsPath];

        let previewSelection = activePreview?.previewEditor?.selection;
        if (activePreview && activePreview.sourceMap && previewSelection) {
            try {
                let mappedRange = await SourceMapConsumer.with(activePreview.sourceMap, null, (consumer) => {
                    let start = consumer.originalPositionFor({
                        line: previewSelection.start.line + 1,
                        column: previewSelection.start.character,
                        bias: SourceMapConsumer.LEAST_UPPER_BOUND
                    });
                    if (start.line === null || start.column === null) {
                        start = consumer.originalPositionFor({
                            line: previewSelection.start.line + 1,
                            column: previewSelection.start.character,
                            bias: SourceMapConsumer.GREATEST_LOWER_BOUND
                        });
                    }
                    let end = consumer.originalPositionFor({
                        line: previewSelection.end.line + 1,
                        column: previewSelection.end.character,
                        bias: SourceMapConsumer.LEAST_UPPER_BOUND
                    });
                    if (end.line === null || end.column === null) {
                        end = consumer.originalPositionFor({
                            line: previewSelection.end.line + 1,
                            column: previewSelection.end.character,
                            bias: SourceMapConsumer.GREATEST_LOWER_BOUND
                        });
                    }
                    return new Range(
                        start.line - 1,
                        start.column,
                        end.line - 1,
                        end.column
                    );
                });

                //scroll the preview editor to the source's clicked location
                activePreview.sourceEditor.revealRange(mappedRange, vscode.TextEditorRevealType.InCenter);
                activePreview.sourceEditor.selection = new vscode.Selection(mappedRange.start, mappedRange.end);
            } catch (e) {
                console.error(e);
            }
        }
    }

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
            /**
             * The editor this "preview transpiled bs" command was initiated upon.
             */
            sourceEditor: vscode.TextEditor,
            /**
             * The editor that contains the preview doc
             */
            previewEditor: vscode.TextEditor,
            /**
             * the latest source map for the preview.
             */
            sourceMap: any
        }
    };

    /**
     * The handler for the command. Creates a custom URI so we can open it
     * with our TextDocumentContentProvider to show the transpiled code
     */
    public async openPreview(uri: Uri, sourceEditor: vscode.TextEditor, showToSide: boolean) {
        let activePreview: BrighterScriptPreviewCommand['activePreviews'][0];
        let previewDoc: vscode.TextDocument;
        if (!this.activePreviews[uri.fsPath]) {
            activePreview = this.activePreviews[uri.fsPath] = {} as any;
            let customUri = this.getBsPreviewUri(uri);
            previewDoc = await vscode.workspace.openTextDocument(customUri);
        } else {
            activePreview = this.activePreviews[uri.fsPath];
            previewDoc = activePreview.previewEditor.document;
        }
        activePreview.sourceEditor = sourceEditor;
        activePreview.previewEditor = await vscode.window.showTextDocument(previewDoc, {
            preview: true,
            preserveFocus: true,
            viewColumn: showToSide ? vscode.ViewColumn.Beside : vscode.ViewColumn.Active
        });
    }

    // emitter and its event
    public onDidChangeEmitter = new vscode.EventEmitter<vscode.Uri>();
    public onDidChange = this.onDidChangeEmitter.event;

    public async provideTextDocumentContent(uri: vscode.Uri) {
        let fsPath = this.getSourcePathFromPreviewUri(uri);
        let result = await languageServerManager.getTranspiledFileContents(fsPath);
        this.activePreviews[fsPath].sourceMap = result.map;
        return result.code;
    }

    /**
     * Get the fsPath from the uri. this handles both `file` and `bs-preview` schemes
     */
    private getSourcePathFromPreviewUri(uri: vscode.Uri) {
        if (uri.scheme === FILE_SCHEME) {
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
        let fsPath = uri.fsPath;
        return Uri.parse(`${FILE_SCHEME}:(Transpiled) ${path.basename(fsPath)}?fsPath=${fsPath}`);
    }
}

export const brighterScriptPreviewCommand = new BrighterScriptPreviewCommand();
