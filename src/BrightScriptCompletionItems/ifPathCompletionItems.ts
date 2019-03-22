import {
    CompletionItem,
    CompletionItemKind,
    MarkdownString,
    SnippetString
} from 'vscode';

export const ifPathCompletionItems: CompletionItem[] = [
    {
        kind: CompletionItemKind.Method,
        label: 'Change',
        insertText: new SnippetString('Change(${1:path as String})'),
        documentation: new MarkdownString(
`
    Change(path as String) as Boolean

Modify or change the current path via the relative or absolute path passed as a string

Returns true if the resulting path is valid.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'IsValid',
        insertText: new SnippetString('IsValid()'),
        documentation: new MarkdownString(
`
    IsValid() as Boolean

Returns true if the current path is valid; that is, if the path is correctly formed. This does not check whether the file actually exists.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'Split',
        insertText: new SnippetString('Split()'),
        documentation: new MarkdownString(
`
    Split() as Object

Returns an roAssociativeArray containing the following keys:

* basename: The filename, without parent directories or extension
* extension: The filename extension
* filename: The filename, with extension, without parent directories
* parent: The parent directory, or empty if in a root directory
* phy: The PHY volume
`
        )
    }
];
