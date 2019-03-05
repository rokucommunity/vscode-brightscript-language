import {
    CompletionItem,
    CompletionItemKind
} from 'vscode';

import * as vscode from 'vscode';

export const ifSocketOptionCompletionItems: CompletionItem[] = [
    {
        kind: CompletionItemKind.Method,
        label: 'GetTTL',
        insertText: new vscode.SnippetString('GetTTL()'),
        documentation: new vscode.MarkdownString(
`
    GetTTL() as Integer

Return the integer TTL (Time To Live) value for all IP packets on the socket.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'SetTTL',
        insertText: new vscode.SnippetString('SetTTL(${1:ttl as Integer})'),
        documentation: new vscode.MarkdownString(
`
    SetTTL(ttl as Integer) as Boolean

Set the integer TTL (Time To Live) value for all IP packets on the socket.

Returns true if successfully set.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'GetReuseAddr',
        insertText: new vscode.SnippetString('GetReuseAddr()'),
        documentation: new vscode.MarkdownString(
`
    GetReuseAddr() as Boolean

Return true if an address that has been previously assigned can be immediately reassigned.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'SetReuseAddr',
        insertText: new vscode.SnippetString('SetReuseAddr(${1:reuse as Boolean})'),
        documentation: new vscode.MarkdownString(
`
    SetReuseAddr(reuse as Boolean)

Set the whether an address that has been previously assigned can be immediately reassigned.

Returns true if successfully set.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'GetOOBInline',
        insertText: new vscode.SnippetString('GetOOBInline()'),
        documentation: new vscode.MarkdownString(
`
    GetOOBInline() as Boolean

Return true if Out Of Bounds data is read inline with regular data.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'SetOOBInline',
        insertText: new vscode.SnippetString('SetOOBInline(${1:inline as Boolean})'),
        documentation: new vscode.MarkdownString(
`
    SetOOBInline(inline as Boolean) as Boolean

Set whether OOB data is received in regular read.

Returns true if successfully set.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'GetSendBuf',
        insertText: new vscode.SnippetString('GetSendBuf()'),
        documentation: new vscode.MarkdownString(
`
    GetSendBuf() as Integer

Return the current send buffer size.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'SetSendBuf',
        insertText: new vscode.SnippetString('SetSendBuf(${1:size as Integer})'),
        documentation: new vscode.MarkdownString(
`
    SetSendBuf(size as Integer) as Boolean

Set the current send buffer size.

Returns true if successfully set.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'GetRcvBuf',
        insertText: new vscode.SnippetString('GetRcvBuf()'),
        documentation: new vscode.MarkdownString(
`
    GetRcvBuf() as Integer

Return the current receive buffer size.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'SetRcvBuf',
        insertText: new vscode.SnippetString('SetRcvBuf(${1:size as Integer})'),
        documentation: new vscode.MarkdownString(
`
    SetRcvBuf(size as Integer) as Boolean

Set the current receive buffer size.

Returns true if successfully set.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'GetSendTimeout',
        insertText: new vscode.SnippetString('GetSendTimeout()'),
        documentation: new vscode.MarkdownString(
`
    GetSendTimeout() as Integer

Return the current send timeout, in seconds.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'SetSendTimeout',
        insertText: new vscode.SnippetString('SetSendTimeout(${1:timeout as Integer})'),
        documentation: new vscode.MarkdownString(
`
    SetSendTimeout(timeout as Integer) as Boolean

Set the current send timeout, in seconds.

Returns true if successfully set.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'GetReceiveTimeout',
        insertText: new vscode.SnippetString('GetReceiveTimeout()'),
        documentation: new vscode.MarkdownString(
`
    GetReceiveTimeout() as Integer

Return the current receive timeout, in seconds.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'SetReceiveTimeout',
        insertText: new vscode.SnippetString('SetReceiveTimeout(${1:timeout as Integer})'),
        documentation: new vscode.MarkdownString(
`
    SetReceiveTimeout(timeout as Integer) as Boolean

Set the current receive timeout, in seconds.

Returns true if successfully set.
`
        )
    },
];
