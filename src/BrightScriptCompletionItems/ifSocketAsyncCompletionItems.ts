import {
    CompletionItem,
    CompletionItemKind
} from 'vscode';

import * as vscode from 'vscode';

export const ifSocketAsyncCompletionItems: CompletionItem[] = [
    {
        kind: CompletionItemKind.Method,
        label: 'IsReadable',
        insertText: new vscode.SnippetString('IsReadable()'),
        documentation: new vscode.MarkdownString(
`
    IsReadable() as Boolean

Returns true if underlying select determines non-blocking read is possible.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'IsWritable',
        insertText: new vscode.SnippetString('IsWritable()'),
        documentation: new vscode.MarkdownString(
`
    IsWritable() as Boolean

Returns true if underlying select determines non-blocking write is possible.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'IsException',
        insertText: new vscode.SnippetString('IsException()'),
        documentation: new vscode.MarkdownString(
`
    IsException() as Boolean

Returns true if underlying select determines non-blocking read of OOB data is possible.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'NotifyReadable',
        insertText: new vscode.SnippetString('NotifyReadable(${1:enable as Boolean})'),
        documentation: new vscode.MarkdownString(
`
    NotifyReadable(enable as Boolean) as Void

Enable roSocketEvent events to be sent via the message port when the underlying socket becomes readable.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'NotifyWritable',
        insertText: new vscode.SnippetString('NotifyWritable(${1:enable as Boolean})'),
        documentation: new vscode.MarkdownString(
`
    NotifyWritable(enable as Boolean) as Void

Enable roSocketEvent events to be sent via the message port when the underlying socket becomes writable.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'NotifyException',
        insertText: new vscode.SnippetString('NotifyException(${1:enable as Boolean})'),
        documentation: new vscode.MarkdownString(
`
    NotifyException(enable as Boolean) as Void

Enable roSocketEvent events to be sent via the message port when the underlying socket gets an exception or OOB data.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'GetID',
        insertText: new vscode.SnippetString('GetID()'),
        documentation: new vscode.MarkdownString(
`
    GetID() as Integer

Returns a unique identifier that can be compared to the value returned by roSocketEvent.getSocketID() to match the underlying socket that the event is for.
`
        )
    },
];
