# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).


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
 - Upgraded to roku-deploy@2.0.0-beta2 which fixes some file path regression issues introduced in 1.0.0



## [1.5.0] - 2019-01-03
### Added
 - Ability to send remote control commands from the keyboard. See readme for more details.



## [1.4.2] - 2018-12-19
### Changed
 - Upgraded to roku-deploy version 1.0.0 which brings `glob-all` support for negating globs.



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



[1.8.0]: https://github.com/TwitchBronBron/vscode-brightscript-language/compare/v1.7.0...v1.8.0
[1.7.0]: https://github.com/TwitchBronBron/vscode-brightscript-language/compare/v1.6.1...v1.7.0
[1.6.1]: https://github.com/TwitchBronBron/vscode-brightscript-language/compare/v1.6.0...v1.6.1
[1.6.0]: https://github.com/TwitchBronBron/vscode-brightscript-language/compare/v1.5.0...v1.6.0
[1.5.0]: https://github.com/TwitchBronBron/vscode-brightscript-language/compare/v1.4.2...v1.5.0
[1.4.2]: https://github.com/TwitchBronBron/vscode-brightscript-language/compare/v1.4.1...v1.4.2
[1.4.1]: https://github.com/TwitchBronBron/vscode-brightscript-language/compare/v1.4.0...v1.4.1
[1.4.0]: https://github.com/TwitchBronBron/vscode-brightscript-language/compare/v1.3.2...v1.4.0
[1.3.2]: https://github.com/TwitchBronBron/vscode-brightscript-language/compare/v1.3.1...v1.3.2
[1.3.1]: https://github.com/TwitchBronBron/vscode-brightscript-language/compare/v1.3.0...v1.3.1
[1.3.0]: https://github.com/TwitchBronBron/vscode-brightscript-language/compare/v1.2.2...v1.3.0
[1.2.2]: https://github.com/TwitchBronBron/vscode-brightscript-language/compare/v1.2.1...v1.2.2
[1.2.1]: https://github.com/TwitchBronBron/vscode-brightscript-language/compare/v1.2.0...v1.2.1
[1.2.0]: https://github.com/TwitchBronBron/vscode-brightscript-language/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/TwitchBronBron/vscode-brightscript-language/compare/v1.0.1...v1.1.0
[1.0.1]: https://github.com/TwitchBronBron/vscode-brightscript-language/compare/v1.0.0...v1.0.1