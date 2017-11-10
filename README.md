# BrightScript Language support for VSCode

This is the README for your extension "brightscript-language". After writing up a brief description, we recommend including the following sections.

## Features

- Syntax highlighting
- Basic code formatting (provided by the included [brightscript-formatter](https://github.com/TwitchBronBron/brightscript-formatter)) library
- Publish directly from VSCode to a roku device (provided by the included[roku-deploy](https://github.com/TwitchBronBron/roku-deploy) library)
- Debug your source code running on the Roku device from within VSCode 

## Requirements

Your project must be structured in the way that Roku expects, which looks something like this:

- manifest
- components/
    - HomeScene.brs
    - HomeScene.xml
- source/
    - main.brs

This extension expects that the manifest file is located at the root of the brightscript project. If the BrightScript project is located in a subfolder of the workspace, you will need to update the launch configuration property called 'rootDir' to point to the root folder containing the manifest file. 

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
            "rootDir": "${workspaceRoot}", //update if roku files are nested
            "stopOnEntry": false,
            "debugServer": 4711
        }
    ]
}
```

## Extension Settings

This extension contributes the following settings:

* `brightscript.format.keywordCase`: specify case of keywords when formatting
* `brightscript.format.compositeKeywords`: specify whether composite words (ie: "endif", "endfor") should be broken apart into their two-word format (ie: "end if", "end for")

## Known Issues

This is a brand new extension, so there are probably tons of edge cases that haven't been tested yet. 

## Release Notes

Users appreciate release notes as you update your extension.

### 1.0.0

Initial release
