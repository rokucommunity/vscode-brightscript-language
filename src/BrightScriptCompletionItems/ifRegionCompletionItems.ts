import {
    CompletionItem,
    CompletionItemKind
} from 'vscode';

import * as vscode from 'vscode';

export const ifRegionCompletionItems: CompletionItem[] = [
    {
        kind: CompletionItemKind.Method,
        label: 'GetBitmap',
        insertText: new vscode.SnippetString('GetBitmap()'),
        documentation: new vscode.MarkdownString(
`
    GetBitmap() as Object

Returns the roBitmap object of the bitmap this region refers to. A region is always a section of a bitmap.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'GetX',
        insertText: new vscode.SnippetString('GetX()'),
        documentation: new vscode.MarkdownString(
`
    GetX() as Integer

Returns the x coordinate of the region in its bitmap.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'GetY',
        insertText: new vscode.SnippetString('GetY()'),
        documentation: new vscode.MarkdownString(
`
    GetY() as Integer

Returns the y coordinate of the region in its bitmap.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'GetWidth',
        insertText: new vscode.SnippetString('GetWidth()'),
        documentation: new vscode.MarkdownString(
`
    GetWidth() as Integer

Returns the width of the region.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'GetHeight',
        insertText: new vscode.SnippetString('GetHeight()'),
        documentation: new vscode.MarkdownString(
`
    GetHeight() as Integer

Returns the height of the region.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'Offset',
        insertText: new vscode.SnippetString('Offset(${1:x as Integer}, ${2:y as Integer}, ${3:w as Integer}, ${4:h as Integer})'),
        documentation: new vscode.MarkdownString(
`
    Offset(x as Integer, y as Integer, w as Integer, h as Integer) as Void

Adds the passed parameters x,y, w, and h to the values of those roRegion fields

Respects the wrap setting when adjusting the fields by the offsets.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'Set',
        insertText: new vscode.SnippetString('Set(${1:srcRegion as Object})'),
        documentation: new vscode.MarkdownString(
`
    Set(srcRegion as Object) as Void

Takes an roRegion object as input

Initializes the fields of this region to be the same as the values of the fields in the srcRegion.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'Copy',
        insertText: new vscode.SnippetString('Copy()'),
        documentation: new vscode.MarkdownString(
`
    Copy() as Object

Returns a newly created copy of the region as a new roRegion object.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'SetWrap',
        insertText: new vscode.SnippetString('SetWrap(${1:wrap as Boolean})'),
        documentation: new vscode.MarkdownString(
`
    SetWrap(wrap as Boolean) as Boolean

If wrap is true, any part of a region that extends beyond the bounds of its bitmap "wraps" to the other side of the bitmap and is rendered there.
If wrap is false, the part of the region beyond the bounds of its bitmap is not rendered.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'GetWrap',
        insertText: new vscode.SnippetString('GetWrap()'),
        documentation: new vscode.MarkdownString(
`
    GetWrap() as Boolean

Returns true if the region will wrap.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'SetTime',
        insertText: new vscode.SnippetString('SetTime(${1:time as Integer})'),
        documentation: new vscode.MarkdownString(
`
    SetTime(time as Integer) as Void

Set the "frame hold time" in milliseconds. This is the duration of each frame of any animated sprite which uses this region.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'GetTime',
        insertText: new vscode.SnippetString('GetTime()'),
        documentation: new vscode.MarkdownString(
`
    GetTime() as Integer

Returns the "frame hold time" in milliseconds.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'SetPretranslation',
        insertText: new vscode.SnippetString('SetPretranslation(${1:x as Integer}, ${2:y as Integer})'),
        documentation: new vscode.MarkdownString(
`
    SetPretranslation(x as Integer, y as Integer) as Void

Set the pretranslation for DrawObject, DrawRotatedObject, and DrawScaledObject.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'GetPretranslationX',
        insertText: new vscode.SnippetString('GetPretranslationX()'),
        documentation: new vscode.MarkdownString(
`
    GetPretranslationX() as Integer

Returns the pretranslation x value.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'GetPretranslationY',
        insertText: new vscode.SnippetString('GetPretranslationY()'),
        documentation: new vscode.MarkdownString(
`
    GetPretranslationY() as Integer

Returns the pretranslation y value.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'SetScaleMode',
        insertText: new vscode.SnippetString('SetScaleMode(${1:mode as Integer})'),
        documentation: new vscode.MarkdownString(
`
    SetScaleMode(mode as Integer) as Void

Set the scaling mode used for DrawScaledObject

* 0 = fast scaling operation (may have jaggies)
* 1 = smooth scaling operation (may be slow)
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'GetScaleMode',
        insertText: new vscode.SnippetString('GetScaleMode()'),
        documentation: new vscode.MarkdownString(
`
    GetScaleMode() as Integer

Returns the scaling mode.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'SetCollisionType',
        insertText: new vscode.SnippetString('SetCollisionType(${1:collisionType as Integer})'),
        documentation: new vscode.MarkdownString(
`
    SetCollisionType(collisionType as Integer) as Void

Sets the type of region to be used for collision tests with this sprite.

* Type 0 – Use the entire defined region of the sprite. Type 0 is the default.
* Type 1 – Use the defined rectangular region specified by the SetCollisionRectangle() method.
* Type 2 – Use a circular region specified by the SetCollisionCircle() method.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'GetCollisionType',
        insertText: new vscode.SnippetString('GetCollisionType()'),
        documentation: new vscode.MarkdownString(
`
    GetCollisionType() as Integer

Returns the collision type.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'SetCollisionRectangle',
        insertText: new vscode.SnippetString('SetCollisionRectangle(${1:xOffset as Integer}, ${2:yOffset as Integer}, ${3:width as Integer}, ${4:height as Integer})'),
        documentation: new vscode.MarkdownString(
`
    SetCollisionRectangle(xOffset as Integer, yOffset as Integer, width as Integer, height as Integer) as Void

Sets the collision rectangle used for type 1 collision tests.
The upper left corner of the rectangle is the (x,y) position of the sprite plus the specified offsets. width and height specify the size of the rectangle.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'SetCollisionCircle',
        insertText: new vscode.SnippetString('SetCollisionCircle(${1:xOffset as Integer}, ${2:yOffset as Integer}, ${3:radius as Integer})'),
        documentation: new vscode.MarkdownString(
`
    SetCollisionCircle(xOffset as Integer, yOffset as Integer, Radius as Integer) as Void

Sets the collision circle used for type 2 collision tests. The center of the circle is the (x,y) position of the sprite plus the specified offsets. radius specifies the size of the circle.
`
        )
    },
];
