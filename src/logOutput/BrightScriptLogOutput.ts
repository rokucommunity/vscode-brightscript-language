import * as vscode from 'vscode';
import * as fsExtra from 'fs-extra';
import stripAnsi from 'strip-ansi';
import { isLaunchStartEvent, isLogOutputEvent } from 'roku-debug';
import type { DeclarationProvider } from '../DeclarationProvider';
import type { BrightScriptLaunchConfiguration } from '../DebugConfigurationProvider';
import { util } from '../util';
import type { LogOutput } from './LogOutput';
import { isBrightScriptLogDocument } from './LogOutput';
import type { FileReference } from './logLineUtils';
import { annotateErrorCodes, findFileReference } from './logLineUtils';
import { PkgPathResolver } from './PkgPathResolver';

/**
 * How many log lines are kept for re-filtering the output. Older lines stay in the output channel,
 * but are dropped when the output is re-filtered.
 */
export const MAX_HISTORY_LINES = 100_000;

/**
 * The history is trimmed back to `MAX_HISTORY_LINES` once it grows past this, so it isn't shifted on every line
 */
const HISTORY_TRIM_THRESHOLD = MAX_HISTORY_LINES + (MAX_HISTORY_LINES / 10);

interface LogLine {
    text: string;
    /**
     * Shown regardless of the include and level filters (i.e. the lines added by "Mark Log Output")
     */
    isMustInclude: boolean;
    /**
     * The file reference in this line, looked up the first time the line is shown.
     * `undefined` means not looked up yet, `null` means the line has none.
     */
    reference?: ResolvedFileReference | null;
}

interface ResolvedFileReference extends FileReference {
    /**
     * The source file on disk, or undefined if it couldn't be found
     */
    fsPath: string | undefined;
    /**
     * The name of the function containing the referenced line, looked up only when needed.
     * `undefined` means not looked up yet, `null` means there is none.
     */
    methodName?: string | null;
}

interface OutputLink {
    /**
     * The full text of the output line holding this link, to confirm the document still lines up with it
     */
    lineText: string;
    range: vscode.Range;
    target: vscode.Uri;
    tooltip: string;
}

/**
 * The "BrightScript Log" output: writes device log output to the output channel, and links file references
 * in that output back to the source files.
 */
export class BrightScriptLogOutput implements LogOutput, vscode.DocumentLinkProvider, vscode.Disposable {
    constructor(
        private outputChannel: vscode.OutputChannel,
        context: vscode.ExtensionContext,
        private declarationProvider: DeclarationProvider
    ) {
        this.loadSettings();
        context.subscriptions.push(
            this,
            vscode.workspace.onDidChangeConfiguration((e) => {
                if (e.affectsConfiguration('brightscript.output')) {
                    this.loadSettings();
                }
            }),
            //output channels can't be told apart by language, so this checks each document instead
            vscode.languages.registerDocumentLinkProvider({ scheme: 'output' }, this),
            vscode.commands.registerCommand('extension.brightscript.markLogOutput', () => {
                this.markOutput();
            }),
            vscode.commands.registerCommand('extension.brightscript.clearLogOutput', () => {
                this.clearOutput();
            }),
            vscode.commands.registerCommand('extension.brightscript.setOutputIncludeFilter', async () => {
                await this.promptForFilter('Enter log include regex', this.includeRegex, (text) => this.setIncludeFilter(text));
            }),
            vscode.commands.registerCommand('extension.brightscript.setOutputLogLevelFilter', async () => {
                await this.promptForFilter('Enter log level regex', this.logLevelRegex, (text) => this.setLevelFilter(text));
            }),
            vscode.commands.registerCommand('extension.brightscript.setOutputExcludeFilter', async () => {
                await this.promptForFilter('Enter log exclude regex', this.excludeRegex, (text) => this.setExcludeFilter(text));
            })
        );
        this.clearOutput();
    }

    private pkgPathResolver = new PkgPathResolver();
    private launchConfig: BrightScriptLaunchConfiguration;

    private includeStackTraces: boolean;
    private isFocusingOutputOnLaunch: boolean;
    private isClearingOutputOnLaunch: boolean;
    private isClearingConsoleOnChannelStart: boolean;
    private hyperlinkFormat: string;

    private includeRegex: RegExp | undefined;
    private logLevelRegex: RegExp | undefined;
    private excludeRegex: RegExp | undefined;

    /**
     * Every line received (up to `MAX_HISTORY_LINES`), whether or not it passed the filters, so the output can be re-filtered
     */
    private history: LogLine[] = [];
    /**
     * The number of lines written to the output channel since it was last cleared
     */
    private lineCount = 0;
    /**
     * The links in the output channel, keyed by line number
     */
    private links = new Map<number, OutputLink>();
    private markCount = 0;

