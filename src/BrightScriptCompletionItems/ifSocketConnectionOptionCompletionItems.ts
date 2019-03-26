import {
    CompletionItem,
    CompletionItemKind,
    MarkdownString,
    SnippetString
} from 'vscode';

export const ifSocketConnectionOptionCompletionItems: CompletionItem[] = [
    {
        kind: CompletionItemKind.Method,
        label: 'GetKeepAlive',
        insertText: new SnippetString('GetKeepAlive()'),
        documentation: new MarkdownString(
`
    GetKeepAlive() as Boolean

Return true if keep alive is set.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'SetKeepAlive',
        insertText: new SnippetString('SetKeepAlive(${1:enable as Boolean})'),
        documentation: new MarkdownString(
`
    SetKeepAlive(enable as Boolean) as Boolean

Enable keep alive if enable is true, otherwise disable it.

If keep alive set, occasional no-data packets will be sent to keep the connection alive.

Returns true if successfully set.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'GetLinger',
        insertText: new SnippetString('GetLinger()'),
        documentation: new MarkdownString(
`
    GetLinger() as Integer

Return the max time in seconds that the socket close() blocks to allow send data to be flushed in synchronous mode.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'SetLinger',
        insertText: new SnippetString('SetLinger(${1:time as Integer})'),
        documentation: new MarkdownString(
`
    SetLinger(time as Integer) as Boolean

Set the max time in seconds that the socket close() blocks to allow send data to be flushed in synchronous mode.

Returns true if successfully set.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'GetMaxSeg',
        insertText: new SnippetString('GetMaxSeg()'),
        documentation: new MarkdownString(
`
    GetMaxSeg() as Integer

Return the max TCP segment size.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'SetMaxSeg',
        insertText: new SnippetString('SetMaxSeg(${1:time as Integer})'),
        documentation: new MarkdownString(
`
    SetMaxSeg(time as Integer) as Boolean

Set the max TCP segment size.

Returns true if successfully set.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'GetNoDelay',
        insertText: new SnippetString('GetNoDelay()'),
        documentation: new MarkdownString(
`
    GetNoDelay() as Boolean

Return true if no delay is on.

With no delay on, data is sent as soon as it is available rather than waiting for enough data to fill a segment.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'SetNoDelay',
        insertText: new SnippetString('SetNoDelay(${1:enable as Boolean})'),
        documentation: new MarkdownString(
`
    SetNoDelay(enable as Boolean) as Boolean

Enable the No Delay property on the socket.

If No Delay is set, data is sent as soon as it is available rather than waiting for enough data to fill a segment.

Returns true if successfully set.
`
        )
    }
];
