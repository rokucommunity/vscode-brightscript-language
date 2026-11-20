# Extension Settings

These are all of the settings the extension contributes. Set them in your user or workspace `settings.json`, or search for `brightscript` in VS Code's settings UI.

<!-- reference:start: everything below is generated from package.json by docs/scripts/reference.mjs. Edit descriptions there. Notes written right after a setting's generated:end marker are kept. -->

## Formatting

### `brightscript.format.formatIndent`
<!-- generated:start -->
If true, lines are indented based on what they are nested inside of. If false, all leading whitespace is left alone.

**Type:** `boolean` · **Default:** `true`
<!-- generated:end -->

### `brightscript.format.keywordCase`
<!-- generated:start -->
Replaces all keywords with the upper or lower case settings specified. `"original"` means they are not modified at all.

**Type:** `string` · **Default:** `"lower"`

Allowed values:

- `"lower"`
- `"upper"`
- `"title"`
- `"original"`
<!-- generated:end -->

### `brightscript.format.typeCase`
<!-- generated:start -->
Replaces all type keywords with the upper or lower case settings specified. `"original"` means they are not modified at all.

**Type:** `string` · **Default:** `"lower"`

Allowed values:

- `"lower"`
- `"upper"`
- `"title"`
- `"original"`
<!-- generated:end -->

### `brightscript.format.compositeKeywords`
<!-- generated:start -->
Forces all composite keywords (i.e. 'elseif', 'endwhile', etc...) to be consistent. If 'split', they are split into their alternatives ('else if', 'end while'). If 'combine', they are combined ('elseif', 'endwhile'). If null, they are not modified.

**Type:** `string` · **Default:** `"split"`

Allowed values:

- `"split"`
- `"combine"`
- `"original"`
<!-- generated:end -->

### `brightscript.format.removeTrailingWhiteSpace`
<!-- generated:start -->
Removes all trailing whitespace at the end of each line.

**Type:** `boolean` · **Default:** `true`
<!-- generated:end -->

### `brightscript.format.insertSpaceAfterOpeningAndBeforeClosingNonemptyBraces`
<!-- generated:start -->
if true, ensure exactly 1 space after leading and before trailing curly braces. If false, REMOVE all whitespace after leading and before trailing curly braces (excluding beginning-of-line indentation spacing)

**Type:** `boolean` · **Default:** `true`
<!-- generated:end -->

### `brightscript.format.formatMultiLineObjectsAndArrays`
<!-- generated:start -->
if true, insert newlines and indents for multi-line objects and arrays.

**Type:** `boolean` · **Default:** `true`
<!-- generated:end -->

### `brightscript.format.keywordCaseOverride`
<!-- generated:start -->
Allows overriding case at the individual keyword level.
Example {"string": "title"} would make string always lower case regardless of keywordCase

**Type:** `object`

Properties:

- `endfunction` (string)
- `endif` (string)
- `endsub` (string)
- `endwhile` (string)
- `exitwhile` (string)
- `exitfor` (string)
- `endfor` (string)
- `elseif` (string)
- `#elseif` (string)
- `#endif` (string)
- `endclass` (string)
- `endnamespace` (string)
- `and` (string)
- `eval` (string)
- `if` (string)
- `then` (string)
- `else` (string)
- `for` (string)
- `to` (string)
- `step` (string)
- `exit` (string)
- `each` (string)
- `while` (string)
- `function` (string)
- `sub` (string)
- `as` (string)
- `return` (string)
- `print` (string)
- `goto` (string)
- `dim` (string)
- `stop` (string)
- `void` (string)
- `boolean` (string)
- `integer` (string)
- `longinteger` (string)
- `float` (string)
- `double` (string)
- `string` (string)
- `object` (string)
- `interface` (string)
- `invalid` (string)
- `dynamic` (string)
- `or` (string)
- `let` (string)
- `next` (string)
- `not` (string)
- `#if` (string)
- `#else` (string)
- `#const` (string)
- `class` (string)
- `namespace` (string)
- `import` (string)
<!-- generated:end -->

### `brightscript.format.typeCaseOverride`
<!-- generated:start -->
Provides a way to override type keyword case at the individual TokenType level. Types are defined as keywords that are preceeded by an `as` token.

**Type:** `object`

Properties:

- `boolean` (string)
- `double` (string)
- `dynamic` (string)
- `float` (string)
- `function` (string)
- `integer` (string)
- `invalid` (string)
- `longinteger` (string)
- `object` (string)
- `string` (string)
- `void` (string)
<!-- generated:end -->

### `brightscript.format.formatInteriorWhitespace`
<!-- generated:start -->
If true, all whitespace between items is reduced to exactly 1 space character,and certain keywords and operators are padded with whitespace (i.e. `1+1` becomes `1 + 1`)

**Type:** `boolean` · **Default:** `true`
<!-- generated:end -->

### `brightscript.format.insertSpaceBeforeFunctionParenthesis`
<!-- generated:start -->
If true, a space is inserted to the left of an opening function declaration parenthesis. (i.e. `function main ()` or `function ()`). If false, all spacing is removed (i.e. `function main()` or `function()`).

**Type:** `boolean` · **Default:** `false`
<!-- generated:end -->

### `brightscript.format.insertSpaceBetweenEmptyCurlyBraces`
<!-- generated:start -->
If true, empty curly braces will contain exactly 1 whitespace char (i.e. `{ }`). If false, there will be zero whitespace chars between empty curly braces (i.e. `{}`)

**Type:** `boolean` · **Default:** `false`
<!-- generated:end -->

### `brightscript.format.insertSpaceBetweenAssociativeArrayLiteralKeyAndColon`
<!-- generated:start -->
If true, ensure exactly 1 space between an associative array literal key and its colon. If false, all space between the key and its colon will be removed

**Type:** `boolean` · **Default:** `false`
<!-- generated:end -->

### `brightscript.format.insertSpaceAfterConditionalCompileSymbol`
<!-- generated:start -->
If true, a space is inserted after the `#` in conditional compile directives (i.e. `# if true`). If false, no space is inserted (i.e. `#if true`)

