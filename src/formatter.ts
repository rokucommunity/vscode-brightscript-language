import type { FormattingOptions } from 'brighterscript-formatter';
import { Runner, Formatter as BrighterScriptFormatter } from 'brighterscript-formatter';
import type {
    DocumentRangeFormattingEditProvider,
    TextDocument
} from 'vscode';
import {
    Position,
    Range,
    TextEdit,
    window, workspace
} from 'vscode';
import type * as vscode from 'vscode';
import * as path from 'path';

export class Formatter implements DocumentRangeFormattingEditProvider {

    private getFormatterOptions(document: TextDocument): { bsfmtOptions: FormattingOptions | null; userSettingsOptions: vscode.WorkspaceConfiguration } {
        //TODO is there anything we can to do to better detect when the same file is used in multiple workspaces?
        //vscode seems to pick the lowest workspace (or perhaps the last workspace?)
        const workspaceFolder = workspace.getWorkspaceFolder(document.uri);
        const cwd = workspaceFolder?.uri.fsPath ?? process.cwd();
        const userSettingsOptions = workspace.getConfiguration('brightscript.format');
        const configFile = userSettingsOptions.get<string>('configFile');
        let bsfmtPath: string | undefined;
        if (configFile) {
            // Resolve relative to workspace folder, or process.cwd() if no workspace
            // Note: path.resolve() handles absolute paths correctly (returns them as-is)
            bsfmtPath = path.resolve(cwd, configFile);
        }

        const bsfmtOptions = new Runner().getBsfmtOptions({
            cwd: cwd,
            //we just want bsfmt options...but files is mandatory. Don't worry, we won't actually use it.
            files: [],
            ...(bsfmtPath && { bsfmtPath: bsfmtPath })
        });

        return { bsfmtOptions: bsfmtOptions, userSettingsOptions: userSettingsOptions };
    }

    public async provideDocumentRangeFormattingEdits(document: TextDocument, range: Range, options: vscode.FormattingOptions): Promise<TextEdit[]> {
        const { bsfmtOptions, userSettingsOptions } = this.getFormatterOptions(document);

        try {
            let text = document.getText();
            let formatter = new BrighterScriptFormatter();
            let formattedText = formatter.format(text, <FormattingOptions>{
                //if we found bsfmt.json options, use ONLY those. Otherwise, use any options found from user/workspace settings
                ...(bsfmtOptions ?? userSettingsOptions),
                indentSpaceCount: options.tabSize,
                indentStyle: options.insertSpaces ? 'spaces' : 'tabs',
                formatMultiLineObjectsAndArrays: false
            });

            let edits = this.getEditChunks(document, formattedText, range);

            return edits;
        } catch (e) {
            await window.showErrorMessage(e.message, e.stack.split('\n')[0]);
        }
    }

    private getEditChunks(document: TextDocument, formattedText: string, range: Range) {
        let lines = formattedText?.split(/\r?\n/g);
        //make an edit per line of the doc
        let edits: TextEdit[] = [];
        for (let lineNumber = range.start.line; lineNumber <= range.end.line; lineNumber++) {
            let formattedLine = lines[lineNumber];

            let docLine = document.lineAt(lineNumber);
            let range = new Range(
                new Position(lineNumber, 0),
                new Position(lineNumber, docLine.text.length)
            );
            range = document.validateRange(range);
            let edit = TextEdit.replace(range, formattedLine);
            edits.push(edit);
        }
        return edits;
    }

}
