import * as vscode from 'vscode';
import { BrightScriptFormatter } from 'brightscript-formatter';

export function activate(context: vscode.ExtensionContext) {
    var inwardKeywords = ['sub', 'for', 'while', 'if'];
    var outwardKeywords = ['end', 'exit', 'step'];

    vscode.languages.registerDocumentFormattingEditProvider({ language: 'brightscript', scheme: 'file' }, {
        provideDocumentFormattingEdits(document: vscode.TextDocument): vscode.TextEdit[] {
            try {
                var lastLine = document.lineAt(document.lineCount - 1);
                var range = new vscode.Range(
                    new vscode.Position(0, 0),
                    new vscode.Position(document.lineCount, lastLine.text.length)
                );
                var text = document.getText(range);
                let formatter = new BrightScriptFormatter
                var formattedText = formatter.format(text);
    
                let edit = new vscode.TextEdit(range, formattedText);
                return [edit];
            } catch (e) {
                vscode.window.showErrorMessage(e.message, e.stack.split('\n')[0]);
            }

        }
    });
}

export function deactivate() {
}