**Type:** `boolean` · **Default:** `false`
<!-- generated:end -->

### `brightscript.format.formatSingleLineCommentType`
<!-- generated:start -->
Forces all single-line comments to use the same style

**Type:** `string`

Allowed values:

- `"singlequote"`
- `"rem"`
- `"original"`
<!-- generated:end -->

### `brightscript.format.sortImports`
<!-- generated:start -->
Sort import statements alphabetically

**Type:** `boolean` · **Default:** `false`
<!-- generated:end -->

### `brightscript.format.bsfmtPath`
<!-- generated:start -->
Path to a custom `bsfmt.json` formatting config file. This can be an absolute path, or a path relative to the workspace folder. When specified, this file will be used instead of searching for a `bsfmt.json` file at the root of the workspace folder

**Type:** `string`
<!-- generated:end -->

## Project Settings

### `brightscript.projects`
<!-- generated:start -->
Set of projects to load instead of automatic discovery.

**Type:** `array`
<!-- generated:end -->

### `brightscript.bsdk`
<!-- generated:start -->
The BrighterScript version to use for the BrightScript and BrighterScript language features. Can be `embedded`, an npm version/range/dist-tag, a URL or path to a `.tgz`, or a path to a brighterscript package directory. Relative paths are resolved relative to the `.code-workspace` file or workspace folder where this is defined. Paths may start with `${workspaceFolder}` or `${workspaceFolder:name}`.

**Type:** `string`
<!-- generated:end -->

Supported values:
 - `"embedded"` (or omitted) - use the version of BrighterScript bundled with the extension
 - a path to a directory containing the `brighterscript` package (i.e. `"node_modules/brighterscript"`)
 - an npm version, range, or dist-tag (i.e. `"0.65.0"`, `"^0.65.0"`, or `"@next"`), which the extension will download and cache
 - a URL or path to a `.tgz` package (i.e. `"https://github.com/rokucommunity/brighterscript/releases/download/v0.0.0-packages/brighterscript-0.65.27.tgz"`)

Relative paths are resolved relative to the file where the setting is defined:
 - in a `.code-workspace` file, relative to the directory containing the `.code-workspace` file (which does not need to be the project root)
 - in a folder's `.vscode/settings.json`, relative to that workspace folder

The path may start with one of these variables:
 - `${workspaceFolder}` - in a `.code-workspace` file, this is the first workspace folder. In a folder's `.vscode/settings.json`, this is that folder.
 - `${workspaceFolder:name}` - the workspace folder with the given name (i.e. `"${workspaceFolder:app}/node_modules/brighterscript"`)

Any other variable (i.e. `${env:MY_VAR}`) is not supported, and an error will be shown in the BrightScript extension output panel.

When there are multiple sources, the first match wins:
 1. the value from the `.code-workspace` file
 2. if exactly one workspace folder has a value (or all folders resolve to the same value), use it
 3. if workspace folders have different values, you will be prompted to pick which one to use
 4. otherwise, use the embedded version

### `brightscript.npmCacheRetentionDays`
<!-- generated:start -->
How long should the extension keep around unused extension-managed npm packages such as brighterscript

**Type:** `number` · **Default:** `45`
<!-- generated:end -->

### `brightscript.enableLanguageServer`
<!-- generated:start -->
> [!WARNING]
> **Deprecated.** Use 'brightscript.languageServer.enabled' instead. This setting will be removed in a future version.

Enable the Language Server, which includes things like syntax checking, intellisense, completions, etc.

**Type:** `boolean` · **Default:** `true`
<!-- generated:end -->

### `brightscript.languageServer.enabled`
<!-- generated:start -->
Enable the Language Server, which includes things like syntax checking, intellisense, completions, etc.

**Type:** `boolean` · **Default:** `true`
<!-- generated:end -->

### `brightscript.languageServer.enableThreading`
<!-- generated:start -->
Should the projects in this workspace be run in their own dedicated worker threads, or all run on the main thread

**Type:** `boolean` · **Default:** `true`
<!-- generated:end -->

### `brightscript.languageServer.enableProjectDiscovery`
<!-- generated:start -->
Should the projects in this workspace be discovered automatically

**Type:** `boolean` · **Default:** `true`
<!-- generated:end -->

### `brightscript.languageServer.logLevel`
<!-- generated:start -->
The level of logging that should be used for the language server. If omitted, the most verbose value from all bsconfig.json files will be used, or default to 'log' if no bsconfig.json files are found.

**Type:** `string`

Allowed values:

- `"off"`
- `"error"`
- `"warn"`
- `"log"`
- `"info"`
- `"debug"`
- `"trace"`
<!-- generated:end -->

## Debug Logging

### `brightscript.output.clearConsoleOnChannelStart`
<!-- generated:start -->
If set to true, will clear the  brightscript log after connecting to the Roku channel after launching.

**Type:** `boolean` · **Default:** `true`
<!-- generated:end -->

### `brightscript.output.clearOnLaunch`
<!-- generated:start -->
If set to true, will clear the brightscript log when launching.

**Type:** `boolean` · **Default:** `true`
<!-- generated:end -->

### `brightscript.output.focusOnLaunch`
<!-- generated:start -->
If set to true, focus on the brightscript log when launching, which is convenient for controlling your roku with the extension's remote control keys.

**Type:** `boolean` · **Default:** `true`
<!-- generated:end -->

### `brightscript.output.hyperlinkFormat`
<!-- generated:start -->
Determines the format of roku hyperlinks in the output panel. For example, given pkg:/components/KeyLogTester.brs(24:0)  The hyperlink will appear as follows: 
 (Full) pkg:/components/KeyLogTester.brs(24:0) [INFO] retrieving videos for category id 23 
 (Filename) KeyLogTester.brs(24) [INFO] retrieving videos for category id 23 
 (FilenameAndFunction) KeyLogTester.getVideos(24) [INFO] retrieving videos for category id 23 
 (Short) #1 [INFO] retrieving videos for category id 23 
 (Hidden) [INFO] retrieving videos for category id 23

