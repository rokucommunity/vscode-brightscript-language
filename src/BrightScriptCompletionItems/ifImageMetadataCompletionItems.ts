import {
    CompletionItem,
    CompletionItemKind
} from 'vscode';

import * as vscode from 'vscode';

export const ifImageMetadataCompletionItems: CompletionItem[] = [
    {
        kind: CompletionItemKind.Method,
        label: 'SetUrl',
        insertText: new vscode.SnippetString('SetUrl(${1:url as String})'),
        detail: 'SetUrl(url as String) as Void',
        documentation: new vscode.MarkdownString(
`
Set the URL to the image. Only file urls are supported.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'GetMetaData',
        insertText: new vscode.SnippetString('GetMetaData()'),
        detail: 'GetMetaData() as Object',
        documentation: new vscode.MarkdownString(
`
Returns an associative array with set of simple and common image metadata. This associative array includes:

Name | Type | Notes
--- | --- | ---
width | Integer | Width of the image in pixels.
height | Integer | Height of the image in pixels.
orientation | String | "portrait" or "landscape"
datetime | roDateTime | The creation time of the image such as the time a photo was taken.
comment | String | User specified comment string. This is often referred to as a caption.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'GetThumbnail',
        insertText: new vscode.SnippetString('GetThumbnail()'),
        detail: 'GetThumbnail() as Object',
        documentation: new vscode.MarkdownString(
`
Returns a thumbnail image if one is embedded in the image metadata. This will not generate a thumbnail if one doesn't already exist.
Returns an AssociateArray with two entries: "bytes" and "type". "bytes" is an roByteArray with the image data.
"type" specifies the type of image which is most likely "image/jpeg" but could be something else like "image/png".
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'GetRawExif',
        insertText: new vscode.SnippetString('GetRawExif()'),
        detail: 'GetRawExif() as Object',
        documentation: new vscode.MarkdownString(
`
Returns an associative array with all of the raw EXIF metadata. See the EXIF section below for more details.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'GetRawExifTag',
        insertText: new vscode.SnippetString('GetRawExifTag(${1:ifd as Integer}, ${2:tag as Integer})'),
        detail: 'GetRawExifTag(ifd as Integer, tag as Integer) as Dynamic',
        documentation: new vscode.MarkdownString(
`
Returns the raw data for one Exif tag. Returns invalid if that tag does not exist. This is useful for direct access to a raw EXIF tag if you know exactly what tag you want.
`
        )
    },
];
