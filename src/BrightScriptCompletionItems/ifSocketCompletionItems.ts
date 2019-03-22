import {
    CompletionItem,
    CompletionItemKind,
    MarkdownString,
    SnippetString
} from 'vscode';

export const ifSocketCompletionItems: CompletionItem[] = [
    {
        kind: CompletionItemKind.Method,
        label: 'Send',
        insertText: new SnippetString('Send(${1:data as Object}, ${2:startIndex as Integer}, ${3:length as Integer})'),
        documentation: new MarkdownString(
`
    Send(data as Object, startIndex as Integer, length as Integer) as Integer

Sends up to length bytes of data to the socket.  The data parameter is a roByteArray containing the data to be sent, starting at the byte indexed by startIndex.

Returns the number of bytes actually sent.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'SendStr',
        insertText: new SnippetString('SendStr(${1:data as String})'),
        documentation: new MarkdownString(
`
    SendStr(data as String) as Integer

Sends the whole string to the socket if possible.

Returns the number of bytes actually sent.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'Receive',
        insertText: new SnippetString('Receive(${1:data as Object}, ${2:startIndex as Integer}, ${3:length as Integer})'),
        documentation: new MarkdownString(
`
    Receive(data as Object, startIndex as Integer, length as Integer) as Integer

Reads up to length bytes from the socket.  The data parameter is a roByteArray into which data is stored, beginning at the byte indexed by startIndex.

Returns the number of bytes actually read.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'ReceiveStr',
        insertText: new SnippetString('ReceiveStr(${1:length as String})'),
        documentation: new MarkdownString(
`
    ReceiveStr(length as Integer) as String

Reads up to length bytes from the socket and stores the result in a string.

Returns the received string. If no bytes were received, the string will be empty.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'Close',
        insertText: new SnippetString('Close()'),
        documentation: new MarkdownString(
`
    Close() as Void

Performs an orderly close of socket.

After a close, most operations on the socket will return invalid.

On blocking sockets, this clears the receive buffer and blocks until the send buffer is emptied. Neither buffer may be read or written afterward.

On non-blocking sockets, both the send and the receive buffer may be read but not written.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'SetAddress',
        insertText: new SnippetString('SetAddress(${1:sockAddr as Object})'),
        documentation: new MarkdownString(
`
    SetAddress(sockAddr as Object) as Boolean

sockAddr is an roSocketAddress.

Returns true if successfully set address using a BSD bind() call.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'GetAddress',
        insertText: new SnippetString('GetAddress()'),
        documentation: new MarkdownString(
`
    GetAddress() as Object

Returns the roSocketAddress object bound to this socket.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'SetSendToAddress',
        insertText: new SnippetString('SetSendToAddress(${1:sockAddr as Object})'),
        documentation: new MarkdownString(
`
    SetSendToAddress(sockAddr as Object) as Boolean

Set remote address for next message to be sent

sockAddr is an roSocketAddress.

Returns true if successfully stored address as first half of underlying BSD sendto() call
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'GetSendToAddress',
        insertText: new SnippetString('GetSendToAddress()'),
        documentation: new MarkdownString(
`
    GetSendToAddress() as Object

Returns roSocketAddress for remote address of next message to be sent

Can also be used to return the remote address on newly accepted sockets
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'GetReceivedFromAddress',
        insertText: new SnippetString('GetReceivedFromAddress()'),
        documentation: new MarkdownString(
`
    GetReceivedFromAddress() as Object

Returns roSocketAddress for remote address of last message received via receive()

Can also be used to return the remote address on newly accepted sockets
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'GetCountRcvBuf',
        insertText: new SnippetString('GetCountRcvBuf()'),
        documentation: new MarkdownString(
`
    GetCountRcvBuf() as Integer

Returns the number of bytes in the receive buffer
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'GetCountSendBuf',
        insertText: new SnippetString('GetCountSendBuf()'),
        documentation: new MarkdownString(
`
    GetCountSendBuf() as Integer

Returns the number of bytes in the send buffer
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'Status',
        insertText: new SnippetString('Status()'),
        documentation: new MarkdownString(
`
    Status() as Integer

Returns the errno of the last operation attempted or zero if the last operation was a success.
`
        )
    }
];
