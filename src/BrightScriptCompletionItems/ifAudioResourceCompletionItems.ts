import {
    CompletionItem,
    CompletionItemKind
} from 'vscode';

import * as vscode from 'vscode';

export const ifAudioResourceCompletionItems: CompletionItem[] = [
    {
        kind: CompletionItemKind.Method,
        label: 'Trigger',
        insertText: new vscode.SnippetString('Trigger(${1:volume as Integer})'),
        detail: 'Trigger(volume as Integer) as Void',
        documentation: new vscode.MarkdownString(
`
This method triggers the start of the audio resource sound playback.
The volume is a number between 0 and 100 (percentage of full volume).  50 should be used for normal volume.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'IsPlaying',
        insertText: new vscode.SnippetString('IsPlaying()'),
        detail: 'IsPlaying() as Boolean',
        documentation: new vscode.MarkdownString(
`
Returns true if this audio resource is currently playing.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'Stop',
        insertText: new vscode.SnippetString('Stop()'),
        detail: 'Stop() as Void',
        documentation: new vscode.MarkdownString(
`
Stops playing the audio resource. If the resource is not currently playing, has no effect.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'MaxSimulStreams',
        insertText: new vscode.SnippetString('MaxSimulStreams()'),
        detail: 'MaxSimulStreams() as Integer',
        documentation: new vscode.MarkdownString(
`
Returns the maximum number of audio resources which can be played simultaneous.
Some Roku models support playing multiple resources and mix the output, others support playing only one stream at a time.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'GetMetaData',
        insertText: new vscode.SnippetString('GetMetaData()'),
        detail: 'GetMetaData() as Object',
        documentation: new vscode.MarkdownString(
`
Returns an roAssociativeArray array containing the following meta data parameters about the audio resource.  All values are integers.

* Length (number of samples)
* SamplesPerSecond
* NumChannels
* BitsPerSample
`
        )
    },
];
