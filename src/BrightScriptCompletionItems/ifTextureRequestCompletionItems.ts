import {
    CompletionItem,
    CompletionItemKind,
    MarkdownString,
    SnippetString
} from 'vscode';

export const ifTextureRequestCompletionItems: CompletionItem[] = [
    {
        kind: CompletionItemKind.Method,
        label: 'GetId',
        insertText: new SnippetString('GetId()'),
        documentation: new MarkdownString(
`
    GetId() as Integer

Returns a unique id for the request.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'GetState',
        insertText: new SnippetString('GetState()'),
        documentation: new MarkdownString(
`
    GetState() as Integer

Returns the state of the request.

Value | State
--- | ---
0 | Requested
1 | Downloading
2 | Downloaded
3 | Ready
4 | Failed
5 | Cancelled
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'SetAsync',
        insertText: new SnippetString('SetAsync(${1:async as Boolean})'),
        documentation: new MarkdownString(
`
    SetAsync(async as Boolean) as Integer

Sets the request to be either asynchronous (true) or synchronous (false).  The default is asynchronous.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'SetSize',
        insertText: new SnippetString('SetSize(${1:width as Integer}, ${2:height as Integer})'),
        documentation: new MarkdownString(
`
    SetSize(width as Integer, height as Integer) as Void

Set the desired size of the roBitmap.  The default is to return a bitmap in its native size.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'SetScaleMode',
        insertText: new SnippetString('SetScaleMode(${1:mode as Integer})'),
        documentation: new MarkdownString(
`
    SetScaleMode(mode as Integer)

Set the scaling mode to be used. The default is zero.

Value | Mode
--- | ---
0 | Nearest neighbor (fast)
1 | Bilinear (smooth)
`
        )
    }
];