**Type:** `string | null` · **Default:** `"FilenameAndFunction"`

Allowed values:

- `"Full"`
- `"Filename"`
- `"FilenameAndFunction"`
- `"Short"`
- `"Hidden"`
<!-- generated:end -->

### `brightscript.output.includeStackTraces`
<!-- generated:start -->
If set to true, will print stack trace or breakpoint info in the log output. Set to false to avoid noisy logs - you'll still get the traces in the debug console, in any case.

**Type:** `boolean` · **Default:** `true`
<!-- generated:end -->

### `brightscript.outputPanelStartupBehavior`
<!-- generated:start -->
Used to configure if the 'BrightScript Log' output channel will be shown, shown and be focused, or nothing happens as soon as this extension is initialized

**Type:** `string` · **Default:** `"nothing"`

Allowed values:

- `"show"`
- `"focus"`
- `"nothing"`
<!-- generated:end -->

### `brightscript.focusOutputPanelOnStartup`
<!-- generated:start -->
> [!WARNING]
> **Deprecated.** Deprecated. Use 'outputPanelStartupBehavior' instead

If enabled, the 'BrightScript Log' output channel will be focused as soon as this extension is initialized

**Type:** `boolean` · **Default:** `false`
<!-- generated:end -->

## Experimental

### `brightscript.experimental.all`
<!-- generated:start -->
Enable every experimental feature in this section, regardless of each feature's own setting. Changing this requires a window reload.

**Type:** `boolean` · **Default:** `false`
<!-- generated:end -->

## Device Discovery

### `brightscript.deviceDiscovery.showInfoMessages`
<!-- generated:start -->
If set to true, an info toast will be shown when a Roku device has been found on the network.

**Type:** `boolean` · **Default:** `true`
<!-- generated:end -->

### `brightscript.deviceDiscovery.enabled`
<!-- generated:start -->
If set to true, the extension will automatically watch and scan the network for online Roku devices. This can be pared with the ${promptForHost} option in the launch config to display a list of online Rokus, removing the need to constantly change the host IP in your config files.

**Type:** `boolean` · **Default:** `true`
<!-- generated:end -->

### `brightscript.deviceDiscovery.heartbeatLogging`
<!-- generated:start -->
Log every ssdp:alive heartbeat to the 'BrightScript Extension' output panel, including the serial number, time since last seen, and whether the device-online notification was suppressed or fired. Useful for verifying heartbeat suppression behavior. Leave disabled in normal use.

**Type:** `boolean` · **Default:** `false`
<!-- generated:end -->

### `brightscript.deviceDiscovery.concealDeviceInfo`
<!-- generated:start -->
If set to true, the extension will randomize the numbers and letters in the following fields (useful for hiding your sensitive device fields when creating public screenshots or demos). ['udn', 'device-id', 'advertising-id', 'wifi-mac', 'ethernet-mac', 'serial-number', 'keyed-developer-id']

**Type:** `boolean` · **Default:** `false`
<!-- generated:end -->

### `brightscript.devices`
<!-- generated:start -->
Hand-curated list of Roku devices that always appear in the device list, regardless of network discovery.

**Type:** `object[]` · **Default:** `[]`

Properties:

- `host` (string, required): IP address or hostname of the device. Used as a location hint to speed up device detection on the network.
- `name` (string): Friendly name for the device (overrides discovered name)
- `serialNumber` (string): Serial number (if known). Used for merging with discovered devices and cache lookup.
- `password` (string): Developer password for this device
<!-- generated:end -->

### `brightscript.defaultDevicePassword`
<!-- generated:start -->
Default developer password applied to any device that does not have its own password configured. Leave empty to disable.

**Type:** `string` · **Default:** `""`
<!-- generated:end -->

## Devices View

### `brightscript.devicesView.filters.devModeEnabled`
<!-- generated:start -->
Show devices with developer mode enabled in the Devices view.

**Type:** `boolean` · **Default:** `true`
<!-- generated:end -->

### `brightscript.devicesView.filters.devModeDisabled`
<!-- generated:start -->
Show devices with developer mode disabled in the Devices view.

**Type:** `boolean` · **Default:** `false`
<!-- generated:end -->

### `brightscript.devicesView.filters.tv`
<!-- generated:start -->
Show TV devices in the Devices view.

**Type:** `boolean` · **Default:** `true`
<!-- generated:end -->

### `brightscript.devicesView.filters.setTopBox`
<!-- generated:start -->
Show set-top boxes in the Devices view.

**Type:** `boolean` · **Default:** `true`
<!-- generated:end -->

### `brightscript.devicesView.filters.stick`
<!-- generated:start -->
Show streaming sticks in the Devices view.

**Type:** `boolean` · **Default:** `true`
<!-- generated:end -->

### `brightscript.devicesView.filters.online`
<!-- generated:start -->
Show online devices in the Devices view.

**Type:** `boolean` · **Default:** `true`
<!-- generated:end -->

### `brightscript.devicesView.filters.offline`
<!-- generated:start -->
Show offline devices in the Devices view.

**Type:** `boolean` · **Default:** `false`
<!-- generated:end -->

### `brightscript.devicesView.filters.userDefined`
<!-- generated:start -->
Show user-defined devices (devices listed in your settings) in the Devices view.

**Type:** `boolean` · **Default:** `true`
<!-- generated:end -->

### `brightscript.devicesView.filters.autoDetected`
<!-- generated:start -->
Show auto-detected devices (discovered on the network) in the Devices view.

**Type:** `boolean` · **Default:** `true`
<!-- generated:end -->

### `brightscript.devicesView.filters.local`
<!-- generated:start -->
Show local (LAN) devices in the Devices view.

**Type:** `boolean` · **Default:** `true`
<!-- generated:end -->

### `brightscript.devicesView.filters.cloud`
<!-- generated:start -->
Show Roku Cloud Emulator devices in the Devices view.

