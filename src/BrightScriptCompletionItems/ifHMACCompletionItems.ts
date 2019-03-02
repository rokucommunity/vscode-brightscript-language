import {
    CompletionItem,
    CompletionItemKind
} from 'vscode';

import * as vscode from 'vscode';

export const ifHMACCompletionItems: CompletionItem[] = [
    {
        kind: CompletionItemKind.Method,
        label: 'Setup',
        insertText: new vscode.SnippetString('Setup(${1:digestType as String})'),
        detail: 'Setup(digestType as String) as Integer',
        documentation: new vscode.MarkdownString(
`
Initialize new HMAC context. The digestType parameter selects one of the supported digest algorithms, as documented in roEVPDigest.
The key parameter must be an roByteArray containing the key for the MAC.  Returns 0 on success, -1 on failure.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'Reint',
        insertText: new vscode.SnippetString('Reint()'),
        detail: 'Reint() as Integer',
        documentation: new vscode.MarkdownString(
`
Re-initialize an existing HMAC context. This can be called to reuse an existing roHMAC object to authenticate new data. Returns 0 on success or non-zero on failure
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'Process',
        insertText: new vscode.SnippetString('Process(${1:message as Object})'),
        detail: 'Process(message as Object) as Object',
        documentation: new vscode.MarkdownString(
`
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
        insertText: new vscode.SnippetString('Update(${1:partialMessage as Object})'),
        detail: 'Update(partialMessage as Object) as Void',
        documentation: new vscode.MarkdownString(
`
Add more data to be digested. The parameter should be an roByteArray. The data in the array is added to the current digest.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'Final',
        insertText: new vscode.SnippetString('Final()'),
        detail: 'Final() as Object',
        documentation: new vscode.MarkdownString(
`
Return an roByteArray containing the final MAC.
`
        )
    },
];
