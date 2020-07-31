import * as vscode from 'vscode';

import { DiagnosticCollection } from 'vscode';

import { BrightScriptDebugCompileError } from 'roku-debug';
import { DeclarationProvider } from './DeclarationProvider';
import { LogDocumentLinkProvider } from './LogDocumentLinkProvider';
import { CustomDocumentLink } from './LogDocumentLinkProvider';
import * as fsExtra from 'fs-extra';
import { BrightScriptLaunchConfiguration } from './DebugConfigurationProvider';

export class LogLine {
    constructor(
        public text: string,
        public isMustInclude: boolean
    ) {
    }
}

export class LogOutputManager {

    constructor(
        outputChannel,
        context,
        docLinkProvider,
        private declarationProvider: DeclarationProvider
    ) {
        this.collection = vscode.languages.createDiagnosticCollection('BrightScript');
        this.outputChannel = outputChannel;
        this.docLinkProvider = docLinkProvider;

        this.loadConfigSettings();
        vscode.workspace.onDidChangeConfiguration((e) => {
            this.loadConfigSettings();
        });

        this.context = context;
        let subscriptions = context.subscriptions;
        this.includeRegex = null;
        this.logLevelRegex = null;
        this.excludeRegex = null;
        /**
         * we want to catch a few different link formats here:
         *  - pkg:/path/file.brs(LINE:COL)
         *  - file://path/file.bs:LINE
         *  - at line LINE of file pkg:/path/file.brs - this case can arise when the device reports various scenegraph errors such as fields not present, or texture size issues, etc
         */
        this.pkgRegex = /(?:\s*at line (\d*) of file )*(?:(pkg:\/|file:\/\/)(.*\.(bs|brs|xml)))[ \t]*(?:(?:(?:\()(\d+)(?:\:(\d+))?\)?)|(?:\:(\d+)?))*/;
        this.debugStartRegex = new RegExp('BrightScript Micro Debugger\.', 'ig');
        this.debugEndRegex = new RegExp('Brightscript Debugger>', 'ig');

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
        }));

        subscriptions.push(vscode.commands.registerCommand('extension.brightscript.setOutputLogLevelFilter', async () => {
            let entryText: string = await vscode.window.showInputBox({
                placeHolder: 'Enter log level regex',
                value: this.logLevelRegex ? this.logLevelRegex.source : ''
            });
            if (entryText || entryText === '') {
                this.setLevelFilter(entryText);
            }
        }));

        subscriptions.push(vscode.commands.registerCommand('extension.brightscript.setOutputExcludeFilter', async () => {
            let entryText: string = await vscode.window.showInputBox({
                placeHolder: 'Enter log exclude regex',
                value: this.excludeRegex ? this.excludeRegex.source : ''
            });
            if (entryText || entryText === '') {
                this.setExcludeFilter(entryText);
            }
        }));
        this.clearOutput();

    }
    private context: any;
    private displayedLogLines: LogLine[];
    private allLogLines: LogLine[];
    private markCount: number;
    private includeRegex?: RegExp;
    private logLevelRegex?: RegExp;
    private excludeRegex?: RegExp;
    private pkgRegex: RegExp;
    private isNextBreakpointSkipped: boolean = false;
    private includeStackTraces: boolean;
    private isInMicroDebugger: boolean;
    public launchConfig: BrightScriptLaunchConfiguration;
    public isFocusingOutputOnLaunch: boolean;
    public isClearingOutputOnLaunch: boolean;
    public isClearingConsoleOnChannelStart: boolean;
    public hyperlinkFormat: string;
    private collection: DiagnosticCollection;
    private outputChannel: vscode.OutputChannel;
    private docLinkProvider: LogDocumentLinkProvider;
    private debugStartRegex: RegExp;
    private debugEndRegex: RegExp;

    public onDidStartDebugSession() {
        this.isInMicroDebugger = false;
        this.isNextBreakpointSkipped = false;
        if (this.isClearingConsoleOnChannelStart) {
            this.clearOutput();
        }
    }

    private loadConfigSettings() {
        let config: any = vscode.workspace.getConfiguration('brightscript') || {};
        this.includeStackTraces = (config.output || {}).includeStackTraces;
        this.isFocusingOutputOnLaunch = config?.output?.focusOnLaunch === false ? false : true;
        this.isClearingOutputOnLaunch = config?.output?.clearOnLaunch === false ? false : true;
        this.isClearingConsoleOnChannelStart = config?.output?.clearConsoleOnChannelStart === false ? false : true;
        this.hyperlinkFormat = (config.output || {}).hyperlinkFormat;
    }

    public setLaunchConfig(launchConfig: BrightScriptLaunchConfiguration) {
        this.launchConfig = launchConfig;
    }

    public onDidReceiveDebugSessionCustomEvent(e: any) {
        if (e.event === 'BSRendezvousEvent') {
            // No need to handle rendezvous type events
            return;
        }

        console.log('received event ' + e.event);
        if (e.event === 'BSLogOutputEvent') {
            this.appendLine(e.body);
        } else if (e.event === 'BSLaunchStartEvent') {
            this.isInMicroDebugger = false;
            this.isNextBreakpointSkipped = false;
            if (this.isFocusingOutputOnLaunch) {
                vscode.commands.executeCommand('workbench.action.focusPanel');
                this.outputChannel.show();
            }
            if (this.isClearingOutputOnLaunch) {
                this.clearOutput();
            }
        } else {
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
                if (!this.includeStackTraces) {
                    // filter out debugger noise
                    if (line.match(this.debugStartRegex)) {
                        console.log('start MicroDebugger block');
                        this.isInMicroDebugger = true;
                        this.isNextBreakpointSkipped = false;
                        line = 'Pausing for a breakpoint...';
                    } else if (this.isInMicroDebugger && line.match(this.debugEndRegex)) {
                        console.log('ended MicroDebugger block');
                        this.isInMicroDebugger = false;
                        if (this.isNextBreakpointSkipped) {
                            line = '\n**Was a bogus breakpoint** Skipping!\n';
                        } else {
                            line = null;
                        }
                    } else if (this.isInMicroDebugger) {
                        if (this.launchConfig.enableDebuggerAutoRecovery && line.startsWith('Break in ')) {
                            console.log('this block is a break: skipping it');
                            this.isNextBreakpointSkipped = true;
                        }
                        line = null;
                    }
                }
            }
            if (line) {
                const logLine = new LogLine(line, mustInclude);
                this.allLogLines.push(logLine);
                if (this.matchesFilter(logLine)) {
                    this.allLogLines.push(logLine);
                    this.addLogLineToOutput(logLine);
                    this.writeLogLineToLogfile(logLine.text);
                }
            }
        });
    }

    public writeLogLineToLogfile(text: string) {
        if (this.launchConfig?.logfilePath) {
            fsExtra.appendFileSync(this.launchConfig.logfilePath, text + '\n');
        }
    }

    public addLogLineToOutput(logLine: LogLine) {
        const logLineNumber = this.displayedLogLines.length;
        if (this.matchesFilter(logLine)) {
            this.displayedLogLines.push(logLine);
            let match = this.pkgRegex.exec(logLine.text);
            if (match) {
                const isFilePath = match[2] === 'file://';
                const path = isFilePath ? match[3] : 'pkg:/' + match[3];
                let lineNumber = match[1] ? Number(match[1]) : undefined;
                if (!lineNumber) {
                    lineNumber = isFilePath ? Number(match[7]) : Number(match[5]);
                }

                const filename = this.getFilename(path);
                const ext = `.${match[4]}`.toLowerCase();
                let customText = this.getCustomLogText(path, filename, ext, Number(lineNumber), logLineNumber, isFilePath);
                const customLink = new CustomDocumentLink(logLineNumber, match.index, customText.length, path, lineNumber, filename);
                if (isFilePath) {
                    this.docLinkProvider.addCustomFileLink(customLink);
                } else {
                    this.docLinkProvider.addCustomPkgLink(customLink);
                }
                let logText = logLine.text.substring(0, match.index) + customText + logLine.text.substring(match.index + match[0].length);
                this.outputChannel.appendLine(logText);
            } else {
                this.outputChannel.appendLine(logLine.text);
            }
        }
    }

    public getFilename(pkgPath: string): string {
        const parts = pkgPath.split('/');
        let name = parts.length > 0 ? parts[parts.length - 1] : pkgPath;
        if (name.toLowerCase().endsWith('.xml') || name.toLowerCase().endsWith('.brs')) {
            name = name.substring(0, name.length - 4);
        } else if (name.toLowerCase().endsWith('.bs')) {
            name = name.substring(0, name.length - 3);
        }
        return name;
    }

    public getCustomLogText(pkgPath: string, filename: string, extension: string, lineNumber: number, logLineNumber: number, isFilePath: boolean): string {
        switch (this.hyperlinkFormat) {
            case 'Full':
                return pkgPath + `(${lineNumber})`;
                break;
            case 'Short':
                return `#${logLineNumber}`;
                break;
            case 'Hidden':
                return ' ';
                break;
            case 'Filename':
                return `${filename}${extension}(${lineNumber})`;
                break;
            default:
                if (extension === '.brs' || extension === '.bs') {
                    const methodName = this.getMethodName(pkgPath, lineNumber, isFilePath);
                    if (methodName) {
                        return `${filename}.${methodName}(${lineNumber})`;
                    }
                }
                return pkgPath + `(${lineNumber})`;
                break;
        }
    }

    public getMethodName(path: string, lineNumber: number, isFilePath: boolean): string | null {
        let fsPath = isFilePath ? path : this.docLinkProvider.convertPkgPathToFsPath(path);
        const method = this.declarationProvider.getFunctionBeforeLine(fsPath, lineNumber);
        return method ? method.name : null;
    }

    public matchesFilter(logLine: LogLine): boolean {
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
        this.docLinkProvider.resetCustomLinks();
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
        this.docLinkProvider.resetCustomLinks();

        for (let i = 0; i < this.allLogLines.length - 1; i++) {
            let logLine = this.allLogLines[i];
            if (this.matchesFilter(logLine)) {
                this.addLogLineToOutput(logLine);
            }
        }
    }

    public markOutput(): void {
        this.appendLine(`---------------------- MARK ${this.markCount} ----------------------`, true);
        this.markCount++;
    }
}
