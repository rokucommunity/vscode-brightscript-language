# BrightScript Language support for VSCode

## Features

- Syntax highlighting
- Basic code formatting (provided by the included [brightscript-formatter](https://github.com/TwitchBronBron/brightscript-formatter)) library
- Publish directly from VSCode to a roku device (provided by the included [roku-deploy](https://github.com/TwitchBronBron/roku-deploy) library)
- Debug your source code running on the Roku device from within VSCode 

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


## Extension Settings

This extension contributes the following settings:

* `brightscript.format.keywordCase`: specify case of keywords when formatting
* `brightscript.format.compositeKeywords`: specify whether composite words (ie: "endif", "endfor") should be broken apart into their two-word format (ie: "end if", "end for")

## Known Issues

This is a brand new extension, so there are probably tons of edge cases that haven't been tested yet. 

## Release Notes

## [1.0.2] - 2018-07-11
 - Upgraded to the latest brightscript-formatter version that enables removing trailing whitespace when formatting.

## [1.0.1] - 2018-04-04
 - Fixed issue in debugger that was not properly handling truncated file paths received from Roku. 

## [1.0.0] - 2018-03-16
- Added debugger support
- Added code formatter
- Fixed issues with language colorization
