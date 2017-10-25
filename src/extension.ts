import * as vscode from 'vscode';
import { BrightScriptFormatter } from 'brightscript-formatter';

export function activate(context: vscode.ExtensionContext) {
    vscode.languages.registerDocumentFormattingEditProvider({ language: 'brightscript', scheme: 'file' }, {
        provideDocumentFormattingEdits(document: vscode.TextDocument, options) {
            let config = vscode.workspace.getConfiguration('brightscript.format');
            let lineEnding = document.eol === vscode.EndOfLine.CRLF ? '\r\n' : '\n';
            try {
                var text = document.getText();
                let formatter = new BrightScriptFormatter
                var formattedText = formatter.format(text, {
                    indentSpaceCount: options.tabSize,
                    indentStyle: options.insertSpaces ? 'spaces' : 'tabs',
                    compositeKeywords: config.compositeKeywords,
                    keywordCase: config.keywordCase
                });

                let edits = getEditChunks(formattedText);

                return edits;
            } catch (e) {
                vscode.window.showErrorMessage(e.message, e.stack.split('\n')[0]);
            }

            function getEditChunks(formattedText: string) {
                let lines = formattedText.split(lineEnding);
                //make an edit per line of the doc
                let edits: vscode.TextEdit[] = [];
                for (let lineNumber = 0; lineNumber < document.lineCount; lineNumber++) {
                    let formattedLine = lines[lineNumber];

                    let docLine = document.lineAt(lineNumber);
                    var range = new vscode.Range(
                        new vscode.Position(lineNumber, 0),
                        new vscode.Position(lineNumber, docLine.text.length)
                    );
                    let validatedRange = document.validateRange(range);
                    let edit = vscode.TextEdit.replace(range, formattedLine);
                    edits.push(edit);
                }
                return edits;
            }
        }
    });
}

export function deactivate() {
}