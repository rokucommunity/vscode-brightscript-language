import {
    CompletionItem,
    CompletionItemKind
} from 'vscode';

import * as vscode from 'vscode';

export const ifRegistryCompletionItems: CompletionItem[] = [
    {
        kind: CompletionItemKind.Method,
        label: 'GetSectionList',
        insertText: new vscode.SnippetString('GetSectionList()'),
        documentation: new vscode.MarkdownString(
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
        insertText: new vscode.SnippetString('Delete(${1:section as String})'),
        documentation: new vscode.MarkdownString(
`
    Delete(section as String) as Boolean

Deletes the specified section and returns an indication of success.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'Flush',
        insertText: new vscode.SnippetString('Flush()'),
        documentation: new vscode.MarkdownString(
`
    Flush() as Boolean

Flushes the registry out to persistent storage.
`
        )
    }
];
