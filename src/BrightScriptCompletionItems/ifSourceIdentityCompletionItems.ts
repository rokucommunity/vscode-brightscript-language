import {
    CompletionItem,
    CompletionItemKind
} from 'vscode';

import * as vscode from 'vscode';

export const ifSourceIdentityCompletionItems: CompletionItem[] = [
    {
        kind: CompletionItemKind.Method,
        label: 'GetSourceIdentity',
        insertText: new vscode.SnippetString('GetSourceIdentity()'),
        documentation: new vscode.MarkdownString(
`
    GetSourceIdentity() as Integer

Return the id currently associated with this source (event generating) or event object.
`
        )
    }
];
