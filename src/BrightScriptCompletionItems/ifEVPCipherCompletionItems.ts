import {
    CompletionItem,
    CompletionItemKind
} from 'vscode';

import * as vscode from 'vscode';

export const ifEVPCipherCompletionItems: CompletionItem[] = [
    {
        kind: CompletionItemKind.Method,
        label: 'Setup',
        insertText: new vscode.SnippetString('Setup(${1:encrypt as Boolean}, ${2:format as String}, ${3:key as String}, ${4:iv as String}, ${5:padding as Integer})'),
        documentation: new vscode.MarkdownString(
`
    Setup(encrypt as Boolean, format as String, key as String, iv as String, padding as Integer) as Integer

Setup and initialize a new cipher context. The Setup function takes the following parameters:

Parameter | Description
--- | ---
encrypt | true for encryption, false for decryption
format | cipher format string, from openssl, listed at roEVPCipher
key | hex-encoded key
iv | hex-encoded initialization vector (can be empty string)
padding | 1 to use standard padding, 0 for no padding

Returns 0 on success or non-zero on failure.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'Reinit',
        insertText: new vscode.SnippetString('Reinit()'),
        documentation: new vscode.MarkdownString(
`
    Reinit() as Integer

Reinitialize an existing cipher context. This can be called to reuse an existing roEVPCipher object to encrypt new data.  Returns 0 on success or non-zero on failure.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'Process',
        insertText: new vscode.SnippetString('Process(${1:bytes as Object})'),
        documentation: new vscode.MarkdownString(
`
    Process(bytes as Object) as Object

The parameter should be an roByteArray.  The data in the array is encrypted or decrypted. Returns an roByteArray containing the result.

    x = evp.Process(bytes)

is equivalent to

    evp.Reinit()
    x = evp.Update(bytes)
    x = x + evp.Final()
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'Update',
        insertText: new vscode.SnippetString('Update(${1:bytes as Object})'),
        documentation: new vscode.MarkdownString(
`
    Update(bytes as Object) as Object

The parameter should be an roByteArray. The data in the array is encrypted or decrypted.
Returns an roByteArray containing a subset of the result. Some or all of the result may not be returned until the next call to Update().
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'Final',
        insertText: new vscode.SnippetString('Final()'),
        documentation: new vscode.MarkdownString(
`
    Final() as Object

Signals that all data has been submitted by previous calls to Update(). Returns the last remaining encrypted or decrypted bytes.
`
        )
    }
];
