import {
    CompletionItem,
    CompletionItemKind
} from 'vscode';

import * as vscode from 'vscode';

export const ifSocketCastOptionCompletionItems: CompletionItem[] = [
    {
        kind: CompletionItemKind.Method,
        label: 'GetBroadcast',
        insertText: new vscode.SnippetString('GetBroadcast()'),
        documentation: new vscode.MarkdownString(
`
    GetBroadcast() as Boolean

Return true if broadcast messages are enabled to be sent or received.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'SetBroadcast',
        insertText: new vscode.SnippetString('SetBroadcast(${1:enable as Boolean})'),
        documentation: new vscode.MarkdownString(
`
    SetBroadcast(enable as Boolean) as Boolean

If enable is true, enable broadcast messages to be sent or received; otherwise do not send or receive broadcast messages.

Returns true if successfully set.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'JoinGroup',
        insertText: new vscode.SnippetString('JoinGroup(${1:ipAddress as Object})'),
        documentation: new vscode.MarkdownString(
`
    JoinGroup(ipAddress as Object) as Boolean

Join the multicast group specified by the passed in multicast ipAddress. ipAddress must be an roSocketAddress.

Ipv4 multicast addresses are in the range: 224.0.0.0 through 239.255.255.255

Returns true if successfully set.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'DropGroup',
        insertText: new vscode.SnippetString('DropGroup(${1:ipAddress as Object})'),
        documentation: new vscode.MarkdownString(
`
    DropGroup(ipAddress as Object) as Boolean

Drop out of the multicast group specified by the passed in multicast ipAddress. ipAddress must be an roSocketAddress.

Ipv4 multicast addresses are in the range: 224.0.0.0 through 239.255.255.255

Returns true if successfully set.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'GetMulticastLoop',
        insertText: new vscode.SnippetString('GetMulticastLoop()'),
        documentation: new vscode.MarkdownString(
`
    GetMulticastLoop() as Boolean

Return true if multicast messages are enabled for local loopback.

If enabled, multicast message sent locally are to be received locally.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'SetMulticastLoop',
        insertText: new vscode.SnippetString('SetMulticastLoop(${1:enable as Boolean})'),
        documentation: new vscode.MarkdownString(
`
    SetMulticastLoop(enable as Boolean) as Boolean

If enable is true, enable local loopback of multicast messages; otherwise do not send or receive broadcast messages.

Returns true if successfully set.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'GetMulticastTTL',
        insertText: new vscode.SnippetString('GetMulticastTTL()'),
        documentation: new vscode.MarkdownString(
`
    GetMulticastTTL() as Integer

Return the TTL integer value for multicast messages.

TTL is the number of hops a packet is allowed before a router drops the packet.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'SetMulticastTTL',
        insertText: new vscode.SnippetString('SetMulticastTTL(${1:ttl as Integer})'),
        documentation: new vscode.MarkdownString(
`
    SetMulticastTTL(ttl as Integer) as Boolean

Set the TTL integer value for multicast messages.

TTL is the number of hops a packet is allowed before a router drops the packet.

Returns true if successfully set.
`
        )
    }
];
