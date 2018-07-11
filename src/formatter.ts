import { TextDocument, TextEdit, Position, Range, window, EndOfLine, workspace, FormattingOptions } from 'vscode';
import { BrightScriptFormatter } from 'brightscript-formatter';

export class Formatter {
    provideDocumentFormattingEdits(document: TextDocument, options: FormattingOptions) {
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

            let edits = getEditChunks(formattedText);

            return edits;
        } catch (e) {
            window.showErrorMessage(e.message, e.stack.split('\n')[0]);
        }

        function getEditChunks(formattedText: string) {
            let lines = formattedText.split(lineEnding);
            //make an edit per line of the doc
            let edits: TextEdit[] = [];
            for (let lineNumber = 0; lineNumber < document.lineCount; lineNumber++) {
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