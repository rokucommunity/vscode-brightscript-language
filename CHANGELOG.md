# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).



## [2.8.4] - 2020-09-25
### Added
 - (Language Server) alpha version of plugin system. This is subject to change at any time, so use at your own risk.
### Changed
 - upgraded to [roku-debug@0.5.4](https://github.com/rokucommunity/roku-debug/blob/master/CHANGELOG.md#054---2020-09-25)
 - update to [brighterscript@0.15.0](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0150---2020-09-18)
### Fixed
 - (Debugger) fixed some false positive detections of `Can't continue` in the TelnetAdapter



## [2.8.3] - 2020-09-04
### Changed
 - (Language Server) Add error diagnostic BS1115 which flags duplicate component names [brighterscript#186](https://github.com/rokucommunity/brighterscript/pull/186)
 - update to [brighterscript@0.14.0](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0140---2020-09-04)


## [2.8.2] - 2020-09-01
### Changed
 - update to [brighterscript@0.13.2](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0132---2020-08-31)
 - (Language Server) Upgraded BS1104 to error (previously a warning) and refined the messaging.



## [2.8.1] - 2020-08-14
###  Changed
 - upgraded to [roku-deploy@3.2.3](https://github.com/rokucommunity/roku-deploy/blob/master/CHANGELOG.md#323---2020-08-14)
 - upgraded to [roku-debug@0.5.3](https://github.com/rokucommunity/roku-debug/blob/master/CHANGELOG.md#053---2020-08-14)
 - upgraded to [brighterscript@0.13.1](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0131---2020-08-14)
 - throw exception when copying to staging folder and `rootDir` does not exist in the file system
 - throw exception when zipping package and `${stagingFolder}/manifest` does not exist in the file system
### Fixed
 - bug in `DebugConfigProvider` that incorrectly used `${workspaceFolder}` when `rootDir` didn't exist. 



## [2.8.0] - 2020-08-10
### Added
 - (Language Server) ability to mark the `extends` and `project` options in `bsconfig.json` as optional by prefixing the path with a question mark. See [this link](https://github.com/rokucommunity/brighterscript#optional-extends-and-project) for more details. 
### Changed
 - upgraded to [brighterscript@0.13.0](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0130---2020-08-10)



## [2.7.0] - 2020-08-03
### Added
 - support for clickable `file://` links in the log output ([#262](https://github.com/rokucommunity/vscode-brightscript-language/pull/262))
### Changed
 - upgraded to [brighterscript@0.12.3](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0123---2020-08-03)
### Fixed
 - (Language Server) bug that would provide stale completions due to the file throttling introduced in brighterscript@0.11.2. Now the language server will wait for the throttled parsing to complete before serving completion results. 
 - improvements in the auto-indent functionality for certain language keywords ([#271](https://github.com/rokucommunity/vscode-brightscript-language/pull/271)).



## [2.6.0] - 2020-07-29
### Added
- (Formatter) ability to load formatter settings in `bsfmt.json` file in cwd. If `bsfmt.json` exists, then user/workspace formatting settings are ignored. 
### Changed
 - upgraded to [brighterscript@0.12.2](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0122---2020-07-16)
 - Upgraded to [brighterscript-formatter@1.5.4](https://github.com/rokucommunity/brighterscript-formatter/blob/master/CHANGELOG.md#154---2020-07-29)
### Fixed
 - (BrighterScript) bug on Windows when transpiling import statements into xml script tags that would use the wrong path separator sometimes.



## [2.5.4] - 2020-07-14
### Changed
 - upgraded to [roku-deploy@3.2.2](https://github.com/rokucommunity/roku-deploy/blob/master/CHANGELOG.md#322---2020-07-14)
 - upgraded to [brighterscript@0.12.1](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0121---2020-07-15)
### Fixed
 - (LanguageServer) - critical bug in BrighterScript and roku-deploy when when loading `stagingFolderPath` from `rokudeploy.json` or `bsconfig.json` that would crash the language server



## [2.5.3] - 2020-07-11
### Fixed
 - (Debugger) Prevent debug session crash if target breakpoint file doesn't exist. [roku-debug#10](https://github.com/rokucommunity/roku-debug/pull/10)
 - (Debugger) Bug when converting source location to staging locations that incorrectly checked rootDir before sourceDirs. [roku-debug#10](https://github.com/rokucommunity/roku-debug/pull/10)



## [2.5.2] - 2020-07-09
### Changed
 - Upgraded to [brighterscript@0.12.0](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0120---2020-07-09)
### Fixed
 - Throttle LanguageServer validation to prevent running too many validations in a row.



## [2.5.1] - 2020-07-09
### Changed
 - (LanguageServer) add 350ms debounce in `onDidChangeWatchedFiles` to increase performance by reducing the number of times a file is parsed and validated.
 - Upgraded to [brighterscript@0.11.2](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0112---2020-07-09)
### Fixed
 - (Debugger) bug in the `.env` file processing during debug launch.
 - (LanguageServer) bug in the log output that wasn't casting string log levels into their numeric enum versions, causing messages to be lost at certain log levels.
 - (LanguageServer) load manifest file exactly one time per program rather than every time a file gets parsed.
 - (LanguageServer) bug in `info` logging that wasn't showing the proper parse times for files on first run.



## [2.5.0] - 2020-07-08
### Added
 - (Debugger) support for inline values during a debug session. [roku-debug#8](https://github.com/rokucommunity/roku-debug/pull/8)
 - (LanguageServer) diagnostic for unknown file reference in import statements in BrighterScript files ([brighterscript#139](https://github.com/rokucommunity/brighterscript/pull/139))
 - (BrighterScript) [Source literals feature](https://github.com/rokucommunity/brighterscript/blob/master/docs/source-literals.md) which adds new literals such as `SOURCE_FILE_PATH`, `SOURCE_LINE_NUM`, `FUNCTION_NAME`, and more. ([brighterscript#13](https://github.com/rokucommunity/brighterscript/issues/13))
 - (BrighterScript) [Template string feature](https://github.com/rokucommunity/brighterscript/blob/master/docs/template-strings.md) which brings template string support to BrighterScript. ([brighterscript#98](https://github.com/rokucommunity/brighterscript/issues/98))
### Changed
 - upgraded to [roku-deploy@3.2.1](https://www.npmjs.com/package/roku-deploy/v/3.2.1)
 - Upgraded to [roku-debug@0.5.0](https://github.com/rokucommunity/roku-debug/blob/master/CHANGELOG.md#050---2020-07-06) 
 - Upgraded to [brighterscript@0.11.1](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0109)
### Fixed
 - (Debugger) Fixed bug when inspecting indexed variables that would always show the list or array itself when using the BrightScript debug protocol [roku-debug#8](https://github.com/rokucommunity/roku-debug/pull/8)
 - (LanguageServer) bug in parser that would fail to find function calls in certain situations, killing the rest of the parse.
 - (LanguageServer) Do not show BS1010 diagnostic `hint`s for the same script imported for parent and child. ([brighterscript#113](https://github.com/rokucommunity/brighterscript/issues/113))



### [2.4.6] - 2020-07-02
### Changed
 - Upgraded to [roku-debug@0.4.0](https://github.com/rokucommunity/roku-debug/blob/master/CHANGELOG.md#040---2020-07-02) 
 - (Debugger) Try to look up original function names for anonymous functions in call stack [roku-debug#6](https://github.com/rokucommunity/roku-debug/issues/6)



## [2.4.5] - 2020-07-02
### Fixed
 - bug where .env placeholders in nested launch.json settings were not being handled in the config resolver. [#256](https://github.com/rokucommunity/vscode-brightscript-language/pull/256)



## [2.4.4] - 2020-06-12
### Changed
 - Upgraded to [brighterscript@0.10.9](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0109)
### Added
 - (BrighterScript) bslib.brs gets copied to `pkg:/source` and added as an import to every component on transpile.
 - (LanguageServer) several timing logs under the `"info"` log level.
### Changed
 - (LanguageServer) pipe the language server output to the extension's log window
### Fixed
 - (LanguageServer) bug with global `val` function signature that did not support the second parameter ([BrighterScript#110](https://github.com/rokucommunity/vscode-brightscript-language/issues/110))
 - (LanguageServer) bug with global 'StrI' function signature that did not support the second parameter.



## [2.4.3] - 2020-06-10
### Changed
 - Upgraded to [brighterscript@0.10.8](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0108---2020-06-09)
### Fixed
 - (LanguageServer) Allow leading spaces for `bs:disable-line` and `bs:disable-next-line` comments ([brighterscript#108](https://github.com/rokucommunity/brighterscript/pull/108))
 - (LanguageServer) incorrect definition for global `Left()` function. ([brighterscript#100](https://github.com/rokucommunity/brighterscript/issues/100))
 - (LanguageServer) missing definition for global `Tab()` and `Pos()` functions ([brighterscript#101](https://github.com/rokucommunity/brighterscript/issues/101))
 - BrighterScript `class-extends` snippet with broken placeholder for parent class ([#252](https://github.com/rokucommunity/vscode-brightscript-language/issues/252))



## [2.4.2] - 2020-06-04
### Changed
 - Upgraded to [brighterscript@0.10.5](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0103---2020-05-27)
 - (LanguageServer) log full error to language server console in client anytime critical error is encountered (attempting to find cause of [brighterscript#97](https://github.com/rokucommunity/brighterscript/issues/97))



## [2.4.1] - 2020-06-04
### Changed
 - remove required fields (`rootDir`, `host`, `password`) from `launch.json` as it's perfectly valid to provide none and rely on the `bsconfig.json`. ([#251](https://github.com/rokucommunity/vscode-brightscript-language/issues/251))



## [2.4.0] - 2020-06-01
### Added
 - basic snippets for brs/bs and xml files ([#248](https://github.com/rokucommunity/vscode-brightscript-language/pull/248))
### Fixed
 - bug where command `extension.brightscript.toggleXML` wouldn't account for `.bs` files ([#242](https://github.com/rokucommunity/vscode-brightscript-language/pull/242))



## [2.3.0] - 2020-06-01
### Added 
- (Formatter) new option `insertSpaceBetweenAssociativeArrayLiteralKeyAndColon` which will ensure exactly 1 or 0 spaces between an associative array key and its trailing colon. ([brighterscript-formatter#17](https://github.com/rokucommunity/brighterscript-formatter/issues/17))
### Changed
 - Upgraded to [brighterscript-formatter@1.4.0](https://github.com/rokucommunity/brighterscript-formatter/blob/master/CHANGELOG.md#140---2020-05-29)
### Fixed
 - (Formatter) bugs related to formatting single-line if statements ([brighterscript-formatter#13](https://github.com/rokucommunity/brighterscript-formatter/issues/13))
 


## [2.2.1] - 2020-05-28
### Changed
 - Upgraded to [brighterscript@0.10.4](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0104---2020-05-28)
### Fixed
 - (LanguageServer) `CreateObject("roRegex")` with third parameter caused compile error ([BrighterScript#95](https://github.com/rokucommunity/brighterscript/issues/95))
 - (BrighterScript) flag parameter with same name as namespace
 - (BrighterScript) flag variable with same name as namespace



## [2.2.0] - 2020-05-27
### Added
 - commands to show preview of transpiled BrighterScript (`brighterscript.showPreview` and `brighterscript.showPreviewToSide`);
### Changed
 - Upgraded to [brighterscript@0.10.3](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0103---2020-05-27)



## [2.1.23] - 2020-05-20
### Changed
 - disabled `formatMultiLineObjectsAndArrays` by default because it has a bug. Will re-enable in the future when that option gets fixed.



## [2.1.22] - 2020-05-20
### Added
 - (BRS/BS formatter) new option `formatMultiLineObjectsAndArrays` which inserts newlines and indents multi-line objects and arrays



## [2.1.21] - 2020-05-20
### Added
 - (BRS/BS Formatter) new option `insertSpaceAfterOpeningAndBeforeClosingNonemptyBraces` which...does what it says. ([brighterscript-formatter#16](https://github.com/rokucommunity/brighterscript-formatter/issues/16)
### Changed
 - Upgraded to [brighterscript-formatter@1.2.0](https://github.com/rokucommunity/brighterscript-formatter/blob/master/CHANGELOG.md#120---2020-05-20) 
 - missing launch.json schema information for `enableDebugProtocol`
### Fixed
 - issue where somehow BrighterScript got moved from a dependency into a devDependency, causing the entire package to be excluded from the extension. ([#244](https://github.com/rokucommunity/vscode-brightscript-language/issues/244))
 - incorrect indent when using `class`, `endclass`, `namespace`, `endnamespace` as an object property ([brighterscript-formatter#18](https://github.com/rokucommunity/brighterscript-formatter/issues/18))



## [2.1.20] - 2020-05-19
### Added
 - (BrighterScript) parser support for the new [callfunc operator](https://github.com/rokucommunity/brighterscript/blob/master/docs/callfunc-operator.md)
### Changed
 - Upgraded to [brighterscript@0.10.0](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0100)



## [2.1.19] - 2020-05-16
### Changed
 - Upgraded to [brighterscript@0.9.8](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#098---2020-05-16)
### Fixed
 - timing bugs in the language server on first parse that would randomly show errors during startup
 - (BrighterScript) some bugs related to import statements not being properly traced.



## [2.1.18] - 2020-05-14
### Changed
 - Upgraded to [brighterscript@0.9.7](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#097---2020-05-14) 
 - BrighterScript TypeScript compile targets "ES2017" which provides a signifiant performance boost in lexer (~30%) and parser (~175%)
### Fixed
 - (LanguageServer) false negative diagnostic when using the `new` keyword as a local variable [#79](https://github.com/rokucommunity/brighterscript/issues/79)



## [2.1.17] - 2020-05-14
### Changed
 - Upgraded to [brighterscript-formatter@1.1.8](https://github.com/rokucommunity/brighterscript-formatter/blob/master/CHANGELOG.md#118) 
### Fixed
 - formatter bug that would incorrectly add spacing between a negative sign and a number if it's the first entry in an array ([brighterscript-formatter#14](https://github.com/rokucommunity/brighterscript-formatter/issues/14))
 - formatter bug that would incorrectly add spacing to the left of a negative sign if preceeded by a left curly bracket or left paren.  
 - (formatter) Prevent indent after lines with indexed getter function call (i.e. `someObj[someKey]()`) ([brighterscript-formatter#15](https://github.com/rokucommunity/brighterscript-formatter/issues/15))



## [2.1.16] - 2020-05-11
### Changed
 - brightscript debug commands from the debug console in the telnet adapter like cont and step are now supported (but use at your own risk as there are synchronization issues between the adapter and vscode sometimes)
 - source maps are now cached on launch to improve step speed.
 - only initialize the log manager when launching a BrightScript debug session.
 - only clear/focus console/output when launching a BrightScript debug session
 - Upgraded to [roku-deploy@3.1.1](https://github.com/rokucommunity/roku-deploy/blob/master/CHANGELOG.md#311---2020-05-08) 
 - Upgraded to [roku-debug@0.3.7](https://github.com/rokucommunity/roku-debug/blob/master/CHANGELOG.md#037---2020-05-11) 
 - Upgraded to [brighterscript-formatter@1.1.7](https://github.com/rokucommunity/brighterscript-formatter/blob/master/CHANGELOG.md#117---2020-05-11) 
 - Upgraded to [brighterscript@0.9.6](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#096---2020-05-11) 
### Fixed
 - Added missing roku-deploy options into launch config schema.
 - issue that was treating logpoints like regular breakpoints
 - bugs when debugging files with sourcemaps. This still isn't perfect, as files with injected breakpoints will debug the staging file. However, files with maps that don't have breakpoints will be debuggable in the source file. Fix coming soon for the prior.
 - several bugs where the source locations and staging locations were not being computed properly, causing a poor debugging experience.
 - bugs related to sourcemaps not loading from the proper locations.
 - bug with circular dependencies in source maps (shouldn't ever actually exist, but at least we won't loop forever now)



## [2.1.15] - 2020-05-07
### Changed
  - Upgraded to [brighterscript@0.9.5](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#095) 
### Fixed
  - bug in LanguageServer that was printing diagnostics to the console when it shouldn't be.



## [2.1.14] - 2020-05-05
### Added
 - diagnostic for detecting unnecessary script imports when autoImportComponentScript is enabled
### Changed
 - several performance regressions that were introduced in v0.8.2. ([#230](https://github.com/rokucommunity/vscode-brightscript-language/issues/230))
 - Upgraded to [brighterscript@0.9.4](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#094---2020-05-05) 
 - filter duplicate dignostics from multiple projects. ([#75](https://github.com/rokucommunity/brighterscript/issues/75))
 - bug that was flagging namespaced functions with the same name as a stdlib function.
 - bug that was not properly transpiling brighterscript script tags in xml components.
 - fixes to the `autoImportComponentScript` logic that was not properly finding the files in all situations.
 - Replace `type="text/brighterscript"` with `type="text/brightscript"` in xml script imports during transpile. ([#73](https://github.com/rokucommunity/brighterscript/issues/73))



## [2.1.13] - 2020-05-04
### Changed
 - Upgraded to [brighterscript-formatter@1.1.6](https://github.com/rokucommunity/brighterscript-formatter/blob/master/CHANGELOG.md#116---2020-05-04)
### Fixed
 - issue where object properties named `next` would incorrectly cause a de-indent ([brighterscript-formatter#12](https://github.com/rokucommunity/brighterscript-formatter/issues/12))



## [2.1.12] - 2020-05-04
### Changed
 - Upgraded to [brighterscript@0.9.3](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#093---2020-05-04) 
 - do not show BRS1013 for standalone files ([brighterscript#72](https://github.com/rokucommunity/brighterscript/issues/72))
 - BS1011 (same name as global function) is no longer shown for local variables that are not of type function ([brighterscript#70](https://github.com/rokucommunity/brighterscript/issues/70))
### Fixed
 - issue that prevented certain keywords from being used as function parameter names ([brighterscript#69](https://github.com/rokucommunity/brighterscript/issues/69))



## [2.1.11] - 2020-05-02
### Changed
 - Upgraded to [brighterscript@0.9.2](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#092---2020-05-02) 
 - Include keywords in intellisense anywhere other than next to a dot ([brighterscript#67](https://github.com/rokucommunity/brighterscript/issues/67))

### Fixed
 - colorization of the `new` keyword in BrighterScript
 - Bug in LanguageServer that would show parse errors for functions named `constructor`([brighterscript#66](https://github.com/rokucommunity/brighterscript/issues/66))
 - bug when printing diagnostics that would sometimes fail to find the line in question `([brighterscript#68](https://github.com/rokucommunity/brighterscript/issues/68))
 - Some performance issues during typing caused by the LanguageServer validating too frequently.



## [2.1.10] - 2020-05-01
### Added
 - (LanguageServer) New BrighterScript compile flag `autoImportComponentScript` which will automatically inject a script at transpile-time for a component with the same name if it exists.
 - (Formatter) new formatting option `typeCaseOverride` which works the same as `keywordCaseOverride` but exclusively for type tokens (`integer`, `function`, etc...)
### Changed
 - Upgraded to [brighterscript-formatter@1.1.5](https://github.com/rokucommunity/brighterscript-formatter/blob/master/CHANGELOG.md#115---2020-05-01)
 - Upgraded to [brighterscript@0.9.1](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#091---2020-05-01) 
### Fixed 
 - (Formatter) conditional compile `keywordCaseOverride` characters now support using the literal tokens `#if`, `#else`, etc...
 - (Formatter) bug indenting all-uppercase two-word conditional compile tokens `#ELSE IF` and `#END IF`
 - (Formatter) Unwanted spacing between a negative sign and a number whenever preceeded by a comma ([brightscript-formatter#8](https://github.com/rokucommunity/brighterscript-formatter/issues/8))
 - (Formatter) Remove whitespace preceeding a comma within a statement [brightscript-formatter#5](https://github.com/rokucommunity/brighterscript-formatter/issues/5))
 - (Formatter) Remove leading whitespace around `++` and `--` [brightscript-formatter#10](https://github.com/rokucommunity/brighterscript-formatter/issues/10))
 - (Formatter) bug when providing `null` to keywordCaseOverride would case crash
 - (Formatter) Fix bug with `titleCase` option not being properly handled.
 - (Formatter) Only indent once for left square bracket and left square curly brace on the same line ([brightscript-formatter#6](https://github.com/rokucommunity/brighterscript-formatter/issues/6))
 - (LanguageServer) Parse bug with upper-case two-word conditional compile tokens `#ELSE IF` and `#END IF` ([brightscript#63](https://github.com/rokucommunity/brighterscript/issues/63))



## [2.1.9] - 2020-04-29
### Changed
 - Upgraded to [brighterscript@0.8.2](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#082---2020-04-29) 
 - Upgraded to [brighterscript-formatter@1.1.2](https://github.com/rokucommunity/brighterscript-formatter/blob/master/CHANGELOG.md#112---2020-04-29)
### Fixed
 - bugs in class field initialization
 - bug preventing class fields from being named certain keywords. Now they can.



## [2.1.8] - 2020-04-27
### Changed
 - Upgraded to [brighterscript@0.8.1](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#072---2020-04-24) 
 - Upgraded to [brighterscript-formatter@1.1.1](https://github.com/rokucommunity/brighterscript-formatter/blob/master/CHANGELOG.md#111---2020-04-27)
### Fixed
 - incorrect syntax highlighting for commented-out `end if` statement. 
 - colorize class fields
### Fixed
 - formatter bug that was de-indenting `for each` loop bodies and everything after.



## [2.1.7] - 2020-04-24
### Added
 - new setting `brightscript.focusOutputPanelOnStartup`. 
### Changed
 - Disable file system logging by default.
 - The "BrightScript Log" output channel is no longer automatically focused on extension init. You will need to set  `brightscript.focusOutputPanelOnStartup` to `true` in order to regain this functionality.
 - Upgraded to [brighterscript@0.7.2](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#072---2020-04-24) 
 - Upgraded to [brighterscript-formatter@1.1.0](https://github.com/rokucommunity/brighterscript-formatter/blob/master/CHANGELOG.md#110---2020-04-23) which brings indent support for namespace and class, and keyword support for namespace, class, and import.
### Fixed
 - incorrect syntax highlighting for `end class`.



## [2.1.6] - 2020-04-16
### Added
 - syntax highlighting for `import` and `namespace`
### Changed
 - upgraded to [roku-debug@0.3.6](https://www.npmjs.com/package/roku-debug/v/0.3.6) which fixed a bug in the new BrightScript debug protocol that would sometimes crash during launch.



## [2.1.5] - 2020-04-15
### Added
 - (LanguageServer) ability to filter out diagnostics by using the `diagnosticFilters` option in bsconfig
### Changed
 - upgraded to [brighterscript@0.6.0](https://github.com/rokucommunity/brighterscript/releases/tag/v0.6.0) 
 - (LanguageServer depricated the `ignoreErrorCodes` in favor of `diagnosticFilters`
### Fixed
 - (LanguageServer) Bug in the language server that wasn't reloading the project when changing the `bsconfig.json`



## [2.1.4] - 2020-04-14
### Changed
 - upgraded to [brighterscript@0.5.4](https://github.com/rokucommunity/brighterscript/releases/tag/v0.5.4) which fixed a syntax bug, now allowing the use of a period before an indexed getter (i.e. `object.["key]"`). It



## [2.1.3] - 2020-04-12
### Changed
 - upgraded to [brighterscript@0.5.3](https://github.com/rokucommunity/brighterscript/releases/tag/v0.5.3) which fixed several syntax errors during brighscript file parsing. 



## [2.1.2] - 2020-04-11
### Changed
 - upgraded to [brighterscript@0.5.2](https://github.com/rokucommunity/brighterscript/releases/tag/v0.5.2)
 - upgraded to [roku-debug@0.3.5](https://www.npmjs.com/package/roku-debug/v/0.3.5)
 - upgraded to [roku-deploy@3.0.2](https://www.npmjs.com/package/roku-deploy/v/3.0.2) which fixed a file copy bug in subdirectories of symlinked folders
 - (LanguageServer) downgrade diagnostic issue 1007 from an error to a warning, and updated the message to "Component is mising "extends" attribute and will automatically extend "Group" by default". ([BrighterScript#53](https://github.com/rokucommunity/brighterscript/issues/53))
### Fixed
 - (LanguageServer) Prevent xml files found outside of the `pkg:/components` folder from being parsed and validated. ([BrighterScript#51](https://github.com/rokucommunity/brighterscript/issues/51))
 - (LanguageServer) allow empty `elseif` and `else` blocks. ([BrighterScript#48](https://github.com/rokucommunity/brighterscript/issues/48))



## [2.1.1] - 2020-04-10
### Added
- several new diagnostics for conditional compiles. Some of them allow the parser to recover and continue. (BrightScript/BrighterScript) 
### Changed
 - upgraded to [brighterscript@0.5.0](https://github.com/rokucommunity/brighterscript/releases/tag/v0.5.0)
 - parser diagnostics have been broken out into their own error codes, removing the use of error code 1000 for a generic catch-all. That code still exists and will hold runtime errors from the parser. (BrightScript/BrighterScript) 
### Fixed
 - (LanguageServer) bug in parser that was flagging the new class keywords (`new`, `class`, `public`, `protected`, `private`, `override`) as parse errors. These are now allowed as both local variables and property names.



## [2.1.0] - 2020-04-07
### Added
 - Support for the [BrightScript debug protocol](https://developer.roku.com/en-ca/docs/developer-program/debugging/socket-based-debugger.md). It's disabled by default, but can be enabled by setting `brightscript.debug.enableDebugProtocol` to `true` in your user settings or launch configuration.



## [2.0.0] - 2020-04-01
This is a summary of all changes between 1.23.0 and 2.0.0-beta.50
### Added
 - language server support, which includes intellisense and syntax checking for brightscript projects
 - flag to enable/disable the language server
 - DebugServer output channel for showing more details of the status of the debug server without cluttering the main BrightScript log output 



## [2.0.0-beta.50] - 2020-03-25
### Added
 - flag to enable/disable the language server


## [2.0.0-beta.49] - 2020-03-07
### Added
 - all changes from 1.23.0



## [2.0.0-beta.48] - 2020-02-26
### Fixed
 - bug where no files would be copied to staging during the launch process.



## [2.0.0-beta.47] - 2020-02-26
### Added
 - all changes from 1.22.0



## [2.0.0-beta.46] - 2020-02-18
### Added
 - all changes from 1.21.3



## [2.0.0-beta.45] - 2020-01-22
### Fixed
 - performance issue where projects including component libraries were writing to the filesystem too frequently, causing very slow build times. [#217](https://github.com/rokucommunity/vscode-brightscript-language/pull/217)



## [2.0.0-beta.44] - 2020-01-15
### Fixed
 - issue where the extension was still using [roku-deploy@3.0.0-beta.5](https://github.com/rokucommunity/roku-deploy/releases/tag/v3.0.0-beta.5). The extension now uses  [roku-deploy@3.0.0-beta.7](https://github.com/rokucommunity/roku-deploy/releases/tag/v3.0.0-beta.7)



## [2.0.0-beta.43] - 2020-01-11
### Added
 - DebugServer output channel for showing more details of the status of the debug server without cluttering the main BrightScript log output 
### Updated
 - use [roku-deploy@3.0.0-beta.7](https://github.com/rokucommunity/roku-deploy/releases/tag/v3.0.0-beta.7) which fixes bug during file copy that was not prepending `stagingFolderPath` to certain file operations.
 - use [brighterscript@0.4.0](https://github.com/rokucommunity/brighterscript/releases/tag/v0.4.0) updates to [roku-deploy@3.0.0-beta.7](https://github.com/rokucommunity/roku-deploy/releases/tag/v3.0.0-beta.7)



## [2.0.0-beta.42] - 2020-01-07
### Updated
 - [brighterscript@0.4.0](https://github.com/rokucommunity/brighterscript/releases/tag/v0.4.0) which fixes [these issues](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#040---2020-01-07);



## [2.0.0-beta.41] - 2019-11-08
### Updated
 - [brighterscript@0.3.1](https://github.com/rokucommunity/brighterscript/releases/tag/v0.3.1) which fixes [these issues](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#031---2019-11-08).



## [2.0.0-beta.40] - 2019-10-30
### Added
 - all changes from 1.20.3



## [2.0.0-beta.39] - 2019-10-21
### Added
 - all changes from 1.20.2



## [2.0.0-beta.38] - 2019-10-03
### Added
 - all changes from 1.20.0
### Changed
 - upgraded to [brighterscript@0.3.0](https://www.npmjs.com/package/brighterscript/v/0.3.0) which fixes parse error related to comments inside of associative array literals, and supports parsing opened files that are not included in a `bsconfig.json` file



## [2.0.0-beta.37] - 2019-10-01
### Added
  - all changes from 1.20.0



## [2.0.0-beta.36] - 2019-09-28
### Changed
 - upgraded to [brighterscript@0.2.2](https://www.npmjs.com/package/brighterscript/v/0.2.2) which fixes several startup race conditions.



## [2.0.0-beta.35] - 2019-09-24
### Added
 - all changes from 1.19.0 through 1.19.6
### Changed
 - Enhanced intellisense to scan all files in context to provide more accurate results for object property completions.
 - Enhanced intellisense that filters results based on whether you typing an object proeprty/method or not.
 - switched languageserver to use [brighterscript](https://github.com/RokuCommunity/brighterscript). This is the first step towards support the BrighterScript language.
### Fixed
 - bug that would not register new files until a vscode restart.
## [1.23.0] - 2020-03-06
### Added
 - support for file-system logging of the BrightScript and debug output channels. (`brightscript.debug.logfilePath` in user/workspace settings or `logfilePath` in `launch.json`) (#216)



## [1.22.0] - 2020-02-25
### Added
 - source map support during debugging. See the sourcemap section of the README for more information.
 - support for `sourceDirs` for component libraries
 - ability to set any default launch config settings in user/workspace settings under `brightscript.debug.launchConfigValueHere`. There is not full validation for these yet, but the logic is already in place to use them.
### Changed
 - setting `brightscript.rokuAdvancedLayoutEditor.trackerTaskFileLocation` has been depricated and replaced with `brightscript.debug.raleTrackerTaskFileLocation`



## [1.21.3] - 2020-02-18
### Fixed
 - set many default config values so .env file works better. (#215)
 - Speed up RALE insertion (#218)



## [1.21.2] - 2020-01-22
### Fixed
 - performance issue where projects including component libraries were writing to the filesystem too frequently, causing very slow build times. [#217](https://github.com/rokucommunity/vscode-brightscript-language/pull/217)



## [1.21.1] - 2019-12-20
### Changed
 - upgraded to [roku-deploy@2.6.1](https://github.com/rokucommunity/roku-deploy/tree/v2.6.1)



## [1.21.0] - 2019-12-08
### Added
 - option to use an alternate port when publishing a package to a Roku. This is mainly useful for publishing to an emulator an alternate port through port-forwarding. 
### Changed
 - upgraded to [roku-deploy@2.6.0](https://github.com/rokucommunity/roku-deploy/tree/v2.6.0)



## [1.20.3] - 2019-10-21
### Fixed
 - bug in debugger that would fail to identify empty arrays and associative arrays.



## [1.20.2] - 2019-10-21
### Fixed
 - bug in the parsing of the file paths on the device as of Roku FW 9.2 causing the opening of Component Library file to fail on runtime crashes and break points.



## [1.20.1] - 2019-10-03
### Fixed
 - bug in the "port is in use" crash message detection (it wasn't awaiting an async call which was causing intermittent errors).
 - bug in the componentLibrary `files` JSON schema that wasn't allowing `{src;dest}` objects.



## [1.20.0] - 2019-10-01
### Added
 - "port is in use" crash message when serving component libraries
### Changed
 - The Roku stacktrace includes all function names back as fully lower case. The extension reads the original files and attempts to find the correct case for every function. These results were not being cached, but are now cached in order to improve performance.
### Fixed
 - some syntax colors related to object function calls



## [1.19.6] - 2019-09-23
### Fixed
 - bugs in language grammar (syntax highlighting)



## [1.19.5] - 2019-09-20
### Fixed
 - issue where part of the debug crash output was not being logged to the console (see [#198](https://github.com/rokucommunity/vscode-brightscript-language/pull/198))


## [1.19.4] - 2019-09-19
### Changed
 - upgraded to [brighterscript-formatter](https://www.npmjs.com/package/brighterscript-formatter)@1.0.2
### Fixed
 - formatting bug where, if a line ended with `end` (even property names), the following lines would all be de-indented



## [1.19.3] - 2019-09-18
### Fixed
 - added format-document support for BrighterScript files.



## [1.19.2] - 2019-09-17
### Changed
 - migrated from [brightscript-formatter](https://www.npmjs.com/package/brightscript-formatter) to [brighterscript-formatter](https://www.npmjs.com/package/brighterscript-formatter). `brighterscript-formatter` fully supports formatting standard BrightScript code, so there's no lost functionality by upgrading.
### Fixed
 - syntax colorization of `library` and `sub`


## [1.19.1] - 2019-09-17
### Changed
 - .env files are processed closer to the beginning of the config resolve function, which allows users to customize which prompts they want to see.



## [1.19.0] - 2019-09-16
### Changed
 - location of repository is now https://github.com/RokuCommunity/vscode-brightscript-language
 - removed experimental flag `enableLookupVariableNodeChildren` because it is now enabled by default.
### Fixed
 - many bugs related to inspecting large arrays/objects on the Roku during debugging. (see [#152](https://github.com/RokuCommunity/vscode-brightscript-language/issues/152))



## [2.0.0-beta.34] - 2019-08-19
### Changed
 - upgraded to [brightscript-language@0.2.15](https://www.npmjs.com/package/brightscript-language/v/0.2.15)
### Fixed
 - issue with syntax highlighting while hovering over variables in `.brs` files (fixed by upgrading [brightscript-language@0.2.15](https://www.npmjs.com/package/brightscript-language/v/0.2.15))



## [2.0.0-beta.33] - 2019-08-09
### Fixed
 - issue that was crashing every debug session before it started.



## [2.0.0-beta.32] - 2019-08-07
### Added
 - all changes from [v1.18.2](#1182---2019-08-07)
### Changed
 - upgraded to [brightscript-language@0.2.14](https://www.npmjs.com/package/brightscript-language/v/0.2.14)



## [2.0.0-beta.31] - 2019-08-03
### Added
 - all changes from [v1.18.1](#1181---2019-08-03)



## [2.0.0-beta.30] - 2019-08-02
### Added
 - all changes from [v1.18.0](#1180---2019-08-02)



## [2.0.0-beta.30] - 2019-06-21
### Added
 - all changes from [v1.17.1](#1171---2019-06-21)



## [2.0.0-beta.28] - 2019-06-18
### Added
 - all changes from [v1.17.0](#1170---2019-06-18)



## [2.0.0-beta.27] - 2019-06-13
### Added
 - upgraded to [brightscript-language@0.2.13](https://www.npmjs.com/package/brightscript-language/v/0.2.13) which:
   - syntax support for `GOTO` and labels [brs#248](https://github.com/sjbarag/brs/pull/248)



## [2.0.0-beta.26] - 2019-06-11
### Added
 - all changes from [v1.16.0](#1160---2019-06-11)



## [2.0.0-beta.25] - 2019-05-31
### Fixed
 - upgraded to [brightscript-language@0.2.12](https://www.npmjs.com/package/brightscript-language/v/0.2.12) which:
   - prevent compile errors for conditional compile statements
   - syntax support for single-word `#elseif` and `#endif` [brs#249](https://github.com/sjbarag/brs/pull/249)
   - syntax support for `stop` statements [brs#247](https://github.com/sjbarag/brs/pull/247)
   - syntax support for empty `print` statements [brs#264](https://github.com/sjbarag/brs/pull/246)



## [2.0.0-beta.24] - 2019-05-28
### Added
 - all changes from [v1.15.0](#1150---2019-05-28)
### Changed
 - upgraded to [brightscript-language@0.2.11](https://www.npmjs.com/package/brightscript-language/v/0.2.11) which:
  - syntax support for LINE_NUM variable



## [2.0.0-beta.23] - 2019-05-23
### Changed
 - upgraded to [brightscript-language@0.2.10](https://www.npmjs.com/package/brightscript-language/v/0.2.10) which:
   - adds syntax support for trailing colons in if statements



## [2.0.0-beta.22] - 2019-05-22
### Changed
 - upgraded to [brightscript-language@0.2.9](https://www.npmjs.com/package/brightscript-language/v/0.2.9) which:
   - added syntax support for numbers with leading or trailing period
   - added `&` as supported type designator for identifiers



## [2.0.0-beta.21] - 2019-05-14
### Added
 - all changes from [v1.14.0](#1140---2019-05-14)
### Changed
 - upgraded to [brightscript-language@0.2.8](https://www.npmjs.com/package/brightscript-language/v/0.2.8) which:
   - adds syntax support for library statements



## [2.0.0-beta.20] - 2019-05-07
### Changed
 - upgraded to [brightscript-language@0.2.7](https://www.npmjs.com/package/brightscript-language/v/0.2.7) which:
   - fixes many syntax errors related to using keywords as property names.
   - adds support for hex literals
### Fixed
 - bug in syntax highlighting that was showing keyword colors for object properties with keyword names.



## [2.0.0-beta.19] - 2019-05-01
### Changed
 - upgraded to [brightscript-language@0.2.6](https://www.npmjs.com/package/brightscript-language/v/0.2.6) which removes error for subs with return types ([brs#220](https://github.com/sjbarag/brs/issues/220))



## [2.0.0-beta.18] - 2019-04-30
### Changed
 - upgraded to [brightscript-language@0.2.5](https://www.npmjs.com/package/brightscript-language/v/0.2.6) which brings syntax support for increment (++) and decrement (--) operators.



## [2.0.0-beta.17] - 2019-04-26
### Added
 - all changes from [v1.13.1](#1131---2019-04-26)



## [2.0.0-beta.16] - 2019-04-19
### Added
 - all changes from [v1.13.0](#1130---2019-04-19)



## [2.0.0-beta.15] - 2019-04-11
### Added
 - all changes from [v1.12.0](#1120---2019-04-09) and [v1.12.1](#1121---2019-04-11)



## [2.0.0-beta.14] - 2019-03-21
### Added
 - all changes from [v1.11.0](#1110---2019-04-01)



## [2.0.0-beta.13] - 2019-03-21
### Changed
 - upgraded to [brightscript-language@0.2.4](https://github.com/RokuCommunity/brightscript-language/tree/v0.2.4)
### Fixed
 - greatly improved single-line recovery. Previously, certain syntax errors would prevent the rest of the block or file from parsing. The parser will now skip erraneous lines and attempt to recover. This _usually_ provides much better error recovery, but in certain cases can produce additional errors in the file.
 - bitshift assignment operators (`>>=` `<<=`) no longer cause parse errors
 - using colons as separators for associate arrays no longer cause parse errors (e.g `obj = {x:0 : y: 1}`)



## [2.0.0-beta.12] - 2019-03-21
### Added
 - all changes from v1.9.0 and v1.10.0
### Changed
 - This release is the successor to `2.0.0-beta.11`. The name of the beta program caused some confusion in the past, because it seemed like it was a beta version of 1.9.0, when in reality it was just a beta version of new features, and we needed a higher number than the current version (which was 1.8.* at that time). So now, for clarity, the new versions of the languageserver beta versions will be `2.0.0-beta.[the_beta_number}`. It would have been nice to not use a version number at all, but vscode and npm both need valid semantic version numbers, so we decided to use 999 instead, which makes it much more obvious that this is an outlier.
 - Upgrade to [brightscript-language@0.2.3](https://github.com/RokuCommunity/brightscript-language/tree/v0.2.3)
 - exclude method completions from xml files (will be added back once CDATA support arrives)
 - empty script reference errors will show a more usefull error message `"Script import cannot be empty or whitespace"`
### Fixed
 - parse errors for type designators (i.e. `$` `%` `!` `#` at end of variable name)
 - parse errors for multiple spaces between two-word keywords (like `else     if` or `end    if`)
 - issue with missing `brsconfig.json` schema file.



## [2.0.0-beta.11] - 2019-03-12
### Added
 - Support for `go to definition` to open parent component xml file when the cursor is on a component's `extends="ParentName"` section (fixes #114).
### Fixed
 - Syntax colorization for multi-word keywords like endfor, endif, elseif, etc. that were not supporting zero spaces between or more than 1 space between.



## [2.0.0-beta.10] - 2019-03-12
### Added
 - Upgraded to [brightscript-language@0.1.21](https://github.com/RokuCommunity/brightscript-language/tree/v0.1.21) which brought support for supressing errors using a comment
### Fixed
 - regression issue preventing the use of launch configs stored `settings.json` (see #111)



## [2.0.0-beta.9] - 2019-03-11
### Fixed
 - Upgraded to [brightscript-language@0.1.20](https://github.com/RokuCommunity/brightscript-language/tree/v0.1.20) which fixed an npm issue that was loading the wrong version of `brs`.



## [2.0.0-beta.8] - 2019-03-10
### Added
 - support specifying `brsconfig.json` path as a vscode setting under the `brightscript.configFile` setting.
 - reload workspace if brsconfig.json has changed
 - When launching debug session, read values from brsconfig.json when available
### Changed
 - Don't show brightscript log on workspace open (still support option to show on debug-start)
### Fixed
  - Upgraded to [brightscript-language@0.1.19](https://github.com/RokuCommunity/brightscript-language/tree/v0.1.19)) which fixes:
 - RHS boolean assignment parse errors (see [this issue](https://github.com/sjbarag/brs/issues/156))
 - hover bug in multi-root workspace that was only showing hovers for the first workspace



## [2.0.0-beta.7] - 2019-03-09
### Added
 - All changes from 1.8.4 and 1.8.5
### Fixed
 - Upgraded to [brightscript-language@0.1.17](https://github.com/RokuCommunity/brightscript-language/tree/v0.1.17)) which fixes:
   - Regression issue where mixed case `then` statements showed up as parse errors (fixed by
   - Parse errors related to assignment operators (i.e. `+=`, `-=`, `*=`, etc.)
   - issue where only top-level variables were being found. Now all variables are found throughout the entire function scope.
   - runtime error when getting hover result.
   - issue with hover that would not find top-level function parameter types.



## [2.0.0-beta.6] - 2019-03-04
### Added
 - All changes from [1.8.3](#183---2019-03-04)
### Fixed
 - syntax highlighting bug related to `then` not colorizing when containing any upper case character
 - the `MaxListenersExceededWarning` warning by upgrading to [brightscript-language@0.1.15](https://github.com/RokuCommunity/brightscript-language/tree/v0.1.15)



## [2.0.0-beta.5] - 2019-03-03
### Changed
 - Upgraded to [brightscript-language@0.1.14](https://github.com/RokuCommunity/brightscript-language/tree/v0.1.14) that brings syntax fixes for using `then` as an object property name and now allows `function` as an argument type.
### Fixed
 - textmate grammar related to `run`, `stop`, and `then` when used as object property names



### [2.0.0-beta.4] - 2019-02-25
### Changed
 - Upgraded to [brightscript-language@0.1.13](https://github.com/RokuCommunity/brightscript-language/tree/v0.1.13) which fixes duplicate diagnostic reporting



## [2.0.0-beta.3] - 2019-02-25
### Fixed
 - bugs with errors showing up for script imports inside of comments.



## [2.0.0-beta.2] - 2019-02-24
### Changed
 - Upgraded to latest `brightscript` project, which fixes bitshift assignment operators and `stop` and `run` keywords on object literals.



## [2.0.0-beta.1] - 2019-02-20
### Added
 - Experimental language validation support. Catches most parse errors and a few basic language errors.




## [1.18.2] - 2019-08-07
### Changed
 - upgrade to roku-deploy@2.2.1 which fixes manifest parsing bug related to colors starting with `#`.



## [1.18.1] - 2019-08-03
### Fixed
 - issue where the RALE Tracker Task injection logic was enabled by default.



## [1.18.0] - 2019-08-02
### Added
 - Automatic Rendezvous tracking when `logrendezvous` is enabled on the Roku. The extension monitors all rendezvous console log entries and displays them in a new side panel in vscode.
 - bs_const support in the launch.config. See [the bs_const section](https://github.com/RokuCommunity/vscode-brightscript-language#bs_const) for more information.
 - User-Agent header to the ECP requests in the ActiveDeviceManager to make it easier to detect where those requests are coming from.
 - Ability to auto-name component libraries based on values from the manifest (such as `title`)
 - Ability to inject the Roku Advanced Layout Editor(RALE) task from a single user managed version. (See the [#RALE-Support](https://github.com/RokuCommunity/vscode-brightscript-language#RALE-Support) for more information)

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
 - support for hosting and debugging component libraries. ([#161](https://github.com/RokuCommunity/vscode-brightscript-language/pull/161))
 - Dropdown during launch allowing you to pick from a list of Rokus found on local network. ([#156](https://github.com/RokuCommunity/vscode-brightscript-language/pull/156))
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
 - bug that would cause debug session crashes when inspecting a `roList` variable ([#155](https://github.com/RokuCommunity/vscode-brightscript-language/issues/155))



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
 - Issue in `Go to definition` that would not find functions/subs with a space between the name and the opening parenthesis ([#85](https://github.com/RokuCommunity/vscode-brightscript-language/issues/85))



## [1.8.0] - 2019-01-25
### Added
 - Support for reading variables from a `.env` file in `launch.json` (see [this section](https://github.com/RokuCommunity/vscode-brightscript-language#config-file-for-user-specific-launch-settings) of the readme for more information)
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
 - Upgraded to [roku-deploy](https://www.npmjs.com/package/roku-deploy) version `0.2.0` which adds support for moving and renaming files during the packaging process (see [the files property](https://github.com/RokuCommunity/roku-deploy#options) for more details).



## [1.1.0] - 2018-07-11
### Changed
 - Upgraded [brightscript-formatter](https://www.npmjs.com/package/brightscript-formatter) to version `1.2.0` which enables removing trailing whitespace when formatting.



## [1.0.1] - 2018-04-04
### Fixed
 - Issue in debugger that was not properly handling truncated file paths received from Roku.



## [1.0.0] - 2018-03-16
### Added
- Remote debugging support
- Code formatter

### Fixed
- Issues with language colorization

[1.0.0]:  https://github.com/RokuCommunity/vscode-brightscript-language/compare/f3e1d91...v1.0.0
[1.0.1]:  https://github.com/RokuCommunity/vscode-brightscript-language/compare/v1.0.0...v1.0.1
[1.1.0]:  https://github.com/RokuCommunity/vscode-brightscript-language/compare/v1.0.1...v1.1.0
[1.2.0]:  https://github.com/RokuCommunity/vscode-brightscript-language/compare/v1.1.0...v1.2.0
[1.2.1]:  https://github.com/RokuCommunity/vscode-brightscript-language/compare/v1.2.0...v1.2.1
[1.2.2]:  https://github.com/RokuCommunity/vscode-brightscript-language/compare/v1.2.1...v1.2.2
[1.3.0]:  https://github.com/RokuCommunity/vscode-brightscript-language/compare/v1.2.2...v1.3.0
[1.3.1]:  https://github.com/RokuCommunity/vscode-brightscript-language/compare/v1.3.0...v1.3.1
[1.3.2]:  https://github.com/RokuCommunity/vscode-brightscript-language/compare/v1.3.1...v1.3.2
[1.4.0]:  https://github.com/RokuCommunity/vscode-brightscript-language/compare/v1.3.2...v1.4.0
[1.4.1]:  https://github.com/RokuCommunity/vscode-brightscript-language/compare/v1.4.0...v1.4.1
[1.4.2]:  https://github.com/RokuCommunity/vscode-brightscript-language/compare/v1.4.1...v1.4.2
[1.5.0]:  https://github.com/RokuCommunity/vscode-brightscript-language/compare/v1.4.2...v1.5.0
[1.6.0]:  https://github.com/RokuCommunity/vscode-brightscript-language/compare/v1.5.0...v1.6.0
[1.6.1]:  https://github.com/RokuCommunity/vscode-brightscript-language/compare/v1.6.0...v1.6.1
[1.7.0]:  https://github.com/RokuCommunity/vscode-brightscript-language/compare/v1.6.1...v1.7.0
[1.8.0]:  https://github.com/RokuCommunity/vscode-brightscript-language/compare/v1.7.0...v1.8.0
[1.8.1]:  https://github.com/RokuCommunity/vscode-brightscript-language/compare/v1.8.0...v1.8.1
[1.8.2]:  https://github.com/RokuCommunity/vscode-brightscript-language/compare/v1.8.1...v1.8.2
[1.8.3]:  https://github.com/RokuCommunity/vscode-brightscript-language/compare/v1.8.2...v1.8.3
[1.8.4]:  https://github.com/RokuCommunity/vscode-brightscript-language/compare/v1.8.3...v1.8.4
[1.8.5]:  https://github.com/RokuCommunity/vscode-brightscript-language/compare/v1.8.4...v1.8.5
[1.8.6]:  https://github.com/RokuCommunity/vscode-brightscript-language/compare/v1.8.5...v1.8.6
[1.9.0]:  https://github.com/RokuCommunity/vscode-brightscript-language/compare/v1.8.6...v1.9.0
[1.10.0]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v1.9.0...v1.10.0
[1.11.0]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v1.10.0...v1.11.0
[1.12.0]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v1.11.0...v1.12.0
[1.12.1]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v1.12.0...v1.12.1
[1.13.0]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v1.12.1...v1.13.0
[1.13.1]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v1.13.0...v1.13.1
[1.14.0]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v1.13.1...v1.14.0
[1.15.0]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v1.14.0...v1.15.0
[1.16.0]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v1.15.0...v1.16.0
[1.17.0]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v1.16.0...v1.17.0
[1.17.1]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v1.17.0...v1.17.1
[1.18.0]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v1.17.1...v1.18.0
[1.18.1]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v1.18.0...v1.18.1
[1.18.2]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v1.18.1...v1.18.2
[1.19.0]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v1.18.2...v1.19.0
[1.19.1]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v1.19.0...v1.19.1
[1.19.2]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v1.19.1...v1.19.2
[1.19.3]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v1.19.2...v1.19.3
[1.19.4]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v1.19.3...v1.19.4
[1.19.5]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v1.19.4...v1.19.5
[1.19.6]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v1.19.5...v1.19.6
[1.20.0]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v1.19.6...v1.20.0
[1.20.1]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v1.20.0...v1.20.1
[1.20.2]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v1.20.1...v1.20.2
[1.20.3]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v1.20.2...v1.20.3
[1.21.0]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v1.20.3...v1.21.0
[1.21.1]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v1.21.0...v1.21.1
[1.21.2]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v1.21.1...v1.21.2
[1.21.3]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v1.21.2...v1.21.3
[1.22.0]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v1.21.3...v1.22.0
[1.23.0]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v1.22.0...v1.23.0
[2.0.0-beta.1]:  https://github.com/RokuCommunity/vscode-brightscript-language/compare/v1.8.2...v2.0.0-beta.1
[2.0.0-beta.2]:  https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.0.0-beta.1...v2.0.0-beta.2
[2.0.0-beta.3]:  https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.0.0-beta.2...v2.0.0-beta.3
[2.0.0-beta.4]:  https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.0.0-beta.3...v2.0.0-beta.4
[2.0.0-beta.5]:  https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.0.0-beta.4...v2.0.0-beta.5
[2.0.0-beta.6]:  https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.0.0-beta.5...v2.0.0-beta.6
[2.0.0-beta.7]:  https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.0.0-beta.6...v2.0.0-beta.7
[2.0.0-beta.8]:  https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.0.0-beta.7...v2.0.0-beta.8
[2.0.0-beta.9]:  https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.0.0-beta.8...v2.0.0-beta.9
[2.0.0-beta.10]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.0.0-beta.9...v2.0.0-beta.10
[2.0.0-beta.11]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.0.0-beta.10...v2.0.0-beta.11
[2.0.0-beta.12]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.0.0-beta.11...v2.0.0-beta.12
[2.0.0-beta.13]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.0.0-beta.12...v2.0.0-beta.13
[2.0.0-beta.14]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.0.0-beta.13...v2.0.0-beta.14
[2.0.0-beta.15]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.0.0-beta.14...v2.0.0-beta.15
[2.0.0-beta.16]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.0.0-beta.15...v2.0.0-beta.16
[2.0.0-beta.17]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.0.0-beta.16...v2.0.0-beta.17
[2.0.0-beta.18]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.0.0-beta.17...v2.0.0-beta.18
[2.0.0-beta.19]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.0.0-beta.18...v2.0.0-beta.19
[2.0.0-beta.20]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.0.0-beta.19...v2.0.0-beta.20
[2.0.0-beta.21]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.0.0-beta.20...v2.0.0-beta.21
[2.0.0-beta.22]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.0.0-beta.21...v2.0.0-beta.22
[2.0.0-beta.23]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.0.0-beta.22...v2.0.0-beta.23
[2.0.0-beta.24]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.0.0-beta.23...v2.0.0-beta.24
[2.0.0-beta.25]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.0.0-beta.24...v2.0.0-beta.25
[2.0.0-beta.26]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.0.0-beta.25...v2.0.0-beta.26
[2.0.0-beta.27]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.0.0-beta.26...v2.0.0-beta.27
[2.0.0-beta.28]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.0.0-beta.27...v2.0.0-beta.28
[2.0.0-beta.29]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.0.0-beta.28...v2.0.0-beta.29
[2.0.0-beta.30]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.0.0-beta.29...v2.0.0-beta.30
[2.0.0-beta.31]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.0.0-beta.30...v2.0.0-beta.31
[2.0.0-beta.32]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.0.0-beta.31...v2.0.0-beta.32
[2.0.0-beta.33]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.0.0-beta.32...v2.0.0-beta.33
[2.0.0-beta.34]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.0.0-beta.33...v2.0.0-beta.34
[2.0.0-beta.35]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.0.0-beta.34...v2.0.0-beta.35
[2.0.0-beta.36]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.0.0-beta.35...v2.0.0-beta.36
[2.0.0-beta.37]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.0.0-beta.36...v2.0.0-beta.37
[2.0.0-beta.38]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.0.0-beta.37...v2.0.0-beta.38
[2.0.0-beta.39]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.0.0-beta.38...v2.0.0-beta.39
[2.0.0-beta.40]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.0.0-beta.39...v2.0.0-beta.40
[2.0.0-beta.41]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.0.0-beta.40...v2.0.0-beta.41
[2.0.0-beta.42]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.0.0-beta.41...v2.0.0-beta.42
[2.0.0-beta.43]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.0.0-beta.42...v2.0.0-beta.43
[2.0.0-beta.44]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.0.0-beta.43...v2.0.0-beta.44
[2.0.0-beta.45]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.0.0-beta.44...v2.0.0-beta.45
[2.0.0-beta.46]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.0.0-beta.45...v2.0.0-beta.46
[2.0.0-beta.47]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.0.0-beta.46...v2.0.0-beta.47
[2.0.0-beta.48]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.0.0-beta.47...v2.0.0-beta.48
[2.0.0-beta.49]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.0.0-beta.48...v2.0.0-beta.49
[2.0.0-beta.50]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.0.0-beta.49...v2.0.0-beta.50
[2.0.0]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v1.23.0...v2.0.0
[2.1.0]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.0.0...v2.1.0
[2.1.1]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.1.0...v2.1.1
[2.1.2]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.1.1...v2.1.2
[2.1.3]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.1.2...v2.1.3
[2.1.4]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.1.3...v2.1.4
[2.1.5]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.1.4...v2.1.5
[2.1.6]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.1.5...v2.1.6
[2.1.7]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.1.6...v2.1.7
[2.1.8]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.1.7...v2.1.8
[2.1.9]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.1.8...v2.1.9
[2.1.10]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.1.9...v2.1.10
[2.1.11]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.1.10...v2.1.11
[2.1.12]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.1.11...v2.1.12
[2.1.13]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.1.12...v2.1.13
[2.1.14]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.1.13...v2.1.14
[2.1.15]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.1.14...v2.1.15
[2.1.16]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.1.15...v2.1.16
[2.1.17]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.1.16...v2.1.17
[2.1.18]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.1.17...v2.1.18
[2.1.19]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.1.18...v2.1.19
[2.1.20]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.1.19...v2.1.20
[2.1.21]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.1.20...v2.1.21
[2.1.22]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.1.21...v2.1.22
[2.1.23]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.1.22...v2.1.23
[2.2.0]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.1.23...v2.2.0
[2.2.1]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.2.0...v2.2.1
[2.3.0]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.2.1...v2.3.0
[2.4.0]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.3.0...v2.4.0
[2.4.1]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.4.0...v2.4.1
[2.4.2]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.4.1...v2.4.2
[2.4.3]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.4.2...v2.4.3
[2.4.4]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.4.3...v2.4.4
[2.4.5]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.4.4...v2.4.5
[2.4.6]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.4.5...v2.4.6
[2.5.0]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.4.6...v2.5.0
[2.5.1]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.5.0...v2.5.1
[2.5.2]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.5.1...v2.5.2
[2.5.3]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.5.2...v2.5.3
[2.5.4]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.5.3...v2.5.4
[2.6.0]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.5.4...v2.6.0
[2.7.0]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.6.0...v2.7.0
[2.8.0]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.7.0...v2.8.0
[2.8.1]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.8.0...v2.8.1
[2.8.2]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.8.1...v2.8.2
[2.8.3]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.8.2...v2.8.3
[2.8.4]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.8.3...v2.8.4