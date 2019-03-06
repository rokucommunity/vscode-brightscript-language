import {
    CompletionItem,
    CompletionItemKind,
    MarkdownString,
    SnippetString
} from 'vscode';

export const ifSourceIdentityCompletionItems: CompletionItem[] = [
    {
        kind: CompletionItemKind.Method,
        label: 'GetSourceIdentity',
        insertText: new SnippetString('GetSourceIdentity()'),
        documentation: new MarkdownString(
`
    GetSourceIdentity() as Integer

Return the id currently associated with this source (event generating) or event object.
`
        )
    }
];
