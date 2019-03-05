import {
    CompletionItem,
    CompletionItemKind
} from 'vscode';

import * as vscode from 'vscode';

export const ifArraySortCompletionItems: CompletionItem[] = [
    {
        kind: CompletionItemKind.Method,
        label: 'Sort',
        insertText: new vscode.SnippetString('Sort(${1|"","i","r","ir"|})'),
        documentation: new vscode.MarkdownString(
`
    Sort(flags = "" as String) as Void

Performs a stable sort.

Items are arbitrarily grouped by comparable type of number or string, and are sorted within the group with a logical comparison.

If "r" is included in flags, a reverse sort is performed. If "i" is included in flags, a case-insensitive sort is performed. If invalid flags are specified, the sort is not performed.\\
_This function is available in firmware 7.1 or later._

Examples

    a=[3, 1, 2]
    a.Sort()
    print a
    ' sets the array to [1, 2, 3]

    a=[3, 1, 2.5]
    a.Sort("r")  ' reverse order sort
    print a
    ' sets the array to [3, 2.5, 1]

    a=["cat", "DOG", "bee"]
    a.Sort()  ' case-sensitive sort by default
    print a
    ' sets the array to ["DOG", "bee", "cat"]

    a=["cat", "DOG", "bee"]
    a.Sort("i")  ' case-insensitive sort
    print a
    ' sets the array to ["bee", "cat", "DOG"]

    a=["cat", "DOG", "bee"]
    a.Sort("ir")  ' case-insensitive, reverse order sort
    print a
    ' sets the array to ["DOG", "cat", "bee"]
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'SortBy',
        insertText: new vscode.SnippetString('SortBy(${1:fieldName as String}, ${2|"","i","r","ir"|})'),
        documentation: new vscode.MarkdownString(
`
    SortBy(fieldName as String, flags = "" as String) as Void

Performs a stable sort of an array of associative arrays by value of a common field.

Items are arbitrarily grouped by comparable value type of number or string, and are sorted within the group with a logical comparison.

If "r" is included in flags, a reverse sort is performed. If "i" is included in flags, a case-insensitive sort is performed. If invalid flags are specified, the sort is not performed.\\
_This function is available in firmware 7.1 or later._

Examples

    a=[ {id:3, name:"Betty"}, {id:1, name:"Carol"}, {id:2, name:"Anne"} ]
    a.SortBy("name")
    ' sets the array to [ {id:2, name:"Anne"}, {id:3, name:"Betty"}, {id:1, name:"Carol"} ]

    a.SortBy("id")
    ' sets the array to [ {id:1, name:"Carol"}, {id:2, name:"Anne"}, {id:3, name:"Betty"} ]

    a.SortBy("name", "r")  ' reverse order sort
    ' sets the array to [ {id:1, name:"Carol"}, {id:3, name:"Betty"}, {id:2, name:"Anne"} ]
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'Reverse',
        insertText: new vscode.SnippetString('Reverse()'),
        documentation: new vscode.MarkdownString(
`
    Reverse() as Void

Reverses the order of elements in an array.\\
_This function is available in firmware 7.1 or later._

Example

    a=[1, "one", 2, "two"]
    a.Reverse()
    ' sets the array to ["two", 2, "one", 1]
`
        )
    }
];
