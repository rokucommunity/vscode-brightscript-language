import {
    CompletionItem,
    CompletionItemKind
} from 'vscode';

import * as vscode from 'vscode';

export const ifDraw2DCompletionItems: CompletionItem[] = [
    {
        kind: CompletionItemKind.Method,
        label: 'Clear',
        insertText: new vscode.SnippetString('Clear(${1:rgba as Integer})'),
        detail: 'Clear(rgba as Integer) as Void',
        documentation: new vscode.MarkdownString(
`
Clear the bitmap, and fill with the specified RGBA color.

Note that the alpha channel will be filled into the bitmap, even when not used. Once AlphaEnable is set to true,
the alpha channel will be taken into account when using this bitmap as a source. See SetAlphaEnable() for more information on alpha blending.

Note that Clear() is not the same as a DrawRect() for the entire bitmap. Clear() fills the bitmap with the specified RGBA; it does not perform any alpha blending operations.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'GetWidth',
        insertText: new vscode.SnippetString('GetWidth()'),
        detail: 'GetWidth() as Integer',
        documentation: new vscode.MarkdownString(
`
Returns the width of the bitmap in pixels.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'GetHeight',
        insertText: new vscode.SnippetString('GetHeight()'),
        detail: 'GetHeight() as Integer',
        documentation: new vscode.MarkdownString(
`
Returns the height of the bitmap in pixels.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'GetByteArray',
        insertText: new vscode.SnippetString('GetByteArray(${1:x as Integer}, ${2:y as Integer}, ${3:width as Integer}, ${4:height as Integer})'),
        detail: 'GetByteArray(x as Integer, y as Integer, width as Integer, height as Integer) as Object',
        documentation: new vscode.MarkdownString(
`
Returns an roByteArray representing the RGBA pixel values for the rectangle described by the parameters.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'GetPng',
        insertText: new vscode.SnippetString('GetPng(${1:x as Integer}, ${2:y as Integer}, ${3:width as Integer}, ${4:height as Integer})'),
        detail: 'GetPng(x as Integer, y as Integer, width as Integer, height as Integer) as Object',
        documentation: new vscode.MarkdownString(
`
If successful, returns an roByteArray object containing PNG image data for the specified area of the bitmap.

If the coordinates are out of bounds, or the PNG conversion fails for any reason, then invalid is returned.

The PNG is in 32-bit RGBA format.

_This function is available in firmware 7.0 or later._
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'GetAlphaEnable',
        insertText: new vscode.SnippetString('GetAlphaEnable()'),
        detail: 'GetAlphaEnable() as Boolean',
        documentation: new vscode.MarkdownString(
`
Returns true if alpha blending is enabled.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'SetAlphaEnable',
        insertText: new vscode.SnippetString('SetAlphaEnable(${1:enable as Boolean})'),
        detail: 'SetAlphaEnable(enable as Boolean) as Void',
        documentation: new vscode.MarkdownString(
`
If enable is true, do alpha blending when this bitmap is the destination. The setting of the source bitmap's alpha enable is ignored.

When turned on, each pixel in the destination bitmap is set by combining the destination and source pixels according to the alpha value in the source bitmap (or rectangle).
The destination alpha is not used. (In OpenGL this is referred to as GL_ONE_MINUS_SRC_ALPHA).

By default, alpha blending is off.

Even when alpha blending is off, the alpha value is still present in the bitmap, and must be passed when a function parameter is a color (which are always RGBA).
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'DrawRect',
        insertText: new vscode.SnippetString('DrawRect(${1:x as Integer}, ${2:y as Integer}, ${3:width as Integer}, ${4:height as Integer}, ${5:rgba as Integer})'),
        detail: 'DrawRect(x as Integer, y as Integer, width as Integer, height as Integer, rgba as Integer) as Void',
        documentation: new vscode.MarkdownString(
`
Fill the specified rectangle from left (x), top (y) to right (x + width), bottom (y + height) with the RGBA color.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'DrawPoint',
        insertText: new vscode.SnippetString('DrawPoint(${1:x as Integer}, ${2:y as Integer}, ${3:size as Float}, ${4:rgba as Integer})'),
        detail: 'DrawPoint(x as Integer, y as Integer, size as Float, rgba as Integer) as Void',
        documentation: new vscode.MarkdownString(
`
Draws a point at (x,y) with the given size and RGBA color.

_This function is available in firmware 6.2 or later._
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'DrawLine',
        insertText: new vscode.SnippetString('DrawLine(${1:xStart as Integer}, ${2:yStart as Integer}, ${3:xEnd as Integer}, ${4:yEnd as Integer}, ${5:rgba as Integer})'),
        detail: 'DrawLine(xStart as Integer, yStart as Integer, xEnd as Integer, yEnd as Integer, rgba as Integer) as Void',
        documentation: new vscode.MarkdownString(
`
Draw a line from (xStart, yStart) to (xEnd, yEnd) with RGBA color.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'DrawObject',
        insertText: new vscode.SnippetString('DrawObject(${1:x as Integer}, ${2:y as Integer}, ${3:src as Object}, ${4:rgba = &hFFFFFFFF})'),
        detail: 'DrawObject(x as Integer, y as Integer, src as Object, rgba = &hFFFFFFFF as Integer) as Boolean',
        documentation: new vscode.MarkdownString(
`
Draw the source object, where src is an roBitmap or an roRegion object, at position x,y.

Returns true if successful.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'DrawScaledObject',
        insertText: new vscode.SnippetString(
            'DrawScaledObject(${1:x as Integer}, ${2:y as Integer}, ${3:scaleX as Float}, ${4:scaleY as Float}, ${5:src as Object}, ${6:rgba = &hFFFFFFFF as Integer})'
            ),
        detail: 'DrawScaledObject(x as Integer, y as Integer, scaleX as Float, scaleY as Float, src as Object, rgba = &hFFFFFFFF as Integer) as Boolean',
        documentation: new vscode.MarkdownString(
`
Draw the source object, where src is an roBitmap or an roRegion object, at position x,y, scaled in the x direction by scaleX and in the y direction by scaleY.

scaleX and scaleY should each be greater than zero and less than one to reduce the object size, or greater than one to increase the object size.

Returns true if successful.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'DrawRotatedObject',
        insertText: new vscode.SnippetString('DrawRotatedObject(${1:x as Integer}, ${2:y as Integer}, ${3:theta as Float}, ${4:src as Object}, ${6:rgba = &hFFFFFFFF as Integer})'),
        detail: 'DrawRotatedObject(x as Integer, y as Integer, theta as Float, src as Object, rgba = &hFFFFFFFF as Integer) as Boolean',
        documentation: new vscode.MarkdownString(
`
Draw the source object, where src is an roBitmap or an roRegion object,  at position x,y rotated by angle theta degrees.

Theta is currently limited to 0, 90, 180, and 270 degrees.

Returns true if successful.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'DrawText',
        insertText: new vscode.SnippetString('DrawText(${1:text as String}, ${2:x as Integer}, ${3:y as Integer}, ${4:rgba as Integer}, ${5:font as Object})'),
        detail: 'DrawText(text as String, x as Integer, y as Integer, rgba as Integer, font as Object) as Boolean',
        documentation: new vscode.MarkdownString(
`
Draws the text at position (x,y) using the specified RGBA color and roFont font object.

Text is drawn anti-aliased.

The background image/color behind the text will show through the spaces and holes in the text.  To have the text erase the background, make a call to DrawRect() before calling DrawText().

The size, bold, and italic attributes are specified when creating the roFont.

Returns true if successful.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'Finish',
        insertText: new vscode.SnippetString('Finish()'),
        detail: 'Finish() as Void',
        documentation: new vscode.MarkdownString(
`
Realize the bitmap by finishing all queued draw calls. Until Finish() is called, prior graphics operations may not be user visible.

For example, they may be in the graphics display pipeline, or in a server queue.

Note that Finish() is synchronous, i.e. it does not return until all graphic operations are complete.

_Note: when working with an roScreen object, ifScreen.SwapBuffers() should be used instead of Finish()._
`
        )
    },
];
