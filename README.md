# BrightScript Extension for VSCode 
A VSCode extension to support Roku's BrightScript language.

[![Build Status](https://travis-ci.org/TwitchBronBron/vscode-brightscript-language.svg?branch=master)](https://travis-ci.org/TwitchBronBron/vscode-brightscript-language)
[![Coverage Status](https://coveralls.io/repos/github/TwitchBronBron/vscode-brightscript-language/badge.svg?branch=master)](https://coveralls.io/github/TwitchBronBron/vscode-brightscript-language?branch=master)
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

## Known Issues

Click [here](https://github.com/TwitchBronBron/vscode-brightscript-language/issues) to see the list of known issues.

## Changelog
Click [here](https://github.com/TwitchBronBron/vscode-brightscript-language/blob/master/CHANGELOG.md) to see the changelog.
