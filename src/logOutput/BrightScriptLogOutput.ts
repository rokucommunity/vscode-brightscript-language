import * as vscode from 'vscode';
import * as fsExtra from 'fs-extra';
import stripAnsi from 'strip-ansi';
import { isLaunchStartEvent, isLogOutputEvent } from 'roku-debug';
import type { DeclarationProvider } from '../DeclarationProvider';
import type { BrightScriptLaunchConfiguration } from '../DebugConfigurationProvider';
import { createLogger } from '../logging';
import { util } from '../util';
import type { LogOutput } from './LogOutput';
import { isBrightScriptLogDocument } from './LogOutput';
import type { FileReference } from './logLineUtils';
import { annotateErrorCodes, findFileReference } from './logLineUtils';
import { PkgPathResolver } from './PkgPathResolver';

const logger = createLogger('BrightScriptLogOutput');

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
 *
 * Filtering is left to the filter box built into VS Code's Output panel, which hides lines without changing
 * the document, so the links never move.
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
            //these commands (and their keybindings) are still contributed for the legacy implementation
            ...[
                'extension.brightscript.setOutputIncludeFilter',
                'extension.brightscript.setOutputLogLevelFilter',
                'extension.brightscript.setOutputExcludeFilter'
            ].map(command => vscode.commands.registerCommand(command, () => this.showFilterHelp()))
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
    public appendLine(text: string) {
        const lines = text.split(/\r?\n/g);
        //drop the empty line that a trailing newline leaves behind
        if (lines[lines.length - 1] === '') {
            lines.pop();
        }
        for (const rawLine of lines) {
            const outputLines = (rawLine !== '' && !this.includeStackTraces) ? this.filterDebuggerNoise(rawLine) : [rawLine];
            for (const outputLine of outputLines) {
                const line = annotateErrorCodes(stripAnsi(outputLine));
                this.outputChannel.appendLine(this.render(line, this.lineCount++));
                this.writeToLogfile(line);
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

    /**
     * Get the text for a line as it appears in the output channel at `lineNumber`, and record its link (if it has one)
     */
    private render(line: string, lineNumber: number): string {
        const reference = findFileReference(line);
        if (!reference) {
            return line;
        }
        const fsPath = reference.isFilePath ? reference.path : this.pkgPathResolver.resolve(reference.path);

        const linkText = this.getLinkText(reference, fsPath, lineNumber);
        const text = line.substring(0, reference.index) + linkText + line.substring(reference.index + reference.length);
        if (fsPath) {
            let target = vscode.Uri.file(fsPath);
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

    private getLinkText(reference: FileReference, fsPath: string | undefined, lineNumber: number): string {
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
                if ((reference.extension === '.brs' || reference.extension === '.bs') && this.fileExists(fsPath)) {
                    const methodName = this.declarationProvider.getFunctionBeforeLine(fsPath, reference.lineNumber)?.name;
                    if (methodName) {
                        return `${reference.filename}.${methodName}(${reference.lineNumber})`;
                    }
                }
                return `${reference.path}(${reference.lineNumber})`;
        }
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
                logger.error(`Error writing to logfile ${logfilePath}`, error);
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
        this.lineCount = 0;
        this.links.clear();
        this.outputChannel.clear();
    }

    public markOutput() {
        this.appendLine(`---------------------- MARK ${this.markCount} ----------------------`);
        this.markCount++;
    }

    /**
     * The old include/exclude/level filter commands are replaced by the Output panel's own filter box
     */
    private async showFilterHelp() {
        this.outputChannel.show();
        await vscode.window.showInformationMessage(
            'To filter the BrightScript Log, use the filter box at the top of the Output panel. ' +
            `To go back to the previous filter commands, enable the "brightscript.output.useLegacyLogOutput" setting.`
        );
    }

    public dispose() {
        this.closeLogfile();
    }
}
