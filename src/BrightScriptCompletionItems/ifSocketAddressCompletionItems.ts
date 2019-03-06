import {
    CompletionItem,
    CompletionItemKind,
    MarkdownString,
    SnippetString
} from 'vscode';

export const ifSocketAddressCompletionItems: CompletionItem[] = [
    {
        kind: CompletionItemKind.Method,
        label: 'SetAddress',
        insertText: new SnippetString('SetAddress(${1:address as String})'),
        documentation: new MarkdownString(
`
    SetAddress(address as String) as Boolean

Sets the IPV4 address to the string. The string consists of a hostname, optionally followed by a colon and a decimal port number.
The hostname may be either dotted quad (such as "192.168.1.120") or a DNS name (such as "roku.com").
If a name is given, a DNS lookup is performed to convert it to dotted quad. Use IsAddressValid() to determine the result of the DNS lookup.

Example: "192.168.1.120:8888" or "roku.com".

Returns true on success.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'GetAddress',
        insertText: new SnippetString('GetAddress()'),
        documentation: new MarkdownString(
`
    GetAddress() as String

Returns the IPV4 address in dotted quad form.

Example: "192.168.1.120:8888"
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'SetHostName',
        insertText: new SnippetString('SetHostName(${1:hostname as String})'),
        documentation: new MarkdownString(
`
    SetHostName(hostname as String) as Boolean

Sets the hostname.  The port number is unchanged.

Returns true on success.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'GetHostName',
        insertText: new SnippetString('GetHostName()'),
        documentation: new MarkdownString(
`
    GetHostName() as String

Returns the hostname.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'SetPort',
        insertText: new SnippetString('SetPort(${1:port as Integer})'),
        documentation: new MarkdownString(
`
    SetPort(port as Integer) as Boolean

Sets the port number.  The hostname is unchanged.

Returns true on success.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'GetPort',
        insertText: new SnippetString('GetPort()'),
        documentation: new MarkdownString(
`
    GetPort() as Integer

Returns the port number.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'IsAddressValid',
        insertText: new SnippetString('IsAddressValid()'),
        documentation: new MarkdownString(
`
    IsAddressValid() as Boolean

Returns true if the component contains a valid IP address.
`
        )
    }
];
