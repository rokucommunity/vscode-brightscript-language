import {
    CompletionItem,
    CompletionItemKind
} from 'vscode';

import * as vscode from 'vscode';

export const ifListCompletionItems: CompletionItem[] = [
    {
        kind: CompletionItemKind.Method,
        label: 'ResetIndex',
        insertText: new vscode.SnippetString('ResetIndex()'),
        documentation: new vscode.MarkdownString(
`
    ResetIndex() as Boolean

Reset current index or position in list to the head element.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'AddTail',
        insertText: new vscode.SnippetString('AddTail(${1:tval as Dynamic})'),
        documentation: new vscode.MarkdownString(
`
    AddTail(tval as Dynamic) as Void

Add typed value to tail of list.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'AddHead',
        insertText: new vscode.SnippetString('AddHead(${1:tval as Dynamic})'),
        documentation: new vscode.MarkdownString(
`
    AddHead(tval as Dynamic) as Void

Add typed value to head of list.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'RemoveIndex',
        insertText: new vscode.SnippetString('RemoveIndex()'),
        documentation: new vscode.MarkdownString(
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
        insertText: new vscode.SnippetString('GetIndex()'),
        documentation: new vscode.MarkdownString(
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
        insertText: new vscode.SnippetString('RemoveTail()'),
        documentation: new vscode.MarkdownString(
`
    RemoveTail() as Dynamic

Remove entry at tail of list.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'RemoveHead',
        insertText: new vscode.SnippetString('RemoveHead()'),
        documentation: new vscode.MarkdownString(
`
    RemoveHead() as Dynamic

Remove entry at head of list.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'GetTail',
        insertText: new vscode.SnippetString('GetTail()'),
        documentation: new vscode.MarkdownString(
`
    GetTail() as Dynamic

Get Object at tail of List and keep Object in list.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'GetHead',
        insertText: new vscode.SnippetString('GetHead()'),
        documentation: new vscode.MarkdownString(
`
    GetHead() as Dynamic

Get entry at head of list and keep entry in list.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'Count',
        insertText: new vscode.SnippetString('Count()'),
        documentation: new vscode.MarkdownString(
`
    Count() as Integer

Return the number of elements in list.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'Clear',
        insertText: new vscode.SnippetString('Clear()'),
        documentation: new vscode.MarkdownString(
`
    Clear() as Void

Remove all elements from list.
`
        )
    },
];
