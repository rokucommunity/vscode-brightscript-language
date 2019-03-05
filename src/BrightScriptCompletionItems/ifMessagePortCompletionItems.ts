import {
    CompletionItem,
    CompletionItemKind
} from 'vscode';

import * as vscode from 'vscode';

export const ifMessagePortCompletionItems: CompletionItem[] = [
    {
        kind: CompletionItemKind.Method,
        label: 'WaitMessage',
        insertText: new vscode.SnippetString('WaitMessage(${1:timeout as Integer})'),
        documentation: new vscode.MarkdownString(
`
    WaitMessage(timeout as Integer) as Dynamic

Waits until an event object is available or timeout milliseconds have passed. If an event is available, it is returned. If the timeout expires, invalid is returned.
If timeout is zero, waits indefinitely for a message, with no timeout.

The Brightscript wait() native function can also be used to get the event object which WaitMessage() would return.  That is, these two statements have the same effect:

    msg = port.WaitMessage(timeout)
    msg = wait(timeout, port)
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'GetMessage',
        insertText: new vscode.SnippetString('GetMessage()'),
        documentation: new vscode.MarkdownString(
`
    GetMessage() as Dynamic

If an event object is available, it is returned. Otherwise invalid is returned. The method returns immediately in either case and does not wait.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'PeekMessage',
        insertText: new vscode.SnippetString('PeekMessage()'),
        documentation: new vscode.MarkdownString(
`
    PeekMessage() as Dynamic

Similar to GetMessage() but the returned object (if not invalid) remains in the message queue. A later call to WaitMessage(), GetMessage() or PeekMessage() will return the same message.
`
        )
    }
];
