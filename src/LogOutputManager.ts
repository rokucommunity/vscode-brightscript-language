import * as vscode from 'vscode';
import type { DiagnosticCollection } from 'vscode';
import type { BSDebugDiagnostic } from 'roku-debug';
import { isChanperfEvent, isDiagnosticsEvent, isLaunchStartEvent, isLogOutputEvent, isPopupMessageEvent, isRendezvousEvent } from 'roku-debug';
import type { DeclarationProvider } from './DeclarationProvider';
import type { LogDocumentLinkProvider } from './LogDocumentLinkProvider';
import { CustomDocumentLink } from './LogDocumentLinkProvider';
import * as fsExtra from 'fs-extra';
import type { BrightScriptLaunchConfiguration } from './DebugConfigurationProvider';

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
        this.debugStartRegex = /BrightScript Micro Debugger\./ig;
        this.debugEndRegex = /Brightscript Debugger>/ig;

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
    private isNextBreakpointSkipped = false;
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
        this.includeStackTraces = config.output?.includeStackTraces;
        this.isFocusingOutputOnLaunch = config?.output?.focusOnLaunch === false ? false : true;
        this.isClearingOutputOnLaunch = config?.output?.clearOnLaunch === false ? false : true;
        this.isClearingConsoleOnChannelStart = config?.output?.clearConsoleOnChannelStart === false ? false : true;
        this.hyperlinkFormat = config.output?.hyperlinkFormat;
    }

    public setLaunchConfig(launchConfig: BrightScriptLaunchConfiguration) {
        this.launchConfig = launchConfig;
    }

    public async onDidReceiveDebugSessionCustomEvent(e: { event: string; body?: any }) {
        if (isRendezvousEvent(e) || isChanperfEvent(e)) {
            // No need to handle rendezvous type events
            return;
        }

        if (isLogOutputEvent(e)) {
            this.appendLine(e.body.line);

        } else if (isPopupMessageEvent(e)) {
            this.showMessage(e.body.message, e.body.severity);

        } else if (isLaunchStartEvent(e)) {
            this.isInMicroDebugger = false;
            this.isNextBreakpointSkipped = false;
            if (this.isFocusingOutputOnLaunch) {
                await vscode.commands.executeCommand('workbench.action.focusPanel');
                this.outputChannel.show();
            }
            if (this.isClearingOutputOnLaunch) {
                this.clearOutput();
            }

        } else if (isDiagnosticsEvent(e)) {
            let errorsByPath = {};
            for (const diagnostic of e.body.diagnostics) {
                if (diagnostic.path) {
                    if (!errorsByPath[diagnostic.path]) {
                        errorsByPath[diagnostic.path] = [];
                    }
                    errorsByPath[diagnostic.path].push(diagnostic);
                }
            }
            for (const path in errorsByPath) {
                if (errorsByPath.hasOwnProperty(path)) {
                    const errors = errorsByPath[path];
                    await this.addDiagnosticForError(path, errors);
                }
            }
        }
    }

    private showMessage(message: string, severity: string) {
        const methods = {
            error: vscode.window.showErrorMessage,
            info: vscode.window.showInformationMessage,
            warn: vscode.window.showWarningMessage
        };
        methods[severity](message);
    }

    public async addDiagnosticForError(path: string, diagnostics: BSDebugDiagnostic[]) {
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
            let result: vscode.Diagnostic[] = [];
            for (const diagnostic of diagnostics) {
                result.push({
                    code: diagnostic.code,
                    message: diagnostic.message,
                    source: diagnostic.source,
                    severity: diagnostic.severity,
                    tags: diagnostic.tags,
                    range: new vscode.Range(
                        new vscode.Position(diagnostic.range.start.line, diagnostic.range.start.character),
                        new vscode.Position(diagnostic.range.end.line, diagnostic.range.end.character)
                    )
                });
            }
            this.collection.set(documentUri, result);
        }
    }

    /**
     * Log output methods
     */
    public appendLine(lineText: string, mustInclude = false): void {
        let lines = lineText.split(/\r?\n/g);
        for (let line of lines) {
            if (line !== '') {
                if (!this.includeStackTraces) {
                    // filter out debugger noise
                    if (this.debugStartRegex.exec(line)) {
                        console.log('start MicroDebugger block');
                        this.isInMicroDebugger = true;
                        this.isNextBreakpointSkipped = false;
                        line = 'Pausing for a breakpoint...';
                    } else if (this.isInMicroDebugger && (this.debugEndRegex.exec(line))) {
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
                if (this.shouldLineBeShown(logLine)) {
                    this.allLogLines.push(logLine);
                    this.addLogLineToOutput(logLine);
                    this.writeLogLineToLogfile(logLine.text);
                }
            }
        }
    }

    public writeLogLineToLogfile(text: string) {
        if (this.launchConfig?.logfilePath) {
            fsExtra.appendFileSync(this.launchConfig.logfilePath, text + '\n');
        }
    }

    public addLogLineToOutput(logLine: LogLine) {
        const logLineNumber = this.displayedLogLines.length;
        if (this.shouldLineBeShown(logLine)) {
            this.displayedLogLines.push(logLine);
            let match = this.pkgRegex.exec(logLine.text);
            if (match) {
                const isFilePath = match[2] === 'file://';
                const path = isFilePath ? match[3] : 'pkg:/' + match[3];
                let lineNumber = match[1] ? Number(match[1]) : undefined;
                if (!lineNumber) {
                    if (isFilePath) {
                        lineNumber = Number(match[7]);
                        if (isNaN(lineNumber)) {
                            lineNumber = Number(match[5]);
                        }
                    } else {
                        lineNumber = Number(match[5]);
                    }
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
        const method = fsPath ? this.declarationProvider.getFunctionBeforeLine(fsPath, lineNumber) : null;
        return method ? method.name : null;
    }

    private shouldLineBeShown(logLine: LogLine): boolean {
        //filter excluded lines
        if (this.excludeRegex?.test(logLine.text)) {
            return false;
        }
        //once past the exclude filter, always keep "mustInclude" lines
        if (logLine.isMustInclude) {
            return true;
        }
        //throw out lines that don't match the logLevelRegex (if we have one)
        if (this.logLevelRegex && !this.logLevelRegex.test(logLine.text)) {
            return false;
        }
        //throw out lines that don't match the includeRegex (if we have one)
        if (this.includeRegex && !this.includeRegex.test(logLine.text)) {
            return false;
        }
        //all other log entries should be kept
        return true;
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
            if (this.shouldLineBeShown(logLine)) {
                this.addLogLineToOutput(logLine);
            }
        }
    }

    public markOutput(): void {
        this.appendLine(`---------------------- MARK ${this.markCount} ----------------------`, true);
        this.markCount++;
    }
}
