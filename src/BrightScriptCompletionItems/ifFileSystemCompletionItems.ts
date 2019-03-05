import {
    CompletionItem,
    CompletionItemKind
} from 'vscode';

import * as vscode from 'vscode';

export const ifFileSystemCompletionItems: CompletionItem[] = [
    {
        kind: CompletionItemKind.Method,
        label: 'GetVolumeList',
        insertText: new vscode.SnippetString('GetVolumeList()'),
        documentation: new vscode.MarkdownString(
`
    GetVolumeList() as Object

Returns an roList containing Strings representing the available volumes.

Volumes may be internal or external storage devices, such as "tmp:", "pkg:", "ext1:", etc.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'GetDirectoryListing',
        insertText: new vscode.SnippetString('GetDirectoryListing(${1:dirPath as String})'),
        documentation: new vscode.MarkdownString(
`
    GetDirectoryListing(dirPath as String) as Object

Returns an roList of Strings representing the directory listing of names in dirPath.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'Find',
        insertText: new vscode.SnippetString('Find(${1:dirPath as String}, ${2:regEx as String})'),
        documentation: new vscode.MarkdownString(
`
    Find(dirPath as String, regEx as String) as Object

Returns an roList of Strings representing the directory listing of names in dirPath which match the regEx regular expression.
The list is not recursive; it includes only files and directories that are directly in the directory dirPath. Each item in the list is the name of the file relative to dirPath.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'FindRecurse',
        insertText: new vscode.SnippetString('FindRecurse(${1:dirPath as String}, ${2:regEx as String})'),
        documentation: new vscode.MarkdownString(
`
    FindRecurse(dirPath as String, regEx as String) as Object

Returns an roList of Strings representing the recursive directory listing of names in dirPath which match the regEx regular expression.
Each item in the list is the name of the file relative to dirPath.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'Match',
        insertText: new vscode.SnippetString('Match(${1:path as String}, ${2:pattern as String})'),
        documentation: new vscode.MarkdownString(
`
    Match(path as String, pattern as String) as Object

Returns an roList of Strings representing the directory listing of names in dirPath which match the shell-like pattern.
The pattern may contain wildcards like * and ?. This method is like Find() except that it uses shell-like pattern matching rather than regular expression matching.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'Exists',
        insertText: new vscode.SnippetString('Exists(${1:path as String})'),
        documentation: new vscode.MarkdownString(
`
    Exists(path as String) as Boolean

Returns true if the path exists.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'Stat',
        insertText: new vscode.SnippetString('Stat(${1:path as String})'),
        documentation: new vscode.MarkdownString(
`
    Stat(path as String) as Object

Returns an roAssociativeArray containing the following keys for the passed in path:

* type: (String) Either the value "file" or "directory"
* size: (Integer) Number of bytes in the file. Only relevant for type "file".
* permissions: (String) the value "rw" for read/write or "r" for read only.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'GetVolumeInfo',
        insertText: new vscode.SnippetString('GetVolumeInfo(${1:path as String})'),
        documentation: new vscode.MarkdownString(
`
    GetVolumeInfo(path as String) as Object

Returns an roAssociativeArray containing information about the volume specified in path.

The path should be specified as the volume name plus a directory separator, e.g. "ext1:/".

The following keys are returned in the roAssociativeArray:

* blocksize : (Integer) The size of the filesystem blocks in bytes.
* blocks : (Integer) The number of blocks in the filesystem.
* freeblocks : (Integer) The number of unused blocks in the filesystem.
* usedblocks : (Integer) The number of used blocks in the filesystem.
* label : (String) The volume label, if any.

Can only be called on external volumes. Internal volumes do not return meaningful information.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'CreateDirectory',
        insertText: new vscode.SnippetString('CreateDirectory(${1:path as String})'),
        documentation: new vscode.MarkdownString(
`
    CreateDirectory(path as String) as Boolean

Creates the directory specified by the path parameter. All directories in path except the last one must already exist; that is, only one directory can be created.

Returns true if successful.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'Delete',
        insertText: new vscode.SnippetString('Delete(${1:path as String})'),
        documentation: new vscode.MarkdownString(
`
    Delete(path as String) as Boolean

Deletes the file or directory specified by the path parameter. If path is a directory, its contents are recursively removed.

Returns true if successful.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'CopyFile',
        insertText: new vscode.SnippetString('CopyFile(${1:fromPath as String}, ${2:toPath as String})'),
        documentation: new vscode.MarkdownString(
`
    CopyFile(fromPath as String, toPath as String) as Boolean

Copies the file fromPath to toPath.

Returns true if successful.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'Rename',
        insertText: new vscode.SnippetString('Rename(${1:fromPath as String}, ${2:toPath as String})'),
        documentation: new vscode.MarkdownString(
`
    Rename(fromPath as String, toPath as String) as Boolean

Renames or moves the file or directory fromPath to toPath.

If toPath exists, it is not overwritten. Instead the operation fails and Rename returns false.

Returns true if successful.
`
        )
    }
];
