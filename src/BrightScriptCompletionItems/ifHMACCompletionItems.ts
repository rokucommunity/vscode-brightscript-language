import {
    CompletionItem,
    CompletionItemKind,
    MarkdownString,
    SnippetString
} from 'vscode';

export const ifHMACCompletionItems: CompletionItem[] = [
    {
        kind: CompletionItemKind.Method,
        label: 'Setup',
        insertText: new SnippetString('Setup(${1:digestType as String})'),
        documentation: new MarkdownString(
`
    Setup(digestType as String) as Integer

Initialize new HMAC context. The digestType parameter selects one of the supported digest algorithms, as documented in roEVPDigest.
The key parameter must be an roByteArray containing the key for the MAC.  Returns 0 on success, -1 on failure.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'Reint',
        insertText: new SnippetString('Reint()'),
        documentation: new MarkdownString(
`
    Reint() as Integer

Re-initialize an existing HMAC context. This can be called to reuse an existing roHMAC object to authenticate new data. Returns 0 on success or non-zero on failure
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'Process',
        insertText: new SnippetString('Process(${1:message as Object})'),
        documentation: new MarkdownString(
`
    Process(message as Object) as Object

The parameter should be an roByteArray.  The data in the array is digested and an MAC is generated. Returns an roByteArray containing the MAC.

    mac = hmac.Process(message)

is equivalent to

    hmac.Reinit()
    hmac.Update(message)
    mac = hmac.Final()
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'Update',
        insertText: new SnippetString('Update(${1:partialMessage as Object})'),
        documentation: new MarkdownString(
`
    Update(partialMessage as Object) as Void

Add more data to be digested. The parameter should be an roByteArray. The data in the array is added to the current digest.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'Final',
        insertText: new SnippetString('Final()'),
        documentation: new MarkdownString(
`
    Final() as Object

Return an roByteArray containing the final MAC.
`
        )
    }
];
