import {
    CompletionItem,
    CompletionItemKind
} from 'vscode';

import * as vscode from 'vscode';

export const ifStringOpsCompletionItems: CompletionItem[] = [
    {
        kind: CompletionItemKind.Method,
        label: 'SetString',
        insertText: new vscode.SnippetString('SetString(${1:s as String}, ${2:len as Integer})'),
        documentation: new vscode.MarkdownString(
`
    SetString(s as String, len as Integer) as Void

Sets the string to the first len characters of s.  Note that there is a similar function in the ifString interface, ifString.SetString(), which does not take a length parameter.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'AppendString',
        insertText: new vscode.SnippetString('AppendString(${1:s as String}, ${2:len as Integer})'),
        documentation: new vscode.MarkdownString(
`
    AppendString(s as String, len as Integer) as Void

Appends the first len characters of s to the end of the string.

Note: the function AppendString() modifies the object on which it is called, which can result in unexpected results if called on a literal string constant rather than a string object. For example:

    x = "one"
    print type(x) ' prints "String"
    x.AppendString("two", 3)
    print x ' will print "one" not "onetwo"

    y = box("one")
    print type(y) ' prints "roString"
    y.AppendString("two", 3)
    print y ' will print "onetwo"

The third line does not appear to do an append, but it is working as designed since the append happens to the temporary boxed object.
x="string" sets x to the intrinsic type, vs. y=box("string"), which works as you might expect.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'Len',
        insertText: new vscode.SnippetString('Len()'),
        documentation: new vscode.MarkdownString(
`
    Len() as Integer

Returns the number of characters in the string.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'Left',
        insertText: new vscode.SnippetString('Left(${1:len as Integer})'),
        documentation: new vscode.MarkdownString(
`
    Left(len as Integer) as String

Returns a string consisting of the first len characters of the string.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'Right',
        insertText: new vscode.SnippetString('Right(${1:len as Integer})'),
        documentation: new vscode.MarkdownString(
`
    Right(len as Integer) as String

Returns a string consisting of the last len characters of the string.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'Mid',
        insertText: new vscode.SnippetString('Mid(${1:start_index as Integer})'),
        documentation: new vscode.MarkdownString(
`
    Mid(start_index as Integer) as String

Returns a string consisting of the last characters of the string, starting at the zero-based start_index.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'Mid',
        insertText: new vscode.SnippetString('Mid(${1:start_index as Integer}, ${2:num_chars as Integer})'),
        documentation: new vscode.MarkdownString(
`
    Mid(start_index as Integer, num_chars as Integer) as String

Returns a string consisting of num_chars characters of the string, starting at the zero-based start_index.
If there are fewer than num_chars in the string after start_index, returns the remaining characters in the string.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'Instr',
        insertText: new vscode.SnippetString('Instr(${1:substring as String})'),
        documentation: new vscode.MarkdownString(
`
    Instr(substring as String) as Integer

Returns the zero-based index of the first occurrence of substring in the string. If the substring does not occur in the string, returns -1.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'Replace',
        insertText: new vscode.SnippetString('Replace(${1:from as String}, ${2:to as String})'),
        documentation: new vscode.MarkdownString(
`
    Replace(from As String, to As String) As String

Returns a copy of the string with all instances of fromStr replaced with toStr.  If fromStr is empty the return value is the same as the source string.

Example:

    print "a-b-c".Replace("-", "/")
    ' result is "a/b/c"
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'Instr',
        insertText: new vscode.SnippetString('Instr(${1:start_index as Integer}, ${2:substring as String})'),
        documentation: new vscode.MarkdownString(
`
    Instr(start_index as Integer, substring as String) as Integer

Returns the zero-based index of the first occurrence of substring in the string, starting at the specified zero-based start_index.
If the substring does not occur in the string after start_index, returns -1.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'Trim',
        insertText: new vscode.SnippetString('Trim()'),
        documentation: new vscode.MarkdownString(
`
    Trim() as String

Returns the string with any leading and trailing whitespace characters removed.

Whitespace characters include space, TAB, LF, CR, VT, FF, NO-BREAK SPACE, et al.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'ToInt',
        insertText: new vscode.SnippetString('ToInt()'),
        documentation: new vscode.MarkdownString(
`
    ToInt() as Integer

Returns the value of the string interpreted as a decimal number.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'ToFloat',
        insertText: new vscode.SnippetString('ToFloat()'),
        documentation: new vscode.MarkdownString(
`
    ToFloat() as Float

Returns the value of the string interpreted as a floating point number.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'Tokenize',
        insertText: new vscode.SnippetString('Tokenize(${1:delim as String})'),
        documentation: new vscode.MarkdownString(
`
    Tokenize(delim as String) as Object

Splits the string into separate substrings separated by a single delimiter character. The delim parameter specifies a set of characters which are treated as delimiters.
A sequence of two or more contiguous delimiters in the string is treated as a single delimiter. Returns an roList containing each of the substrings. The delimiters are not returned.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'Split',
        insertText: new vscode.SnippetString('Split(${1:separator as String})'),
        documentation: new vscode.MarkdownString(
`
    Split(separator as String) as Object

_This function is available in firmware 7.1 or later._

Splits the input string using the separator string as a delimiter, and returns an array of the split token strings (not including the delimiter(s)).
An empty separator string indicates to split the string by character.

Examples:

    a = "".Split("")
    ' creates the array equivalent to
    a = []

    a = "123".Split("")
    ' creates the array equivalent to
    a = ["1", "2", "3"]

    a = "123".Split("/")
    ' creates the array equivalent to
    a = ["123"]

    a = "/123/".Split("/")
    ' creates the array equivalent to
    a = ["", "123", ""]

    a = "one, two, three".Split(", ")
    ' creates the array equivalent to
    a = ["one", "two", "three"]
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'GetEntityEncode',
        insertText: new vscode.SnippetString('GetEntityEncode()'),
        documentation: new vscode.MarkdownString(
`
    GetEntityEncode() as String

Returns the string with certain characters replaced with the corresponding HTML entity encoding sequence:

Character | Replaced With
--- | ---
" | &amp;quot;
' | &amp;apos;
< | &amp;lt;
> | &amp;gt;
& | &amp;amp;
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'Escape',
        insertText: new vscode.SnippetString('Escape()'),
        documentation: new vscode.MarkdownString(
`
    Escape() as String

_This function is available in firmware 7.5 or later._

URL encode the specified string per RFC 3986 and return the encoded string.

Non-ASCII characters are encoded as UTF-8 escape sequences.

The functionality is essentially the same as roUrlTransfer.Escape, but without the overhead of creating a roUrlTransfer object.

Note: consider using EncodeUri or EncodeUriComponent instead.

Examples:

    s = "@&=+/#!*"
    t = s.Escape()
    print """" + t + """"
    ' "%40%26%3D%2B%2F%23%21%2A"

    ' escaped characters are encoded as UTF-8 sequences
    s = Chr(&h2022)
    t = s.Escape()
    print """" + t + """"
    ' "%E2%80%A2"
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'Unescape',
        insertText: new vscode.SnippetString('Unescape()'),
        documentation: new vscode.MarkdownString(
`
    Unescape() as String

_This function is available in firmware 7.5 or later._

URL decode the specified string per RFC 3986 and return the decoded string.

The functionality is essentially the same as roUrlTransfer.Unescape, but without the overhead of creating a roUrlTransfer object.

If the escaped string includes invalid escape sequences, the decode will fail and an empty string will be returned.

Note: consider using DecodeUri or DecodeUriComponent instead.

Examples:

    t = "%3B%3F%3A%24%2C%28%29"
    s = t.Unescape()
    print """" + s + """"
    ' ";?:$,()"
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'EncodeUri',
        insertText: new vscode.SnippetString('EncodeUri()'),
        documentation: new vscode.MarkdownString(
`
    EncodeUri() as String

_This function is available in firmware 7.5 or later._

Encode the specified string with escape sequences for reserved Uniform Resource Identifier (URI) characters.

Non-ASCII characters are encoded as UTF-8 escape sequences.

Examples:

    s = "http://roku.com/my test.asp?first=jane&last=doe"
    t = s.EncodeUri()
    print """" + t + """"
    ' "http://roku.com/my%20test.asp?first=jane&last=doe"
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'DecodeUri',
        insertText: new vscode.SnippetString('DecodeUri()'),
        documentation: new vscode.MarkdownString(
`
    DecodeUri() as String

_This function is available in firmware 7.5 or later._

Decode the specified string with escape sequences for reserved Uniform Resource Identifier (URI) characters.

If the escaped string includes invalid escape sequences, the decode will fail and an empty string will be returned.

Examples:

    t = "http://roku.com/my%20test.asp?first=jane&last=doe"
    s = t.DecodeUri()
    print """" + s + """"
    ' "http://roku.com/my test.asp?first=jane&last=doe"
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'EncodeUriComponent',
        insertText: new vscode.SnippetString('EncodeUriComponent()'),
        documentation: new vscode.MarkdownString(
`
    EncodeUriComponent() as String

_This function is available in firmware 7.5 or later._

Encode the specified string with escape sequences for reserved Uniform Resource Identifier (URI) component characters.

Non-ASCII characters are encoded as UTF-8 escape sequences.

Examples:

    s = "http://roku.com/my test.asp?first=jane&last=doe"
    t = s.EncodeUriComponent()
    print """" + t + """"
    ' "http%3A%2F%2Froku.com%2Fmy%20test.asp%3Ffirst%3Djane%26last%3Ddoe"
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'DecodeUriComponent',
        insertText: new vscode.SnippetString('DecodeUriComponent()'),
        documentation: new vscode.MarkdownString(
`
    DecodeUriComponent() as String

_This function is available in firmware 7.5 or later._

Decode the specified string with escape sequences for reserved Uniform Resource Identifier (URI) component characters.

If the escaped string includes invalid escape sequences, the decode will fail and an empty string will be returned.

Examples:

    t = "http%3A%2F%2Froku.com%2Fmy%20test.asp%3Ffirst%3Djane%26last%3Ddoe"
    s = t.DecodeUriComponent()
    print """" + s + """"
    ' "http://roku.com/my test.asp?first=jane&last=doe"
`
        )
    },
];
