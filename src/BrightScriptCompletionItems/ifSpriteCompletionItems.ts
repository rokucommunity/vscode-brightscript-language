import {
    CompletionItem,
    CompletionItemKind
} from 'vscode';

import * as vscode from 'vscode';

export const ifSpriteCompletionItems: CompletionItem[] = [
    {
        kind: CompletionItemKind.Method,
        label: 'MoveTo',
        insertText: new vscode.SnippetString('MoveTo(${1:x as Integer}, ${2:y as Integer})'),
        documentation: new vscode.MarkdownString(
`
    MoveTo(x as Integer, y as Integer) as Void

Move the sprite to coordinate x,y.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'MoveOffset',
        insertText: new vscode.SnippetString('MoveOffset(${1:xOffset as Integer}, ${2:yOffset as Integer})'),
        documentation: new vscode.MarkdownString(
`
    MoveOffset(xOffset as Integer, yOffset as Integer) as Void

Move the sprite to the current position plus the xOffset and yOffset.
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

Returns the x coordinate of the sprite.
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

Returns the y coordinate of the sprite.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'SetZ',
        insertText: new vscode.SnippetString('SetZ(${1:z as Integer})'),
        documentation: new vscode.MarkdownString(
`
    SetZ(z as Integer) as Void

Sets the z value of the sprite. The z value defines the order in which sprites are drawn.
Sprites with higher z values are drawn after (in front of) sprites with lower z values. The default z value is 0.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'GetZ',
        insertText: new vscode.SnippetString('GetZ()'),
        documentation: new vscode.MarkdownString(
`
    GetZ() as Integer

Returns the z value of the sprite.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'SetDrawableFlag',
        insertText: new vscode.SnippetString('SetDrawableFlag(${1:enable as Boolean})'),
        documentation: new vscode.MarkdownString(
`
    SetDrawableFlag(enable as Boolean) as Void

Sets whether this sprite is drawable or just used for collision tests. An undrawable sprite can be used to define a region in the background that needs collision testing.
It can also be used as an auxiliary collision region for a more complex sprite defined in another sprite. The default value of true is set when a sprite is created. The default value is true.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'GetDrawableFlag',
        insertText: new vscode.SnippetString('GetDrawableFlag()'),
        documentation: new vscode.MarkdownString(
`
    GetDrawableFlag() as Boolean

Returns the value of the Drawable Flag.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'SetMemberFlags',
        insertText: new vscode.SnippetString('SetMemberFlags(${1:flags as Integer})'),
        documentation: new vscode.MarkdownString(
`
    SetMemberFlags(flags as Integer) as Void

Sets flags to define the sprite membership.These flags are used with CollidableFlags to define what sprites are allowed to collide. The default value is 1.

Enables "levels" of collision detection, as only sprites with a member flag bit that matches a collidable flag bit will be checked for collisions.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'GetMemberFlags',
        insertText: new vscode.SnippetString('GetMemberFlags()'),
        documentation: new vscode.MarkdownString(
`
    GetMemberFlags() as Integer

Returns the value of member flags variable.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'SetCollidableFlags',
        insertText: new vscode.SnippetString('SetCollidableFlags(${1:flags as Integer})'),
        documentation: new vscode.MarkdownString(
`
    SetCollidableFlags(flags as Integer) as Void

Sets bits to determine what sprites will be checked for collisions. The sprites that are checked must have the corresponding bits sets in their MemberFlags. The default value is 1.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'GetCollidableFlags',
        insertText: new vscode.SnippetString('GetCollidableFlags()'),
        documentation: new vscode.MarkdownString(
`
    GetCollidableFlags() as Integer

Returns the value of collidable flags variable.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'SetRegion',
        insertText: new vscode.SnippetString('SetRegion(${1:region as Object})'),
        documentation: new vscode.MarkdownString(
`
    SetRegion(region as Object) as Void

Set the region of the sprite to the passed in region roRegion object. If one already is set, it is replaced.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'GetRegion',
        insertText: new vscode.SnippetString('GetRegion()'),
        documentation: new vscode.MarkdownString(
`
    GetRegion() as Object

Returns an roRegion object that specifies the region of a bitmap that is the sprite's display graphic.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'OffsetRegion',
        insertText: new vscode.SnippetString('OffsetRegion(${1:x as Integer}, ${2:y as Integer}, ${3:width as Integer}, ${4:height as Integer})'),
        documentation: new vscode.MarkdownString(
`
    OffsetRegion(x as Integer, y as Integer, width as Integer, height as Integer) as Void

Calls Region.Offset() on this Sprite's region. Adjusts the part of an roRegion's bitmap that is being displayed as the sprite. Wrap is taken into consideration.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'SetData',
        insertText: new vscode.SnippetString('SetData(${1:data as Dynamic})'),
        documentation: new vscode.MarkdownString(
`
    SetData(data as Dynamic) as Void

Associate user defined data with the sprite. The data can be any type including intrinsic types or objects.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'GetData',
        insertText: new vscode.SnippetString('GetData()'),
        documentation: new vscode.MarkdownString(
`
    GetData() as Dynamic

Returns any user data associated with the sprite previously set via SetData().

Returns invalid if there is no user data associated with this sprite.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'CheckCollision',
        insertText: new vscode.SnippetString('CheckCollision()'),
        documentation: new vscode.MarkdownString(
`
    CheckCollision() as Object

Returns the first roSprite that this sprite collides with. The collision area is the entire sprite's bounding box, and the sprites must actually be overlapped to detect a collision.
That is, if a fast moving sprite moves "through" another sprite without actually overlapping when this call is made, no collision is detected.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'CheckMultipleCollisions',
        insertText: new vscode.SnippetString('CheckMultipleCollisions()'),
        documentation: new vscode.MarkdownString(
`
    CheckMultipleCollisions() as Dynamic

Like CheckCollision but returns an array of all colliding sprites. If there are no collisions return invalid.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'Remove',
        insertText: new vscode.SnippetString('Remove()'),
        documentation: new vscode.MarkdownString(
`
    Remove() as Void

Remove the sprite from the managing roComposite object and delete the sprite.
`
        )
    },
];
