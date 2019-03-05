import {
    CompletionItem,
    CompletionItemKind
} from 'vscode';

import * as vscode from 'vscode';

export const ifAudioMetadataCompletionItems: CompletionItem[] = [
    {
        kind: CompletionItemKind.Method,
        label: 'SetUrl',
        insertText: new vscode.SnippetString('SetUrl(${1:url as String})'),
        documentation: new vscode.MarkdownString(
`
    SetUrl(url as String) as Void

Sets the URL to the audio file. Only file URLs are initially supported.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'GetTags',
        insertText: new vscode.SnippetString('GetTags()'),
        documentation: new vscode.MarkdownString(
`
    GetTags() as Object

Returns an associative array that contains a simple set of tags that are common to most audio formats. This associative array contains:

Name | Type
--- | ---
album | String
artist | String
comment | String
composer | String
genre | String
title | String
track | Integer
year | Integer
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'GetAudioProperties',
        insertText: new vscode.SnippetString('GetAudioProperties()'),
        documentation: new vscode.MarkdownString(
`
    GetAudioProperties() as Object

Returns an associative array with a simple set of audio properties. These are values which may involve reading a larger portion of the
file and thus may take longer to retrieve than the tags. The associative array contains:

Name | Type | Notes
--- | --- | ---
length | Integer | Duration in seconds
bitrate | Integer | In kilobytes per second
samplerate | Integer | Samples per second
channels | Integer | Number of channels

`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'GetCoverArt',
        insertText: new vscode.SnippetString('GetCoverArt()'),
        documentation: new vscode.MarkdownString(
`
    GetCoverArt() as Object

Returns the cover art if available. Returns an associative array with two entries: "bytes" and "type".
"bytes" is an roByteArray containing the image data. "type" specifies the mime-type of the image which is almost always either "image/jpeg" or "image/png".
Looks for the picture designated as the cover art if there is more than one picture in the file. If there is no FrontCover picture then the first picture is used.
`
        )
    }
];
