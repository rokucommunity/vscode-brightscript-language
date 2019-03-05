import {
    CompletionItem,
    CompletionItemKind
} from 'vscode';

import * as vscode from 'vscode';

export const ifByteArrayCompletionItems: CompletionItem[] = [
    {
        kind: CompletionItemKind.Method,
        label: 'WriteFile',
        insertText: new vscode.SnippetString('WriteFile(${1:path as String})'),
        documentation: new vscode.MarkdownString(
`
    WriteFile(path as String) as Boolean

Writes the bytes contained in the Byte Array to the specified file.

Returns true if successful.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'WriteFile',
        insertText: new vscode.SnippetString('WriteFile(${1:path as String}, ${2:start_index as Integer}, ${3:length as Integer})'),
        documentation: new vscode.MarkdownString(
`
    WriteFile(path as String, start_index as Integer, length as Integer) as Boolean

Writes a subset of the bytes contained in the Byte Array to the specified file.
"length" bytes are written, starting at the zero-based start_index.

Returns true if successful.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'ReadFile',
        insertText: new vscode.SnippetString('ReadFile(${1:path as String})'),
        documentation: new vscode.MarkdownString(
`
    ReadFile(path as String) as Boolean

Reads the specified file into the Byte Array.

Any data currently in the Byte Array is discarded.

Returns true if successful.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'ReadFile',
        insertText: new vscode.SnippetString('ReadFile(${1:path as String}, ${2:start_pos as Integer}, ${3:length as Integer})'),
        documentation: new vscode.MarkdownString(
`
    ReadFile(path as String, start_pos as Integer, length as Integer) as Boolean

Reads a section of the file into the Byte Array.
"length" bytes are read, starting at the zero-based start_pos.

*Note that in WriteFile, start_index is an index into the Byte Array, but in ReadFile, start_pos is an index into the file.*

Any data currently in the Byte Array is discarded.

Returns true if successful.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'AppendFile',
        insertText: new vscode.SnippetString('AppendFile(${1:path as String})'),
        documentation: new vscode.MarkdownString(
`
    AppendFile(path as String) as Boolean

Appends the contents of the Byte Array to the specified file.

Returns true if successful.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'AppendFile',
        insertText: new vscode.SnippetString('AppendFile(${1:path as String}, ${2:start_pos as Integer}, ${3:length as Integer})'),
        documentation: new vscode.MarkdownString(
`
    AppendFile(path as String, start_pos as Integer, length as Integer) as Boolean

Appends a subset of the bytes contained in the Byte Array to the specified file.
"length" bytes are written, starting at the zero-based start_index.

Returns true if successful.

_This function is available in firmware 7.5 or later._
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'SetResize',
        insertText: new vscode.SnippetString('SetResize(${1:min_size as Integer}, ${2:auto_resize as Boolean})'),
        documentation: new vscode.MarkdownString(
`
    SetResize(min_size as Integer, auto_resize as Boolean) as Boolean

If the size of the Byte Array is less than min_size, expands the Byte Array to min_size.
Also sets the auto-resize attribute of the Byte Array to the specified value.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'ToHexString',
        insertText: new vscode.SnippetString('ToHexString()'),
        documentation: new vscode.MarkdownString(
`
    ToHexString() as String

Returns a hexadecimal string representing the contents of the Byte Array, two digits per byte.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'FromHexString',
        insertText: new vscode.SnippetString('FromHexString(${1:hexstring as String})'),
        documentation: new vscode.MarkdownString(
`
    FromHexString(hexstring as String) as Void

Sets the contents of the Byte Array to the specified value.
The string must be an even number of hexadecimal digits.
The string must contain valid hexadecimal digits, or the result is undefined.

Any data currently in the Byte Array is discarded.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'ToBase64String',
        insertText: new vscode.SnippetString('ToBase64String()'),
        documentation: new vscode.MarkdownString(
`
    ToBase64String() as String

Returns a base-64 string representing the contents of the Byte Array.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'FromBase64String',
        insertText: new vscode.SnippetString('FromBase64String(${1:s as String})'),
        documentation: new vscode.MarkdownString(
`
    FromBase64String(s as String) as Void

Sets the contents of the Byte Array to the specified value.
The string must be a valid base-64 encoding.

Any data currently in the Byte Array is discarded.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'ToAsciiString',
        insertText: new vscode.SnippetString('ToAsciiString()'),
        documentation: new vscode.MarkdownString(
`
    ToAsciiString() as String

Returns the contents of the Byte Array as a string.
The contents must be valid UTF-8 (or ASCII subset), or the result is undefined.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'FromAsciiString',
        insertText: new vscode.SnippetString('FromAsciiString(${1:s as String})'),
        documentation: new vscode.MarkdownString(
`
    FromAsciiString(s as String) as Void

Sets the contents of the Byte Array to the specified string using UTF-8 encoding.
Any data currently in the Byte Array is discarded.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'GetSignedByte',
        insertText: new vscode.SnippetString('GetSignedByte(${1:index as Integer})'),
        documentation: new vscode.MarkdownString(
`
    GetSignedByte(index as Integer) as Integer

Returns the signed byte at the specified zero-based index in the Byte Array.
Use ifArrayGet.GetEntry() or the [] array operator to read an unsigned byte in the Byte Array.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'GetSignedLong',
        insertText: new vscode.SnippetString('GetSignedLong(${1:index as Integer})'),
        documentation: new vscode.MarkdownString(
`
    GetSignedLong(index as Integer) as Integer

Returns the signed long (four bytes) starting at the specified zero-based index in the Byte Array.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'GetCRC32',
        insertText: new vscode.SnippetString('GetCRC32()'),
        documentation: new vscode.MarkdownString(
`
    GetCRC32() as Integer

Calculates a CRC-32 of the contents of the Byte Array.

_This function is available in firmware 7.5 or later._
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'GetCRC32',
        insertText: new vscode.SnippetString('GetCRC32(${1:start as Integer}, ${2:length as Integer})'),
        documentation: new vscode.MarkdownString(
`
    GetCRC32(start as Integer, length as Integer) as Integer

Calculates a CRC-32 of a subset of the bytes in the Byte Array.

_This function is available in firmware 7.5 or later._
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'IsLittleEndianCPU',
        insertText: new vscode.SnippetString('IsLittleEndianCPU()'),
        documentation: new vscode.MarkdownString(
`
    IsLittleEndianCPU() as Boolean

Returns true if the CPU architecture is little-endian.
`
        )
    }
];
