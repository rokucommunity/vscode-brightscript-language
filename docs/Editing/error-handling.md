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

# Ignore errors and warnings for a block of code or whole file
Use `bs:disable` and `bs:enable` to suppress diagnostics for a span of code. A `bs:disable` opens a suppression block, and a matching `bs:enable` closes it. If no `bs:enable` follows, the block runs to the end of the file, so a bare `bs:disable` at the top of a file suppresses the whole file.

 - `bs:disable`: suppress all diagnostics from this line until the next `bs:enable`
 - `bs:disable: code1 code2 code3`: suppress only the listed codes
 - `bs:enable`: close any open `bs:disable` block
 - `bs:enable: code1 code2 code3`: re-enable specific codes from an open `bs:disable`

```vb
' bs:disable: 1001 1002

sub Main()
    DoSomething()
end sub
```

```xml
<?xml version="1.0" encoding="utf-8" ?>
<!-- bs:disable: 1006 -->
<component name="Foo">
</component>
```

`bs:enable: <code>` after a bare `bs:disable` re-enables one diagnostic while keeping the rest suppressed:

```vb
' bs:disable
'   1006 is still suppressed below, but 1001 reports normally
' bs:enable: 1001

sub Main()
    DoSomething()
end sub
```

# Quick fixes for disabling diagnostics
Every diagnostic surfaced in the editor has two quick fixes for suppressing it without leaving the file:
 - **Disable {code} for this line: {message}**: appends the code to an existing `bs:disable-line` or `bs:disable-next-line` directive on or above the diagnostic line if there is one, otherwise inserts a new `bs:disable-next-line: {code}` directive above the diagnostic.
 - **Disable {code} for this file: {message}**: appends the code to an existing header-level `bs:disable` directive if there is one, otherwise inserts a new `bs:disable: {code}` directive at the top of the file.

Open the quick-fix menu the same way you would for any other diagnostic (the lightbulb in the gutter, or `Ctrl+.` / `Cmd+.`).
