import {
    CompletionItem,
    CompletionItemKind
} from 'vscode';

import * as vscode from 'vscode';

export const ifTextureManagerCompletionItems: CompletionItem[] = [
    {
        kind: CompletionItemKind.Method,
        label: 'RequestTexture',
        insertText: new vscode.SnippetString('RequestTexture(${1:req as Object})'),
        documentation: new vscode.MarkdownString(
`
    RequestTexture(req as Object) as Void

req should be an roTextureRequest. Makes a request for an roBitmap with the attributes specified by the roTextureRequest.
The roTextureManager will pass an roTextureRequestEvent to the message port when completed.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'CancelRequest',
        insertText: new vscode.SnippetString('CancelRequest(${1:req as Object})'),
        documentation: new vscode.MarkdownString(
`
    CancelRequest(req as Object) as Void

Cancels the request specified by req, which should be an roTextureRequest previously passed to RequestTexture().
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'UnloadBitmap',
        insertText: new vscode.SnippetString('UnloadBitmap(${1:url as String})'),
        documentation: new vscode.MarkdownString(
`
    UnloadBitmap(url as String) as Void

Removes a bitmap from the roTextureManager with the specified URL.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'Cleanup',
        insertText: new vscode.SnippetString('Cleanup()'),
        documentation: new vscode.MarkdownString(
`
    Cleanup() as Void

Removes all bitmaps from the roTextureManager.
`
        )
    },
];
