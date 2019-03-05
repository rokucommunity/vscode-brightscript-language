import {
    CompletionItem,
    CompletionItemKind
} from 'vscode';

import * as vscode from 'vscode';

export const ifAudioGuideCompletionItems: CompletionItem[] = [
    {
        kind: CompletionItemKind.Method,
        label: 'Say',
        insertText: new vscode.SnippetString('Say(${1:text as String}, ${2:flushSpeech as Boolean}, ${3:dontRepeat as Boolean})'),
        documentation: new vscode.MarkdownString(
`
    Say(text as String, flushSpeech as Boolean, dontRepeat as Boolean) as Integer

Speaks the specified text string. This method does nothing if Audio Guide is currently disabled.

This method returns an ID for the spoken string to notify observer callbacks about a specific spoken string. This ID can be used with roTextToSpeechEvent.

This method will automatically split up text to reduce lag. Due to this automatic splitting, the roTextToSpeechEvent 0
("Started speech") event for the returned ID may not be sent until later than expected. The roTextToSpeechEvents 1
("Speech has completed") and 2 ("Speech has been flushed") events are sent at the expected times.

This method also uses the correct voice, language, volume, and speech rate for Audio Guide and tries to be "smart"
by pre-processing the text for correct pronunciation of items such as currency, email addresses, acronyms, media-related names and titles, etc.

For more control over what is said, use roTextToSpeech.Say() which does not pre-process the text, set volume, rate, etc.
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

Interrupts and stops any current text to speech spoken string, to be used when the application does not want the text to speech to continue.
Note that this call is equivalent to roTextToSpeech.Flush(), and stops speech started using both roAudioGuide.Say() and roTextToSpeech.Say().
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

If Audio Guide is enabled, causes text to speech to continue to suppress any application background sound for the amount of time specified by duration (in milliseconds).
This can be used to add clarity for longer spoken text that may have pauses that might otherwise allow application background sound to be heard.
This method does nothing if Audio Guide is currently disabled.
`
        )
    }
];
