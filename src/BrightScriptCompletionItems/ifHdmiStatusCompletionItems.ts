import {
    CompletionItem,
    CompletionItemKind
} from 'vscode';

import * as vscode from 'vscode';

export const ifHdmiStatusCompletionItems: CompletionItem[] = [
    {
        kind: CompletionItemKind.Method,
        label: 'IsConnected',
        insertText: new vscode.SnippetString('IsConnected()'),
        documentation: new vscode.MarkdownString(
`
    IsConnected() as Boolean

Returns true if the HDMI or MHL output is connected to an HDMI device.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'GetHdcpVersion',
        insertText: new vscode.SnippetString('GetHdcpVersion()'),
        documentation: new vscode.MarkdownString(
`
    GetHdcpVersion() as String

Returns the version number of the currently established HDCP link.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'IsHdcpActive',
        insertText: new vscode.SnippetString('IsHdcpActive(${1:version as String})'),
        documentation: new vscode.MarkdownString(
`
    IsHdcpActive(version as String) as Boolean

Returns true if the current established HDCP link is the specified version (such as "1.4" or "2.2") or higher, otherwise returns false.
`
        )
    },
];
