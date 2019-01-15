import * as vscode from 'vscode';

import { DiagnosticCollection } from 'vscode';

import { BrightScriptDebugCompileError } from './RokuAdapter';
class LogLine {
    constructor(text, mustInclude) {
        this.text = text;
        this.isMustInclude = mustInclude;
    }
    public text: string;
    public isMustInclude: boolean;
}

export class LogOutputManager {
    constructor(outputChannel, context) {
        this.collection = vscode.languages.createDiagnosticCollection('BrightScript');
        this.outputChannel = outputChannel;
        this.context = context;
        let subscriptions = context.subscriptions;
        this.includeRegex = null;
        this.logLevelRegex = null;
        this.excludeRegex = null;

        subscriptions.push(vscode.commands.registerCommand('extension.brightscript.markLogOutput', () => {
            this.markOutput();
        }));
        subscriptions.push(vscode.commands.registerCommand('extension.brightscript.clearLogOutput', () => {
            this.clearOutput();
        }));

        subscriptions.push(vscode.commands.registerCommand('extension.brightscript.setOutputIncludeFilter', async () => {
            let entryText: string = await vscode.window.showInputBox({
                placeHolder: 'Enter log include regex',
                value: this.includeRegex ? this.includeRegex.source : ''
            });
            if (entryText || entryText === '') {
                this.setIncludeFilter(entryText);
            }
        } ));

        subscriptions.push(vscode.commands.registerCommand('extension.brightscript.setOutputLogLevelFilter', async () => {
            let entryText: string = await vscode.window.showInputBox({
                placeHolder: 'Enter log level regex',
                value: this.logLevelRegex ? this.logLevelRegex.source : ''
            });
            if (entryText || entryText === '') {
                this.setLevelFilter(entryText);
            }
        } ));

        subscriptions.push(vscode.commands.registerCommand('extension.brightscript.setOutputExcludeFilter', async () => {
            let entryText: string = await vscode.window.showInputBox({
                placeHolder: 'Enter log exclude regex',
                value: this.excludeRegex ? this.excludeRegex.source : ''
            });
            if (entryText || entryText === '') {
                this.setExcludeFilter(entryText);
            }
        } ));
        this.clearOutput();

    }
    private context: any;
    private displayedLogLines: LogLine[];
    private allLogLines: LogLine[];
    private markCount: number;
    private includeRegex?: RegExp;
    private logLevelRegex?: RegExp;
    private excludeRegex?: RegExp;

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

    public appendLine(lineText: string, mustInclude: boolean = false): void {
        let lines = lineText.split('\n');
        lines.forEach((line) => {
            if (line !== '') {
                const logLine = new LogLine(line, mustInclude);
                this.allLogLines.push(logLine);
                if (this.matchesFilter(logLine)) {
                    this.displayedLogLines.push(logLine);
                    this.outputChannel.appendLine(logLine.text);
                }
            }
        });
    }

    public matchesFilter(logLine: LogLine): boolean {
        console.log(`IS MATCHED ? ${logLine.text} ${logLine.isMustInclude} ${(!this.logLevelRegex || this.logLevelRegex.test(logLine.text))}`);
        return (logLine.isMustInclude || (
            (!this.logLevelRegex || this.logLevelRegex.test(logLine.text)))
            && (!this.includeRegex || this.includeRegex.test(logLine.text)))
            && (!this.excludeRegex || !this.excludeRegex.test(logLine.text)
        );
    }

    public clearOutput(): any {
        this.markCount = 0;
        this.allLogLines = [];
        this.displayedLogLines = [];
        this.outputChannel.clear();
        this.collection.clear();
    }

    public setIncludeFilter(text: string): void {
        this.includeRegex = text && text.trim() !== '' ? new RegExp(text, 'i') : null;
        this.reFilterOutput();
    }

    public setExcludeFilter(text: string): void {
        this.excludeRegex = text && text.trim() !== '' ? new RegExp(text, 'i') : null;
        this.reFilterOutput();
    }

    public setLevelFilter(text: string): void {
        this.logLevelRegex = text && text.trim() !== '' ? new RegExp(text, 'i') : null;
        this.reFilterOutput();
    }

    public reFilterOutput(): void {
        this.outputChannel.clear();

        for (let i = 0; i < this.allLogLines.length - 1; i++) {
            let logLine = this.allLogLines[i];
            if (this.matchesFilter(logLine)) {
                console.log(`IS MATCHED !!! ${logLine.text}`);
                this.outputChannel.appendLine(logLine.text);
            }
        }
    }

    public markOutput(): void {
        this.appendLine(`---------------------- MARK ${this.markCount} ----------------------`, true);
        this.markCount++;
    }
}
