import {
    CompletionItem,
    CompletionItemKind
} from 'vscode';

import * as vscode from 'vscode';

export const ifTextureRequestCompletionItems: CompletionItem[] = [
    {
        kind: CompletionItemKind.Method,
        label: 'GetId',
        insertText: new vscode.SnippetString('GetId()'),
        documentation: new vscode.MarkdownString(
`
    GetId() as Integer

Returns a unique id for the request.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'GetState',
        insertText: new vscode.SnippetString('GetState()'),
        documentation: new vscode.MarkdownString(
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
        insertText: new vscode.SnippetString('SetAsync(${1:async as Boolean})'),
        documentation: new vscode.MarkdownString(
`
    SetAsync(async as Boolean) as Integer

Sets the request to be either asynchronous (true) or synchronous (false).  The default is asynchronous.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'SetSize',
        insertText: new vscode.SnippetString('SetSize(${1:width as Integer}, ${2:height as Integer})'),
        documentation: new vscode.MarkdownString(
`
    SetSize(width as Integer, height as Integer) as Void

Set the desired size of the roBitmap.  The default is to return a bitmap in its native size.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'SetScaleMode',
        insertText: new vscode.SnippetString('SetScaleMode(${1:mode as Integer})'),
        documentation: new vscode.MarkdownString(
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
