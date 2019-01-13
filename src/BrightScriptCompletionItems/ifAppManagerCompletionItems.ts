import {
    CompletionItem,
    CompletionItemKind,
    TextEdit,
} from 'vscode';

import * as vscode from 'vscode';

export const ifAppManagerCompletionItems: CompletionItem[] = [
    {
        kind: CompletionItemKind.Method,
        label: 'SetTheme',
        insertText: new vscode.SnippetString('SetTheme(${1:attributeArray as Object})'),
        detail: 'as Void',
    },
    {
        kind: CompletionItemKind.Method,
        label: 'SetThemeAttribute',
        insertText: new vscode.SnippetString('SetThemeAttribute(${1:attributeName as String}, ${2:attributeValue as String})'),
        detail: 'as Void',
    },
    {
        kind: CompletionItemKind.Method,
        label: 'ClearThemeAttribute',
        insertText: new vscode.SnippetString('ClearThemeAttribute(${1:attributeName as String})'),
        detail: 'as Void',
    },
    {
        kind: CompletionItemKind.Method,
        label: 'GetUptime',
        insertText: new vscode.SnippetString('GetUptime()'),
        detail: 'as Object',
    },
    {
        kind: CompletionItemKind.Method,
        label: 'GetScreensaverTimeout',
        insertText: new vscode.SnippetString('GetScreensaverTimeout()'),
        detail: 'as Integer',
    },
    {
        kind: CompletionItemKind.Method,
        label: 'UpdateLastKeyPressTime',
        insertText: new vscode.SnippetString('UpdateLastKeyPressTime()'),
        detail: 'as Void',
    },
    {
        kind: CompletionItemKind.Method,
        label: 'SetUserSignedIn',
        insertText: new vscode.SnippetString('SetUserSignedIn(${1:signedIn as Boolean})'),
        detail: 'as Void',
    },
    {
        kind: CompletionItemKind.Method,
        label: 'SetAutomaticAudioGuideEnabled',
        insertText: new vscode.SnippetString('SetAutomaticAudioGuideEnabled(${1:enabled as Boolean})'),
        detail: 'as Void',
    },
    {
        kind: CompletionItemKind.Method,
        label: 'IsAppInstalled',
        insertText: new vscode.SnippetString('IsAppInstalled(${1:channelID as String}, ${2:version as String})'),
        detail: 'as Boolean',
    },
];
