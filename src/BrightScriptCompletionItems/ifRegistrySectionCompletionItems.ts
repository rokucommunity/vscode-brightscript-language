import {
    CompletionItem,
    CompletionItemKind
} from 'vscode';

import * as vscode from 'vscode';

export const ifRegistrySectionCompletionItems: CompletionItem[] = [
    {
        kind: CompletionItemKind.Method,
        label: 'Read',
        insertText: new vscode.SnippetString('Read(${1:key as String})'),
        documentation: new vscode.MarkdownString(
`
    Read(key as String) as String

Reads and returns the value of the specified key
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'ReadMulti',
        insertText: new vscode.SnippetString('ReadMulti(${1:keysArray as Object})'),
        documentation: new vscode.MarkdownString(
`
    ReadMulti(keysArray as Object) as Object

_This function is available in firmware 8.0 and later._

Reads multiple values from the registry. Takes an array of strings, the key names to read. Returns an associative array with the keys and accompanying values read from the registry.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'Write',
        insertText: new vscode.SnippetString('Write(${1:key as String}, ${2:value as String})'),
        documentation: new vscode.MarkdownString(
`
    Write(key as String, value as String) as Boolean

Replaces the value of the specified key.

Does not guarantee a commit to non-volatile storage until an explicit Flush() is done.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'WriteMulti',
        insertText: new vscode.SnippetString('WriteMulti(${1:roAA as Object})'),
        documentation: new vscode.MarkdownString(
`
    WriteMulti(roAA as Object) as Boolean

_This function is available in firmware 8.0 and later._

Writes multiple values to the registry. Takes an associative array with key/value pairs to write. Returns boolean indicating success or failure of the write operation.
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

Deletes the specified key.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'Exists',
        insertText: new vscode.SnippetString('Exists(${1:key as String})'),
        documentation: new vscode.MarkdownString(
`
    Exists(key as String) as Boolean

Returns true if the specified key exists.
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

Flushes the contents of the registry out to persistent storage. Developers should explicitly Flush after performing a write or series of writes.
Flush is transactional and all writes between calls to Flush are atomic.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'GetKeyList',
        insertText: new vscode.SnippetString('GetKeyList()'),
        documentation: new vscode.MarkdownString(
`
    GetKeyList() as Object

Returns an roList containing one entry per registry key in this section.  Each entry is an roString containing the name of the key.
`
        )
    },
];
