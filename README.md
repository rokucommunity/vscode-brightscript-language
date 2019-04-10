# BrightScript Extension for VSCode
A VSCode extension to support Roku's BrightScript language.

[![Build Status](https://travis-ci.org/TwitchBronBron/vscode-brightscript-language.svg?branch=master)](https://travis-ci.org/TwitchBronBron/vscode-brightscript-language)
[![codecov](https://codecov.io/gh/TwitchBronBron/vscode-brightscript-language/branch/master/graph/badge.svg)](https://codecov.io/gh/TwitchBronBron/vscode-brightscript-language)
[![Visual Studio Marketplace](https://vsmarketplacebadge.apphb.com/installs-short/celsoaf.brightscript.svg?style=flat-square)](https://marketplace.visualstudio.com/items?itemName=celsoaf.brightscript)
[![GitHub](https://img.shields.io/github/release/twitchbronbron/vscode-brightscript-language.svg?style=flat-square)](https://github.com/twitchbronbron/vscode-brightscript-language/releases)
## Features

- Static analysis (code validation)
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
- Roku remote control from keyboard ([click here](#Roku-Remote-Control) for for more information)
- Brightscript output log (which is searchable and can be colorized with a plugin like [IBM.output-colorizer](https://marketplace.visualstudio.com/items?itemName=IBM.output-colorizer)
- Navigate to source files (by clicking while holding alt key) referenced as `pkg:/` paths from output log, with various output formats.
	- Configure `brightscript.output.hyperlinkFormat` as follows:
	  - **Full**	`pkg:/components/KeyLogTester.brs(24:0)`
	  - **FilenameAndFunction**	`KeyLogTester.DoSomething(24:0)`
	  - **Filename**	`KeyLogtester.brs(24)`
	  - **Short**	`#1`
	  - **Hidden**	``
- Marking the output log (CTRL+L)
- Clearing the output log (CTRL+K), which also clears the mark indexes - **be sure to use the extension's command for clearing, or you may find that your hyperlinks and filters get out of sync**
- Filtering the output log - 3 filters are available:
  - LogLevel (example `^\[(info|warn|debug\]`)
  - Include (example `NameOfSomeInterestingComponent`)
  - Exclude (example `NameOfSomeNoisyComponent`)



## Requirements

Your project must be structured in the way that Roku expects, which looks something like this:

- manifest
- components/
    - HomeScene.brs
    - HomeScene.xml
- source/
    - main.brs

If your project lives in a subdirectory, you will need to create a `brsconfig.json` file at the root of your project, and reference your subdirectory like such:

```json
{
    "rootDir": "./someSubdir"
}
```

This project relies heavily on the [brightscript-language](https://github.com/twitchbronbron/brightscript-language) project for language server support. See [this link](https://github.com/twitchbronbron/brightscript-language#brsconfigjson-options) to view the `brsconfig.json` options.

## Language Features
## Ignore errors and warnings on a per-line basis
In addition to disabling an entire class of errors in the `ignoreErrorCodes` array in `brsconfig.json`, you may also disable errors for a subset of the complier rules within a file with the following comment flags:
 - `brs:disable-next-line`
 - `brs:disable-next-line: code1 code2 code3`
 - `brs:disable-line`
 - `brs:disable-line: code1 code2 code3`

Here are some examples:

```brightscript
sub Main()
    'disable errors about invalid syntax here
    'brs:disable-next-line
    DoSomething(

    DoSomething( 'brs:disable-line

    'disable errors about wrong parameter count
    DoSomething(1,2,3) 'brs:disable-next-line

    DoSomething(1,2,3) 'brs:disable-next-line:1002
end sub

sub DoSomething()
end sub
```


## Debugging

This extension supports launching and debugging your local project on a Roku device. In order to do this, you will need to create a `launch.json` configuration file.

Here is a sample `launch.json` file where your roku project lives at the root of your workspace:

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
            "rootDir": "${workspaceRoot}",
            "stopOnEntry": false
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
            "rootDir": "${workspaceRoot}/Roku App",
            ...
        }
    ]
}
```

### Using both `launch.json` and `brsconfig.json`

When launching a debug session, this extension will first read all configurations from `brsconfig.json`. Then, it will overwrite any options from the selected configuration from `launch.json`. So, it is advised to keep all common settings in `brsconfig.json`, and only add values you wish to override in `launch.json`.

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
* `brightscript.output.includeStackTraces`: If set to true, will print stack trace or breakpoint info in the log output. Set to false to avoid noisy logs - you'll still get the traces in the debug console, in any case
* `brightscript.output.focusOnLaunch`: If set to true, focus on the brighscript log when launching, which is convenient for controlling your roku with the extension's remote control keys. **Experimental. Does not always work**
* `brightscript.output.clearOnLaunch`: If set to true, will clear the brigthscript log when launching
* `brightscript.output.hyperlinkFormat`: specifies the display format for log output `pkg` link

## Roku Remote Control

You can use your keyboard as a Roku remote by clicking inside the Output or Debug Console panel of VSCode, and then pressing one of the predefined keyboard shortcuts from the table below (make sure the find widget is closed). You can also press `win+k (or cmd+k on mac)` from inside those same panels to bring up a text box to send text to the Roku device.

This extension sends keypresses to the Roku device through Roku's [External Control API](https://sdkdocs.roku.com/display/sdkdoc/External+Control+API#ExternalControlAPI-KeypressKeyValues). The 12 standard Roku remote buttons are already included. The keys are mapped using the `when` clause so it will only send remote commands if the Output or Debug Console Panel has focus (`panelFocus`) AND the Editor Find widget is NOT visible (`!findWidgetVisible`).

### Keyboard Commands:

|Keyboard Key | Roku Remote Key | Keybinding Command|
|--|--|--|
|`Backspace` | Back Button  | `extension.brightscript.pressBackButton` |
|`win+Backspace` (or `cmd+Backspace` on mac)  | Backspace |  `extension.brightscript.pressBackspaceButton` |
|`Escape` | Home Button | `extension.brightscript.pressHomeButton` |
|`up` | Up Button | `extension.brightscript.pressUpButton` |
|`down` | Down Button | `extension.brightscript.pressDownButton` |
|`right` | Right Button | `extension.brightscript.pressRightButton` |
|`left` | Left Button | `extension.brightscript.pressLeftButton` |
|`Enter` | Select Button (OK) | `extension.brightscript.pressSelectButton` |
|`win+Enter` (or `cmd+Enter` on mac) | Play Button | `extension.brightscript.pressPlayButton` |
|`win+left` (or `cmd+left` on mac) | Rev Button | `extension.brightscript.pressRevButton` |
|`win+right` (or `cmd+right` on mac) | Fwd Button | `extension.brightscript.pressFwdButton` |
|`win+8` (or `cmd+8` on mac) | Info Button | `extension.brightscript.pressStarButton` |

You also have the ability to create keybindings for any other Roku supported key by adding. Here's a example entry for `keybindings.json` of how to create a VSCode keyboard shortcut to send the space key to the Roku:
```
{
	"key": "Space",
	"command": "extension.brightscript.sendRemoteCommand",
	"args": "Lit_%20",
	"when": "panelFocus && !inDebugRepl && !findWidgetVisible"
}
```

## Other keyboard shortcuts

| Keybinding (Windows) | Keybinding (Mac) | Command | Description|
|--|--|--|--|
| `ctrl+L` |  `ctrl+L` | extension.brightscript.markLogOutput | Add a new mark line in the BrightScript output panel |
| `ctrl+alt+k` | `ctrl+alt+k` | extension.brightscript.clearLogOutput | Clear the current log output |
| `win+ctrl+l` | `cmd+ctrl+l` | extension.brightscript.setOutputLogLevelFilter | Filter the BrightScript Output by log level (info, warn, debug)  |
| `win+ctrl+i` | `cmd+ctrl+i` | extension.brightscript.setOutputIncludeFilter | Filter the BrightScript Output by typing text you want to *include* |
| `win+ctrl+x` | `cmd+ctrl+x` | extension.brightscript.setOutputExcludeFilter | Filter the BrightScript output by typing text you want to *exclude* |

## Config file for user-specific launch settings
If you change your `launch.json` settings regularly, or don't want to check certain values into version control, then another option is to store those values in a `.env` file. Then, reference it in your `launch.json` and use `${end:YOUR_VAR_NAME}` in `launch.json` settings. Here's an example.

```javascript
//launch.json

{
    "version": "0.2.0",
    "configurations": [
        {
            ...
            "envFile": "${workspaceRoot}/.env",
            "username": "${env:ROKU_USERNAME}",
            "password": "${env:ROKU_PASSWORD}"
            ...
        }
    ]
}
```

```bash
# .env

#the username for the roku
ROKU_USERNAME=rokudev
#the password for the roku
ROKU_PASSWORD=password123
```

This extension uses the [dotenv](https://www.npmjs.com/package/dotenv) npm module for parsing the `.env` files, so see [this link](https://github.com/motdotla/dotenv#rules) for syntax information.

## Pre-release Versions

You can often find pre-release versions of this extension under the [GitHub Releases](https://github.com/TwitchBronBron/vscode-brightscript-language/releases) page of this project. Unfortunately, Visual Studio Code does not currently support publishing pre-release versions of an extension, so manually installing the `.vsix` is the next-best option at this point. Here's how it works.

1. Download `.vsix` file for version of the extension you want from [the releases page](https://github.com/TwitchBronBron/vscode-brightscript-language/releases);
1. Open Visual Studio Code and click the "extensions" tab.
1. Choose "Install from VSIX..." ![image](https://user-images.githubusercontent.com/2544493/52904494-3f4bdf00-31fb-11e9-9a83-ceca294a4d12.png)
1. Select the file you downloaded from step 1.

### Reinstalling store version of the extension
This process will REPLACE any existing version of the extension you have installed from the store. So, if you want to go back to using the store version, you need to uninstall the extension completely, and then install the extension through the VSCode store.


## Contributing

Much of this extension depends on the [brightscript-language](https://github.com/twitchbronbron/brightscript-language) project, which contributes the language server. To get up and running, do the following:

 1. Clone this project
 1. Clone [brightscript-language](https://github.com/twitchbronbron/brightscript-language)
 1. Open the `package.json` for this project and edit the dependencies.brightscript value to look like this (assuming brightscript was installed to `C:/projects/brightscript-language`):

    `"brightscript-language": "file:C:/projects/brightscript-language"`
 1. run `npm install` in both directories
 1. Open vscode in each directory, build, and run as usual


View our [developer guidelines](https://github.com/TwitchBronBron/vscode-brightscript-language/blob/master/developer-guidelines.md) for more information on how to contribute to this extension.

You can also chat with us [on slack](http://tiny.cc/nrdf0y). (We're in the #vscode-bs-lang-ext channel).

## Changelog
Click [here](https://github.com/TwitchBronBron/vscode-brightscript-language/blob/master/CHANGELOG.md) to see the changelog.
