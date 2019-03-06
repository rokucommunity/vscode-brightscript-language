import {
    CompletionItem,
    CompletionItemKind,
    MarkdownString,
    SnippetString
} from 'vscode';

export const ifAppInfoCompletionItems: CompletionItem[] = [
    {
        kind: CompletionItemKind.Method,
        label: 'GetID',
        insertText: new SnippetString('GetID()'),
        documentation: new MarkdownString(
`
    GetID() as String

Returns the app's channel ID, e.g. "12345" or "dev".
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'IsDev',
        insertText: new SnippetString('IsDev()'),
        documentation: new MarkdownString(
`
    IsDev() as Boolean

Returns true if the application is side-loaded, i.e. the channel ID is "dev"
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'GetVersion',
        insertText: new SnippetString('GetVersion()'),
        documentation: new MarkdownString(
`
    GetVersion() as String

Returns the conglomerate version number from the manifest, e.g. "1.2.3", as formatted major_version + minor_version + build_version.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'GetTitle',
        insertText: new SnippetString('GetTitle()'),
        documentation: new MarkdownString(
`
    GetTitle() as String

Returns the title value from the manifest.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'GetSubtitle',
        insertText: new SnippetString('GetSubtitle()'),
        documentation: new MarkdownString(
`
    GetSubtitle() as String

Returns the subtitle value from the manifest.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'GetDevID',
        insertText: new SnippetString('GetDevID()'),
        documentation: new MarkdownString(
`
    GetDevID() as String

Returns the app's developer ID, or the keyed developer ID, if the application is side-loaded.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'GetValue',
        insertText: new SnippetString('GetValue(${1:key as String})'),
        documentation: new MarkdownString(
`
    GetValue(key as String) as String

Returns the named manifest value, or an empty string if the entry is does not exist.
`
        )
    }
];
