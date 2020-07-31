# BrightScript Extension for VSCode

A VSCode extension to support Roku's BrightScript language.

[![build](https://img.shields.io/github/workflow/status/rokucommunity/vscode-brightscript-language/build.svg?logo=github)](https://github.com/rokucommunity/vscode-brightscript-language/actions?query=workflow%3Abuild)
[![Coverage Status](https://coveralls.io/repos/github/rokucommunity/vscode-brightscript-language/badge.svg?branch=master)](https://coveralls.io/github/rokucommunity/vscode-brightscript-language?branch=master)
[![Visual Studio Marketplace](https://vsmarketplacebadge.apphb.com/installs-short/celsoaf.brightscript.svg?style=flat-square)](https://marketplace.visualstudio.com/items?itemName=celsoaf.brightscript)
[![Visual Studio Marketplace Version](https://img.shields.io/visual-studio-marketplace/v/celsoaf.brightscript.svg)](https://marketplace.visualstudio.com/items?itemName=celsoaf.brightscript)

## Upgrading from V1
If you're upgrading from version 1 of the extension, please review [these changes](ReleaseNotes.md#2.0.0)

## Features

- Debugging support - Set breakpoints, launch and debug your source code running on the Roku device all from within VSCode

  ![BrightScript-language-debugging](https://user-images.githubusercontent.com/2544493/78854455-5e08c880-79ef-11ea-8eb4-1f2d74230842.gif)

- Automatic Rendezvous tracking when `logrendezvous` is enabled on the Roku. See [here](https://developer.roku.com/docs/developer-program/debugging/debugging-channels.md#scenegraph-debug-server-port-8080-commands) for information on how to enable rendezvous logging your Roku.
- Real time code validation
- Syntax highlighting
- Code formatting
- Injection of the Roku Advanced Layout Editor(RALE) task from a single user managed version
  - This helps avoid committing the tracker to you repo and also lets you manage what version you want installed rather then other users on the project
  - See ([Extension Settings](#Extension-Settings) and [RALE Support](#RALE-Support) for more information)
- Publish directly to a roku device from VSCode (provided by [roku-deploy](https://github.com/RokuCommunity/roku-deploy))
  - Also supports zipping and static file hosting for Component Libraries ([click here](#Component-Libraries) for more information)
- Basic symbol navigation for document and workspace ("APPLE/Ctrl + SHIFT + O" for document, "APPLE/Ctrl + T" for workspace)
- Goto definition (F12)
- Peek definition (Alt+F12)
- Find usages (Shift+F12)
- XML goto definition support which navigates to xml component, code behind function, or brs script import (F12)
- Method signature help (open bracket, or APPLE/Ctrl + SHIFT + SPACE)
- Roku remote control from keyboard ([click here](#Roku-Remote-Control) for more information)
- Brightscript output log (which is searchable and can be colorized with a plugin like [IBM.output-colorizer](https://marketplace.visualstudio.com/items?itemName=IBM.output-colorizer)
- Navigate to source files (by clicking while holding alt key) referenced as `pkg:/` paths from output log, with various output formats.
  - Configure `brightscript.output.hyperlinkFormat` as follows:
    - **Full** `pkg:/components/KeyLogTester.brs(24:0)`
    - **FilenameAndFunction** `KeyLogTester.DoSomething(24:0)`
    - **Filename** `KeyLogTester.brs(24)`
    - **Short** `#1`
    - **Hidden** ``
- Marking the output log (CTRL+L)
- Clearing the output log (CTRL+K), which also clears the mark indexes - **be sure to use the extension's command for clearing, or you may find that your hyperlinks and filters get out of sync**
- Filtering the output log - 3 filters are available:
  - LogLevel (example `^\[(info|warn|debug\]`)
  - Include (example `NameOfSomeInterestingComponent`)
  - Exclude (example `NameOfSomeNoisyComponent`)
- Variable `bs_const` values using the `launch.json` (see the [BS_Const](#BS_Const) section for more information)


## Requirements

Your project must be structured in the way that Roku expects, which looks something like this:

- manifest
- components/
  - HomeScene.brs
  - HomeScene.xml
- source/
  - main.brs

If your project lives in a subdirectory, you will need to create a `bsconfig.json` file at the root of your project, and reference your subdirectory like such:

```json
{
    "rootDir": "./someSubdir"
}
```

This project relies heavily on the [brighterscript](https://github.com/rokucommunity/brighterscript) project for language server support. See [this link](https://github.com/rokucommunity/brighterscript#bsconfigjson-options) to view the `bsconfig.json` options.

## Language Features
## Ignore errors and warnings on a per-line basis
In addition to disabling an entire class of errors in the `ignoreErrorCodes` array in `bsconfig.json`, you may also disable errors for a subset of the complier rules within a file with the following comment flags:
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
      "rootDir": "${workspaceFolder}",
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
            "rootDir": "${workspaceFolder}/Roku App",
            ...
        }
    ]
}
```

### Using both `launch.json` and `bsconfig.json`

When launching a debug session, this extension will first read all configurations from `bsconfig.json`. Then, it will overwrite any options from the selected configuration from `launch.json`. So, it is advised to keep all common settings in `bsconfig.json`, and only add values you wish to override in `launch.json`.
## Breakpoints

Roku devices currently do not have a way to dynamically insert breakpoints during a running application. So, in order to use breakpoints, this extension will inject a `STOP` statement into the code for each breakpoint before the app is deployed. This means that anytime you add/remove a breakpoint, you will need to stop your current debug session and start a new one.

When injecting `STOP` statements, the extension will also generate a source map for each affected file so we can convert the debugger locations back into source locations. See the [SourceMaps](#SourceMaps) section for more information

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

```json
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
      "sourceDirs": ["${workspaceFolder}/src"],
      "preLaunchTask": "your-build-task-here"
    }
  ]
}
```

### Multiple source dirs

If you have a custom build process that pulls in files from multiple source directories, but still want to be able to place breakpoints in those source folders without using this extension's build process, you can use the `sourceDirs` launch configuration setting to specify where the various source files exist. The extension will walk through each of the `sourceDirs` entries, in order, until it finds a file that matches the relative path of the file with the active breakpoint.

```jsonc
{
  "version": "0.2.0",
  "configurations": [
    {
      "rootDir": "${workspaceFolder}/dist",
      "sourceDirs": [
        "${workspaceFolder}/../ProjectA",
        "${workspaceFolder}/../ProjectB",
        "${workspaceFolder}/../ProjectC"
      ],
      "preLaunchTask": "your-build-task-here"
      //...
    }
  ]
}
```

### SourceMaps

The extension has full support for [source maps](https://developer.mozilla.org/en-US/docs/Tools/Debugger/How_to/Use_a_source_map). Which means that if your preprocessor has source map support then the extension will correctly translate breakpoints from source files into compiled locations and will translate compiled locations back to source locations. In this situation, you would want to set up your launch config like this:

```javascript
//.vscode/launch.json
{
    "version": "0.2.0",
    "configurations": [{
        //this is where your preprocessor puts the final code (including source maps)
        "rootDir": "${workspaceFolder}/dist",
        // run your preprocessor which writes the final code to `${workspaceFolder}/dist` (including source maps)
        "preLaunchTask": "your-build-task-here",
        //...other launch args
    }]
}
```

Your dist folder would look something like this after running your preprocessor.

- \${workspaceFolder}/dist/
  - manifest
  - source/
    - main.brs
    - main.brs.map
  - components/
    - component1.xml
    - component1.xml.map
    - component1.brs
    - component1.brs.map

## BS_Const

If you use `bs_const` in your project manifest you can define separate launch configs in your `launch.json` allowing for easy changing without modifying the manifest yourself. This helps prevent accidentally committing a change to the `bs_consts` in your project. You can not define a constant that is not also in your manifest. See the [Manifest constant](https://developer.roku.com/en-ca/docs/references/brightscript/language/conditional-compilation.md#manifest-constant) documentation for more info on their format.

example config:

```json
{
  "type": "brightscript",
  "rootDir": "${workspaceFolder}/dist",
  "host": "192.168.1.2",
  "bsConst": {
    "debug": true,
    "logging": false
  }
}
```

## Component Libraries

If you are working on custom component libraries you can define them in the launch.json file. The extension will automatically zip and statically host your component libraries. The library folder(s) can ether be in your project or in another workspace on your machine.

`launch.json` configuration options:

- `componentLibraries`: This field takes an array of library configuration objects allowing you to work on more than one library at a time. For the examples, there will only be one library configured but you can simply add more if you need to. Each object in the `componentLibraries` field requires three values.
  - `rootDir`: This is the relative path to the libraries source code. Since this is a relative path your library source does not need to be in the same work space.
  - `outFile`: The name of the zip file that your channel code will download as a component library. You can use values in your outFile string such as `${title}` to be inferred from the libraries manifest file.
  - `files`: A file path or file glob that should be copied to the deployment package.
- `componentLibrariesPort`: Port to access component libraries. Default: `8080`s

**Example:**

- .vscode
  - launch.json
- manifest
- components/
  - HomeScene.brs
  - HomeScene.xml
- source/
  - main.brs
- customLibrary
  - manifest
  - components/
    - CustomButton.brs
    - CustomButton.xml
    - CustomTextInput.brs
    - CustomTextInput.xml

Here's a sample launch.json for this scenario:

```json
{
    "version": "0.2.0",
    "configurations": [
        {
            "type": "brightscript",
            ...
            "rootDir": "${workspaceFolder}",
            "files": [
                "manifest",
                "source/**/*.*",
                "components/**/*.*"
            ],
            "componentLibraries": [
                {
                    "rootDir": "${workspaceFolder}/customLibrary/",
                    "outFile": "customLibrary.zip",
                    "files": [
                        "manifest",
                        "components/**/*.*"
                    ]
                }
            ]
        }
    ]
}

```

## Deep Linking / ECP

You can launch a debug session with a deep link by setting the `deepLinkUrl` property in your `launch.json` configuration.

```json
{
  "type": "brightscript",
  "rootDir": "${workspaceFolder}/dist",
  "host": "192.168.1.2",
  "deepLinkUrl": "http://${host}:8060/launch/dev?${promptForQueryParams}"
}
```

There are several string placeholders you can use when defining your deep link url, but none of them are required.

- `${host}` - the roku host. This is the `host` property set in your launch configuration. By using `${host}` in the deep link url, it prevents you from needing to update the host twice in your config when you want to change which Roku to debug.

- `${promptForQueryparams}` - will pop up an input box at debug launch time, asking for the URL-encoded query parameters to pass to the deep link.

- `${promptForDeepLinkUrl}` - if the entire `deepLinkUrl` is set to this, then at debug launch time, an input box will appear asking you to input the full deep link url.

## RALE Support

You can also have the extension automatically inject the `TrackerTack.xml` and the code snippet required to start the tracker task.
To do this you need a few simple things:

- In your VS Code user settings add the `brightscript.debug.raleTrackerTaskFileLocation` setting. (See [Extension Settings](#Extension-Settings) for more information)
- Add the entry point comment `' vscode_rale_tracker_entry` to your code.
  - This is optional as you can still include the the code to create the tracker task yourself.
  - We recommend adding it to the end of your `screen.show()` call. For example: `screen.show() ' vscode_rale_tracker_entry`
  - This can be added anywhere in the channel including source files but it must be on or after the call to `screen.show()`
- Set the `injectRaleTrackerTask` value to true in `launch.json`. For example:

```json
{
  "type": "brightscript",
  "rootDir": "${workspaceFolder}/dist",
  "host": "192.168.1.2",
  "injectRaleTrackerTask": true
}
```

## Extension Settings

This extension contributes the following settings:

- `brightscript.format.keywordCase`: specify case of keywords when formatting
- `brightscript.format.compositeKeywords`: specify whether composite words (ie: "endif", "endfor") should be broken apart into their two-word format (ie: "end if", "end for")
- `brightscript.format.removeTrailingWhiteSpace`: specify whether trailing whitespace should be removed on format
- `brightscript.format.formatInteriorWhitespace`: If true (the default), all whitespace between items is reduced to exactly 1 space character, and certain keywords and operators are padded with whitespace (i.e. `1+1` becomes `1 + 1`)
- `brightscript.format.insertSpaceBeforeFunctionParenthesis`: If true, a space is inserted to the left of an opening function declaration parenthesis. (i.e. `function main ()` or `function ()`). If false, all spacing is removed (i.e. `function main()` or `function()`).
- `brightscript.format.insertSpaceBetweenEmptyCurlyBraces`: if true, empty curly braces will contain exactly 1 whitespace char (i.e. `{ }`). If false, there will be zero whitespace chars between empty curly braces (i.e. `{}`)
- `brightscript.output.includeStackTraces`: If set to true, will print stack trace or breakpoint info in the log output. Set to false to avoid noisy logs - you'll still get the traces in the debug console, in any case
- `brightscript.output.focusOnLaunch`: If set to true, focus on the brightscript log when launching, which is convenient for controlling your roku with the extension's remote control keys. **Experimental. Does not always work**
- `brightscript.output.clearOnLaunch`: If set to true, will clear the brightscript log when launching
- `brightscript.output.clearConsoleOnChannelStart`: If set to true, will clear the brightscript log after connecting to the Roku channel after launching
- `brightscript.output.hyperlinkFormat`: specifies the display format for log output `pkg` link
- `brightscript.deviceDiscovery.showInfoMessages`: If set to true, an info toast will be shown when a Roku device has been found on the network.
- `brightscript.deviceDiscovery.enabled`: If set to true, the extension will automatically watch and scan the network for online Roku devices. This can be pared with the `${promptForHost}` option in the launch config to display a list of online Rokus, removing the need to constantly change the host IP in your config files.
- `brightscript.debug.raleTrackerTaskFileLocation`: This is an absolute path to the TrackerTask.xml file to be injected into your Roku channel during a debug session. (i.e. `/Users/user/roku/TrackerTask/TrackerTask.xml`)
- `brightscript.debug.enableSourceMaps`: Defaults to true. if set to false, then the debugger falls back to using line offets (based on the number of breakpoints injected) to determine the actual line number. Only use this if you're noticing issues with the sourcemaps not working properly.
- `brightscript.debug.enableDebugProtocol` - If true, the debugger will use the new BrightScript debug protocol and will disable the telnet debugger. See [the official documentation](https://developer.roku.com/en-ca/docs/developer-program/debugging/socket-based-debugger.md) for more details.

## Roku Remote Control

You can use your keyboard as a Roku remote by clicking inside the Output or Debug Console panel of VSCode, and then pressing one of the predefined keyboard shortcuts from the table below (make sure the find widget is closed). You can also press `win+k (or cmd+k on mac)` from inside those same panels to bring up a text box to send text to the Roku device.

This extension sends key presses to the Roku device through Roku's [External Control API](https://sdkdocs.roku.com/display/sdkdoc/External+Control+API#ExternalControlAPI-KeypressKeyValues). The 12 standard Roku remote buttons are already included. The keys are mapped using the `when` clause so it will only send remote commands if the Output or Debug Console Panel has focus (`panelFocus`) AND the Editor Find widget is NOT visible (`!findWidgetVisible`).

### Keyboard Commands:

| Keyboard Key                                | Roku Remote Key    | Keybinding Command                            |
| ------------------------------------------- | ------------------ | --------------------------------------------- |
| `Backspace`                                 | Back Button        | `extension.brightscript.pressBackButton`      |
| `win+Backspace` (or `cmd+Backspace` on mac) | Backspace          | `extension.brightscript.pressBackspaceButton` |
| `Escape`                                    | Home Button        | `extension.brightscript.pressHomeButton`      |
| `up`                                        | Up Button          | `extension.brightscript.pressUpButton`        |
| `down`                                      | Down Button        | `extension.brightscript.pressDownButton`      |
| `right`                                     | Right Button       | `extension.brightscript.pressRightButton`     |
| `left`                                      | Left Button        | `extension.brightscript.pressLeftButton`      |
| `Enter`                                     | Select Button (OK) | `extension.brightscript.pressSelectButton`    |
| `win+Enter` (or `cmd+Enter` on mac)         | Play Button        | `extension.brightscript.pressPlayButton`      |
| `win+left` (or `cmd+left` on mac)           | Rev Button         | `extension.brightscript.pressRevButton`       |
| `win+right` (or `cmd+right` on mac)         | Fwd Button         | `extension.brightscript.pressFwdButton`       |
| `win+8` (or `cmd+8` on mac)                 | Info Button        | `extension.brightscript.pressStarButton`      |

You also have the ability to create keybindings for any other Roku supported key by adding. Here's a example entry for `keybindings.json` of how to create a VSCode keyboard shortcut to send the space key to the Roku:

```json
{
  "key": "Space",
  "command": "extension.brightscript.sendRemoteCommand",
  "args": "Lit_%20",
  "when": "panelFocus && !inDebugRepl && !findWidgetVisible"
}
```

## Other keyboard shortcuts

| Keybinding (Windows) | Keybinding (Mac) | Command                                        | Description                                                         |
| -------------------- | ---------------- | ---------------------------------------------- | ------------------------------------------------------------------- |
| `ctrl+L`             | `ctrl+L`         | extension.brightscript.markLogOutput           | Add a new mark line in the BrightScript output panel                |
| `ctrl+alt+k`         | `ctrl+alt+k`     | extension.brightscript.clearLogOutput          | Clear the current log output                                        |
| `win+ctrl+l`         | `cmd+ctrl+l`     | extension.brightscript.setOutputLogLevelFilter | Filter the BrightScript Output by log level (info, warn, debug)     |
| `win+ctrl+i`         | `cmd+ctrl+i`     | extension.brightscript.setOutputIncludeFilter  | Filter the BrightScript Output by typing text you want to _include_ |
| `win+ctrl+x`         | `cmd+ctrl+x`     | extension.brightscript.setOutputExcludeFilter  | Filter the BrightScript output by typing text you want to _exclude_ |

## Config file for user-specific launch settings

If you change your `launch.json` settings regularly, or don't want to check certain values into version control, then another option is to store those values in a `.env` file. Then, reference it in your `launch.json` and use `${env:YOUR_VAR_NAME}` in `launch.json` settings. Here's an example.

```json
//launch.json

{
    "version": "0.2.0",
    "configurations": [
        {
            ...
            "envFile": "${workspaceFolder}/.env",
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

## Snippets

This extension adds some basic snippets for Roku development.

### Example snippets in .bs/.brs files:

Typing `sub<tab>` generates:
```brs
sub subName(params)

end sub
```
with "subName" and "params" editable, and cursor inside the block

Typing `for-each<tab>` generates:
```brs
for each item in collection

end for
```
with "item" and "collection" editable and cursor inside the block

### Example snippets in .xml files:

Typing `<component<tab>` generates
```xml
<component name="ComponentName">
  <script type="text/brightscript" uri="ComponentName.brs" />
  
</component>
```
with "ComponentName" editable and cursor inside the block

Typing `<field<tab>` generates
```xml
<field name="name" type="integer" />
```
with "name" editable, and the type is a dropdown of possible values

## Code formatting
The extension provides code formatting for BrightScript and BrighterScript files. If you don't like the default formatter settings, you can customize them in two ways: 
1. Update your user or workspace settings with various `brightscript.format.*` options (see the [extension settings](#extension-settings) section above).

2. Create a `bsfmt.json` file at the root of your project. See all of the available `bsfmt.json` options [here](https://github.com/rokucommunity/brighterscript-formatter#bsfmtjson-options). Please note, if a `bsfmt.json` file exists, all formatter-related user/workspace settings will be ignored. 


## Pre-release Versions

You can often find pre-release versions of this extension under the [GitHub Releases](https://github.com/RokuCommunity/vscode-brightscript-language/releases) page of this project. Unfortunately, Visual Studio Code does not currently support publishing pre-release versions of an extension, so manually installing the `.vsix` is the next-best option at this point. Here's how it works.

1. Download `.vsix` file for version of the extension you want from [the releases page](https://github.com/RokuCommunity/vscode-brightscript-language/releases);
2. Open Visual Studio Code and click the "extensions" tab.
3. Choose "Install from VSIX..." ![image](https://user-images.githubusercontent.com/2544493/52904494-3f4bdf00-31fb-11e9-9a83-ceca294a4d12.png)
4. Select the file you downloaded from step 1.

### Reinstalling store version of the extension

This process will REPLACE any existing version of the extension you have installed from the store. So, if you want to go back to using the store version, you need to uninstall the extension completely, and then install the extension through the VSCode store.

## Contributing

[![](https://sourcerer.io/fame/TwitchBronBron/rokucommunity/vscode-brightscript-language/images/0)](https://sourcerer.io/fame/TwitchBronBron/rokucommunity/vscode-brightscript-language/links/0)[![](https://sourcerer.io/fame/TwitchBronBron/rokucommunity/vscode-brightscript-language/images/1)](https://sourcerer.io/fame/TwitchBronBron/rokucommunity/vscode-brightscript-language/links/1)[![](https://sourcerer.io/fame/TwitchBronBron/rokucommunity/vscode-brightscript-language/images/2)](https://sourcerer.io/fame/TwitchBronBron/rokucommunity/vscode-brightscript-language/links/2)[![](https://sourcerer.io/fame/TwitchBronBron/rokucommunity/vscode-brightscript-language/images/3)](https://sourcerer.io/fame/TwitchBronBron/rokucommunity/vscode-brightscript-language/links/3)[![](https://sourcerer.io/fame/TwitchBronBron/rokucommunity/vscode-brightscript-language/images/4)](https://sourcerer.io/fame/TwitchBronBron/rokucommunity/vscode-brightscript-language/links/4)[![](https://sourcerer.io/fame/TwitchBronBron/rokucommunity/vscode-brightscript-language/images/5)](https://sourcerer.io/fame/TwitchBronBron/rokucommunity/vscode-brightscript-language/links/5)[![](https://sourcerer.io/fame/TwitchBronBron/rokucommunity/vscode-brightscript-language/images/6)](https://sourcerer.io/fame/TwitchBronBron/rokucommunity/vscode-brightscript-language/links/6)[![](https://sourcerer.io/fame/TwitchBronBron/rokucommunity/vscode-brightscript-language/images/7)](https://sourcerer.io/fame/TwitchBronBron/rokucommunity/vscode-brightscript-language/links/7)

The majority of this extension's language feature support depends on the [BrighterScript](https://github.com/RokuCommunity/brighterscript) project, which contributes the language server. The debugging functionality comes from the [roku-debug](https://github.com/RokuCommunity/roku-debug] project. To get up and running, do the following:

### The easy way
In a terminal, execute 
```bash
npm run install-local
```

This will do the following automatically for you:
 - Clone any missing repositories at the same folder level as this project.
 - Install and build each dependency
 - Update this project's `package.json` to point to the local projects using a relative file scheme (i.e. `"roku-deploy": "file:../roku-deploy"`)
 - delete each dependency's folder in this project's node_modules folder to prevent conflicts.
 - run `npm install` in the root of this project.

 To undo these changes, run 
 ```bash
 npm run uninstall-local
 ```


### The manual way
You only need to install local copies of projects you actually want to work on. You can leave the others as npm modules. This workflow will show the process of installing all projects.

 1. Clone the following projects to the parent folder as this project. (i.e. `C:\projects\vscode-brightscript language`, `C:\projects\brighterscript`, etc...)
    - [brighterscript](https://github.com/RokuCommunity/brighterscript)
    - [brighterscript-formatter](https://github.com/RokuCommunity/brighterscript-formatter)
    - [roku-debug](https://github.com/RokuCommunity/roku-debug)
    - [roku-deploy](https://github.com/RokuCommunity/roku-deploy)

 1. Inside each of the cloned repositories, run  
     ```bash
     npm install && npm run build
     ```
 1. In `vscode-brightscript-language/node_modules`, delete any folders matching the above project names
 1. Open `vscode-brightscript-language/package.json` and edit the `dependencies`to look like this:
    ```javascript
    {
        "dependencies": {
            //...
            "brighterscript": "file:../brighterscript",
            "brighterscript-formatter": "file:../brighterscript-formatter",
            "roku-debug": "file:../roku-debug",
            "roku-deploy": "file:../roku-debug",
            //...
        }
    }

 1. In the `vscode-brightscript-language` folder
    ```bash
    npm install && npm run build
    ``` 
 1. You're all set! Open the `vscode-brightscript-language` folder in vscode to start debugging. 

View our [developer guidelines](https://github.com/RokuCommunity/vscode-brightscript-language/blob/master/developer-guidelines.md) for more information on how to contribute to this extension.

You can also chat with us [on slack](http://tiny.cc/nrdf0y). (We're in the #vscode-bs-lang-ext channel).

## Changelog

Click [here](https://github.com/RokuCommunity/vscode-brightscript-language/blob/master/CHANGELOG.md) to see the changelog.
