import {
    CompletionItem,
    CompletionItemKind,
    MarkdownString,
    SnippetString
} from 'vscode';

export const ifRegistryCompletionItems: CompletionItem[] = [
    {
        kind: CompletionItemKind.Method,
        label: 'GetSectionList',
        insertText: new SnippetString('GetSectionList()'),
        documentation: new MarkdownString(
`
    GetSectionList() as Object

Returns an roList with one entry for each registry section. Each element in the list is an roString containing the name of the section.
The section itself can be accessed by creating an roRegistrySection object using that name.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'Delete',
        insertText: new SnippetString('Delete(${1:section as String})'),
        documentation: new MarkdownString(
`
    Delete(section as String) as Boolean

Deletes the specified section and returns an indication of success.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'Flush',
        insertText: new SnippetString('Flush()'),
        documentation: new MarkdownString(
`
    Flush() as Boolean

Flushes the registry out to persistent storage.
`
        )
    }
];