    private isInMicroDebugger = false;
    private isNextBreakpointSkipped = false;

    private fileExistsCache = new Map<string, boolean>();
    private logfile: { path: string; stream: fsExtra.WriteStream } | undefined;

    private loadSettings() {
        const config = util.getConfiguration('brightscript');
        this.includeStackTraces = config.get('output.includeStackTraces') !== false;
        this.isFocusingOutputOnLaunch = config.get('output.focusOnLaunch') !== false;
        this.isClearingOutputOnLaunch = config.get('output.clearOnLaunch') !== false;
        this.isClearingConsoleOnChannelStart = config.get('output.clearConsoleOnChannelStart') !== false;
        this.hyperlinkFormat = config.get('output.hyperlinkFormat');
    }

    public async setLaunchConfig(launchConfig: BrightScriptLaunchConfiguration) {
        this.launchConfig = launchConfig;
        this.fileExistsCache.clear();
        await this.pkgPathResolver.setLaunchConfig(launchConfig);
    }

    public onDidStartDebugSession() {
        this.isInMicroDebugger = false;
        this.isNextBreakpointSkipped = false;
        if (this.isClearingConsoleOnChannelStart) {
            this.clearOutput();
        }
    }

    public async onDidReceiveDebugSessionCustomEvent(e: { event: string; body?: any }) {
        if (isLogOutputEvent(e)) {
            this.appendLine(e.body.line);
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
        }
    }

    /**
     * Add text (which may contain several lines) to the log
     */
    public appendLine(text: string, isMustInclude = false) {
        const lines = text.split(/\r?\n/g);
        //drop the empty line that a trailing newline leaves behind
        if (lines[lines.length - 1] === '') {
            lines.pop();
        }
        for (const rawLine of lines) {
            const outputLines = (rawLine !== '' && !this.includeStackTraces) ? this.filterDebuggerNoise(rawLine) : [rawLine];
            for (const outputLine of outputLines) {
                const line: LogLine = { text: annotateErrorCodes(stripAnsi(outputLine)), isMustInclude: isMustInclude };
                this.addToHistory(line);
                if (this.isVisible(line)) {
                    this.outputChannel.appendLine(this.render(line, this.lineCount++));
                    this.writeToLogfile(line.text);
                }
            }
        }
    }

    /**
     * Collapse the micro debugger's output (shown while paused at a breakpoint) into a single line
     */
    private filterDebuggerNoise(line: string): string[] {
        if (/BrightScript Micro Debugger\./i.test(line)) {
            this.isInMicroDebugger = true;
            this.isNextBreakpointSkipped = false;
            return ['Pausing for a breakpoint...'];
        } else if (this.isInMicroDebugger && /Brightscript Debugger>/i.test(line)) {
            this.isInMicroDebugger = false;
            return this.isNextBreakpointSkipped ? ['', '**Was a bogus breakpoint** Skipping!', ''] : [];
        } else if (this.isInMicroDebugger) {
            if (this.launchConfig?.enableDebuggerAutoRecovery && line.startsWith('Break in ')) {
                this.isNextBreakpointSkipped = true;
            }
            return [];
        }
        return [line];
    }

    private addToHistory(line: LogLine) {
        this.history.push(line);
        if (this.history.length > HISTORY_TRIM_THRESHOLD) {
            this.history.splice(0, this.history.length - MAX_HISTORY_LINES);
        }
    }

    private isVisible(line: LogLine): boolean {
        if (this.excludeRegex?.test(line.text)) {
            return false;
        }
        //once past the exclude filter, always keep "mustInclude" lines
        if (line.isMustInclude) {
            return true;
        }
        if (this.logLevelRegex && !this.logLevelRegex.test(line.text)) {
            return false;
        }
        if (this.includeRegex && !this.includeRegex.test(line.text)) {
            return false;
        }
        return true;
    }

    /**
     * Get the text for a line as it appears in the output channel at `lineNumber`, and record its link (if it has one)
     */
    private render(line: LogLine, lineNumber: number): string {
        if (line.reference === undefined) {
            const reference = findFileReference(line.text);
            line.reference = reference ? {
                ...reference,
                fsPath: reference.isFilePath ? reference.path : this.pkgPathResolver.resolve(reference.path)
            } : null;
        }
        const reference = line.reference;
        if (!reference) {
            return line.text;
        }

        const linkText = this.getLinkText(reference, lineNumber);
        const text = line.text.substring(0, reference.index) + linkText + line.text.substring(reference.index + reference.length);
        if (reference.fsPath) {
            let target = vscode.Uri.file(reference.fsPath);
            if (reference.lineNumber > 0) {
                target = target.with({ fragment: `L${reference.lineNumber}` });
            }
            this.links.set(lineNumber, {
                lineText: text,
                range: new vscode.Range(lineNumber, reference.index, lineNumber, reference.index + linkText.length),
                target: target,
                tooltip: `${reference.path}(${reference.lineNumber})`
            });
        }
        return text;
    }

