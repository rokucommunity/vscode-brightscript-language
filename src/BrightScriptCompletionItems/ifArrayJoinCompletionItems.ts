import {
    CompletionItem,
    CompletionItemKind,
    MarkdownString,
    SnippetString
} from 'vscode';

export const ifArrayJoinCompletionItems: CompletionItem[] = [
    {
        kind: CompletionItemKind.Method,
        label: 'Join',
        insertText: new SnippetString('Join(${1:separator as String})'),
        documentation: new MarkdownString(
`
    Join(separator as String) as String

Creates a string by joining all array elements together separated by the specified separator.
All elements must be of type string, otherwise an empty string is returned.\\
_This function is available in firmware 7.5 or later._

Examples

    a = ["ant","bat","cat"]
    s = a.Join(",")
    print """" + s + """"
    ' "ant,bat,cat"

    a = "abc".Split("")
    s = a.Join("--")
    print """" + s + """"
    ' "a--b--c"
`
        )
    }
];
