---
priority: 4
---
# Extension Settings

This extension contributes the following settings:

<br/>

### `brightscript.format.keywordCase`
specify case of keywords when formatting

### `brightscript.format.compositeKeywords`
specify whether composite words (ie: "endif", "endfor") should be broken apart into their two-word format (ie: "end if", "end for")

### `brightscript.format.removeTrailingWhiteSpace`
specify whether trailing whitespace should be removed on format
### `brightscript.format.formatInteriorWhitespace`
If true (the default), all whitespace between items is reduced to exactly 1 space character, and certain keywords and operators are padded with whitespace (i.e. `1+1` becomes `1 + 1`)
### `brightscript.format.insertSpaceBeforeFunctionParenthesis`
If true, a space is inserted to the left of an opening function declaration parenthesis. (i.e. `function main ()` or `function ()`). If false, all spacing is removed (i.e. `function main()` or `function()`).
### `brightscript.format.insertSpaceBetweenEmptyCurlyBraces`

if true, empty curly braces will contain exactly 1 whitespace char (i.e. `{ }`). If false, there will be zero whitespace chars between empty curly braces (i.e. `{}`)
### `brightscript.format.sortImports`
if true, import statements will be sorted alphabetically.
### `brightscript.output.includeStackTraces`
If set to true, will print stack trace or breakpoint info in the log output. Set to false to avoid noisy logs - you'll still get the traces in the debug console, in any case
### `brightscript.output.focusOnLaunch`
If set to true, focus on the brightscript log when launching, which is convenient for controlling your roku with the extension's remote control keys. **Experimental. Does not always work**
### `brightscript.output.clearOnLaunch`
If set to true, will clear the brightscript log when launching
### `brightscript.output.clearConsoleOnChannelStart`
If set to true, will clear the brightscript log after connecting to the Roku channel after launching
### `brightscript.output.hyperlinkFormat`
specifies the display format for log output `pkg` link
### `brightscript.deviceDiscovery.showInfoMessages`
If set to true, an info toast will be shown when a Roku device has been found on the network.
### `brightscript.deviceDiscovery.enabled`
If set to true, the extension will automatically watch and scan the network for online Roku devices. This can be pared with the `${promptForHost}` option in the launch config to display a list of online Rokus, removing the need to constantly change the host IP in your config files.
### `brightscript.deviceDiscovery.concealDeviceInfo`
If set to true, the extension will randomize the numbers and letters in the following fields (useful for hiding your sensitive device fields when creating public screenshots or demos).
 - `udn`
 - `device-id`
 - `advertising-id`
 - `wifi-mac`
 - `ethernet-mac`
 - `serial-number`
 - `keyed-developer-id`

### `brightscript.debug.autoRunSgDebugCommands`
Give the ability to run a list of commands on port 8080 of the device at the start of a debug session. Currently there are three supported short hands for the most commonly desired commands. These are:
 - `chanperf` - runs chanperf with a one seconds repeating interval
 - `fpsdisplay` - turns on the FPS
 - `logrendezvous` - enables Rendezvous Logging. You can also include and command string in this array and we will attempt to run it for you. For example you could do `chanperf -r 10` or `clear_launch_caches` as another example.
 - `brightscript_warnings` - Sets the maximum number of brightscript warnings to be displayed by the device on channel install.
### `brightscript.debug.raleTrackerTaskFileLocation`
This is an absolute path to the TrackerTask.xml file to be injected into your Roku channel during a debug session. (i.e. `/Users/user/roku/TrackerTask/TrackerTask.xml`)
### `brightscript.debug.enableSourceMaps`
Defaults to `true`. if set to `false`, then the debugger falls back to using line offsets (based on the number of breakpoints injected) to determine the actual line number. Only use this if you're noticing issues with the sourcemaps not working properly.
### `brightscript.debug.rewriteDevicePathsInLogs`
Defaults to `true`. If true, then any pkg path found in the device logs will be converted to a source location

Supported formats:
```
pkg:/source/main.brs:10
pkg:/source/main.brs(10)
pkg:/source/main.brs:10:20
pkg:/source/main.brs(10:20)
...ce/main.brs:10
...ce/main.brs(10)
...ce/main.brs:10:20
...ce/main.brs(10:20)
```
### `brightscript.debug.enableVariablesPanel`
Defaults to `true`. Enables automatic population of the debug variable panel on a breakpoint or runtime errors
### `brightscript.debug.autoResolveVirtualVariables` (Experimental)
Defaults to `false`. Enables automatic population of the virtual variables.
### `brightscript.debug.enhanceREPLCompletions`
Defaults to `false`.

Enables scanning deployment files for additional REPL completions,
such as user-defined functions. This process runs in a background
thread and may be resource-intensive.
### `brightscript.debug.enableDebugProtocol`
Defaults to `true`. When enabled, the debugger will use the [BrightScript debug protocol](https://developer.roku.com/en-ca/docs/developer-program/debugging/socket-based-debugger.md) and will disable the telnet debugger. When not enabled, will use the legacy telnet debugger.
### `brightscript.extensionLogfilePath`
File where the 'BrightScript Extension' output panel (i.e. debug logs for the extension) will be appended. If omitted, no file logging will be done. `${workspaceFolder}` is supported and will point to the first workspace found.
### `brightscript.remoteControlMode.enableActiveAnimation`
Enables or disables visual animations related to the remote control mode button
