import {
    CompletionItem,
    CompletionItemKind,
    MarkdownString,
    SnippetString
} from 'vscode';

export const ifSystemLogCompletionItems: CompletionItem[] = [
    {
        kind: CompletionItemKind.Method,
        label: 'EnableType',
        insertText: new SnippetString('EnableType(${1:logType as String})'),
        documentation: new MarkdownString(
`
    EnableType(logType as String) as Void

Enables log message of type logType. When a log type is enabled, system log messages of that type are sent to the message port which was set using SetMessagePort().
All system log events are disabled by default and must be explicitly enabled by the application.

The current valid logTypes are:
* "http.connect"
* "http.error"
* "bandwidth.minute"
* “http.complete”

See online documentation for more info on valid logtypes.
https://sdkdocs.roku.com/display/sdkdoc/ifSystemLog
`
        )
    }
];
