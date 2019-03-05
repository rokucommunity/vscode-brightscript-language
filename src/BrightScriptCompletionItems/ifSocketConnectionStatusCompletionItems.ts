import {
    CompletionItem,
    CompletionItemKind
} from 'vscode';

import * as vscode from 'vscode';

export const ifSocketConnectionStatusCompletionItems: CompletionItem[] = [
    {
        kind: CompletionItemKind.Method,
        label: 'eConnAborted',
        insertText: new vscode.SnippetString('eConnAborted()'),
        documentation: new vscode.MarkdownString(
`
    eConnAborted() as Boolean

Return true if errno is ECONNABORTED.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'eConnRefused',
        insertText: new vscode.SnippetString('eConnRefused()'),
        documentation: new vscode.MarkdownString(
`
    eConnRefused() as Boolean

Return true if errno is ECONNREFUSED.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'eConnReset',
        insertText: new vscode.SnippetString('eConnReset()'),
        documentation: new vscode.MarkdownString(
`
    eConnReset() as Boolean

Return true if errno is ECONNRESET.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'eIsConn',
        insertText: new vscode.SnippetString('eIsConn()'),
        documentation: new vscode.MarkdownString(
`
    eIsConn() as Boolean

Return true if errno is EISCONN.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'eNotConn',
        insertText: new vscode.SnippetString('eNotConn()'),
        documentation: new vscode.MarkdownString(
`
    eNotConn() as Boolean

Return true if errno is ENOTCONN.
`
        )
    },
];
