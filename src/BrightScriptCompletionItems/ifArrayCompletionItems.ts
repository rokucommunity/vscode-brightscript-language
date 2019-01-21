import {
    CompletionItem,
    CompletionItemKind
} from 'vscode';

import * as vscode from 'vscode';

export const ifArrayCompletionItems: CompletionItem[] = [
    {
        kind: CompletionItemKind.Method,
        label: 'Peek',
        insertText: new vscode.SnippetString('Peek()'),
        detail: 'Peek() as Dynamic',
        documentation: new vscode.MarkdownString(
`
Returns the last (highest index) array entry without removing it.  If the array is empty, returns invalid.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'Pop',
        insertText: new vscode.SnippetString('Pop()'),
        detail: 'Pop() as Dynamic',
        documentation: new vscode.MarkdownString(
`
Returns the last (highest index) array entry and removes it from the array.  If the array is empty, returns invalid and does not change the array.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'Push',
        insertText: new vscode.SnippetString('Push(${1:tvalue as Dynamic})'),
        detail: 'Push(tvalue as Dynamic) as Void',
        documentation: new vscode.MarkdownString(
`
Adds tvalue as the new highest index entry in the array (adds to the end of the array).
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'Shift',
        insertText: new vscode.SnippetString('Shift()'),
        detail: 'Shift() as Dynamic',
        documentation: new vscode.MarkdownString(
`
Removes the index zero entry from the array and shifts every other entry down one to fill the hole.  Returns the removed entry.
This is like a Pop from the start of the array instead of the end.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'Unshift',
        insertText: new vscode.SnippetString('Unshift(${1:tvalue as Dynamic})'),
        detail: 'Unshift(tvalue as Dynamic) as Void',
        documentation: new vscode.MarkdownString(
`
Adds a new index zero to the array and shifts every other entry up one to accommodate. This is like a Push to the start of the array instead of the end.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'Delete',
        insertText: new vscode.SnippetString('Delete(${1:index as Integer})'),
        detail: 'Delete(index as Integer) as Boolean',
        documentation: new vscode.MarkdownString(
`
Deletes the indicated array entry, and shifts down all entries above to fill the hole. The array length is decreased by one.
If the entry was successfully deleted, returns true.  If index is out of range, returns false and does not change the array.
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
Returns the length of the array; that is, one more than the index of highest entry.
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
Deletes every entry in the array.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'Append',
        insertText: new vscode.SnippetString('Append(${1:array as Object})'),
        detail: 'Append(array as Object) as Void',
        documentation: new vscode.MarkdownString(
`
Appends each entry of one roArray to another. If the passed Array contains "holes" (entries that were never set to a value), they are not appended.
`
        )
    }
];
