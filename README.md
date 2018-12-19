# BrightScript Extension for VSCode
A VSCode extension to support Roku's BrightScript language.

[![Build Status](https://travis-ci.org/TwitchBronBron/vscode-brightscript-language.svg?branch=master)](https://travis-ci.org/TwitchBronBron/vscode-brightscript-language)
[![codecov](https://codecov.io/gh/TwitchBronBron/vscode-brightscript-language/branch/master/graph/badge.svg)](https://codecov.io/gh/TwitchBronBron/vscode-brightscript-language)
[![Visual Studio Marketplace](https://vsmarketplacebadge.apphb.com/installs-short/celsoaf.brightscript.svg?style=flat-square)](https://marketplace.visualstudio.com/items?itemName=celsoaf.brightscript)
<!--[![GitHub](https://img.shields.io/github/release/twitchbronbron/vscode-brightscript-language.svg?style=flat-square)](https://github.com/twitchbronbron/vscode-brightscript-language/releases)-->
## Features

- Syntax highlighting
- Code formatting (provided by [brightscript-formatter](https://github.com/TwitchBronBron/brightscript-formatter))
- Debugging support - Set breakpoints, launch and debug your source code running on the Roku device all from within VSCode
- Publish directly to a roku device from VSCode (provided by [roku-deploy](https://github.com/TwitchBronBron/roku-deploy))
- Basic symbol navigation for document and workspace ("APPLE/Ctrl + SHIFT + O" for document, "APPLE/Ctrl + T" for workspace)
- Goto definition (F12)
- Peek definition (Alt+F12)
- Find usages (Shift+F12)
- XML goto definition support which navigates to xml component, code behind function, or brs script import (F12)
- Method signature help (open bracket, or APPLE/Ctrl + SHIFT + SPACE)
- Brightscript output log (which is searchable and can be colorized with a plugin like this: [https://marketplace.visualstudio.com/items?itemName=IBM.output-colorizer](https://marketplace.visualstudio.com/items?itemName=IBM.output-colorizer)
- Roku remote control from keyboard


## Requirements

Your project must be structured in the way that Roku expects, which looks something like this:

- manifest
- components/
    - HomeScene.brs
    - HomeScene.xml
- source/
    - main.brs

Here is a sample launch configuration

```json

{
    "version": "0.2.0",
    "configurations": [
        {
            "type": "brightscript",
            "request": "launch",
            "name": "BrightScript Debug: Launch",
            "host": "192.168.1.17",
            "password": "password",
            "rootDir": "${workspaceRoot}", //update if roku project lives in a subdirectory
            "stopOnEntry": false,
            "debugServer": 4711
        }
    ]
}
```

If your BrightScript project is located in a subdirectory of the workspace, you will need to update the launch configuration property called 'rootDir' to point to the root folder containing the manifest file.

For example, if you have this structure:

- Root Workspace Folder/
  - Images/
  - Roku App/
    - manifest
    - components/
        - HomeScene.brs
        - HomeScene.xml
    - source/
        - main.brs

then you would need change `rootDir` in your launch config to look like this:

```json

{
    "version": "0.2.0",
    "configurations": [
        {
            ...
            "rootDir": "Roku App/${workspaceRoot}",
            ...
        }
    ]
}
```

## Special Cases

### Debug source files with Custom build process

If you have a build process that moves files from a source directory to an output directory, by default you will need to place breakpoints in the output directory's versions of the files.

**IF** your build process does not change line numbers between source files and built files, this extension will allow you to place breakpoints in your source files, and launch/run your built files. Pair this with vscode's task system, and you can build your code, then launch and debug your code with ease.

**Example:**
  - src/
    - main.brs
    - language.brs
    - manifest
  - languages/
    - english.brs
    - french.brs
  - dist/
    - main.brs
    - language.brs
    - manifest

Here's a sample launch.json for this scenario:

```
{
    "version": "0.2.0",
    "configurations": [
        {
            "type": "brightscript",
            "request": "launch",
            "name": "BrightScript Debug: Launch",
            "host": "192.168.1.100",
            "password": "password",
            "rootDir": "${workspaceFolder}/dist",
            "debugRootDir": "${workspaceFolder}/src",
            "preLaunchTask": "your-build-task-here"
        }
    ]
}

```

## Extension Settings

This extension contributes the following settings:

* `brightscript.format.keywordCase`: specify case of keywords when formatting
* `brightscript.format.compositeKeywords`: specify whether composite words (ie: "endif", "endfor") should be broken apart into their two-word format (ie: "end if", "end for")
* `brightscript.format.removeTrailingWhiteSpace`: specify whether trailing whitespace should be removed on format

## Roku Remote Control

This extension contributes keybindings to send keypresses to the Roku device through Roku's [External Control API](https://sdkdocs.roku.com/display/sdkdoc/External+Control+API#ExternalControlAPI-KeypressKeyValues) using `extension.brightscript.sendRemoteCommand` and passing the key to send as the `args`.

The basic 11 remote keys are already mapped with this extension as defined below. The keys are mapped using the `when` clause so it will only send the remote commands if the Panel has focus (`panelFocus`) AND the focus in NOT in the Debug Console REPL (`!inDebugRepl`) AND the Editor Find widget is NOT visible (`!findWidgetVisible`).

```
format is [Keyboard Key] = [Roku Remote Key]
[Backspace] = Back Button
[Escape] = Home Button
[ArrowUp] = Up Button
[ArrowDown] = Down Button
[ArrowRight] = Right Button
[ArrowLeft] = Left Button
[Enter] = Select Button (OK)
win+p (or cmd+p on mac) = Play Button
win+[ArrowLeft] (or cmd+[ArrowLeft] on mac) = Rev Button
win+[ArrowRight] (or cmd+[ArrowRight] on mac) = Fwd Button
win+8 (or cmd+8 on mac) = Star Button
```

Example Keybindings for other keys:
```
{
	"key": "Space",
	"command": "extension.brightscript.sendRemoteCommand",
	"args": "Lit_%20",
	"when": "panelFocus && !inDebugRepl && !findWidgetVisible"
},
```

## Contributing

View our [developer guidelines](https://github.com/TwitchBronBron/vscode-brightscript-language/blob/master/developer-guidelines.md) for more information on how to contribute to this extension.

You can also chat with us [on slack](https://rokudevelopers.slack.com/messages/CEGCA7AKF/).

## Known Issues

Click [here](https://github.com/TwitchBronBron/vscode-brightscript-language/issues) to see the list of known issues.

## Changelog
Click [here](https://github.com/TwitchBronBron/vscode-brightscript-language/blob/master/CHANGELOG.md) to see the changelog.
