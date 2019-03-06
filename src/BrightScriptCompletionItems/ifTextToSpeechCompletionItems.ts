import {
    CompletionItem,
    CompletionItemKind,
    MarkdownString,
    SnippetString
} from 'vscode';

export const ifTextToSpeechCompletionItems: CompletionItem[] = [
    {
        kind: CompletionItemKind.Method,
        label: 'Say',
        insertText: new SnippetString('Say(${1:text as String})'),
        documentation: new MarkdownString(
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
        insertText: new SnippetString('Silence(${1:duration as Integer})'),
        documentation: new MarkdownString(
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
        insertText: new SnippetString('Flush()'),
        documentation: new MarkdownString(
`
    Flush() as Void

Interrupts and stops any current text to speech spoken string, to be used when the application does not want to the text to speech to continue.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'IsEnabled',
        insertText: new SnippetString('IsEnabled()'),
        documentation: new MarkdownString(
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
        insertText: new SnippetString('GetAvailableLanguages()'),
        documentation: new MarkdownString(
`
    GetAvailableLanguages() as Object

Returns an array containing the current list of languages available for text to speech.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'SetLanguage',
        insertText: new SnippetString('SetLanguage(${1:name as String})'),
        documentation: new MarkdownString(
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
        insertText: new SnippetString('GetLanguage()'),
        documentation: new MarkdownString(
`
    GetLanguage() as String

Returns the name of the currently-selected text to speech language.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'GetAvailableVoices',
        insertText: new SnippetString('GetAvailableVoices()'),
        documentation: new MarkdownString(
`
    GetAvailableVoices() as Object

Returns an array containing the current list of voices available for text to speech.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'SetVoice',
        insertText: new SnippetString('SetVoice(${1:name as String})'),
        documentation: new MarkdownString(
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
        insertText: new SnippetString('GetVoice()'),
        documentation: new MarkdownString(
`
    GetVoice() as String

Returns the currently-selected voice.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'GetVolume',
        insertText: new SnippetString('GetVolume()'),
        documentation: new MarkdownString(
`
    GetVolume() as Integer

Returns the volume at which text is spoken. The value ranges from 0 for muted to 1000 for the highest volume. The default value is 1000.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'SetVolume',
        insertText: new SnippetString('SetVolume(${1:volume as Integer})'),
        documentation: new MarkdownString(
`
    SetVolume(volume as Integer) as Void

volume is the volume at which text is spoken. The value ranges from 0 for muted to 1000 for the highest volume. The default value is 1000.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'GetRate',
        insertText: new SnippetString('GetRate()'),
        documentation: new MarkdownString(
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
        insertText: new SnippetString('SetRate(${1:rate as Integer})'),
        documentation: new MarkdownString(
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
        insertText: new SnippetString('GetPitch()'),
        documentation: new MarkdownString(
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
        insertText: new SnippetString('SetPitch(${1:pitch as Integer})'),
        documentation: new MarkdownString(
`
    SetPitch(pitch as Integer) as Void

_Available since firmware version 7.5_

pitch sets the pitch at which text is spoken. The possible values range from -60 to +60.
`
        )
    }
];
