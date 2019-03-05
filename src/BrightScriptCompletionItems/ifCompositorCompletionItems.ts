import {
    CompletionItem,
    CompletionItemKind
} from 'vscode';

import * as vscode from 'vscode';

export const ifCompositorCompletionItems: CompletionItem[] = [
    {
        kind: CompletionItemKind.Method,
        label: 'SetDrawTo',
        insertText: new vscode.SnippetString('SetDrawTo(${1:destBitmap as Object}, ${2:rgbaBackground as Integer})'),
        documentation: new vscode.MarkdownString(
`
    SetDrawTo(destBitmap as Object, rgbaBackground as Integer) as Void

Set the destBitmap (roBitmap or roScreen) and the background color.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'Draw',
        insertText: new vscode.SnippetString('Draw()'),
        documentation: new vscode.MarkdownString(
`
    Draw() as Void

Draw any dirty sprites (that is, whatever is new or has changed since the last Draw). No compositor or sprite operations will be reflected on the display until Draw() is called.

After calling Draw(), you must call Finish() (if single buffered) or SwapBuffers() (if double buffered) before the changes will be user visible.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'DrawAll',
        insertText: new vscode.SnippetString('DrawAll()'),
        documentation: new vscode.MarkdownString(
`
    DrawAll() as Void

Redraw all sprites even if not dirty.

After calling Draw(), you must call Finish() (if single buffered) or SwapBuffers() (if double buffered) before the changes will be user visible.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'NewSprite',
        insertText: new vscode.SnippetString('NewSprite(${1:x as Integer}, ${2:y as Integer}, ${3:region as Object}, ${4:z as Integer})'),
        documentation: new vscode.MarkdownString(
`
    NewSprite(x as Integer, y as Integer, region as Object, z as Integer) as Object

Returns an roSprite object

Create a new sprite, using an roRegion to define the sprite's bitmap. Position the sprite at coordinate x,y.

If z is provided, position the sprite in front of all other sprites with equal or lower z value. Sprites with negative z values are not rendered or displayed on the screen.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'NewAnimatedSprite',
        insertText: new vscode.SnippetString('NewAnimatedSprite(${1:x as Integer}, ${2:y as Integer}, ${3:regionArray as Object}, ${4:z as Integer})'),
        documentation: new vscode.MarkdownString(
`
    NewAnimatedSprite(x as Integer, y as Integer, regionArray as Object, z as Integer) as Object

Returns an roSprite object.

Create a new sprite that consists of a sequence of frames to be animated. The frames are defined by the regionArray which is an roArray of roRegions

Position the sprite at coordinate x,y.

If z is provided, position the sprite in front of all other sprites with equal or lower z value
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'AnimationTick',
        insertText: new vscode.SnippetString('AnimationTick(${1:duration as Integer})'),
        documentation: new vscode.MarkdownString(
`
    AnimationTick(duration as Integer) as Void

Duration is the number of ms since the last call.

Moves all animated sprites.

Sprites will not animate unless you call this function regularly.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'ChangeMatchingRegions',
        insertText: new vscode.SnippetString('ChangeMatchingRegions(${1:oldRegion as Object}, ${2:newRegion as Object})'),
        documentation: new vscode.MarkdownString(
`
    ChangeMatchingRegions(oldRegion as Object, newRegion as Object) as Void

Global search and replace of Sprite roRegions.

Replaces regions that match oldRegion with newRegion.
`
        )
    }
];
