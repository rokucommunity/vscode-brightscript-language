import {
    CompletionItem,
    CompletionItemKind,
    MarkdownString,
    SnippetString
} from 'vscode';

export const ifSocketStatusCompletionItems: CompletionItem[] = [
    {
        kind: CompletionItemKind.Method,
        label: 'eAgain',
        insertText: new SnippetString('eAgain()'),
        documentation: new MarkdownString(
`
    eAgain() as Boolean

Return true if errno is EAGAIN.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'eAlready',
        insertText: new SnippetString('eAlready()'),
        documentation: new MarkdownString(
`
    eAlready() as Boolean

Return true if errno is EALREADY.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'eBadAddr',
        insertText: new SnippetString('eBadAddr()'),
        documentation: new MarkdownString(
`
    eBadAddr() as Boolean

Return true if errno is EBADADDR.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'eDestAddrReq',
        insertText: new SnippetString('eDestAddrReq()'),
        documentation: new MarkdownString(
`
    eDestAddrReq() as Boolean

Return true if errno is EDESTADDRREQ.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'eHostUnreach',
        insertText: new SnippetString('eHostUnreach()'),
        documentation: new MarkdownString(
`
    eHostUnreach() as Boolean

Return true if errno is EHOSTUNREACH.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'eInvalid',
        insertText: new SnippetString('eInvalid()'),
        documentation: new MarkdownString(
`
    eInvalid() as Boolean

Return true if errno is EINVALID.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'eInProgress',
        insertText: new SnippetString('eInProgress()'),
        documentation: new MarkdownString(
`
    eInProgress() as Boolean

Return true if errno is EINPROGRESS.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'eWouldBlock',
        insertText: new SnippetString('eWouldBlock()'),
        documentation: new MarkdownString(
`
    eWouldBlock() as Boolean

Return true if errno is EWOULDBLOCK.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'eSuccess',
        insertText: new SnippetString('eSuccess()'),
        documentation: new MarkdownString(
`
    eSuccess() as Boolean

Return true if errno is 0 (no errors).
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'eOK',
        insertText: new SnippetString('eOK()'),
        documentation: new MarkdownString(
`
    eOK() as Boolean

Return true if errno is has no hard error, but there could be async conditions: EAGAIN, EALREADY, EINPROGRESS, EWOULDBLOCK
`
        )
    }
];
