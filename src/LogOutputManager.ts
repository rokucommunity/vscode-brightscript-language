import * as vscode from 'vscode';

import { DiagnosticCollection } from 'vscode';

import { BrightScriptDebugCompileError } from './RokuAdapter';

export class LogOutputManager {
    constructor(outputChannel, context) {
        this.collection = vscode.languages.createDiagnosticCollection('BrightScript');
        this.outputChannel = outputChannel;
        this.context = context;
        let subscriptions = context.subscriptions;

        subscriptions.push(vscode.commands.registerCommand('extension.brightscript.markLogOutput', () => {
            this.markOutput();
        }));
        subscriptions.push(vscode.commands.registerCommand('extension.brightscript.clearLogOutput', () => {
            this.clearOutput();
        }));
        this.clearOutput();

    }
    private context: any;
    private displayedLogLines: string[];
    private allLogLines: string[];
    private markCount: number;

    private collection: DiagnosticCollection;
    private outputChannel: vscode.OutputChannel;

    public onDidStartDebugSession() {
        //TODO make this a config setting
        this.clearOutput();
    }

    public onDidReceiveDebugSessionCustomEvent(e: any) {
        console.log('received event ' + e.event);
        if (e.event === 'BSLogOutputEvent') {
            this.appendLine(e.body);
        } else {
            this.clearOutput();
            let errorsByPath = {};
            if (e.body) {
                e.body.forEach(async (compileError) => {
                    if (!errorsByPath[compileError.path]) {
                        errorsByPath[compileError.path] = [];
                    }
                    errorsByPath[compileError.path].push(compileError);
                });
            }
            for (const path in errorsByPath) {
                if (errorsByPath.hasOwnProperty(path)) {
                    const errors = errorsByPath[path];
                    this.addDiagnosticForError(path, errors);
                }
            }
        }
    }

    public async addDiagnosticForError(path: string, compileErrors: BrightScriptDebugCompileError[]) {

        //TODO get the actual folder
        let documentUri: vscode.Uri;
        let uri = vscode.Uri.file(path);
        let doc = await vscode.workspace.openTextDocument(uri); // calls back
        if (doc !== undefined) {
            documentUri = doc.uri;
        }
        // console.log("got " + documentUri);

        //debug crap - for some reason - using this URI works - using the one from the path does not :()
        // const document = vscode.window.activeTextEditor.document;
        // const currentDocumentUri = document.uri;
        // console.log("currentDocumentUri " + currentDocumentUri);
        if (documentUri !== undefined) {
            {
                let diagnostics: vscode.Diagnostic[] = [];
                compileErrors.forEach((compileError) => {

                    const path: string = compileError.path;
                    const message: string = compileError.message;
                    const source: string = compileError.errorText;
                    const lineNumber: number = compileError.lineNumber;
                    const charStart: number = compileError.charStart;
                    const charEnd: number = compileError.charEnd;

                    diagnostics.push({
                        code: '',
                        message: message,
                        range: new vscode.Range(new vscode.Position(lineNumber, charStart), new vscode.Position(lineNumber, charEnd)),
                        severity: vscode.DiagnosticSeverity.Error,
                        source: source
                    });
                });
                this.collection.set(documentUri, diagnostics);
            }
        }
    }

    /**
     * Log output methods
     */

    public appendLine(line: string, mustInclude: boolean = false): void {
        this.allLogLines.push(line);
        if (this.matchesFilter(line) || mustInclude) {
            this.displayedLogLines.push(line);
            this.outputChannel.appendLine(line);
        }
    }

    public matchesFilter(body: string): boolean {
        // TODO implement filter feature
        return true;
    }

    public clearOutput(): any {
        this.markCount = 0;
        this.allLogLines = [];
        this.displayedLogLines = [];
        this.outputChannel.clear();
        this.collection.clear();
    }

    public markOutput(): void {
        this.appendLine(`---------------------- MARK ${this.markCount} ----------------------`);
        this.markCount++;
    }
}
