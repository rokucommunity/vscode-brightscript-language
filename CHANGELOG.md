# Change Log

## [1.6.1]
 - Fixed bug where the debugger would hang indefinitely on deployment error.

## [1.6.0] - 2019-01-15
 - Prevent adding entry breakpoint when `stopOnEntry` is `false` in launch.json.
 - Upgraded to roku-deploy@2.0.0-beta2 which fixes some regression issues introduced in 1.0.0
 - Added ability to filter log output
 - Added ability to clear log output
 - Updated textmate grammar to include `step` as reserved word.
 - Added `not searchViewletVisible` as part of the roku keyboard remote keybindings so the search panel is more usable in the output window.

## [1.5.0] - 2019-01-03
 - Added ability to send remote control commands from the keyboard. See readme for more details.

## [1.4.2] - 2018-12-19
 - Upgraded to roku-deploy version 1.0.0 which brings `glob-all` support for negating globs.

## [1.4.1] - 2018-12-14
 - Fixed bug that was preventing debugger from working.

## [1.4.0] - 2018-12-10
 - Added basic goto declaration support in xml documents
 - Added inline errors for compilation failures
 - Added BrightScript Log output window, which can have colors/searches applied to it
 - Added crude message signature support
 - Added find usage support for brs documents

## [1.3.2] - 2018-12-07
 - Fixed bug that was preventing using `function Main` as an entry function.

## [1.3.1] - 2018-12-05
 - Fixed bug introduced in 1.3.0 that was preventing a debug session from starting due to incorrect "out" path.
 - Upgraded to brightscript-formatter version 1.5.0 which brings support for overriding keywordCase for specific keywords.

## [1.3.0] - 2018-11-20
 - Added support for declarations and symbols
 - Added support for go to definition
 - Added ability to format hightlighted code without formatting the whole document.
 - Added new launch setting called 'debugRootDir' that allows deploying a build file, while still debugging a source file.
 - Added command for switching between xml and brs files for a component.
 - Added support for conditional statements without the `then`.
 - Breakpoints added after a debug session is launched are now correctly show as disabled.

 ## [1.2.2] - 2018-09-26
 - Upgraded to brightscript-formatter version 1.3.0 which brings support for formatting conditional compile statements.

## [1.2.1] - 2018-09-26
 - Upgraded to roku-deploy v0.2.1 which removed some packages containing security vulnerabilities.

## [1.2.0] - 2018-09-26
 - Upgraded to roku-deploy v0.2.0 which adds support for moving and renaming files during the packaging process (see [the files property](https://github.com/TwitchBronBron/roku-deploy#options) for more details).

## [1.1.0] - 2018-07-11
 - Upgraded to the latest brightscript-formatter version that enables removing trailing whitespace when formatting.

## [1.0.1] - 2018-04-04
 - Fixed issue in debugger that was not properly handling truncated file paths received from Roku.

## [1.0.0] - 2018-03-16
- Added debugger support
- Added code formatter
- Fixed issues with language colorization