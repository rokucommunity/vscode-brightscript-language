import {
    CompletionItem,
    CompletionItemKind,
    MarkdownString,
    SnippetString
} from 'vscode';

export const ifSocketConnectionStatusCompletionItems: CompletionItem[] = [
    {
        kind: CompletionItemKind.Method,
        label: 'eConnAborted',
        insertText: new SnippetString('eConnAborted()'),
        documentation: new MarkdownString(
`
    eConnAborted() as Boolean

Return true if errno is ECONNABORTED.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'eConnRefused',
        insertText: new SnippetString('eConnRefused()'),
        documentation: new MarkdownString(
`
    eConnRefused() as Boolean

Return true if errno is ECONNREFUSED.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'eConnReset',
        insertText: new SnippetString('eConnReset()'),
        documentation: new MarkdownString(
`
    eConnReset() as Boolean

Return true if errno is ECONNRESET.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'eIsConn',
        insertText: new SnippetString('eIsConn()'),
        documentation: new MarkdownString(
`
    eIsConn() as Boolean

Return true if errno is EISCONN.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'eNotConn',
        insertText: new SnippetString('eNotConn()'),
        documentation: new MarkdownString(
`
    eNotConn() as Boolean

Return true if errno is ENOTCONN.
`
        )
    }
];