    private getLinkText(reference: ResolvedFileReference, lineNumber: number): string {
        switch (this.hyperlinkFormat) {
            case 'Full':
                return `${reference.path}(${reference.lineNumber})`;
            case 'Short':
                return `#${lineNumber}`;
            case 'Hidden':
                return ' ';
            case 'Filename':
                return `${reference.filename}${reference.extension}(${reference.lineNumber})`;
            default:
                if (reference.extension === '.brs' || reference.extension === '.bs') {
                    const methodName = this.getMethodName(reference);
                    if (methodName) {
                        return `${reference.filename}.${methodName}(${reference.lineNumber})`;
                    }
                }
                return `${reference.path}(${reference.lineNumber})`;
        }
    }

    private getMethodName(reference: ResolvedFileReference): string | null {
        if (reference.methodName === undefined) {
            reference.methodName = this.fileExists(reference.fsPath)
                ? this.declarationProvider.getFunctionBeforeLine(reference.fsPath, reference.lineNumber)?.name ?? null
                : null;
        }
        return reference.methodName;
    }

    private fileExists(fsPath: string | undefined): boolean {
        if (!fsPath) {
            return false;
        }
        let exists = this.fileExistsCache.get(fsPath);
        if (exists === undefined) {
            exists = fsExtra.pathExistsSync(fsPath);
            this.fileExistsCache.set(fsPath, exists);
        }
        return exists;
    }

    public provideDocumentLinks(document: vscode.TextDocument): vscode.DocumentLink[] {
        if (!isBrightScriptLogDocument(document)) {
            return [];
        }
        const result: vscode.DocumentLink[] = [];
        for (const [lineNumber, link] of this.links) {
            //skip links whose line doesn't match what we wrote (i.e. the document hasn't caught up with the channel yet)
            if (lineNumber < document.lineCount && document.lineAt(lineNumber).text === link.lineText) {
                const documentLink = new vscode.DocumentLink(link.range, link.target);
                documentLink.tooltip = link.tooltip;
                result.push(documentLink);
            }
        }
        return result;
    }

    private writeToLogfile(text: string) {
        const logfilePath = this.launchConfig?.logfilePath;
        if (!logfilePath) {
            return;
        }
        if (this.logfile?.path !== logfilePath) {
            this.closeLogfile();
            const stream = fsExtra.createWriteStream(logfilePath, { flags: 'a' });
            stream.on('error', (error) => {
                console.error(`Error writing to logfile ${logfilePath}`, error);
            });
            this.logfile = { path: logfilePath, stream: stream };
        }
        this.logfile.stream.write(text + '\n');
    }

    private closeLogfile() {
        this.logfile?.stream.end();
        this.logfile = undefined;
    }

    public clearOutput() {
        this.markCount = 0;
        this.history = [];
        this.lineCount = 0;
        this.links.clear();
        this.outputChannel.clear();
    }

    public markOutput() {
        this.appendLine(`---------------------- MARK ${this.markCount} ----------------------`, true);
        this.markCount++;
    }

    private async promptForFilter(placeHolder: string, current: RegExp | undefined, apply: (text: string) => void) {
        const text = await vscode.window.showInputBox({
            placeHolder: placeHolder,
            value: current ? current.source : ''
        });
        //undefined means the input box was cancelled
        if (text === undefined) {
            return;
        }
        try {
            apply(text);
        } catch (e) {
            void vscode.window.showErrorMessage(`Invalid log filter regex: ${(e as Error).message}`);
        }
    }

    public setIncludeFilter(text: string) {
        this.includeRegex = this.createFilterRegex(text);
        this.reFilterOutput();
    }

    public setExcludeFilter(text: string) {
        this.excludeRegex = this.createFilterRegex(text);
        this.reFilterOutput();
    }

    public setLevelFilter(text: string) {
        this.logLevelRegex = this.createFilterRegex(text);
        this.reFilterOutput();
    }

    private createFilterRegex(text: string): RegExp | undefined {
        return text?.trim() ? new RegExp(text, 'i') : undefined;
    }

    /**
     * Replace the output channel's contents with the lines in the history that pass the current filters
     */
    private reFilterOutput() {
        this.links.clear();
        this.lineCount = 0;
        const lines: string[] = [];
        for (const line of this.history) {
            if (this.isVisible(line)) {
                lines.push(this.render(line, this.lineCount++));
            }
        }
        if (lines.length > 0) {
            this.outputChannel.replace(lines.join('\n') + '\n');
        } else {
            this.outputChannel.clear();
        }
    }

    public dispose() {
        this.closeLogfile();
    }
}
