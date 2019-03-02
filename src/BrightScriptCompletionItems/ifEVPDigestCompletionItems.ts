import {
    CompletionItem,
    CompletionItemKind
} from 'vscode';

import * as vscode from 'vscode';

export const ifEVPDigestCompletionItems: CompletionItem[] = [
    {
        kind: CompletionItemKind.Method,
        label: 'Setup',
        insertText: new vscode.SnippetString('Setup(${1:digestType as String})'),
        detail: 'Setup(digestType as String) as Integer',
        documentation: new vscode.MarkdownString(
`
Initialize a new message digest context.  digestType identifies one of the supported digest algorithms from openssl,

List of Supported Digest Algorithms:

Type | Detail
--- | ---
md5 | MD5 message digest algorithm (default)
sha1 | SHA-1 message digest algorithm
sha224 | SHA-2, 224 bit variant
sha256 | SHA-2, 256 bit variant
sha384 | SHA-2, 384 bit variant
sha512 | SHA-2, 512 bit variant
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
Re-initialize an existing message digest context. This can be called to reuse an existing roEVPDigest object to digest new data. Returns 0 on success or non-zero on failure.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'Process',
        insertText: new vscode.SnippetString('Process(${1:bytes as Object})'),
        detail: 'Process(bytes as Object) as Object',
        documentation: new vscode.MarkdownString(
`
The parameter should be an roByteArray. The data in the array is digested and the digest is returned as a hex string.

    x = evp.Process(bytes)

is equivalent to

    evp.Reinit()
    evp.Update(bytes)
    x = evp.Final()
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'Update',
        insertText: new vscode.SnippetString('Update(${1:bytes as Object})'),
        detail: 'Update(bytes as Object) as Object',
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
Returns the digest of data passed in by previous calls to Update() as a hex string.
`
        )
    },
];
