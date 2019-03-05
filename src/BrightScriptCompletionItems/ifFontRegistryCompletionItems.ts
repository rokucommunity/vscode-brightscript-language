import {
    CompletionItem,
    CompletionItemKind
} from 'vscode';

import * as vscode from 'vscode';

export const ifFontRegistryCompletionItems: CompletionItem[] = [
    {
        kind: CompletionItemKind.Method,
        label: 'Register',
        insertText: new vscode.SnippetString('Register(${1:path as String})'),
        documentation: new vscode.MarkdownString(
`
    Register(path as String) as Boolean

Register a font file (.ttf or .otf format).  Each font file defines one or more font families (usually one).

Path should be a valid path name (see File System).

Returns true if the font(s) in the file were successfully installed.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'GetFamilies',
        insertText: new vscode.SnippetString('GetFamilies()'),
        documentation: new vscode.MarkdownString(
`
    GetFamilies() as Object

Returns an roArray of strings that represent the names of the font families which have been registered via Register(). Each name can be passed as the first parameter to GetFont().
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'GetFont',
        insertText: new vscode.SnippetString('GetFont(${1:family as String}, ${2:size as Integer}, ${3:bold as Boolean}, ${4:italic as Boolean})'),
        documentation: new vscode.MarkdownString(
`
    GetFont(family as String, size as Integer, bold as Boolean, italic as Boolean) as Object

Returns an roFont object representing a font from the specified family, selected from the fonts previously registered via Register().
size is the requested font size, in pixels, not points. bold and italic specify font variants which may be (but are not always) supported by the font file.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'GetDefaultFont',
        insertText: new vscode.SnippetString('GetDefaultFont(${1:size as Integer}, ${2:bold as Boolean}, ${3:italic as Boolean})'),
        documentation: new vscode.MarkdownString(
`
    GetDefaultFont(size as Integer, bold as Boolean, italic as Boolean) as Object

Returns an roFont object representing the system font. The system font is always available, even if Register() has not been called. Size, bold and italic are interpreted as in GetFont().
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'GetDefaultFontSize',
        insertText: new vscode.SnippetString('GetDefaultFontSize()'),
        documentation: new vscode.MarkdownString(
`
    GetDefaultFontSize() as Integer

Returns the default font size.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'Get',
        insertText: new vscode.SnippetString('Get(${1:family as String}, ${2:size as Integer}, ${3:bold as Boolean}, ${4:italic as Boolean})'),
        documentation: new vscode.MarkdownString(
`
    Get(family as String, size as Integer, bold as Boolean, italic as Boolean) as String

Returns a valid font string that can be used as the value of the Font content meta-data parameter recognized by the roImageCanvas.

family, size, bold, italic are interpreted as in GetFont().
`
        )
    },
];
