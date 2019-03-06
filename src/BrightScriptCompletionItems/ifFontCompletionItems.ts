import {
    CompletionItem,
    CompletionItemKind,
    MarkdownString,
    SnippetString
} from 'vscode';

export const ifFontCompletionItems: CompletionItem[] = [
    {
        kind: CompletionItemKind.Method,
        label: 'GetOneLineHeight',
        insertText: new SnippetString('GetOneLineHeight()'),
        documentation: new MarkdownString(
`
    GetOneLineHeight() as Integer

Returns the number of pixels from one line to the next when drawing with this font.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'GetOneLineWidth',
        insertText: new SnippetString('GetOneLineWidth(${1:text as String}, ${2:MaxWidth as Integer})'),
        documentation: new MarkdownString(
`
    GetOneLineWidth(text as String, MaxWidth as Integer) as Integer

Returns the width in pixels for this particular string, when rendered with this font.
Each glyph and the needed spacing between glyphs is measured.The returned number of pixels will be no larger than MaxWidth.
MaxWidth is generally the amount of pixels available for rendering on this line.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'GetAscent',
        insertText: new SnippetString('GetAscent()'),
        documentation: new MarkdownString(
`
    GetAscent() as Integer

Returns the font ascent in pixels.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'GetDescent',
        insertText: new SnippetString('GetDescent()'),
        documentation: new MarkdownString(
`
    GetDescent() as Integer

Returns the font descent in pixels.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'GetMaxAdvance',
        insertText: new SnippetString('GetMaxAdvance()'),
        documentation: new MarkdownString(
`
    GetMaxAdvance() as Integer

Returns the font maximum advance width in pixels.
`
        )
    }
];
