import {
    CompletionItem,
    CompletionItemKind,
    MarkdownString,
    SnippetString
} from 'vscode';

export const ifXMLListCompletionItems: CompletionItem[] = [
    {
        kind: CompletionItemKind.Method,
        label: 'GetNamedElements',
        insertText: new SnippetString('GetNamedElements(${1:name as String})'),
        documentation: new MarkdownString(
`
    GetNamedElements(name As String) As Object

Returns a new XMLList that contains all roXMLElements that matched the passed in name. This is the same as using the dot operator on an roXMLList.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'GetNamedElementsCi',
        insertText: new SnippetString('GetNamedElementsCi(${1:name as String})'),
        documentation: new MarkdownString(
`
    GetNamedElementsCi(name As String) As Object

Similar to GetNamedElements(), but uses case-insensitive matching.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'Simplify',
        insertText: new SnippetString('Simplify()'),
        documentation: new MarkdownString(
`
    Simplify() As Object

If the list contains exactly one item, Simplify() returns that item. Otherwise, it returns itself
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'GetAttributes',
        insertText: new SnippetString('GetAttributes()'),
        documentation: new MarkdownString(
`
    GetAttributes() As Object

If the list contains exactly one item, GetAttributes() returns the attributes of that item. Otherwise it returns invalid.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'GetText',
        insertText: new SnippetString('GetText()'),
        documentation: new MarkdownString(
`
    GetText() As String

If the list contains exactly one item, GetText() returns the text of that item. Otherwise it returns an empty string.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'GetChildElements',
        insertText: new SnippetString('GetChildElements()'),
        documentation: new MarkdownString(
`
    GetChildElements() As Dynamic

If the list contains exactly one item, GetChildElements() returns the child elements of that item. Otherwise it returns invalid.

Note that GetChildElements does NOT return the items contained in the roXMLList. Use ifList functions to access those items.
`
        )
    }
];
