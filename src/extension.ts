import * as vscode from 'vscode';
import { Formatter } from './formatter';

export function activate(context: vscode.ExtensionContext) {
    //register the code formatter
    vscode.languages.registerDocumentFormattingEditProvider({ language: 'brightscript', scheme: 'file' }, new Formatter());
}

export function deactivate() {
}