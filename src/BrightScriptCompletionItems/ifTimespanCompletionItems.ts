import {
    CompletionItem,
    CompletionItemKind
} from 'vscode';

import * as vscode from 'vscode';

export const ifTimespanCompletionItems: CompletionItem[] = [
    {
        kind: CompletionItemKind.Method,
        label: 'Mark',
        insertText: new vscode.SnippetString('Mark()'),
        documentation: new vscode.MarkdownString(
`
    Mark() as Void

Sets the "Mark" point to the current time. The Mark point is also automatically set to the current time when an roTimespan object is created.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'TotalMilliseconds',
        insertText: new vscode.SnippetString('TotalMilliseconds()'),
        documentation: new vscode.MarkdownString(
`
    TotalMilliseconds() as Integer

Returns the total number of milliseconds from the "Mark" point to the current time.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'TotalSeconds',
        insertText: new vscode.SnippetString('TotalSeconds()'),
        documentation: new vscode.MarkdownString(
`
    TotalSeconds() as Integer

Returns the total number of seconds from the "Mark" point to the current time.

    x = timespan.TotalSeconds()

is equivalent to

    x = Int(timespan.TotalMilliseconds() / 1000)
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'GetSecondsToISO8601Date',
        insertText: new vscode.SnippetString('GetSecondsToISO8601Date(${1:date as String})'),
        documentation: new vscode.MarkdownString(
`
    GetSecondsToISO8601Date(date as String) as Integer

This function parses the ISO8601 date (e.g. 2008-11-29T14:54:02.171) and returns the number of seconds from now (not the "Mark" point) until the specified date/time.
The date provided and the current time calculations are all done assuming UTC. The "Z" timezone part of the ISO8601 string is ignored.
`
        )
    },
];
