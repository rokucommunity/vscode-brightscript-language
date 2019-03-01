import {
    CompletionItem,
    CompletionItemKind
} from 'vscode';

import * as vscode from 'vscode';

export const ifEnumCompletionItems: CompletionItem[] = [
    {
        kind: CompletionItemKind.Method,
        label: 'Reset',
        insertText: new vscode.SnippetString('Reset()'),
        detail: 'Reset() as Void',
        documentation: new vscode.MarkdownString(
`
Resets the current position to the first element of the enumeration.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'Next',
        insertText: new vscode.SnippetString('Next()'),
        detail: 'Next() as Dynamic',
        documentation: new vscode.MarkdownString(
`
Returns the value at the current position and increments the position. If the last element of the enumeration is returned, sets the current position to indicate that it is now past the end.
If the current position is already past the end (that is, the last element has already been returned by a previous call to Next()), return invalid.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'IsNext',
        insertText: new vscode.SnippetString('IsNext()'),
        detail: 'IsNext() as Boolean',
        documentation: new vscode.MarkdownString(
`
Returns true if the current position is not past the end of the enumeration.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'IsEmpty',
        insertText: new vscode.SnippetString('IsEmpty()'),
        detail: 'IsEmpty() as Boolean',
        documentation: new vscode.MarkdownString(
`
Returns true if the enumeration contains no elements.
`
        )
    }
];
