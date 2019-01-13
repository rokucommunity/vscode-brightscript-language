import {
    CancellationToken,
    CompletionItem,
    CompletionItemKind,
    CompletionItemProvider,
    Position, TextDocument
} from 'vscode';

import * as vscode from 'vscode';

export class BrightScriptCompletionItemProvider implements CompletionItemProvider {
    private Command = CompletionItemKind.Function;

    private BuiltinCompletionItems: CompletionItem[] = [
        //WIP - can do way better than this!
        {
            label: 'print',
            kind: this.Command,
        },
        {
            label: 'createObject',
            kind: this.Command,
        },
    ];

    public provideCompletionItems(document: TextDocument, position: Position, token: CancellationToken, context: vscode.CompletionContext): CompletionItem[] {
        //TODO - do something useful here!
        return this.BuiltinCompletionItems;
    }
}