**Type:** `boolean` · **Default:** `true`
<!-- generated:end -->

## Device Quick Pick

### `brightscript.deviceQuickPick.filters.devModeEnabled`
<!-- generated:start -->
Show devices with developer mode enabled in the device quick pick.

**Type:** `boolean` · **Default:** `true`
<!-- generated:end -->

### `brightscript.deviceQuickPick.filters.devModeDisabled`
<!-- generated:start -->
Show devices with developer mode disabled in the device quick pick.

**Type:** `boolean` · **Default:** `false`
<!-- generated:end -->

### `brightscript.deviceQuickPick.filters.tv`
<!-- generated:start -->
Show TV devices in the device quick pick.

**Type:** `boolean` · **Default:** `true`
<!-- generated:end -->

### `brightscript.deviceQuickPick.filters.setTopBox`
<!-- generated:start -->
Show set-top boxes in the device quick pick.

**Type:** `boolean` · **Default:** `true`
<!-- generated:end -->

### `brightscript.deviceQuickPick.filters.stick`
<!-- generated:start -->
Show streaming sticks in the device quick pick.

**Type:** `boolean` · **Default:** `true`
<!-- generated:end -->

### `brightscript.deviceQuickPick.filters.online`
<!-- generated:start -->
Show online devices in the device quick pick.

**Type:** `boolean` · **Default:** `true`
<!-- generated:end -->

### `brightscript.deviceQuickPick.filters.offline`
<!-- generated:start -->
Show offline devices in the device quick pick.

**Type:** `boolean` · **Default:** `false`
<!-- generated:end -->

### `brightscript.deviceQuickPick.filters.userDefined`
<!-- generated:start -->
Show user-defined devices (devices listed in your settings) in the device quick pick.

**Type:** `boolean` · **Default:** `true`
<!-- generated:end -->

### `brightscript.deviceQuickPick.filters.autoDetected`
<!-- generated:start -->
Show auto-detected devices (discovered on the network) in the device quick pick.

**Type:** `boolean` · **Default:** `true`
<!-- generated:end -->

### `brightscript.deviceQuickPick.filters.local`
<!-- generated:start -->
Show local (LAN) devices in the device quick pick.

**Type:** `boolean` · **Default:** `true`
<!-- generated:end -->

### `brightscript.deviceQuickPick.filters.cloud`
<!-- generated:start -->
Show Roku Cloud Emulator devices in the device quick pick.

**Type:** `boolean` · **Default:** `true`
<!-- generated:end -->

## Debugging

### `brightscript.debug.raleTrackerTaskFileLocation`
<!-- generated:start -->
This is an absolute path to the TrackerTask.xml file to be injected into your Roku channel during a debug session.

