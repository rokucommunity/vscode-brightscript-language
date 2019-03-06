import {
    CompletionItem,
    CompletionItemKind,
    MarkdownString,
    SnippetString
} from 'vscode';

export const ifSocketAsyncCompletionItems: CompletionItem[] = [
    {
        kind: CompletionItemKind.Method,
        label: 'IsReadable',
        insertText: new SnippetString('IsReadable()'),
        documentation: new MarkdownString(
`
    IsReadable() as Boolean

Returns true if underlying select determines non-blocking read is possible.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'IsWritable',
        insertText: new SnippetString('IsWritable()'),
        documentation: new MarkdownString(
`
    IsWritable() as Boolean

Returns true if underlying select determines non-blocking write is possible.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'IsException',
        insertText: new SnippetString('IsException()'),
        documentation: new MarkdownString(
`
    IsException() as Boolean

Returns true if underlying select determines non-blocking read of OOB data is possible.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'NotifyReadable',
        insertText: new SnippetString('NotifyReadable(${1:enable as Boolean})'),
        documentation: new MarkdownString(
`
    NotifyReadable(enable as Boolean) as Void

Enable roSocketEvent events to be sent via the message port when the underlying socket becomes readable.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'NotifyWritable',
        insertText: new SnippetString('NotifyWritable(${1:enable as Boolean})'),
        documentation: new MarkdownString(
`
    NotifyWritable(enable as Boolean) as Void

Enable roSocketEvent events to be sent via the message port when the underlying socket becomes writable.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'NotifyException',
        insertText: new SnippetString('NotifyException(${1:enable as Boolean})'),
        documentation: new MarkdownString(
`
    NotifyException(enable as Boolean) as Void

Enable roSocketEvent events to be sent via the message port when the underlying socket gets an exception or OOB data.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'GetID',
        insertText: new SnippetString('GetID()'),
        documentation: new MarkdownString(
`
    GetID() as Integer

Returns a unique identifier that can be compared to the value returned by roSocketEvent.getSocketID() to match the underlying socket that the event is for.
`
        )
    }
];
