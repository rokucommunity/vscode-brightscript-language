import {
    CompletionItem,
    CompletionItemKind
} from 'vscode';

import * as vscode from 'vscode';

export const ifScreenCompletionItems: CompletionItem[] = [
    {
        kind: CompletionItemKind.Method,
        label: 'SwapBuffers',
        insertText: new vscode.SnippetString('SwapBuffers()'),
        documentation: new vscode.MarkdownString(
`
    SwapBuffers() as Void

This function first operates the same as a call to ifDraw2D.Finish(), completing all queued drawing operations on the back buffer (draw surface).

If the screen is single buffered, SwapBuffers() returns immediately after this operation.

If the screen is double buffered, SwapBuffers swaps the back buffer with the front buffer, so the back buffer is now visible.
The new back buffer should be assumed to be in a garbage state after this call is complete, which means you will need to re-render the entire frame before a subsequent call to SwapBuffers.
This call will not return until the back buffer is ready to be drawn on to. Depending on the implementation, it may take up to a single video frame period for the new front buffer to become visible.

This operation is extremely fast (that is, it never copies a bitmap from one location to another), and is guaranteed not to "tear" the visible image.
`
        )
    }
];
