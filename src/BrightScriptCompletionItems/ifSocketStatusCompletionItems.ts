import {
    CompletionItem,
    CompletionItemKind
} from 'vscode';

import * as vscode from 'vscode';

export const ifSocketStatusCompletionItems: CompletionItem[] = [
    {
        kind: CompletionItemKind.Method,
        label: 'eAgain',
        insertText: new vscode.SnippetString('eAgain()'),
        documentation: new vscode.MarkdownString(
`
    eAgain() as Boolean

Return true if errno is EAGAIN.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'eAlready',
        insertText: new vscode.SnippetString('eAlready()'),
        documentation: new vscode.MarkdownString(
`
    eAlready() as Boolean

Return true if errno is EALREADY.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'eBadAddr',
        insertText: new vscode.SnippetString('eBadAddr()'),
        documentation: new vscode.MarkdownString(
`
    eBadAddr() as Boolean

Return true if errno is EBADADDR.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'eDestAddrReq',
        insertText: new vscode.SnippetString('eDestAddrReq()'),
        documentation: new vscode.MarkdownString(
`
    eDestAddrReq() as Boolean

Return true if errno is EDESTADDRREQ.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'eHostUnreach',
        insertText: new vscode.SnippetString('eHostUnreach()'),
        documentation: new vscode.MarkdownString(
`
    eHostUnreach() as Boolean

Return true if errno is EHOSTUNREACH.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'eInvalid',
        insertText: new vscode.SnippetString('eInvalid()'),
        documentation: new vscode.MarkdownString(
`
    eInvalid() as Boolean

Return true if errno is EINVALID.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'eInProgress',
        insertText: new vscode.SnippetString('eInProgress()'),
        documentation: new vscode.MarkdownString(
`
    eInProgress() as Boolean

Return true if errno is EINPROGRESS.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'eWouldBlock',
        insertText: new vscode.SnippetString('eWouldBlock()'),
        documentation: new vscode.MarkdownString(
`
    eWouldBlock() as Boolean

Return true if errno is EWOULDBLOCK.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'eSuccess',
        insertText: new vscode.SnippetString('eSuccess()'),
        documentation: new vscode.MarkdownString(
`
    eSuccess() as Boolean

Return true if errno is 0 (no errors).
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'eOK',
        insertText: new vscode.SnippetString('eOK()'),
        documentation: new vscode.MarkdownString(
`
    eOK() as Boolean

Return true if errno is has no hard error, but there could be async conditions: EAGAIN, EALREADY, EINPROGRESS, EWOULDBLOCK
`
        )
    }
];
