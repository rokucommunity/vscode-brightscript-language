import {
    CompletionItem,
    CompletionItemKind
} from 'vscode';

import * as vscode from 'vscode';

export const ifXMLElementCompletionItems: CompletionItem[] = [
    {
        kind: CompletionItemKind.Method,
        label: 'Parse',
        insertText: new vscode.SnippetString('Parse(${1:xml as String})'),
        documentation: new vscode.MarkdownString(
`
    Parse(xml as String) as Boolean

Parse a string of XML. Returns true if successful. In that case, other methods below can then be used to extract information about the parsed element.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'GetBody',
        insertText: new vscode.SnippetString('GetBody()'),
        documentation: new vscode.MarkdownString(
`
    GetBody() as Object

Returns the body of the element. If the element contains child elements, GetBody() returns an roXMLList representing those elements, like GetChildElements().
If there are no children but the element contains text, GetBody() returns an roString like GetText(). If the element is empty, GetBody() returns invalid.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'GetAttributes',
        insertText: new vscode.SnippetString('GetAttributes()'),
        documentation: new vscode.MarkdownString(
`
    GetAttributes() as Object

Returns an Associative Array representing the XML attributes of the element.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'GetName',
        insertText: new vscode.SnippetString('GetName()'),
        documentation: new vscode.MarkdownString(
`
    GetName() as String

Returns the name of the element.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'GetText',
        insertText: new vscode.SnippetString('GetText()'),
        documentation: new vscode.MarkdownString(
`
    GetText() as String

Returns any text contained in the element. This returns immediate body text only, i.e. does not include text from child elements.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'GetChildElements',
        insertText: new vscode.SnippetString('GetChildElements()'),
        documentation: new vscode.MarkdownString(
`
    GetChildElements() as Object

If there are child elements contained in this one, returns an roXMLList representing those elements.
If there are no child elements, returns invalid. Note that this function won't handle cases of mixed XML content, i.e., content with both child elements and text such as:

<element><child>Child Text</child>More Text</element>

In this case GetChildElements() called with the top level <element> as an argument would return an roXMLList containing only one item corresponding to the <child> element.
The body text "More Text" would be lost. To handle mixed content cases, use GetChildNodes().
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'GetChildNodes',
        insertText: new vscode.SnippetString('GetChildNodes()'),
        documentation: new vscode.MarkdownString(
`
    GetChildNodes() as Object

If there are child elements contained in this one, returns an roList representing those elements.
If there are no child elements, returns invalid. The difference between this function and GetChildElements() is that GetChildNodes() handles the case of mixed XML content,
i.e., content with both child elements and text such as:

<element><child>Child Text</child>More Text</element>

In this case GetChildNodes() called with the top level <element> as an argument would return an roList with two elements.
The first element would be an roXMLElement containing the information about <child>.  The second would be an roString containing "More Text".
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'GetNamedElements',
        insertText: new vscode.SnippetString('GetNamedElements(${1:name as String})'),
        documentation: new vscode.MarkdownString(
`
    GetNamedElements(name as String) as Object

Returns an roXMLList representing all child elements of this element whose name is specified.
If only one element matches the name, an roXMLList containing one element is returned. If no elements match, an empty roXMLList is returned.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'GetNamedElementsCi',
        insertText: new vscode.SnippetString('GetNamedElementsCi(${1:name as String})'),
        documentation: new vscode.MarkdownString(
`
    GetNamedElementsCi(name as String) as Object

Same as GetNamedElements except the name matching is case-insensitive.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'IsName',
        insertText: new vscode.SnippetString('IsName(${1:name as String})'),
        documentation: new vscode.MarkdownString(
`
    IsName(name as String) as Boolean

Returns true if the element has the specified name.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'HasAttribute',
        insertText: new vscode.SnippetString('HasAttribute(${1:attr as String})'),
        documentation: new vscode.MarkdownString(
`
    HasAttribute(attr as String) as Boolean

Returns true if the element has the specified attribute.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'SetBody',
        insertText: new vscode.SnippetString('SetBody(${1:body as Object})'),
        documentation: new vscode.MarkdownString(
`
    SetBody(body as Object) as Void

Sets the element text from the specified string.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'AddBodyElement',
        insertText: new vscode.SnippetString('AddBodyElement()'),
        documentation: new vscode.MarkdownString(
`
    AddBodyElement() as Object

Adds an new unnamed / empty child element and returns it.
This should generally be followed by a call to child.SetName().
Alternatively AddElement() or AddElementWidthBody() can be used to combine this step with additional construction into one call.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'AddElement',
        insertText: new vscode.SnippetString('AddElement(${1:name as String})'),
        documentation: new vscode.MarkdownString(
`
    AddElement(name as String) as Object

Adds a new child element with the specified name and returns the new element.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'AddElementWithBody',
        insertText: new vscode.SnippetString('AddElementWithBody(${1:name as String}, ${2:body as Object})'),
        documentation: new vscode.MarkdownString(
`
    AddElementWithBody(name as String, body as Object) as Object

Adds a new child element with the specified name and text from the specified body string, and returns the new element.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'AddText',
        insertText: new vscode.SnippetString('AddText(${1:text as String})'),
        documentation: new vscode.MarkdownString(
`
    AddText(text as String) as Void

Adds text to the element.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'AddAttribute',
        insertText: new vscode.SnippetString('AddAttribute(${1:attr as String}, ${2:value as String})'),
        documentation: new vscode.MarkdownString(
`
    AddAttribute(attr as String, value as String) as Void

Adds an attribute value to the element. If an attribute of the same name already exists it is replaced. Note that XML attribute order is not significant, i.e. not preserved.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'SetName',
        insertText: new vscode.SnippetString('SetName(${1:name as String})'),
        documentation: new vscode.MarkdownString(
`
    SetName(name as String) as Void

Sets the name of the element.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'GenXML',
        insertText: new vscode.SnippetString('GenXML(${1:gen_header as Boolean})'),
        documentation: new vscode.MarkdownString(
`
    GenXML(gen_header as Boolean) as String

Serializes the element to XML document text. If gen_header is true then the output begins with a standard XML declaration specifying UTF-8 encoding.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'GenXMLHdr',
        insertText: new vscode.SnippetString('GenXMLHdr(${1:hdr as String})'),
        documentation: new vscode.MarkdownString(
`
    GenXMLHdr(hdr as String)

Serializes the element to XML document text. The specified header is used to begin the output, for example as a custom XML declaration.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'Clear',
        insertText: new vscode.SnippetString('Clear()'),
        documentation: new vscode.MarkdownString(
`
    Clear() as Void

Removes all attributes and children from the element, as well as setting the name to empty.
`
        )
    }
];
