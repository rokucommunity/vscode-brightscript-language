import {
    CompletionItem,
    CompletionItemKind,
    MarkdownString,
    SnippetString
} from 'vscode';

export const ifLocalizationCompletionItems: CompletionItem[] = [
    {
        kind: CompletionItemKind.Method,
        label: 'GetPluralString',
        insertText: new SnippetString('GetPluralString(${1:count as Integer}, ${2:zeroString as String}, ${3:oneString as String}, ${4:pluralString as String})'),
        documentation: new MarkdownString(
`
    GetPluralString(count as Integer, zeroString as String, oneString as String, pluralString as String) as String

If count is 0, this returns zeroString. If count is 1, it returns oneString.
Otherwise, it replaces "^n" in pluralString with count and returns the result. For example, you might call it as follows:

    GetPluralString(count, "0 books", "1 book", "^n books")
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'GetLocalizedAsset',
        insertText: new SnippetString('GetLocalizedAsset(${1:dirName as String}, ${2:fileName as String})'),
        documentation: new MarkdownString(
`
    GetLocalizedAsset(dirName as String, fileName as String) as String

Returns an appropriate asset path based on the user's currently selected language.
dirName is the name of a subdirectory in the directory pkg:/locale/XX_YY/ where XX_YY is the current language setting. fileName is the name of the file.  Example usage:

    GetLocalizedAsset("images", "MyImage.png")

If the user's current language setting is French (fr_CA), and the file exists, then this would return "pkg:/locale/fr_CA/images/MyImage.png".

If the file does not exist in the current locale directory, then this will search the directory locale/default/.
If it exists there, it will return it; otherwise, it will check the directory locale/en_US/. If it still can't find the file, then it will return an empty string.

We are adding new locales with each release. A list of currently supported locales can be found at ifDeviceInfo.GetCurrentLocale.
`
        )
    }
];
