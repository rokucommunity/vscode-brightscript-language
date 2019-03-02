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
        detail: 'IsConnected() as Boolean',
        documentation: new vscode.MarkdownString(
`
Returns true if the HDMI or MHL output is connected to an HDMI device.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'GetHdcpVersion',
        insertText: new vscode.SnippetString('GetHdcpVersion()'),
        detail: 'GetHdcpVersion() as String',
        documentation: new vscode.MarkdownString(
`
Returns the version number of the currently established HDCP link.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'IsHdcpActive',
        insertText: new vscode.SnippetString('IsHdcpActive(${1:version as String})'),
        detail: 'IsHdcpActive(version as String) as Boolean',
        documentation: new vscode.MarkdownString(
`
Returns true if the current established HDCP link is the specified version (such as "1.4" or "2.2") or higher, otherwise returns false.
`
        )
    },
];
