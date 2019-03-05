import {
    CompletionItem,
    CompletionItemKind
} from 'vscode';

import * as vscode from 'vscode';

export const ifAudioPlayerCompletionItems: CompletionItem[] = [
    {
        kind: CompletionItemKind.Method,
        label: 'SetContentList',
        insertText: new vscode.SnippetString('SetContentList(${1:contentList as Object})'),
        documentation: new vscode.MarkdownString(
`
    SetContentList(contentList as Object) as Void

Set the content list to be played by the Audio Player. The caller passes an Array of AssociativeArrays (Content Meta-Data objects)
representing the information for each stream to be played. See Content Meta-Data for details on the attributes for each element in the array.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'AddContent',
        insertText: new vscode.SnippetString('AddContent(${1:contentItem as Object})'),
        documentation: new vscode.MarkdownString(
`
    AddContent(contentItem as Object) as Void

Add a new ContentMetaData item to the content list for the Audio Player. The new item is added to the end of the content list.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'ClearContent',
        insertText: new vscode.SnippetString('ClearContent()'),
        documentation: new vscode.MarkdownString(
`
    ClearContent() as Void

Clear the content list.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'Play',
        insertText: new vscode.SnippetString('Play()'),
        documentation: new vscode.MarkdownString(
`
    Play() as Boolean

Put the Audio Player into _play_ mode starting at the current item in the Content List. This will stop any currently playing content.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'Stop',
        insertText: new vscode.SnippetString('Stop()'),
        documentation: new vscode.MarkdownString(
`
    Stop() as Boolean

Stop Audio Player from playing or pausing and cleanup.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'Pause',
        insertText: new vscode.SnippetString('Pause()'),
        documentation: new vscode.MarkdownString(
`
    Pause() as Boolean

Put Audio Player into _pause_ mode. It is an error to Pause if player is not in _play_ mode.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'Resume',
        insertText: new vscode.SnippetString('Resume()'),
        documentation: new vscode.MarkdownString(
`
    Resume() as Boolean

Put Audio Player into _play_ mode starting from the pause point. It is an error to Resume if the player is not in _pause_ mode.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'SetLoop',
        insertText: new vscode.SnippetString('SetLoop(${1:enable as Boolean})'),
        documentation: new vscode.MarkdownString(
`
    SetLoop(enable as Boolean) as Void

Enable/disable the automatic replaying of the Content List. When enabled, after playing the last item in the content list, the player begins playing the first item.
When disabled, after playing the last item in the content list, the player stops.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'SetNext',
        insertText: new vscode.SnippetString('SetNext(${1:item as Integer})'),
        documentation: new vscode.MarkdownString(
`
    SetNext(item as Integer) as Void

Set what the next item to be played within the Content List should be.
item is the zero-based index of the item in the content list. This item will be played after the currently playing item finishes.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'Seek',
        insertText: new vscode.SnippetString('Seek(${1:offsetMs as Integer})'),
        documentation: new vscode.MarkdownString(
`
    Seek(offsetMs as Integer) as Boolean

Set the start point of playback for the current item to offsetMs milliseconds.
If the item is currently playing, playback will be interrupted and will restart at the specified offset.
If the item is not currently playing, playback will begin at the specified offset when Play() is called.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'SetTimeMetaDataForKeys',
        insertText: new vscode.SnippetString('SetTimeMetaDataForKeys(${1:keys as Dynamic})'),
        documentation: new vscode.MarkdownString(
`
    SetTimeMetaDataForKeys(keys[] as Dynamic) as Void

This method is called to specify the timedMetaData keys that the BrightScript channel is interested in receiving from the timedMetaData event.
If the keys array is empty, all the timed metadata associated with the current stream is sent with the isTimedMetaData event.
If the keys array is invalid, then do not return any keys to the BrightScript channel.
Any keys not specified with this method are deleted by the firmware and never returned to the BrightScript application.
`
        )
    },
];
