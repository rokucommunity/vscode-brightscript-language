import { BrightScriptFormatter } from 'brightscript-formatter';
import {
    DocumentRangeFormattingEditProvider,
    EndOfLine,
    FormattingOptions,
    Position,
    ProviderResult,
    Range,
    TextDocument,
    TextEdit,
    window, workspace,
} from 'vscode';

export class Formatter implements DocumentRangeFormattingEditProvider {

    public provideDocumentRangeFormattingEdits(document: TextDocument, range: Range, options: FormattingOptions): ProviderResult<TextEdit[]> {
        let config = workspace.getConfiguration('brightscript.format');
        let lineEnding = document.eol === EndOfLine.CRLF ? '\r\n' : '\n';
        try {
            let text = document.getText();
            let formatter = new BrightScriptFormatter();
            let formattedText = formatter.format(text, {
                indentSpaceCount: options.tabSize,
                indentStyle: options.insertSpaces ? 'spaces' : 'tabs',
                compositeKeywords: config.compositeKeywords,
                keywordCase: config.keywordCase,
                removeTrailingWhiteSpace: config.removeTrailingWhiteSpace
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
