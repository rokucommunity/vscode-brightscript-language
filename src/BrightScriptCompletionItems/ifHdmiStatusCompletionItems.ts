import {
    CompletionItem,
    CompletionItemKind,
    MarkdownString,
    SnippetString
} from 'vscode';

export const ifHdmiStatusCompletionItems: CompletionItem[] = [
    {
        kind: CompletionItemKind.Method,
        label: 'IsConnected',
        insertText: new SnippetString('IsConnected()'),
        documentation: new MarkdownString(
`
    IsConnected() as Boolean

Returns true if the HDMI or MHL output is connected to an HDMI device.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'GetHdcpVersion',
        insertText: new SnippetString('GetHdcpVersion()'),
        documentation: new MarkdownString(
`
    GetHdcpVersion() as String

Returns the version number of the currently established HDCP link.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'IsHdcpActive',
        insertText: new SnippetString('IsHdcpActive(${1:version as String})'),
        documentation: new MarkdownString(
`
    IsHdcpActive(version as String) as Boolean

Returns true if the current established HDCP link is the specified version (such as "1.4" or "2.2") or higher, otherwise returns false.
`
        )
    }
];
