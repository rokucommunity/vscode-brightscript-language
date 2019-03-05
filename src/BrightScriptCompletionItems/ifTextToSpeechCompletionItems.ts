import {
    CompletionItem,
    CompletionItemKind
} from 'vscode';

import * as vscode from 'vscode';

export const ifTextToSpeechCompletionItems: CompletionItem[] = [
    {
        kind: CompletionItemKind.Method,
        label: 'Say',
        insertText: new vscode.SnippetString('Say(${1:text as String})'),
        documentation: new vscode.MarkdownString(
`
    Say(text as String) as Integer

text is a UTF8 string

Causes the string specified by text to be spoken. Returns an ID for the spoken string to notify observer callbacks about a specific spoken string.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'Silence',
        insertText: new vscode.SnippetString('Silence(${1:duration as Integer})'),
        documentation: new vscode.MarkdownString(
`
    Silence(duration as Integer) as Integer

duration is time in milliseconds

Causes text to speech to continue to suppress any application background sound for the amount of time specified by duration.
This can be used to add clarity for longer spoken text that may have pauses that might otherwise allow application background sound to be heard.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'Flush',
        insertText: new vscode.SnippetString('Flush()'),
        documentation: new vscode.MarkdownString(
`
    Flush() as Void

Interrupts and stops any current text to speech spoken string, to be used when the application does not want to the text to speech to continue.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'IsEnabled',
        insertText: new vscode.SnippetString('IsEnabled()'),
        documentation: new vscode.MarkdownString(
`
    IsEnabled() as Boolean

Returns the enabled setting of text to speech.
Text to speech may be enabled or disabled for various technical reasons (for example, on some platforms, text to speech may only be enabled once in connected mode).
This is not affected by the state of any of its clients. In particular, it does not depend on whether a CVAA compliant accessibility feature is enabled or not.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'GetAvailableLanguages',
        insertText: new vscode.SnippetString('GetAvailableLanguages()'),
        documentation: new vscode.MarkdownString(
`
    GetAvailableLanguages() as Object

Returns an array containing the current list of languages available for text to speech.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'SetLanguage',
        insertText: new vscode.SnippetString('SetLanguage(${1:name as String})'),
        documentation: new vscode.MarkdownString(
`
    SetLanguage(name as String) as Void

name is the name of an available text to speech language

Sets the language specified by name for text to speech, from one of the available languages returned by GetAvailableLanguages().
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'GetLanguage',
        insertText: new vscode.SnippetString('GetLanguage()'),
        documentation: new vscode.MarkdownString(
`
    GetLanguage() as String

Returns the name of the currently-selected text to speech language.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'GetAvailableVoices',
        insertText: new vscode.SnippetString('GetAvailableVoices()'),
        documentation: new vscode.MarkdownString(
`
    GetAvailableVoices() as Object

Returns an array containing the current list of voices available for text to speech.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'SetVoice',
        insertText: new vscode.SnippetString('SetVoice(${1:name as String})'),
        documentation: new vscode.MarkdownString(
`
    SetVoice(name as String) as Void

name is the name of an available text to speech voice

Sets the voice specified by name for text to speech, from one of the available voices returned by GetAvailableVoices().
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'GetVoice',
        insertText: new vscode.SnippetString('GetVoice()'),
        documentation: new vscode.MarkdownString(
`
    GetVoice() as String

Returns the currently-selected voice.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'GetVolume',
        insertText: new vscode.SnippetString('GetVolume()'),
        documentation: new vscode.MarkdownString(
`
    GetVolume() as Integer

Returns the volume at which text is spoken. The value ranges from 0 for muted to 1000 for the highest volume. The default value is 1000.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'SetVolume',
        insertText: new vscode.SnippetString('SetVolume(${1:volume as Integer})'),
        documentation: new vscode.MarkdownString(
`
    SetVolume(volume as Integer) as Void

volume is the volume at which text is spoken. The value ranges from 0 for muted to 1000 for the highest volume. The default value is 1000.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'GetRate',
        insertText: new vscode.SnippetString('GetRate()'),
        documentation: new vscode.MarkdownString(
`
    GetRate() as Integer

_Available since firmware version 7.5_

Returns the rate at which text is spoken. The value ranges from -40 to 200 with a default value of 0.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'SetRate',
        insertText: new vscode.SnippetString('SetRate(${1:rate as Integer})'),
        documentation: new vscode.MarkdownString(
`
    SetRate(rate as Integer) as Void

_Available since firmware version 7.5_

rate sets the rate at which text is spoken. The possible values range from -40 to 200.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'GetPitch',
        insertText: new vscode.SnippetString('GetPitch()'),
        documentation: new vscode.MarkdownString(
`
    GetPitch() as Integer

_Available since firmware version 7.5_

Returns the pitch at which text is spoken. The possible values range from -60 to +60.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'SetPitch',
        insertText: new vscode.SnippetString('SetPitch(${1:pitch as Integer})'),
        documentation: new vscode.MarkdownString(
`
    SetPitch(pitch as Integer) as Void

_Available since firmware version 7.5_

pitch sets the pitch at which text is spoken. The possible values range from -60 to +60.
`
        )
    },
];
