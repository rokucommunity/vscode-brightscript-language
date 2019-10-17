import { Formatter as BrighterScriptFormatter, FormattingOptions } from 'brighterscript-formatter';
import {
    DocumentRangeFormattingEditProvider,
    EndOfLine,
    Position,
    ProviderResult,
    Range,
    TextDocument,
    TextEdit,
    window, workspace,
} from 'vscode';
import * as vscode from 'vscode';

export class Formatter implements DocumentRangeFormattingEditProvider {

    public provideDocumentRangeFormattingEdits(document: TextDocument, range: Range, options: vscode.FormattingOptions): ProviderResult<TextEdit[]> {
        let config = workspace.getConfiguration('brightscript.format');
        let lineEnding = document.eol === EndOfLine.CRLF ? '\r\n' : '\n';
        try {
            let text = document.getText();
            let formatter = new BrighterScriptFormatter();
            let formattedText = formatter.format(text, <FormattingOptions>{
                indentSpaceCount: options.tabSize,
                indentStyle: options.insertSpaces ? 'spaces' : 'tabs',
                compositeKeywords: config.compositeKeywords,
                keywordCase: config.keywordCase,
                removeTrailingWhiteSpace: config.removeTrailingWhiteSpace,
                keywordCaseOverride: config.keywordCaseOverride,
                formatIndent: config.formatIndent === false ? false : true,
                formatInteriorWhitespace: config.formatInteriorWhitespace === false ? false : true,
                insertSpaceBeforeFunctionParenthesis: config.insertSpaceBeforeFunctionParenthesis === true ? true : false,
                insertSpaceBetweenEmptyCurlyBraces: config.insertSpaceBeforeFunctionParenthesis === true ? true : false
            });

            let edits = getEditChunks(formattedText, range);

            return edits;
        } catch (e) {
            window.showErrorMessage(e.message, e.stack.split('\n')[0]);
        }

        function getEditChunks(formattedText: string, range: Range) {

            let lines = formattedText.split(lineEnding);
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

}
