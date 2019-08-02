# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).



## [1.18.0] - 2019-08-02
### Added
 - Automatic Rendezvous tracking when `logrendezvous` is enabled on the Roku. The extension monitors all rendezvous console log entries and displays them in a new side panel in vscode.
 - bs_const support in the launch.config. See [the bs_const section](https://github.com/TwitchBronBron/vscode-brightscript-language#bs_const) for more information.
 - User-Agent header to the ECP requests in the ActiveDeviceManager to make it easier to detect where those requests are coming from.
 - Ability to auto-name component libraries based on values from the manifest (such as `title`)
 - Ability to inject the Roku Advanced Layout Editor(RALE) task from a single user managed version. (See the [#RALE-Support](https://github.com/TwitchBronBron/vscode-brightscript-language#RALE-Support) for more information)

### Fixed
 - Set and use default `files` array when not specified in `launch.json` so users don't need to set it themselves.
 - Bug where some of the console output gets lost during `consoleOutput: "normal"`.
 - Show better error messages during the publish process
   - include the host ip address in most error messages
   - open the first file that has a compile error



## [1.17.1] - 2019-06-21
### Fixed
 - regression issue with `formatIndent`



## [1.17.0] - 2019-06-18
### Added
 - support for hosting and debugging component libraries. ([#161](https://github.com/TwitchBronBron/vscode-brightscript-language/pull/161))
 - Dropdown during launch allowing you to pick from a list of Rokus found on local network. ([#156](https://github.com/TwitchBronBron/vscode-brightscript-language/pull/156))
 - Upgraded to brightscript-formatter@1.6.0, and added new extension settings:
   - brightscript.format.formatInteriorWhitespace
   - brightscript.format.insertSpaceBeforeFunctionParenthesis
   - brightscript.format.insertSpaceBetweenEmptyCurlyBraces



## [1.16.0] - 2019-06-11
### Added
 - added launch config setting `stopDebuggerOnAppExit` which monitors the console output, and automatically ends the debug session when detected.
 - added launch config setting `enableLookupVariableNodeChildren` that, if true, will get all children of a node, when the value is displayed in a debug session, and display it in the virtual `_children` field
 - added extension setting `brightscript.output.clearConsoleOnChannelStart` that allows you to clear/not clear the initial roku compile console output.
 -  resolving children of nodes variables
### Fixed
 - bug that would cause debug session crashes when inspecting a `roList` variable ([#155](https://github.com/TwitchBronBron/vscode-brightscript-language/issues/155))



## [1.15.0] - 2019-05-28
### Added
 - support for foldable regions by typing `'#region` and `'#endregion`
 - added syntax colorization for `#region` and `#endregion`



## [1.14.0] - 2019-05-14
### Changed
 - default value of debug configuration setting `stopOnEntry` to false.
### Fixed
 - bug that wouldn't support launching screen savers due to not looking for `RunScreenSaver` entry point.



## [1.13.1] - 2019-04-26
### Fixed
 - bug in the run loop break recovery section that was not resetting certain variables, which was requiring a vscode reboot to fix.



## [1.13.0] - 2019-04-19
### Added
 - `sourceDirs` launch config setting that enables the debugger to search through each entry in `sourceDirs` until it finds a relative file path that matches the file currently being debugged. (#130)
 - deep link / ECP support when launching a debug session. Use the `deepLinkUrl` property in your `launch.json` (#4)
### Depricated
 - `debugRootDir` launch config setting. Use the new `sourceDirs` setting instead. (#130)
### Fixed
 - Bugs in hover and locals that would not show the full variable name (#137).



## [1.12.1] - 2019-04-11
### Fixed
 - issue where vscode would periodically provide different character casing for workspaceFolder than for full file paths, which would prevent launching a debug session
 - Remove excess spacing in logpoint output



## [1.12.0] - 2019-04-09
### Added
 - conditional breakpoint support
 - logpoint support
 - hit count breakpoint support



## [1.11.0] - 2019-04-01
### Added
 - ability to recover from roku run loop break issues that would previously cause many debug sessions to completely bomb. Set `enableDebuggerAutoRecovery` to true to opt-in to this feature. See #129 for more information
 - ability to change the presentation of package path hyperlinks in the BrightScript output log. See #128 for more information.



## [1.10.0] - 2019-03-21
### Added
 - Completion items for all BrightScript interface methods except for a few more obscure ones (#68). These can be activated by typing the full interface name after the variable (i.e. )
### Fixed
 - problems launching a debug session when the Roku has an app already running that is stuck in the debug state. This extension now issues several `exit` commands in a row (in addition to the home press it was already doing) which seems to resolve the majority of those issues. (#125)



## [1.9.0] - 2019-03-19
### Added
 - Support for the `vars` panel during a debug session. This can be disabled by setting `enableVariablesPanel: false` in the `launch.json` configuration.
### Fixed
 - Syntax highlighting issues
   - variable names with type designators are colored properly
   - `endsub` and `endfunction` are colored properly
   - `end` is colored properly as a standalone command
   - various two word keywords now support no space or multiple spaces between (previously needed exactly 1 space between then)



## [1.8.6] - 2019-03-09
### Fixed
 - launching debug session without a `launch.json` works again.



## [1.8.5] - 2019-03-07
### Fixed
 - Re-added the log commands that somehow got dropped in a previous release



## [1.8.4] - 2019-03-04
### Fixed
 - Regression syntax highlighting issue that was not correctly colorizing `then` in conditional statements if it contains any uppercase letters.



## [1.8.3] - 2019-03-04
### Fixed
 - Several textmate grammar issues and added more variety in the captured tokens to provide better colorization



## [1.8.2] - 2019-01-27
### Changed
 - Upgraded to [roku-deploy](https://www.npmjs.com/package/roku-deploy)@2.0.0 which brings support for dereferencing symbolic links, and copying files located outside of rootDir.



## [1.8.1] - 2019-01-25
### Fixed
 - Issue in `Go to definition` that would not find functions/subs with a space between the name and the opening parenthesis ([#85](https://github.com/TwitchBronBron/vscode-brightscript-language/issues/85))



## [1.8.0] - 2019-01-25
### Added
 - Support for reading variables from a `.env` file in `launch.json` (see [this section](https://github.com/TwitchBronBron/vscode-brightscript-language#config-file-for-user-specific-launch-settings) of the readme for more information)
### Fixed
 - Bug in `Go to definition` that wasn't finding function declarations with leading whitespace



## [1.7.0] - 2019-01-22
### Added
 - Ability to click on `pkg:/` links in BrightScript output window to open that file at the specified line number.



## [1.6.1] - 2019-01-20
### Fixed
 - Bug where the debugger would hang indefinitely on certain deployment errors.



## [1.6.0] - 2019-01-15
### Added
 - Ability to filter log output
 - Ability to clear log output

### Changed
 - Included `not searchViewletVisible` as part of the roku keyboard remote keybindings so the search panel is more usable in the output window.
 - Prevent adding entry breakpoint when `stopOnEntry` is `false` in launch.json.
 - Updated textmate grammar to include `step` as reserved word.

### Fixed
 - Upgraded to [roku-deploy](https://www.npmjs.com/package/roku-deploy)@2.0.0-beta2 which fixes some file path regression issues introduced in 1.0.0



## [1.5.0] - 2019-01-03
### Added
 - Ability to send remote control commands from the keyboard. See readme for more details.



## [1.4.2] - 2018-12-19
### Changed
 - Upgraded to [roku-deploy](https://www.npmjs.com/package/roku-deploy) version 1.0.0 which brings `glob-all` support for negating globs.



## [1.4.1] - 2018-12-14
### Fixed
 - Bug that was preventing debugger from working.



## [1.4.0] - 2018-12-10
### Added
 - Basic goto declaration support in xml documents
 - Inline errors for compilation failures
 - BrightScript Log output window, which can have colors/searches applied to it
 - Basic message signature support
 - `Find usage` support for brs documents



## [1.3.2] - 2018-12-07
### Fixed
 - Bug that was preventing using `function Main` as an entry function.



## [1.3.1] - 2018-12-05
### Changed
 - Upgraded to [brightscript-formatter](https://www.npmjs.com/package/brightscript-formatter) version `1.5.0` which brings support for overriding keywordCase for specific keywords.

### Fixed
 - Bug introduced in [1.3.0](#130---2018-11-20) that was preventing a debug session from starting due to incorrect "out" path.



## [1.3.0] - 2018-11-20
### Added
 - Support for declarations and symbols
 - Support for go to definition
 - Ability to format hightlighted code without formatting the whole document
 - A new launch setting called `debugRootDir` that allows deploying a build file while still debugging a source file
 - Command for switching between xml and brs files for a component.
 - Support for conditional statements without the `then`.

### Changed
 - Upgraded to [brightscript-formatter](https://www.npmjs.com/package/brightscript-formatter) version `1.4.0` which brings better support for multi-line if statements without the trailing then.

### Fixed
 - Breakpoints added after a debug session is launched are now correctly show as disabled.



 ## [1.2.2] - 2018-09-26
 ### Changed
 - Upgraded to [brightscript-formatter](https://www.npmjs.com/package/brightscript-formatter) version `1.3.0` which brings support for formatting conditional compile statements.



## [1.2.1] - 2018-09-26
### Changed
 - Upgraded to [roku-deploy](https://www.npmjs.com/package/roku-deploy) version `0.2.1` which removed some packages containing security vulnerabilities.



## [1.2.0] - 2018-09-26
### Changed
 - Upgraded to [roku-deploy](https://www.npmjs.com/package/roku-deploy) version `0.2.0` which adds support for moving and renaming files during the packaging process (see [the files property](https://github.com/TwitchBronBron/roku-deploy#options) for more details).



## [1.1.0] - 2018-07-11
### Changed
 - Upgraded [brightscript-formatter](https://www.npmjs.com/package/brightscript-formatter) to version `1.2.0` which enables removing trailing whitespace when formatting.



## [1.0.1] - 2018-04-04
### Fixed
 - Issue in debugger that was not properly handling truncated file paths received from Roku.



## 1.0.0 - 2018-03-16
### Added
- Remote debugging support
- Code formatter

### Fixed
- Issues with language colorization



[1.18.0]: https://github.com/TwitchBronBron/vscode-brightscript-language/compare/v1.17.1...v1.18.0
[1.17.1]: https://github.com/TwitchBronBron/vscode-brightscript-language/compare/v1.17.0...v1.17.1
[1.17.0]: https://github.com/TwitchBronBron/vscode-brightscript-language/compare/v1.16.0...v1.17.0
[1.16.0]: https://github.com/TwitchBronBron/vscode-brightscript-language/compare/v1.15.0...v1.16.0
[1.15.0]: https://github.com/TwitchBronBron/vscode-brightscript-language/compare/v1.14.0...v1.15.0
[1.14.0]: https://github.com/TwitchBronBron/vscode-brightscript-language/compare/v1.13.1...v1.14.0
[1.13.1]: https://github.com/TwitchBronBron/vscode-brightscript-language/compare/v1.13.0...v1.13.1
[1.13.0]: https://github.com/TwitchBronBron/vscode-brightscript-language/compare/v1.12.1...v1.13.0
[1.12.1]: https://github.com/TwitchBronBron/vscode-brightscript-language/compare/v1.12.0...v1.12.1
[1.12.0]: https://github.com/TwitchBronBron/vscode-brightscript-language/compare/v1.11.0...v1.12.0
[1.11.0]: https://github.com/TwitchBronBron/vscode-brightscript-language/compare/v1.10.0...v1.11.0
[1.10.0]: https://github.com/TwitchBronBron/vscode-brightscript-language/compare/v1.9.0...v1.10.0
[1.9.0]:  https://github.com/TwitchBronBron/vscode-brightscript-language/compare/v1.8.6...v1.9.0
[1.8.6]:  https://github.com/TwitchBronBron/vscode-brightscript-language/compare/v1.8.5...v1.8.6
[1.8.5]:  https://github.com/TwitchBronBron/vscode-brightscript-language/compare/v1.8.4...v1.8.5
[1.8.4]:  https://github.com/TwitchBronBron/vscode-brightscript-language/compare/v1.8.3...v1.8.4
[1.8.3]:  https://github.com/TwitchBronBron/vscode-brightscript-language/compare/v1.8.2...v1.8.3
[1.8.2]:  https://github.com/TwitchBronBron/vscode-brightscript-language/compare/v1.8.1...v1.8.2
[1.8.1]:  https://github.com/TwitchBronBron/vscode-brightscript-language/compare/v1.8.0...v1.8.1
[1.8.0]:  https://github.com/TwitchBronBron/vscode-brightscript-language/compare/v1.7.0...v1.8.0
[1.7.0]:  https://github.com/TwitchBronBron/vscode-brightscript-language/compare/v1.6.1...v1.7.0
[1.6.1]:  https://github.com/TwitchBronBron/vscode-brightscript-language/compare/v1.6.0...v1.6.1
[1.6.0]:  https://github.com/TwitchBronBron/vscode-brightscript-language/compare/v1.5.0...v1.6.0
[1.5.0]:  https://github.com/TwitchBronBron/vscode-brightscript-language/compare/v1.4.2...v1.5.0
[1.4.2]:  https://github.com/TwitchBronBron/vscode-brightscript-language/compare/v1.4.1...v1.4.2
[1.4.1]:  https://github.com/TwitchBronBron/vscode-brightscript-language/compare/v1.4.0...v1.4.1
[1.4.0]:  https://github.com/TwitchBronBron/vscode-brightscript-language/compare/v1.3.2...v1.4.0
[1.3.2]:  https://github.com/TwitchBronBron/vscode-brightscript-language/compare/v1.3.1...v1.3.2
[1.3.1]:  https://github.com/TwitchBronBron/vscode-brightscript-language/compare/v1.3.0...v1.3.1
[1.3.0]:  https://github.com/TwitchBronBron/vscode-brightscript-language/compare/v1.2.2...v1.3.0
[1.2.2]:  https://github.com/TwitchBronBron/vscode-brightscript-language/compare/v1.2.1...v1.2.2
[1.2.1]:  https://github.com/TwitchBronBron/vscode-brightscript-language/compare/v1.2.0...v1.2.1
[1.2.0]:  https://github.com/TwitchBronBron/vscode-brightscript-language/compare/v1.1.0...v1.2.0
[1.1.0]:  https://github.com/TwitchBronBron/vscode-brightscript-language/compare/v1.0.1...v1.1.0
[1.0.1]:  https://github.com/TwitchBronBron/vscode-brightscript-language/compare/v1.0.0...v1.0.1