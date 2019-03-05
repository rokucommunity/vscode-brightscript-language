import {
    CompletionItem,
    CompletionItemKind
} from 'vscode';

import * as vscode from 'vscode';

export const ifAssociativeArrayCompletionItems: CompletionItem[] = [
    {
        kind: CompletionItemKind.Method,
        label: 'AddReplace',
        insertText: new vscode.SnippetString('AddReplace(${1:key as String}, ${2:value as Dynamic})'),
        documentation: new vscode.MarkdownString(
`
    AddReplace(key as String, value as Dynamic) as Void

Add a new entry to the array associating the supplied value with the supplied key string. Only one value may be associated with a key.
If the key is already associated with a value, the existing value is discarded.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'Lookup',
        insertText: new vscode.SnippetString('Lookup(${1:key as String})'),
        documentation: new vscode.MarkdownString(
`
    Lookup(key as String) as Dynamic

Return the value in the array associated with the specified key. If there is no value associated with the key then type "invalid" is returned.
Key comparison is case-insensitive, unless SetModeCaseSensitive() has been called.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'DoesExist',
        insertText: new vscode.SnippetString('DoesExist(${1:key as String})'),
        documentation: new vscode.MarkdownString(
`
    DoesExist(key as String) as Boolean

Look for an entry in the array associated with the specified key. If there is no associated object then false is returned. If there is such an object then true is returned.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'Delete',
        insertText: new vscode.SnippetString('Delete(${1:key as String})'),
        documentation: new vscode.MarkdownString(
`
    Delete(key as String) as Boolean

Look for an entry in the array associated with the specified key. If there is such an value then it is deleted and true is returned. If not then false is returned.
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

Remove all key/values from the associative array.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'Keys',
        insertText: new vscode.SnippetString('Keys()'),
        documentation: new vscode.MarkdownString(
`
    Keys() as Object

Returns an array containing the associative array keys in lexicographical order.\\
_This function is available in firmware 7.0 or later._
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'Items',
        insertText: new vscode.SnippetString('Items()'),
        documentation: new vscode.MarkdownString(
`
    Items() as Object

Returns an array containing the associative array key/value pairs in lexicographical order of key.
Each item is in the returned array is an associative array with 'key' and 'value' fields.\\
_This function is available in firmware 7.5 or later._

Examples

    aa = {one:1, two:2, three:3}
    for each item in aa.Items()
        print item.key, item.value
    end for
    ' prints "one  1", "three  3", "two  2"
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'SetModeCaseSensitive',
        insertText: new vscode.SnippetString('SetModeCaseSensitive()'),
        documentation: new vscode.MarkdownString(
`
    SetModeCaseSensitive() as Void

Associative Array lookups are case insensitive by default. This call makes all subsequent actions case sensitive.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'LookupCI',
        insertText: new vscode.SnippetString('LookupCI(${1:key as String})'),
        documentation: new vscode.MarkdownString(
`
    LookupCI(key as String) as Dynamic

Same as "Lookup" except key comparison is always case insensitive, regardless of case mode.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'Append',
        insertText: new vscode.SnippetString('Append(${1:aa as Object})'),
        documentation: new vscode.MarkdownString(
`
    Append(aa as Object) as Void

Append an AssociativeArray to this one.  If any key in aa is already associated with a value in this AssociativeArray, the current value is discarded and is replaced with the value in aa.
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

Returns the number of keys in the associative array.
`
        )
    },
];