The default for the [`raleTrackerTaskFileLocation`](debugging/launch-configuration.md#raletrackertaskfilelocation) option in every `launch.json` configuration.

**Type:** `string`
<!-- generated:end -->

### `brightscript.debug.autoRunSgDebugCommands`
<!-- generated:start -->
SceneGraph debug commands to run on port 8080 of the device at the start of a debug session. Supports the shorthands `chanperf`, `fpsdisplay`, `logrendezvous` and `brightscript_warnings 0`, or any other SceneGraph debug command (i.e. `chanperf -r 10` or `clear_launch_caches`).

The default for the [`autoRunSgDebugCommands`](debugging/launch-configuration.md#autorunsgdebugcommands) option in every `launch.json` configuration.

**Type:** `array`

Allowed values:

- `"chanperf"`: Enables running the 'chanperf' command with a 1 second reporting interval at the start of a debug session.
- `"fpsdisplay"`: Enables running of the 'fps_display 1' command at the start of a debug session.
- `"logrendezvous"`: Enables running of the 'logrendezvous on' command at the start of a debug session.
- `"brightscript_warnings 0"`: Changes the maximum number of brightscript warnings displayed on channel install to zero.
- _any other value_: Custom SGDebug command that will be run on port 8080
<!-- generated:end -->

### `brightscript.debug.enableDebugProtocol`
<!-- generated:start -->
If true, the debugger will use the new BrightScript debug protocol, and will disable the telnet debugger. See this link for more details: https://developer.roku.com/en-ca/docs/developer-program/debugging/socket-based-debugger.md

The default for the [`enableDebugProtocol`](debugging/launch-configuration.md#enabledebugprotocol) option in every `launch.json` configuration.

**Type:** `boolean` · **Default:** `true`
<!-- generated:end -->

### `brightscript.debug.waitForJsDebugger`
<!-- generated:start -->
When launching a TS/JS app, ask the device to hold app startup until the JS debugger attaches (by appending `inspect=1` to the sideload form) so breakpoints in startup code get hit. Set to false as an escape hatch in case this causes launch issues.

The default for the [`waitForJsDebugger`](debugging/launch-configuration.md#waitforjsdebugger) option in every `launch.json` configuration.

**Type:** `boolean` · **Default:** `true`
<!-- generated:end -->

### `brightscript.debug.jsPathTrace`
<!-- generated:start -->
Diagnostic logging for TS/JS (Hermes) debugging. Logs the computed remoteRoot/localRoot, the CDP proxy's activity, and every path-bearing DAP message to the extension output channel, and writes the full js-debug CDP wire log (including its sourcemap path-mapping decisions) to `<workspace>/logs/`. Enable this when breakpoints don't bind, when a stop opens a duplicate/phantom tab, or when you see "Could not load source ... Unable to retrieve source content".

**Type:** `boolean` · **Default:** `false`
<!-- generated:end -->

### `brightscript.debug.forceJsDebugRelay`
<!-- generated:start -->
Forces the local JS-debug relay for LAN devices on every platform. The relay is always used for RCE devices, and on Windows where it corrects js-debug's malformed four-slash file:// breakpoint urls. This setting is primarily for testing the relay path from macOS/Linux.

**Type:** `boolean` · **Default:** `false`
<!-- generated:end -->

### `brightscript.debug.enableSourceMaps`
<!-- generated:start -->
If true, the debugger will read any available sourcemaps and attempt to convert debugger locations into their original source locations.

The default for the [`enableSourceMaps`](debugging/launch-configuration.md#enablesourcemaps) option in every `launch.json` configuration.

**Type:** `boolean` · **Default:** `true`
<!-- generated:end -->

### `brightscript.debug.rewriteDevicePathsInLogs`
<!-- generated:start -->
If true, then any pkg path found in the device logs will be converted to a source location

Supported formats:
- pkg:/source/main.brs:10
- pkg:/source/main.brs(10)
- pkg:/source/main.brs:10:20
- pkg:/source/main.brs(10:20)
- ...ce/main.brs:10
- ...ce/main.brs(10)
- ...ce/main.brs:10:20
- ...ce/main.brs(10:20)

The default for the [`rewriteDevicePathsInLogs`](debugging/launch-configuration.md#rewritedevicepathsinlogs) option in every `launch.json` configuration.

**Type:** `boolean` · **Default:** `true`
<!-- generated:end -->

### `brightscript.debug.logfilePath`
<!-- generated:start -->
> [!WARNING]
> **Deprecated.** Use `fileLogging` option instead

A path to a file where all brightscript console output will be written. If null or empty, file logging will be disabled.

The default for the [`logfilePath`](debugging/launch-configuration.md#logfilepath) option in every `launch.json` configuration.

**Type:** `string`
<!-- generated:end -->

### `brightscript.debug.host`
<!-- generated:start -->
The host or ip address for the target Roku

The default for the [`host`](debugging/launch-configuration.md#host) option in every `launch.json` configuration.

**Type:** `string` · **Default:** `"${promptForHost}"`
<!-- generated:end -->

### `brightscript.debug.deepLinkUrl`
<!-- generated:start -->
A full deep link url to start the debugging session. There's no pretty way of launching directly to a deep link, so the app must be side-loaded, it auto-runs, we stop the app, and then launch it again using the deep link. You may use ${promptForHost}, ${activeHost}, ${host}, ${promptForQueryParams} which only asks for the URL-encoded querystring, and ${promptForDeepLinkUrl} to enter the entire deep link url at launch-time.

The default for the [`deepLinkUrl`](debugging/launch-configuration.md#deeplinkurl) option in every `launch.json` configuration.

**Type:** `string` · **Default:** `"http://${host}:8060/launch/dev?${promptForQueryParams}"`
<!-- generated:end -->

### `brightscript.debug.password`
<!-- generated:start -->
The password for the developer page on the target Roku. You may use ${promptForPassword} to prompt for password, or ${activeHostPassword} to use the password set for the active device.

The default for the [`password`](debugging/launch-configuration.md#password) option in every `launch.json` configuration.

**Type:** `string` · **Default:** `"${promptForPassword}"`
<!-- generated:end -->

### `brightscript.debug.rootDir`
<!-- generated:start -->
The root directory that contains your Roku project. This path should point to the folder containing your manifest file

The default for the [`rootDir`](debugging/launch-configuration.md#rootdir) option in every `launch.json` configuration.

**Type:** `string` · **Default:** `"${workspaceFolder}"`
<!-- generated:end -->

### `brightscript.debug.debugRootDir`
<!-- generated:start -->
> [!WARNING]
> **Deprecated.** Deprecated. Use sourceDirs instead

If you have a build system, rootDir will point to the build output folder, and this path should point to the actual source folder so that breakpoints can be set in the source files when debugging. In order for this to work, your build process cannot change line offsets between source files and built files, otherwise debugger lines will be out of sync.

The default for the [`debugRootDir`](debugging/launch-configuration.md#debugrootdir) option in every `launch.json` configuration.

**Type:** `string` · **Default:** `"${workspaceFolder}"`
<!-- generated:end -->

### `brightscript.debug.sourceDirs`
<!-- generated:start -->
If you have a build system, this array will point to paths of actual source folders so that breakpoints can be set in the source files when debugging. In order for this to work, your build process cannot change line offsets between source files and built files, otherwise, debugger lines will be out of sync.

The default for the [`sourceDirs`](debugging/launch-configuration.md#sourcedirs) option in every `launch.json` configuration.

**Type:** `array` · **Default:** `["${workspaceFolder}"]`
<!-- generated:end -->

### `brightscript.debug.bsConst`
<!-- generated:start -->
An object of bs_const values to be updated in the manifest before side loading.

The default for the [`bsConst`](debugging/launch-configuration.md#bsconst) option in every `launch.json` configuration.

**Type:** `object`
<!-- generated:end -->

### `brightscript.debug.componentLibrariesPort`
<!-- generated:start -->
Port to access component libraries.

The default for the [`componentLibrariesPort`](debugging/launch-configuration.md#componentlibrariesport) option in every `launch.json` configuration.

**Type:** `number` · **Default:** `8080`
<!-- generated:end -->

### `brightscript.debug.componentLibrariesOutDir`
<!-- generated:start -->
> [!WARNING]
> **Deprecated.** This no longer user-configurable. This value will be set to "${outDir}/component-libraries" by the extension.

The default for the [`componentLibrariesOutDir`](debugging/launch-configuration.md#componentlibrariesoutdir) option in every `launch.json` configuration.

**Type:** `string` · **Default:** `""`
<!-- generated:end -->

### `brightscript.debug.componentLibraries`
<!-- generated:start -->
An array of file path sets. One for each component library. Each index is an array of file paths, file globs. This will override the defaults, so if specified, you must provide ALL files. See https://npmjs.com/roku-deploy for examples. You must specify a componentLibrariesOutDir to use this.

The default for the [`componentLibraries`](debugging/launch-configuration.md#componentlibraries) option in every `launch.json` configuration.

**Type:** `object[]`

**Default:**

```json
[
    {
        "rootDir": "${workspaceFolder}/LibDir/",
        "outFile": "LibName.zip",
        "files": [
            "manifest",
            "source/**/*.*",
            "components/**/*.*",
            "images/**/*.*"
        ]
    }
]
```

Properties:

- `rootDir` (string, required): Root directory of source files for this component library.
- `outFile` (string, required): A file name and extension used as the static file name for the zip. You can use manifest values in this property such as ${title} to be inferred from the library's manifest file.
- `files` (array, required): A file path or file glob that should be copied to the  component library zip.
- `sourceDirs` (array): If you have a build system, this array will point to paths of actual source folders so that breakpoints can be set in the source files when debugging. In order for this to work, your build process cannot change line offsets between source files and built files, otherwise, debugger lines will be out of sync.
<!-- generated:end -->

### `brightscript.debug.outDir`
<!-- generated:start -->
The folder where the the build artifacts are placed (like the staging folder and .zip files of the apps)

The default for the [`outDir`](debugging/launch-configuration.md#outdir) option in every `launch.json` configuration.

**Type:** `string` · **Default:** `"${workspaceFolder}/out"`
<!-- generated:end -->

### `brightscript.debug.stagingDir`
<!-- generated:start -->
The folder where the vscode will copy all the project files to before creating the zip

The default for the [`stagingDir`](debugging/launch-configuration.md#stagingdir) option in every `launch.json` configuration.

**Type:** `string` · **Default:** `"${workspaceFolder}/out/.roku-deploy-staging"`
<!-- generated:end -->

### `brightscript.debug.stopOnEntry`
<!-- generated:start -->
Should the debugger stop on the first line of the program after launch.

The default for the [`stopOnEntry`](debugging/launch-configuration.md#stoponentry) option in every `launch.json` configuration.

**Type:** `boolean` · **Default:** `false`
<!-- generated:end -->

### `brightscript.debug.retainStagingFolder`
<!-- generated:start -->
Prevent the staging folder from being deleted after the deployment package is created.  This is helpful for troubleshooting why your package isn't being created the way you expected.

The default for the [`retainStagingFolder`](debugging/launch-configuration.md#retainstagingfolder) option in every `launch.json` configuration.

**Type:** `boolean` · **Default:** `false`
<!-- generated:end -->

### `brightscript.debug.retainDeploymentArchive`
<!-- generated:start -->
Prevent the deployment package from being deleted after launching a debug session.

The default for the [`retainDeploymentArchive`](debugging/launch-configuration.md#retaindeploymentarchive) option in every `launch.json` configuration.

**Type:** `boolean` · **Default:** `true`
<!-- generated:end -->

### `brightscript.debug.enableVariablesPanel`
<!-- generated:start -->
> [!WARNING]
> **Deprecated.** Use 'deferScopeLoading' instead.

Enables automatic population of the debug variable panel on a breakpoint or runtime errors.

The default for the [`enableVariablesPanel`](debugging/launch-configuration.md#enablevariablespanel) option in every `launch.json` configuration.

**Type:** `boolean` · **Default:** `true`
<!-- generated:end -->

### `brightscript.debug.deferScopeLoading`
<!-- generated:start -->
Will defer the population of the 'Local' scope variables until the user expands it in the variables panel.

The default for the [`deferScopeLoading`](debugging/launch-configuration.md#deferscopeloading) option in every `launch.json` configuration.

**Type:** `boolean` · **Default:** `false`
<!-- generated:end -->

### `brightscript.debug.autoResolveVirtualVariables`
<!-- generated:start -->
(Experimental) Enables automatic population of the virtual variables.

The default for the [`autoResolveVirtualVariables`](debugging/launch-configuration.md#autoresolvevirtualvariables) option in every `launch.json` configuration.

**Type:** `boolean` · **Default:** `false`
<!-- generated:end -->

### `brightscript.debug.enhanceREPLCompletions`
<!-- generated:start -->
Enables scanning deployment files for additional REPL completions, such as user-defined functions. This process runs in a background thread and may be resource-intensive.

The default for the [`enhanceREPLCompletions`](debugging/launch-configuration.md#enhancereplcompletions) option in every `launch.json` configuration.

**Type:** `boolean` · **Default:** `true`
<!-- generated:end -->

### `brightscript.debug.envFile`
<!-- generated:start -->
A path to an environment variables file.

The default for the [`envFile`](debugging/launch-configuration.md#envfile) option in every `launch.json` configuration.

**Type:** `string` · **Default:** `".env"`
<!-- generated:end -->

### `brightscript.debug.consoleOutput`
<!-- generated:start -->
Determines which console output event to listen for. 'full' is every console message (including the ones from the adapter). 'normal' excludes output initiated by the adapter and rendezvous logs if enabled on the device.

The default for the [`consoleOutput`](debugging/launch-configuration.md#consoleoutput) option in every `launch.json` configuration.

**Type:** `string` · **Default:** `"normal"`

Allowed values:

- `"full"`
- `"normal"`
<!-- generated:end -->

### `brightscript.debug.injectRaleTrackerTask`
<!-- generated:start -->
Will inject the Roku Advanced Layout Editor(RALE) TrackerTask into your channel if one is defined in your user settings.

The default for the [`injectRaleTrackerTask`](debugging/launch-configuration.md#injectraletrackertask) option in every `launch.json` configuration.

**Type:** `boolean` · **Default:** `false`
<!-- generated:end -->

### `brightscript.debug.injectRdbOnDeviceComponent`
<!-- generated:start -->
Will inject the OnDeviceComponent used by RDB for RALE like functionality inside of the extension

The default for the [`injectRdbOnDeviceComponent`](debugging/launch-configuration.md#injectrdbondevicecomponent) option in every `launch.json` configuration.

**Type:** `boolean` · **Default:** `false`
<!-- generated:end -->

### `brightscript.debug.disableScreenSaver`
<!-- generated:start -->
If injectRdbOnDeviceComponent is true and this is true the screen saver will be be disabled while the deployed application is running.

The default for the [`disableScreenSaver`](debugging/launch-configuration.md#disablescreensaver) option in every `launch.json` configuration.

**Type:** `boolean` · **Default:** `true`
<!-- generated:end -->

### `brightscript.debug.rdbCallbackPort`
<!-- generated:start -->
By default the OnDeviceComponent tries to find an open callback port on the server. This allows you to set one explicitly

**Type:** `number`
<!-- generated:end -->

### `brightscript.debug.files`
<!-- generated:start -->
An array of file paths, file globs, or {src:string;dest:string} objects that will be copied into the deployment package. This will override the defaults, so if specified, you must provide ALL files. See https://npmjs.com/roku-deploy for examples.

The default for the [`files`](debugging/launch-configuration.md#files) option in every `launch.json` configuration.

**Type:** `array`

**Default:**

```json
[
    "manifest",
    "source/**/*.*",
    "components/**/*.*",
    "images/**/*.*"
]
```
<!-- generated:end -->

### `brightscript.debug.enableDebuggerAutoRecovery`
<!-- generated:start -->
Enables automatic continue when hitting an incorrect 'break in' breakpoint, which are produced by a bug in the roku microdebugger, mishandling multiple runloops. This flag will enable you to recover in most cases - wait until the skipping bogus breakpoint messages have all stopped before continuing to use your app, for best results.

The default for the [`enableDebuggerAutoRecovery`](debugging/launch-configuration.md#enabledebuggerautorecovery) option in every `launch.json` configuration.

**Type:** `boolean` · **Default:** `true`
<!-- generated:end -->

### `brightscript.debug.stopDebuggerOnAppExit`
<!-- generated:start -->
If true, will terminate the debug session if app exit is detected. This option is ignored when enableDebugProtocol is set to true. This currently relies on 9.1+ launch beacon notifications, so will not work on a pre 9.1 device.

The default for the [`stopDebuggerOnAppExit`](debugging/launch-configuration.md#stopdebuggeronappexit) option in every `launch.json` configuration.

**Type:** `boolean` · **Default:** `true`
<!-- generated:end -->

### `brightscript.debug.profiling`
<!-- generated:start -->
Configuration for profiling functionality

The default for the [`profiling`](debugging/launch-configuration.md#profiling) option in every `launch.json` configuration.

**Type:** `object`

**Default:**

```json
{
    "tracing": {
        "enable": true,
        "dir": "${workspaceFolder}/profiling",
        "filename": "${appTitle}_${timestamp}.perfetto-trace",
        "connectOnStart": false
    }
}
```

Properties:

- `tracing` (object): Configuration for Perfetto event profiling
    - `enable` (boolean): Should Perfetto event profiling be enabled
    - `dir` (string): Directory where profile files should be stored
    - `filename` (string): The name of the profile file. Can include variables like ${appTitle} and ${timestamp}
    - `connectOnStart` (boolean): Should profiling connect automatically on debug session start
<!-- generated:end -->

### `brightscript.debug.packagePort`
<!-- generated:start -->
The port used for package-related requests. This is mainly used for things like emulators, or when your roku is behind a firewall with a port-forward.

The default for the [`packagePort`](debugging/launch-configuration.md#packageport) option in every `launch.json` configuration.

**Type:** `number` · **Default:** `80`
<!-- generated:end -->

### `brightscript.debug.remotePort`
<!-- generated:start -->
The port used for sending remote control commands (like home press or back press). This is mainly used for things like emulators, or when your roku is behind a firewall with a port-forward.

The default for the [`remotePort`](debugging/launch-configuration.md#remoteport) option in every `launch.json` configuration.

**Type:** `number` · **Default:** `8060`
<!-- generated:end -->

### `brightscript.debug.logLevel`
<!-- generated:start -->
The level of logging that should be done during a debug session.

The default for the [`logLevel`](debugging/launch-configuration.md#loglevel) option in every `launch.json` configuration.

**Type:** `string` · **Default:** `"log"`

Allowed values:

- `"off"`
- `"error"`
- `"warn"`
- `"log"`
- `"info"`
- `"debug"`
- `"trace"`
<!-- generated:end -->

### `brightscript.debug.fileLogging`
<!-- generated:start -->
Write the device output and the RokuCommunity debugger logs to files. `true` uses the default settings, or pass an object to configure each log.

The default for the [`fileLogging`](debugging/launch-configuration.md#filelogging) option in every `launch.json` configuration.

**Type:** `object | boolean`

Properties:

- `enabled` (boolean): Should file logging be enabled
- `dir` (string): Directory where log files should be stored. used when filename is relative
- `logLimit` (number): The number of log files to keep. `null` means keep all logs
- `rokuDevice` (object | boolean): File logging for the telnet or IO output from the Roku device currently being debugged. (i.e. all the stuff produced by `print` statements in your code)
    - `enabled` (boolean): Should file logging be enabled
    - `dir` (string): Directory where log files should be stored. used when filename is relative
    - `logLimit` (number): The number of log files to keep. `null` means keep all logs
    - `mode` (string): `'session'` means a unique timestamped file will be created on every debug session.`'append'` means all logs will be appended to a single file
- `debugger` (object | boolean): File logging for the debugger. Mostly used to provide crash logs to the RokuCommunity team.
    - `enabled` (boolean): Should file logging be enabled
    - `dir` (string): Directory where log files should be stored. used when filename is relative
    - `logLimit` (number): The number of log files to keep. `null` means keep all logs
    - `mode` (string): `'session'` means a unique timestamped file will be created on every debug session.`'append'` means all logs will be appended to a single file
<!-- generated:end -->

### `brightscript.debug.debugAdapterProtocolLogging`
<!-- generated:start -->
> [!WARNING]
> **Deprecated.** Experimental and subject to change

Log all Debug Adapter Protocol (DAP) communication between VS Code and the debug adapter. Each session writes a new timestamped file to the workspace's `logs/` folder. Useful for crash diagnostics. Can also be set per-launch in launch.json.

The default for the [`debugAdapterProtocolLogging`](debugging/launch-configuration.md#debugadapterprotocollogging) option in every `launch.json` configuration.

**Type:** `boolean` · **Default:** `false`
<!-- generated:end -->

### `brightscript.debug.showHiddenVariables`
<!-- generated:start -->
Show variables that are prefixed with a special prefix designated to be hidden

The default for the [`showHiddenVariables`](debugging/launch-configuration.md#showhiddenvariables) option in every `launch.json` configuration.

**Type:** `boolean` · **Default:** `false`
<!-- generated:end -->

### `brightscript.debug.rendezvousTracking`
<!-- generated:start -->
Should rendezvous tracking be enabled on launch? If `true`: turn on ECP rendezvous tracking, or turn on 8080 rendezvous tracking if ECP unsupported. If `false`, turn off both.

The default for the [`rendezvousTracking`](debugging/launch-configuration.md#rendezvoustracking) option in every `launch.json` configuration.

**Type:** `boolean` · **Default:** `true`
<!-- generated:end -->

### `brightscript.debug.deleteDevChannelBeforeInstall`
<!-- generated:start -->
Delete any currently installed dev channel before starting the debug session

The default for the [`deleteDevChannelBeforeInstall`](debugging/launch-configuration.md#deletedevchannelbeforeinstall) option in every `launch.json` configuration.

**Type:** `boolean` · **Default:** `false`
<!-- generated:end -->

### `brightscript.debug.sceneGraphDebugCommandsPort`
<!-- generated:start -->
Port for sending SceneGraph debug commands

The default for the [`sceneGraphDebugCommandsPort`](debugging/launch-configuration.md#scenegraphdebugcommandsport) option in every `launch.json` configuration.

**Type:** `number` · **Default:** `8080`
<!-- generated:end -->

### `brightscript.debug.remoteControlMode`
<!-- generated:start -->
Turn remote control mode on when a debug session starts and off when it ends. `true` does both, or pass an object to choose.

The default for the [`remoteControlMode`](debugging/launch-configuration.md#remotecontrolmode) option in every `launch.json` configuration.

**Type:** `object | boolean`

Properties:

- `activateOnSessionStart` (boolean): Activate remote control mode on debug session start
- `deactivateOnSessionEnd` (boolean): Deactivate remote control mode on session end
<!-- generated:end -->

### `brightscript.debug.emitChannelPublishedEvent`
<!-- generated:start -->
Should the ChannelPublishedEvent be emitted. This is a hack for when certain roku devices become locked up as a result of this event being emitted. You probably don't need to set this

The default for the [`emitChannelPublishedEvent`](debugging/launch-configuration.md#emitchannelpublishedevent) option in every `launch.json` configuration.

**Type:** `boolean` · **Default:** `true`
<!-- generated:end -->

### `brightscript.debug.packageTask`
<!-- generated:start -->
Task to run instead of roku-deploy to produce the .zip file that will be uploaded to the Roku.

The default for the [`packageTask`](debugging/launch-configuration.md#packagetask) option in every `launch.json` configuration.

**Type:** `string`
<!-- generated:end -->

### `brightscript.debug.packagePath`
<!-- generated:start -->
Path to the .zip that will be uploaded to the Roku

The default for the [`packagePath`](debugging/launch-configuration.md#packagepath) option in every `launch.json` configuration.

**Type:** `string`
<!-- generated:end -->

### `brightscript.debug.packageUploadOverrides`
<!-- generated:start -->
Overrides for values used during the roku-deploy zip upload process, like the route and various form data. You probably don't need to change these...

The default for the [`packageUploadOverrides`](debugging/launch-configuration.md#packageuploadoverrides) option in every `launch.json` configuration.

**Type:** `object` · **Default:** `{"route":"plugin_install","formData":{}}`

Properties:

- `route` (string): The route to use for uploading to the Roku device. Defaults to 'plugin_install'
- `formData` (object): A dictionary of form fields to be included in the package upload request. Set a value to null to delete from the form
<!-- generated:end -->

## Device Control (ECP)

### `brightscript.remoteControl.host`
<!-- generated:start -->
IP address of the roku to remotely control

**Type:** `string` · **Default:** `"${promptForHost}"`
<!-- generated:end -->

### `brightscript.sendRemoteTextHistory.enabled`
<!-- generated:start -->
If true, the extension will not save the history for 'extension.brightscript.sendRemoteText' commands

**Type:** `boolean` · **Default:** `true`
<!-- generated:end -->

### `brightscript.sendRemoteTextHistory.limit`
<!-- generated:start -->
Sets the maximum number of 'extension.brightscript.sendRemoteText' commands to remember for future use

**Type:** `number` · **Default:** `30`
<!-- generated:end -->

### `brightscript.remoteControlMode.enableActiveAnimation`
<!-- generated:start -->
Enables or disables visual animations related to the remote control mode button

**Type:** `boolean` · **Default:** `true`
<!-- generated:end -->

## Miscellaneous

### `brightscript.extensionLogfilePath`
<!-- generated:start -->
> [!WARNING]
> **Deprecated.** Use `fileLogging` option instead

File where the 'BrightScript Extension' output panel (i.e. debug logs for the extension) will be appended. If omitted, no file logging will be done. ${workspaceFolder} is supported and will point to the first workspace found.

**Type:** `string`
<!-- generated:end -->

### `brightscript.screenshotDir`
<!-- generated:start -->
Directory where screenshots will be saved. If omitted, screenshots will be saved to the OS's temporary directory. Supports absolute paths (e.g., "/Users/username/Desktop" on macOS, "C:\\Users\\username\\Desktop" on Windows) and relative paths (e.g., "debug/screenshots" or "debug\\screenshots" on Windows) which are resolved relative to the workspace folder. ${workspaceFolder} is also supported and will point to the first workspace found.

**Type:** `string`
<!-- generated:end -->

### `brightscript.solidDevtools.enabled`
<!-- generated:start -->
Inject the Solid Devtools on-device bridge into RSG/TypeScript apps during debug staging (dev builds only — apps without a ts_path manifest entry are unaffected).

**Type:** `boolean` · **Default:** `true`
<!-- generated:end -->
