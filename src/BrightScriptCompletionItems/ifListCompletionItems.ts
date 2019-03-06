import {
    CompletionItem,
    CompletionItemKind,
    MarkdownString,
    SnippetString
} from 'vscode';

export const ifListCompletionItems: CompletionItem[] = [
    {
        kind: CompletionItemKind.Method,
        label: 'ResetIndex',
        insertText: new SnippetString('ResetIndex()'),
        documentation: new MarkdownString(
`
    ResetIndex() as Boolean

Reset current index or position in list to the head element.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'AddTail',
        insertText: new SnippetString('AddTail(${1:tval as Dynamic})'),
        documentation: new MarkdownString(
`
    AddTail(tval as Dynamic) as Void

Add typed value to tail of list.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'AddHead',
        insertText: new SnippetString('AddHead(${1:tval as Dynamic})'),
        documentation: new MarkdownString(
`
    AddHead(tval as Dynamic) as Void

Add typed value to head of list.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'RemoveIndex',
        insertText: new SnippetString('RemoveIndex()'),
        documentation: new MarkdownString(
`
    RemoveIndex() as Dynamic

Remove entry at current index or position from list and increment index or position in list.

Return invalid when end of list reached
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'GetIndex',
        insertText: new SnippetString('GetIndex()'),
        documentation: new MarkdownString(
`
    GetIndex() as Dynamic

Get entry at current index or position from list and increment index or position in list.

Return invalid when end of list reached
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'RemoveTail',
        insertText: new SnippetString('RemoveTail()'),
        documentation: new MarkdownString(
`
    RemoveTail() as Dynamic

Remove entry at tail of list.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'RemoveHead',
        insertText: new SnippetString('RemoveHead()'),
        documentation: new MarkdownString(
`
    RemoveHead() as Dynamic

Remove entry at head of list.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'GetTail',
        insertText: new SnippetString('GetTail()'),
        documentation: new MarkdownString(
`
    GetTail() as Dynamic

Get Object at tail of List and keep Object in list.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'GetHead',
        insertText: new SnippetString('GetHead()'),
        documentation: new MarkdownString(
`
    GetHead() as Dynamic

Get entry at head of list and keep entry in list.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'Count',
        insertText: new SnippetString('Count()'),
        documentation: new MarkdownString(
`
    Count() as Integer

Return the number of elements in list.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'Clear',
        insertText: new SnippetString('Clear()'),
        documentation: new MarkdownString(
`
    Clear() as Void

Remove all elements from list.
`
        )
    }
];
