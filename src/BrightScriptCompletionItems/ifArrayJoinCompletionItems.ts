import {
    CompletionItem,
    CompletionItemKind
} from 'vscode';

import * as vscode from 'vscode';

export const ifArrayJoinCompletionItems: CompletionItem[] = [
    {
        kind: CompletionItemKind.Method,
        label: 'Join',
        insertText: new vscode.SnippetString('Join(${1:separator as String})'),
        detail: 'Join(separator as String) as String',
        documentation: new vscode.MarkdownString(
`
Creates a string by joining all array elements together separated by the specified separator.
All elements must be of type string, otherwise an empty string is returned.\\
_This function is available in firmware 7.5 or later._

Examples

    a = ["ant","bat","cat"]
    s = a.Join(",")
    print """" + s + """"
    REM "ant,bat,cat"

    a = "abc".Split("")
    s = a.Join("--")
    print """" + s + """"
    REM "a--b--c"
`
        )
    }
];
