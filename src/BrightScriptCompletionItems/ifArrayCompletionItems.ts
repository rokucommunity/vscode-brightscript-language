import {
    CompletionItem,
    CompletionItemKind,
    MarkdownString,
    SnippetString
} from 'vscode';

export const ifArrayCompletionItems: CompletionItem[] = [
    {
        kind: CompletionItemKind.Method,
        label: 'Peek',
        insertText: new SnippetString('Peek()'),
        documentation: new MarkdownString(
`
    Peek() as Dynamic

Returns the last (highest index) array entry without removing it.  If the array is empty, returns invalid.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'Pop',
        insertText: new SnippetString('Pop()'),
        documentation: new MarkdownString(
`
    Pop() as Dynamic

Returns the last (highest index) array entry and removes it from the array.  If the array is empty, returns invalid and does not change the array.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'Push',
        insertText: new SnippetString('Push(${1:tvalue as Dynamic})'),
        documentation: new MarkdownString(
`
    Push(tvalue as Dynamic) as Void

Adds tvalue as the new highest index entry in the array (adds to the end of the array).
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'Shift',
        insertText: new SnippetString('Shift()'),
        documentation: new MarkdownString(
`
    Shift() as Dynamic

Removes the index zero entry from the array and shifts every other entry down one to fill the hole.  Returns the removed entry.
This is like a Pop from the start of the array instead of the end.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'Unshift',
        insertText: new SnippetString('Unshift(${1:tvalue as Dynamic})'),
        documentation: new MarkdownString(
`
    Unshift(tvalue as Dynamic) as Void

Adds a new index zero to the array and shifts every other entry up one to accommodate. This is like a Push to the start of the array instead of the end.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'Delete',
        insertText: new SnippetString('Delete(${1:index as Integer})'),
        documentation: new MarkdownString(
`
    Delete(index as Integer) as Boolean

Deletes the indicated array entry, and shifts down all entries above to fill the hole. The array length is decreased by one.
If the entry was successfully deleted, returns true.  If index is out of range, returns false and does not change the array.
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

Returns the length of the array; that is, one more than the index of highest entry.
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

Deletes every entry in the array.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'Append',
        insertText: new SnippetString('Append(${1:array as Object})'),
        documentation: new MarkdownString(
`
    Append(array as Object) as Void

Appends each entry of one roArray to another. If the passed Array contains "holes" (entries that were never set to a value), they are not appended.
`
        )
    }
];
