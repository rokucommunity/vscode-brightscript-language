import {
    CompletionItem,
    CompletionItemKind,
} from 'vscode';

import * as vscode from 'vscode';

export const ifAppInfoCompletionItems: CompletionItem[] = [
    {
        kind: CompletionItemKind.Method,
        label: 'GetID',
        insertText: new vscode.SnippetString('GetID()'),
        documentation: new vscode.MarkdownString(
`
    GetID() as String

Returns the app's channel ID, e.g. "12345" or "dev".
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'IsDev',
        insertText: new vscode.SnippetString('IsDev()'),
        documentation: new vscode.MarkdownString(
`
    IsDev() as Boolean

Returns true if the application is side-loaded, i.e. the channel ID is "dev"
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'GetVersion',
        insertText: new vscode.SnippetString('GetVersion()'),
        documentation: new vscode.MarkdownString(
`
    GetVersion() as String

Returns the conglomerate version number from the manifest, e.g. "1.2.3", as formatted major_version + minor_version + build_version.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'GetTitle',
        insertText: new vscode.SnippetString('GetTitle()'),
        documentation: new vscode.MarkdownString(
`
    GetTitle() as String

Returns the title value from the manifest.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'GetSubtitle',
        insertText: new vscode.SnippetString('GetSubtitle()'),
        documentation: new vscode.MarkdownString(
`
    GetSubtitle() as String

Returns the subtitle value from the manifest.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'GetDevID',
        insertText: new vscode.SnippetString('GetDevID()'),
        documentation: new vscode.MarkdownString(
`
    GetDevID() as String

Returns the app's developer ID, or the keyed developer ID, if the application is side-loaded.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'GetValue',
        insertText: new vscode.SnippetString('GetValue(${1:key as String})'),
        documentation: new vscode.MarkdownString(
`
    GetValue(key as String) as String

Returns the named manifest value, or an empty string if the entry is does not exist.
`
        )
    }
];
