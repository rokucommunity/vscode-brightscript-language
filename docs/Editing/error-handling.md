---
title: Ignoring Errors and Warnings
---
# Ignore errors and warnings on a per-line basis
In addition to disabling an entire class of errors in the `ignoreErrorCodes` array in `bsconfig.json`, you may also disable errors for a subset of the complier rules within a file with the following comment flags:
 - `bs:disable-next-line`
 - `bs:disable-next-line: code1 code2 code3`
 - `bs:disable-line`
 - `bs:disable-line: code1 code2 code3`

Here are some examples:

```vb
sub Main()
    'disable errors about invalid syntax here
    'bs:disable-next-line
    DoSomething(

    DoSomething( 'bs:disable-line

    'disable errors about wrong parameter count
    DoSomething(1,2,3) 'bs:disable-next-line

    DoSomething(1,2,3) 'bs:disable-next-line:1002
end sub

sub DoSomething()
end sub
```

# Ignore errors and warnings for an entire file
To suppress diagnostics across an entire file, place a `bs:disable-file` comment in the file's header (before any executable code). For XML components, place the comment between the `<?xml ?>` declaration and the root element.
 - `bs:disable-file`
 - `bs:disable-file: code1 code2 code3`

```vb
' bs:disable-file: 1001 1002

sub Main()
    DoSomething()
end sub
```

```xml
<?xml version="1.0" encoding="utf-8" ?>
<!-- bs:disable-file: 1006 -->
<component name="Foo">
</component>
```

A `bs:disable-file` comment placed below the first line of code is ignored.

# Quick fixes for disabling diagnostics
Every diagnostic surfaced in the editor has two quick fixes for suppressing it without leaving the file:
 - **Disable {code} for this line: {message}** &mdash; appends the code to an existing `bs:disable-line` or `bs:disable-next-line` directive on/above the diagnostic line if there is one, otherwise inserts a new `bs:disable-next-line: {code}` directive above the diagnostic.
 - **Disable {code} for this file: {message}** &mdash; appends the code to an existing `bs:disable-file` directive in the file's header if there is one, otherwise inserts a new `bs:disable-file: {code}` directive at the top of the file.

Open the quick-fix menu the same way you would for any other diagnostic (the lightbulb in the gutter, or `Ctrl+.` / `Cmd+.`).
