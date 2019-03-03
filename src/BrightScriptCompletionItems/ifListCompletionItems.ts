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
        detail: 'ResetIndex() as Boolean',
        documentation: new vscode.MarkdownString(
`
Reset current index or position in list to the head element.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'AddTail',
        insertText: new vscode.SnippetString('AddTail(${1:tval as Dynamic})'),
        detail: 'AddTail(tval as Dynamic) as Void',
        documentation: new vscode.MarkdownString(
`
Add typed value to tail of list.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'AddHead',
        insertText: new vscode.SnippetString('AddHead(${1:tval as Dynamic})'),
        detail: 'AddHead(tval as Dynamic) as Void',
        documentation: new vscode.MarkdownString(
`
Add typed value to head of list.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'RemoveIndex',
        insertText: new vscode.SnippetString('RemoveIndex()'),
        detail: 'RemoveIndex() as Dynamic',
        documentation: new vscode.MarkdownString(
`
Remove entry at current index or position from list and increment index or position in list.

Return invalid when end of list reached
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'GetIndex',
        insertText: new vscode.SnippetString('GetIndex()'),
        detail: 'GetIndex() as Dynamic',
        documentation: new vscode.MarkdownString(
`
Get entry at current index or position from list and increment index or position in list.

Return invalid when end of list reached
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'RemoveTail',
        insertText: new vscode.SnippetString('RemoveTail()'),
        detail: 'RemoveTail() as Dynamic',
        documentation: new vscode.MarkdownString(
`
Remove entry at tail of list.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'RemoveHead',
        insertText: new vscode.SnippetString('RemoveHead()'),
        detail: 'RemoveHead() as Dynamic',
        documentation: new vscode.MarkdownString(
`
Remove entry at head of list.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'GetTail',
        insertText: new vscode.SnippetString('GetTail()'),
        detail: 'GetTail() as Dynamic',
        documentation: new vscode.MarkdownString(
`
Get Object at tail of List and keep Object in list.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'GetHead',
        insertText: new vscode.SnippetString('GetHead()'),
        detail: 'GetHead() as Dynamic',
        documentation: new vscode.MarkdownString(
`
Get entry at head of list and keep entry in list.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'Count',
        insertText: new vscode.SnippetString('Count()'),
        detail: 'Count() as Integer',
        documentation: new vscode.MarkdownString(
`
Return the number of elements in list.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'Clear',
        insertText: new vscode.SnippetString('Clear()'),
        detail: 'Clear() as Void',
        documentation: new vscode.MarkdownString(
`
Remove all elements from list.
`
        )
    },
];
