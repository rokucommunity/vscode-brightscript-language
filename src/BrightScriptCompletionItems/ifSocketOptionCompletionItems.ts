import {
    CompletionItem,
    CompletionItemKind,
    MarkdownString,
    SnippetString
} from 'vscode';

export const ifSocketOptionCompletionItems: CompletionItem[] = [
    {
        kind: CompletionItemKind.Method,
        label: 'GetTTL',
        insertText: new SnippetString('GetTTL()'),
        documentation: new MarkdownString(
`
    GetTTL() as Integer

Return the integer TTL (Time To Live) value for all IP packets on the socket.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'SetTTL',
        insertText: new SnippetString('SetTTL(${1:ttl as Integer})'),
        documentation: new MarkdownString(
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
        insertText: new SnippetString('GetReuseAddr()'),
        documentation: new MarkdownString(
`
    GetReuseAddr() as Boolean

Return true if an address that has been previously assigned can be immediately reassigned.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'SetReuseAddr',
        insertText: new SnippetString('SetReuseAddr(${1:reuse as Boolean})'),
        documentation: new MarkdownString(
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
        insertText: new SnippetString('GetOOBInline()'),
        documentation: new MarkdownString(
`
    GetOOBInline() as Boolean

Return true if Out Of Bounds data is read inline with regular data.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'SetOOBInline',
        insertText: new SnippetString('SetOOBInline(${1:inline as Boolean})'),
        documentation: new MarkdownString(
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
        insertText: new SnippetString('GetSendBuf()'),
        documentation: new MarkdownString(
`
    GetSendBuf() as Integer

Return the current send buffer size.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'SetSendBuf',
        insertText: new SnippetString('SetSendBuf(${1:size as Integer})'),
        documentation: new MarkdownString(
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
        insertText: new SnippetString('GetRcvBuf()'),
        documentation: new MarkdownString(
`
    GetRcvBuf() as Integer

Return the current receive buffer size.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'SetRcvBuf',
        insertText: new SnippetString('SetRcvBuf(${1:size as Integer})'),
        documentation: new MarkdownString(
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
        insertText: new SnippetString('GetSendTimeout()'),
        documentation: new MarkdownString(
`
    GetSendTimeout() as Integer

Return the current send timeout, in seconds.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'SetSendTimeout',
        insertText: new SnippetString('SetSendTimeout(${1:timeout as Integer})'),
        documentation: new MarkdownString(
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
        insertText: new SnippetString('GetReceiveTimeout()'),
        documentation: new MarkdownString(
`
    GetReceiveTimeout() as Integer

Return the current receive timeout, in seconds.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'SetReceiveTimeout',
        insertText: new SnippetString('SetReceiveTimeout(${1:timeout as Integer})'),
        documentation: new MarkdownString(
`
    SetReceiveTimeout(timeout as Integer) as Boolean

Set the current receive timeout, in seconds.

Returns true if successfully set.
`
        )
    }
];
