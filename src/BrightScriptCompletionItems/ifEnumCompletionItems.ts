import {
    CompletionItem,
    CompletionItemKind,
    MarkdownString,
    SnippetString
} from 'vscode';

export const ifEnumCompletionItems: CompletionItem[] = [
    {
        kind: CompletionItemKind.Method,
        label: 'Reset',
        insertText: new SnippetString('Reset()'),
        documentation: new MarkdownString(
`
    Reset() as Void

Resets the current position to the first element of the enumeration.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'Next',
        insertText: new SnippetString('Next()'),
        documentation: new MarkdownString(
`
    Next() as Dynamic

Returns the value at the current position and increments the position. If the last element of the enumeration is returned, sets the current position to indicate that it is now past the end.
If the current position is already past the end (that is, the last element has already been returned by a previous call to Next()), return invalid.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'IsNext',
        insertText: new SnippetString('IsNext()'),
        documentation: new MarkdownString(
`
    IsNext() as Boolean

Returns true if the current position is not past the end of the enumeration.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'IsEmpty',
        insertText: new SnippetString('IsEmpty()'),
        documentation: new MarkdownString(
`
    IsEmpty() as Boolean

Returns true if the enumeration contains no elements.
`
        )
    }
];
