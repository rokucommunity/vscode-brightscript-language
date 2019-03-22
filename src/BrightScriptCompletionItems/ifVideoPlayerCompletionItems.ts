import {
    CompletionItem,
    CompletionItemKind,
    MarkdownString,
    SnippetString
} from 'vscode';

export const ifVideoPlayerCompletionItems: CompletionItem[] = [
    {
        kind: CompletionItemKind.Method,
        label: 'SetContentList',
        insertText: new SnippetString('SetContentList(${1:contentList as Object})'),
        documentation: new MarkdownString(
`
    SetContentList(contentList as Object) as Void

Set the content to be played by the roVideoPlayer. The caller passes an roArray of roAssociativeArrays (Content Meta-Data objects) representing the information for each stream to be played.

If the player is currently playing the player will be stopped. Next, the current player position is reset so the next time Play() is called,
playback will start at the first item of the content list (unless Seek() is called prior to Play()).

roVideoPlayer prefetches the next item in the content list while the current item is playing.
Given sufficient network throughput, there is no rebuffering when the player switches to the next item in the list.
To signal the content transition, the player sends an isRequestSucceeded notification with the old content index and isListItemSelected notification with the new content index.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'AddContent',
        insertText: new SnippetString('AddContent(${1:contentItem as Object})'),
        documentation: new MarkdownString(
`
    AddContent(contentItem as Object) as Void

Add a new Content Meta-Data item to the content list for the roVideoPlayer. New items are added to the end of the list.

roVideoPlayer playback buffers on each Content item transition.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'ClearContent',
        insertText: new SnippetString('ClearContent()'),
        documentation: new MarkdownString(
`
    ClearContent() as Void

Clear all content from the roVideoPlayer. If the player is currently playing the player will be stopped.
Next, the current player position is reset so the next time Play() is called, playback will start at the first item of the content list (unless Seek() is called prior to Play()).
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'PreBuffer',
        insertText: new SnippetString('PreBuffer()'),
        documentation: new MarkdownString(
`
    PreBuffer() as Boolean

_Available since firmware version 7.2_

Begins downloading and buffering of a video that may be selected by a user. This can be used to reduce buffering delays after a user has selected a video for playback.
A typical use would be to call PreBuffer() when the user is in the roSpringboardScreen (or equivalent), anticipating that the user will select a video on the springboard screen for download.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'Play',
        insertText: new SnippetString('Play()'),
        documentation: new MarkdownString(
`
    Play() as Boolean

Put the roVideoPlayer into play mode starting at the beginning of the content list. This will stop any currently playing Content List.

If Seek() was called prior to Play(), the player will start playing at the seek position.
If Seek() was not called, the player advances its current position to the next item in the content list and starts playing that item.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'Stop',
        insertText: new SnippetString('Stop()'),
        documentation: new MarkdownString(
`
    Stop() as Boolean

Stops playback and resets the seek position, keeps the player’s current position unchanged.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'Pause',
        insertText: new SnippetString('Pause()'),
        documentation: new MarkdownString(
`
    Pause() as Boolean

Put roVideoPlayer into _pause_ mode.

It is an error to Pause if player is not in _play_ mode.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'Resume',
        insertText: new SnippetString('Resume()'),
        documentation: new MarkdownString(
`
    Resume() as Boolean

Put roVideoPlayer into play mode starting from the pause point.

It is an error to Resume from any other mode than _pause_.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'SetLoop',
        insertText: new SnippetString('SetLoop(${1:loop as Boolean})'),
        documentation: new MarkdownString(
`
    SetLoop(loop as Boolean) as Void

Enable/Disable the automatic replaying of the content list.

Buffers on every loop to the beginning of the content list.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'SetNext',
        insertText: new SnippetString('SetNext(${1:item as Integer})'),
        documentation: new MarkdownString(
`
    SetNext(item as Integer) as Void

Set what the next item to be played within the Content List should be.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'Seek',
        insertText: new SnippetString('Seek(${1:offsetMs as Integer})'),
        documentation: new MarkdownString(
`
    Seek(offsetMs as Integer) as Boolean

Set the start point of playback for the current video to offsetMs milliseconds.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'SetPositionNotificationPeriod',
        insertText: new SnippetString('SetPositionNotificationPeriod(${1:period as Integer})'),
        documentation: new MarkdownString(
`
    SetPositionNotificationPeriod(period as Integer) as Void

Set interval to receive playback position events from the roVideoPlayer. The notification period is specified in seconds.
Notification events sent to the script specify the position in seconds relative to the beginning of the stream. If the value is zero, position notifications are never sent. The default value is zero.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'SetCGMS',
        insertText: new SnippetString('SetCGMS(${1:level as Integer})'),
        documentation: new MarkdownString(
`
    SetCGMS(level as Integer) as Void

Set CGMS (Copy Guard Management System) on analog outputs to the desired level.

* 0 - No Copy Restriction
* 1 - Copy No More
* 2 - Copy Once Allowed
* 3 – No Copying Permitted
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'SetDestinationRect',
        insertText: new SnippetString('SetDestinationRect(${1:rect as Object})'),
        documentation: new MarkdownString(
`
    SetDestinationRect(rect as Object) as Void

Set the target display window for the video.

rect has the params: {x:Integer, y:Integer, w:Integer, h:Integer}

Default value is: {x:0, y:0, w:0, h:0}, which is full screen
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'SetDestinationRect',
        insertText: new SnippetString('SetDestinationRect(${1:x as Integer}, ${2:y as Integer}, ${3:w as Integer}, ${4:h as Integer})'),
        documentation: new MarkdownString(
`
    SetDestinationRect(x as Integer, y as Integer, w as Integer, h as Integer) as Void

Set the target display window for the video.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'SetMaxVideoDecodeResolution',
        insertText: new SnippetString('SetMaxVideoDecodeResolution(${1:width as Integer}, ${2:height as Integer})'),
        documentation: new MarkdownString(
`
    SetMaxVideoDecodeResolution(width as Integer, height as Integer) as Void

Set the max resolution required by your video.

Video decode memory is a shared resource with OpenGL texture memory. The BrightScript 2D APIs are implemented using OpenGL texture memory on Roku models that support the OpenGL APIs
(please see Roku Models and Features for a list of these models).

On models that do not support OpenGL APIs this method exists for API compatibility but has no effect on actual memory allocations.

Video decode memory allocation is based on a resolution of 1920x1080 or 1280x720 as the maximum supported resolution
for a particular Roku model (please see Roku Models and Features for a list of these models).

This API enables applications that want to use both the 2D APIs and video playback with a lower resolution than 1080p.
Without this call, these applications are likely to not have enough memory for either video playback or roScreen rendering.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'GetPlaybackDuration',
        insertText: new SnippetString('GetPlaybackDuration()'),
        documentation: new MarkdownString(
`
    GetPlaybackDuration() as Integer

Returns the duration of the video, in seconds.
This information may not be available until after the video starts playing. A value of zero is returned if the duration is unknown.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'GetAudioTracks',
        insertText: new SnippetString('GetAudioTracks()'),
        documentation: new MarkdownString(
`
    GetAudioTracks() as Object

Function returns an array of audio tracks contained in the current stream. Each element of the array represents a single audio track which contains the following attributes:

Attribute | Description
--- | ---
Language | Language code ("eng" for English, etc.)
Track | Audio track identifier
Name | Track name
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'ChangeAudioTrack',
        insertText: new SnippetString('ChangeAudioTrack(${1:trackID as String})'),
        documentation: new MarkdownString(
`
    ChangeAudioTrack(trackID as String) as Void

This function is called to change the currently playing audio track. For content with multiple audio tracks, the current track can be selected programmatically using this function.
The function is passed a track ID value, as found in the Track attribute of the audio track records returned by GetAudioTracks().
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'SetTimedMetaDataForKeys',
        insertText: new SnippetString('SetTimedMetaDataForKeys(${1:keys as Dynamic})'),
        documentation: new MarkdownString(
`
    SetTimedMetaDataForKeys(keys[] as Dynamic) as Void

This method is called to specify the timedMetaData keys that the BrightScript channel is interested in receiving from the timedMetaData event.
If the keys array is empty, all the timed metadata associated with the current stream is sent with the isTimedMetaData event.
If the keys array is invalid, then do not return any keys to the BrightScript channel.
Any keys not specified with this method are deleted by the firmware and never returned to the BrightScript application.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'GetCaptionRenderer',
        insertText: new SnippetString('GetCaptionRenderer()'),
        documentation: new MarkdownString(
`
    GetCaptionRenderer() as Object

This method returns the roCaptionRenderer instance associated with this roVideoPlayer.
Channels that render their own captions need to call this method to get the caption renderer for their video player in order to do capture rendering. See roCaptionRenderer for details.
`
        )
    }
];
