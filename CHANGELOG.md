# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).



## [2.60.0](https://github.com/rokucommunity/vscode-brightscript-language/compare/2.59.2...v2.60.0) - 2025-11-19
### Added
 - Support for installing component libraries onto device during launch ([#672](https://github.com/rokucommunity/vscode-brightscript-language/pull/672))
 - upgrade to [roku-debug@0.22.4](https://github.com/rokucommunity/roku-debug/blob/master/CHANGELOG.md#0224---2025-11-19). Notable changes since 0.22.3:
     - Add ability to install component libraries on device ([#279](https://github.com/rokucommunity/roku-debug/pull/279))
 - upgrade to [roku-deploy@3.15.0](https://github.com/rokucommunity/roku-deploy/blob/master/CHANGELOG.md#3150---2025-11-17). Notable changes since 3.14.4:
     - Support installing and deleting component libraries ([#220](https://github.com/rokucommunity/roku-deploy/pull/220))



## [2.59.2](https://github.com/rokucommunity/vscode-brightscript-language/compare/2.59.1...v2.59.2) - 2025-10-31
### Changed
 - upgrade to [brighterscript@0.70.3](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0703---2025-10-31). Notable changes since 0.70.2:
     - Fix crash when bsc plugin in worker loads another version of bsc ([#1579](https://github.com/rokucommunity/brighterscript/pull/1579))
     - Fix recursive const and enum resolution during transpilation ([#1578](https://github.com/rokucommunity/brighterscript/pull/1578))
 - upgrade to [roku-debug@0.22.3](https://github.com/rokucommunity/roku-debug/blob/master/CHANGELOG.md#0223---2025-10-31). Notable changes since 0.22.2:
     - Change ecp logging to `trace` to make lower level logs more useful ([#276](https://github.com/rokucommunity/roku-debug/pull/276))
 - upgrade to [roku-deploy@3.14.4](https://github.com/rokucommunity/roku-deploy/blob/master/CHANGELOG.md#3144---2025-10-30). Notable changes since 3.13.0:
### Fixed
 - Fix bug where param named interface breaks syntax highlighting ([#670](https://github.com/rokucommunity/vscode-brightscript-language/pull/670))



## [2.59.1](https://github.com/rokucommunity/vscode-brightscript-language/compare/2.59.0...v2.59.1) - 2025-10-10
### Changed
 - upgrade to [brighterscript@0.70.2](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0702---2025-10-10). Notable changes since 0.70.1:
     - Add info for brightscript components `roUtils` and `roRenderThreadQueue` ([#1574](https://github.com/rokucommunity/brighterscript/pull/1574))
     - Roku sdk updates ([#1573](https://github.com/rokucommunity/brighterscript/pull/1573))
 - upgrade to [brighterscript-formatter@1.7.19](https://github.com/rokucommunity/brighterscript-formatter/blob/master/CHANGELOG.md#1719---2025-10-10)
 - upgrade to [roku-debug@0.22.2](https://github.com/rokucommunity/roku-debug/blob/master/CHANGELOG.md#0222---2025-10-10)
### Fixed
 - Fix incorrect command categories ([#665](https://github.com/rokucommunity/vscode-brightscript-language/pull/665))
### Removed
 - (chore) Remove unnecessary activation events ([#666](https://github.com/rokucommunity/vscode-brightscript-language/pull/666))



## [2.59.0](https://github.com/rokucommunity/vscode-brightscript-language/compare/2.58.0...v2.59.0) - 2025-09-12
### Changed
 - Update SceneGraph Inspector to use new `AppUI` method for building tree and other improvements ([#661](https://github.com/rokucommunity/vscode-brightscript-language/pull/661))
 - Support actions on the popup message event ([#659](https://github.com/rokucommunity/vscode-brightscript-language/pull/659))
 - upgrade to [brighterscript@0.70.1](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0701---2025-09-11). Notable changes since 0.69.13:
     - Flag param names that are reserved words ([#1556](https://github.com/rokucommunity/vscode-brightscript-language/pull/1556))
     - Fix for adding files on beforeProgramValidate ([#1568](https://github.com/rokucommunity/vscode-brightscript-language/pull/1568))
     - Fix typdef generation of default param func ([#1551](https://github.com/rokucommunity/vscode-brightscript-language/pull/1551))
     - Support transpiling class methods as named functions ([#1548](https://github.com/rokucommunity/vscode-brightscript-language/pull/1548))
 - upgrade to [brighterscript-formatter@1.7.18](https://github.com/rokucommunity/brighterscript-formatter/blob/master/CHANGELOG.md#1718---2025-09-12). Notable changes since 1.7.17:
 - upgrade to [roku-debug@0.22.1](https://github.com/rokucommunity/roku-debug/blob/master/CHANGELOG.md#0221---2025-09-11). Notable changes since 0.21.38:
     - Better handling when the telnet debugger freezes ([#268](https://github.com/rokucommunity/vscode-brightscript-language/pull/268))
     - Add more logs to track how long each step takes while sideloading ([#270](https://github.com/rokucommunity/vscode-brightscript-language/pull/270))
 - upgrade to [roku-deploy@3.13.0](https://github.com/rokucommunity/roku-deploy/blob/master/CHANGELOG.md#3130---2025-08-04). Notable changes since 3.12.6:
     - Add standards-compliant User-Agent header ([#203](https://github.com/rokucommunity/vscode-brightscript-language/pull/203))



## [2.58.0](https://github.com/rokucommunity/vscode-brightscript-language/compare/2.57.1...v2.58.0) - 2025-08-04
### Added
 - Add new launch variable substitution called `activeHost` ([#657](https://github.com/rokucommunity/vscode-brightscript-language/pull/657))
### Changed
 - Migrate `enableLanguageServer` to `languageServer.enabled` with backward compatibility ([#660](https://github.com/rokucommunity/vscode-brightscript-language/pull/660))
 - upgrade to [brighterscript@0.69.13](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#06913---2025-08-04). Notable changes since 0.69.12:
     - Add projectDiscoveryExclude setting and files.watcherExclude support ([#1535](https://github.com/rokucommunity/vscode-brightscript-language/pull/1535))
     - Fix signature help crash on malformed function declarations ([#1536](https://github.com/rokucommunity/vscode-brightscript-language/pull/1536))
     - Add max depth configuration for Roku project discovery ([#1533](https://github.com/rokucommunity/vscode-brightscript-language/pull/1533))
 - upgrade to [brighterscript-formatter@1.7.17](https://github.com/rokucommunity/brighterscript-formatter/blob/master/CHANGELOG.md#1717---2025-08-04). Notable changes since 1.7.16:
 - upgrade to [roku-debug@0.21.38](https://github.com/rokucommunity/roku-debug/blob/master/CHANGELOG.md#02138---2025-08-04). Notable changes since 0.21.37:



## [2.57.1](https://github.com/rokucommunity/vscode-brightscript-language/compare/2.57.0...v2.57.1) - 2025-07-07
### Changed
 - upgrade to [brighterscript@0.69.12](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#06912---2025-07-07). Notable changes since 0.69.11:
     - Fix discovery when `projects` is empty ([#1529](https://github.com/rokucommunity/vscode-brightscript-language/pull/1529))



## [2.57.0](https://github.com/rokucommunity/vscode-brightscript-language/compare/2.56.1...v2.57.0) - 2025-07-03
### Changed
 - Settings schema update to support recent lsp changes ([#653](https://github.com/rokucommunity/vscode-brightscript-language/pull/653))
 - upgrade to [brighterscript@0.69.11](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#06911---2025-07-03). Notable changes since 0.69.10:
     - LSP: Support `projects` array in settings ([#1521](https://github.com/rokucommunity/vscode-brightscript-language/pull/1521))
     - LSP: Add `enableProjectDiscovery` language server option ([#1520](https://github.com/rokucommunity/vscode-brightscript-language/pull/1520), [#1525](https://github.com/rokucommunity/vscode-brightscript-language/pull/1525))
     - LSP: Improve `manifests` discovery ([#1518](https://github.com/rokucommunity/vscode-brightscript-language/pull/1518))
     - LSP: Improve `bsconfig.json` auto-discovery ([#1512](https://github.com/rokucommunity/vscode-brightscript-language/pull/1512))
 - upgrade to [brighterscript-formatter@1.7.16](https://github.com/rokucommunity/brighterscript-formatter/blob/master/CHANGELOG.md#1716---2025-07-03). Notable changes since 1.7.15:
 - upgrade to [roku-debug@0.21.37](https://github.com/rokucommunity/roku-debug/blob/master/CHANGELOG.md#02137---2025-07-03). Notable changes since 0.21.36:



## [2.56.1](https://github.com/rokucommunity/vscode-brightscript-language/compare/2.56.0...v2.56.1) - 2025-06-03
### Changed
 - upgrade to [brighterscript@0.69.10](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#06910---2025-06-03). Notable changes since 0.69.9:
 - upgrade to [brighterscript-formatter@1.7.15](https://github.com/rokucommunity/brighterscript-formatter/blob/master/CHANGELOG.md#1715---2025-06-03). Notable changes since 1.7.14:
 - upgrade to [roku-debug@0.21.36](https://github.com/rokucommunity/roku-debug/blob/master/CHANGELOG.md#02136---2025-06-03). Notable changes since 0.21.35:
 - upgrade to [roku-deploy@3.12.6](https://github.com/rokucommunity/roku-deploy/blob/master/CHANGELOG.md#3126---2025-06-03). Notable changes since 3.12.5:



## [2.56.0](https://github.com/rokucommunity/vscode-brightscript-language/compare/2.55.11...v2.56.0) - 2025-05-30
### Added
 - Added support for Exporting and Importing automation scripts. ([#644](https://github.com/rokucommunity/vscode-brightscript-language/pull/644))
### Changed
 - upgrade to [@rokucommunity/logger@0.3.11](https://github.com/rokucommunity/logger/blob/master/CHANGELOG.md#0311---2025-05-05). Notable changes since 0.3.10: 
 - upgrade to [brighterscript@0.69.9](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0699---2025-05-09). Notable changes since 0.69.6:
     - removed no-throw-literal lint rule ([#1489](https://github.com/rokucommunity/vscode-brightscript-language/pull/1489))
     - Prevent runtime crash for non-referencable funcs in ternary and null coalescing ([#1474](https://github.com/rokucommunity/vscode-brightscript-language/pull/1474))
     - Fix `removeParameterTypes` compile errors for return types ([#1414](https://github.com/rokucommunity/vscode-brightscript-language/pull/1414))
     - Flag incorrect return statements in functions and subs ([#1463](https://github.com/rokucommunity/vscode-brightscript-language/pull/1463))
 - upgrade to [brighterscript-formatter@1.7.14](https://github.com/rokucommunity/brighterscript-formatter/blob/master/CHANGELOG.md#1714---2025-05-12). Notable changes since 1.7.12:
 - upgrade to [roku-debug@0.21.35](https://github.com/rokucommunity/roku-debug/blob/master/CHANGELOG.md#02135---2025-05-30). Notable changes since 0.21.31:
     - Removed `isClockValid` virtual variable ([#262](https://github.com/rokucommunity/vscode-brightscript-language/pull/262))
     - Fix telnet-still-in-use issues ([#259](https://github.com/rokucommunity/vscode-brightscript-language/pull/259))
     - Force allowHalfOpen to false on all sockets ([#251](https://github.com/rokucommunity/vscode-brightscript-language/pull/251))
     - Added better telnet socket in use detection ([#250](https://github.com/rokucommunity/vscode-brightscript-language/pull/250))
 - upgrade to [roku-deploy@3.12.5](https://github.com/rokucommunity/roku-deploy/blob/master/CHANGELOG.md#3125---2025-05-05). Notable changes since 3.12.4:
### Fixed
 - Update JSON parsing in formatValues to not handle strings that look like numbers and booleans to avoid registry updates failing when sent to the device ([#645](https://github.com/rokucommunity/vscode-brightscript-language/pull/645))
 - Fix the release-type for the publish workflow ([#640](https://github.com/rokucommunity/vscode-brightscript-language/pull/640))



## [2.55.11](https://github.com/rokucommunity/vscode-brightscript-language/compare/v2.55.10...v2.55.11) - 2025-04-10
### Changed
 - (chore) Migration to Shared CI ([#638](https://github.com/rokucommunity/vscode-brightscript-language/pull/638))
 - upgrade to [@rokucommunity/logger@0.3.10](https://github.com/rokucommunity/logger/blob/master/CHANGELOG.md#0310---2025-03-26). Notable changes since 0.3.9:
     - Added the ability to turn off timestamps in the output and fixed a potental crash if the format string was empty ([logger#11](https://github.com/rokucommunity/logger/pull/11))
 - upgrade to [brighterscript@0.69.6](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0696---2025-04-09). Notable changes since 0.69.5:
     - Updated the type definition of the `InStr` global callable ([brighterscript#1456](https://github.com/rokucommunity/brighterscript/pull/1456))
 - upgrade to [roku-debug@0.21.31](https://github.com/rokucommunity/roku-debug/blob/master/CHANGELOG.md#02131---2025-04-10). Notable changes since 0.21.29:
     - updated usages of socket `addListener` to `on` ([roku-debug#247](https://github.com/rokucommunity/roku-debug/pull/247))
     - Better logs around socket connections with the device ([roku-debug#246](https://github.com/rokucommunity/roku-debug/pull/246))
     - Explicitly set the version of the package glob ([roku-debug#244](https://github.com/rokucommunity/roku-debug/pull/244))



## [2.55.10](https://github.com/rokucommunity/vscode-brightscript-language/compare/v2.55.9...v2.55.10) - 2025-04-03
### Changed
 - track `bsConst` telemetry usage in `launch.json` ([#636](https://github.com/rokucommunity/vscode-brightscript-language/pull/636))
 - upgrade to [roku-debug@0.21.29](https://github.com/rokucommunity/roku-debug/blob/master/CHANGELOG.md#02129---2025-04-03). Notable changes since 0.21.28:
     - fix launch race bug ([roku-debug#241](https://github.com/rokucommunity/roku-debug/pull/241))
 - upgrade to [brighterscript@0.69.5](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0695---2025-04-03). Notable changes since 0.69.3:
     - more safely wrap expressions for template string transpile ([brighterscript#1445](https://github.com/rokucommunity/brighterscript/pull/1445))
     - support plugin factory detecting brighterscript version ([brighterscript#1438](https://github.com/rokucommunity/brighterscript/pull/1438))
### Fixed
 - incorrect default for `enhanceREPLCompletions` ([#637](https://github.com/rokucommunity/vscode-brightscript-language/pull/637))
 - syntax highlighting for comment in enum statement ([#635](https://github.com/rokucommunity/vscode-brightscript-language/pull/635))
 - bsdoc return and type syntax highlighting ([#634](https://github.com/rokucommunity/vscode-brightscript-language/pull/634))
 - syntax highlighting on AA function names ([#627](https://github.com/rokucommunity/vscode-brightscript-language/pull/627))



## [2.55.9](https://github.com/rokucommunity/vscode-brightscript-language/compare/v2.55.8...v2.55.9) - 2025-03-20
### Changed
 - upgrade to [roku-debug@0.21.28](https://github.com/rokucommunity/roku-debug/blob/master/CHANGELOG.md#02128---2025-03-20). Notable changes since 0.21.27:
     - Limit the range of scopes ([roku-debug#240](https://github.com/rokucommunity/roku-debug/pull/240))
     - Fixed some dup var names on datetime ([roku-debug#239](https://github.com/rokucommunity/roku-debug/pull/239))
 - upgrade to [brighterscript@0.69.3](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0693---2025-03-20). Notable changes since 0.69.2:
     - Fixed getClosestExpression bug to return undefined when position not found ([brighterscript#1433](https://github.com/rokucommunity/brighterscript/pull/1433))
     - Adds Alias statement syntax from v1 to v0 ([brighterscript#1430](https://github.com/rokucommunity/brighterscript/pull/1430))
 - upgrade to [brighterscript-formatter@1.7.12](https://github.com/rokucommunity/brighterscript-formatter/blob/master/CHANGELOG.md#1712---2025-03-20)



## [2.55.8](https://github.com/rokucommunity/vscode-brightscript-language/compare/v2.55.7...v2.55.8) - 2025-03-17
### Changed
 - Inverted keys `PageUp` and `PageDown` mapping on remote control mode ([#631](https://github.com/rokucommunity/vscode-brightscript-language/pull/631))
 - upgrade to [roku-debug@0.21.27](https://github.com/rokucommunity/roku-debug/blob/master/CHANGELOG.md#02127---2025-03-17). Notable changes since 0.21.26:
     - Fixed TelnetAdapter reporting that it was a protocol adapter ([roku-debug#237](https://github.com/rokucommunity/roku-debug/pull/237))



## [2.55.7](https://github.com/rokucommunity/vscode-brightscript-language/compare/v2.55.6...v2.55.7) - 2025-03-13
### Changed
 - upgrade to [roku-debug@0.21.26](https://github.com/rokucommunity/roku-debug/blob/master/CHANGELOG.md#02126---2025-03-13). Notable changes since 0.21.25:
 - upgrade to [brighterscript@0.69.2](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0692---2025-03-13). Notable changes since 0.69.1:
     - Significantly improve the performance of standardizePath ([brighterscript#1425](https://github.com/rokucommunity/brighterscript/pull/1425))
     - Backport v1 typecast syntax to v0 ([brighterscript#1421](https://github.com/rokucommunity/brighterscript/pull/1421))
 - upgrade to [brighterscript-formatter@1.7.11](https://github.com/rokucommunity/brighterscript-formatter/blob/master/CHANGELOG.md#1711---2025-03-13). Notable changes since 1.7.10:



## [2.55.6](https://github.com/rokucommunity/vscode-brightscript-language/compare/v2.55.5...v2.55.6) - 2025-03-10
### Added
 - Added snippet for functional fields ([#625](https://github.com/rokucommunity/vscode-brightscript-language/pull/625))
### Changed
 - Reenable the `enhanceREPLCompletions` launch option by default ([#630](https://github.com/rokucommunity/vscode-brightscript-language/pull/630))
 - syntax highlighting updates to include all known brightscript & brightsign components ([#626](https://github.com/rokucommunity/vscode-brightscript-language/pull/626))
 - upgrade to [roku-debug@0.21.25](https://github.com/rokucommunity/roku-debug/blob/master/CHANGELOG.md#02125---2025-03-10). Notable changes since 0.21.24:
     - Fix crash in bsc project when thread has error ([roku-debug#235](https://github.com/rokucommunity/roku-debug/pull/235))
     - Fixed and issue where hasFocus and isInFocusChain virtual vars where missing on nodes ([roku-debug#234](https://github.com/rokucommunity/roku-debug/pull/234))
 - upgrade to [brighterscript@0.69.1](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0691---2025-03-10). Notable changes since 0.69.0:
     - Prevent running the lsp project in a worker thread ([brighterscript#1423](https://github.com/rokucommunity/brighterscript/pull/1423))
### Fixed
 - Fix brightscript object syntax highlighting ([#623](https://github.com/rokucommunity/vscode-brightscript-language/pull/623))



## [2.55.5](https://github.com/rokucommunity/vscode-brightscript-language/compare/v2.55.4...v2.55.5) - 2025-02-21
### Changed
 - upgrade to [roku-debug@0.21.24](https://github.com/rokucommunity/roku-debug/blob/master/CHANGELOG.md#02124---2025-02-21). Notable changes since 0.21.23:
     - Rename roAudioPlayerEvent virtual vars, add missing roChannelStoreEvent virtual vars ([roku-debug#230](https://github.com/rokucommunity/roku-debug/pull/230))
     - Add $contents virtual variable to roRegistrySection ([roku-debug#231](https://github.com/rokucommunity/roku-debug/pull/231))
     - Temporary fix for virtual vars in hovers ([roku-debug#232](https://github.com/rokucommunity/roku-debug/pull/232))
     - Removed the array virtual variables from list and xml list ([roku-debug#229](https://github.com/rokucommunity/roku-debug/pull/229))



## [v2.55.4](https://github.com/rokucommunity/vscode-brightscript-language/compare/v2.55.3...v2.55.4) - 2025-02-19
### Changed
 - Added new settings for deferred scope loading and updated telemetry with some missing settings ([#620](https://github.com/rokucommunity/vscode-brightscript-language/pull/620))
 - upgrade to [roku-debug@0.21.23](https://github.com/rokucommunity/roku-debug/blob/master/CHANGELOG.md#02123---2025-02-19). Notable changes since 0.21.22:
     - Cleaned up the scopes flows and added the ability to defer the loading of the local scope ([roku-debug#227](https://github.com/rokucommunity/roku-debug/pull/227))
     - Removed the random uuid virtual variable from device info ([roku-debug#228](https://github.com/rokucommunity/roku-debug/pull/228))



## [2.55.3](https://github.com/rokucommunity/vscode-brightscript-language/compare/v2.55.2...v2.55.3) - 2025-02-17
### Changed
 - Add thumbnail to Roku AppOverlays grid #549 ([#614](https://github.com/rokucommunity/vscode-brightscript-language/pull/614))
 - upgrade to [roku-debug@0.21.22](https://github.com/rokucommunity/roku-debug/blob/master/CHANGELOG.md#02122---2025-02-17). Notable changes since 0.21.21:
     - Bump serialize-javascript and mocha ([roku-debug#224](https://github.com/rokucommunity/roku-debug/pull/224))
     - Centralize ECP request processing ([roku-debug#225](https://github.com/rokucommunity/roku-debug/pull/225))
     - Fixed an issue where the entry breakpoint could be hit by the end user if they manually restarted the app ([roku-debug#226](https://github.com/rokucommunity/roku-debug/pull/226))



## [2.55.2](https://github.com/rokucommunity/vscode-brightscript-language/compare/v2.55.1...v2.55.2) - 2025-02-13
### Changed
 - upgrade to [roku-debug@0.21.21](https://github.com/rokucommunity/roku-debug/blob/master/CHANGELOG.md#02121---2025-02-13). Notable changes since 0.21.20:
     - Fixed a bug that would cause the stopOnEntry setting from always being respected when using restart debug session ([roku-debug#223](https://github.com/rokucommunity/roku-debug/pull/223))
     - missing new lines in start up logs ([roku-debug#222](https://github.com/rokucommunity/roku-debug/pull/222))
### Fixed
 - Fix `enableDebugProtocol` and `enhanceREPLCompletions` autocomplete defaults ([#617](https://github.com/rokucommunity/vscode-brightscript-language/pull/617))



## [2.55.1](https://github.com/rokucommunity/vscode-brightscript-language/compare/v2.55.0...v2.55.1) - 2025-02-11
### Changed
 - Fix launch config values that were inconsistantly set (and disable `enhanceREPLCompletions` until we can fix the crash) ([#616](https://github.com/rokucommunity/vscode-brightscript-language/pull/616))



## [2.55.0](https://github.com/rokucommunity/vscode-brightscript-language/compare/v2.54.0...v2.55.0) - 2025-02-10
### Added
 - New lanuch config setting to enable/disable pkg path conversions in logs ([#610](https://github.com/rokucommunity/vscode-brightscript-language/pull/610))
### Changed
 - Enable debug protocol by default ([#615](https://github.com/rokucommunity/vscode-brightscript-language/pull/615))
 - upgrade to [roku-debug@0.21.20](https://github.com/rokucommunity/roku-debug/blob/master/CHANGELOG.md#02120---2025-02-10). Notable changes since 0.21.19:
     - Updated the breakpoint manager to fail inline break point requests ([roku-debug#221](https://github.com/rokucommunity/roku-debug/pull/221))
     - Feature/registry scope in variables pannel ([roku-debug#219](https://github.com/rokucommunity/roku-debug/pull/219))
     - Bugfix/UI flicker on invalidated events ([roku-debug#220](https://github.com/rokucommunity/roku-debug/pull/220))
 - upgrade to [brighterscript@0.69.0](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0690---2025-02-10). Notable changes since 0.68.5:
     - Language Server Rewrite ([brighterscript#993](https://github.com/rokucommunity/brighterscript/pull/993))
 - upgrade to [brighterscript-formatter@1.7.10](https://github.com/rokucommunity/brighterscript-formatter/blob/master/CHANGELOG.md#1710---2025-02-10). Notable changes since 1.7.9:



## [2.54.0](https://github.com/rokucommunity/vscode-brightscript-language/compare/v2.53.1...v2.54.0) - 2025-02-06
### Added
 - variable and REPL launch config options ([#613](https://github.com/rokucommunity/vscode-brightscript-language/pull/613))
### Changed
 - upgrade to [roku-debug@0.21.19](https://github.com/rokucommunity/roku-debug/blob/master/CHANGELOG.md#02119---2025-02-06). Notable changes since 0.21.18:
     - Send the same start up logs for both debug console and output panel ([roku-debug#218](https://github.com/rokucommunity/roku-debug/pull/218))
     - debugger REPL completions ([roku-debug#211](https://github.com/rokucommunity/roku-debug/pull/211))
     - add more REPL completion trigger locations ([roku-debug#217](https://github.com/rokucommunity/roku-debug/pull/217))
 - upgrade to [brighterscript@0.68.5](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0685---2025-02-06). Notable changes since 0.68.4:
     - Add `validate` flag to ProgramBuilder.run() ([brighterscript#1409](https://github.com/rokucommunity/brighterscript/pull/1409))



## [2.53.1](https://github.com/rokucommunity/vscode-brightscript-language/compare/v2.53.0...v2.53.1) - 2025-01-31
### Changed
 - upgrade to [roku-debug@0.21.18](https://github.com/rokucommunity/roku-debug/blob/master/CHANGELOG.md#02118---2025-01-31). Notable changes since 0.21.17:
     - Fix ecp limited crash ([roku-debug#215](https://github.com/rokucommunity/roku-debug/pull/215))



## [2.53.0](https://github.com/rokucommunity/vscode-brightscript-language/compare/v2.52.1...v2.53.0) - 2025-01-31
### Changed
 - upgrade to [roku-debug@0.21.17](https://github.com/rokucommunity/roku-debug/blob/master/CHANGELOG.md#02117---2025-01-31). Notable changes since 0.21.16:
    - Add support for custom variables ([#209](https://github.com/rokucommunity/roku-debug/pull/209))
    - Convert pkg path to file system path in logs ([#208](https://github.com/rokucommunity/roku-debug/pull/208))
    - Fixed file path and unusable link issues on windows ([#213](https://github.com/rokucommunity/roku-debug/pull/213))
    - Fixed a bug where some logs could get lost by the debugger ([#212](https://github.com/rokucommunity/roku-debug/pull/212))
    - Fixed issue looking up primitive variables on hover ([#210](https://github.com/rokucommunity/roku-debug/pull/210))
 - upgrade to [brighterscript-formatter@1.7.9](https://github.com/rokucommunity/brighterscript-formatter/blob/master/CHANGELOG.md#179---2025-01-31). Notable changes since 1.7.8:
    - Fix indentation bug when brighterscript keywords are used as identifiers ([#96](https://github.com/rokucommunity/brighterscript-formatter/pull/96))



## [2.52.1](https://github.com/rokucommunity/vscode-brightscript-language/compare/v2.52.0...v2.52.1) - 2025-01-22
### Changed
 - Support multiple named automations in the Roku Automations panel ([#599](https://github.com/rokucommunity/vscode-brightscript-language/pull/599))
 - upgrade to [roku-deploy@3.12.4](https://github.com/rokucommunity/roku-deploy/blob/master/CHANGELOG.md#3124---2025-01-22). Notable changes since 3.12.3:
     - fixed an issue with 577 error codes ([roku-deploy#182](https://github.com/rokucommunity/roku-deploy/pull/182))
 - upgrade to [roku-debug@0.21.16](https://github.com/rokucommunity/roku-debug/blob/master/CHANGELOG.md#02116---2025-01-22). Notable changes since 0.21.15:
     - Uninitialize __brs_err__ when stepping or continuing ([roku-debug#207](https://github.com/rokucommunity/roku-debug/pull/207))
 - upgrade to [brighterscript@0.68.4](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0684---2025-01-22). Notable changes since 0.68.3:



## [2.52.0](https://github.com/rokucommunity/vscode-brightscript-language/compare/v2.51.0...v2.52.0) - 2025-01-13
### Changed
 - upgrade to [roku-debug@0.21.15](https://github.com/rokucommunity/roku-debug/blob/master/CHANGELOG.md#02115---2025-01-13). Notable changes since 0.21.13:
     - Better handling of split log messages ([roku-debug#206](https://github.com/rokucommunity/roku-debug/pull/206))
     - variables improvements ([roku-debug#199](https://github.com/rokucommunity/roku-debug/pull/199))
     - Caught uncaught exceptions ([roku-debug#198](https://github.com/rokucommunity/roku-debug/pull/198))
 - upgrade to [brighterscript@0.68.3](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0683---2025-01-13). Notable changes since 0.68.2:
     - Fix class transpile issue with child class constructor not inherriting parent params ([brighterscript#1390](https://github.com/rokucommunity/brighterscript/pull/1390))
 - upgrade to [brighterscript-formatter@1.7.8](https://github.com/rokucommunity/brighterscript-formatter/blob/master/CHANGELOG.md#178---2025-01-13)
### Fixed
 - Retain original newlines in BrightScript Log output panel, and also strip ansii colors ([#609](https://github.com/rokucommunity/vscode-brightscript-language/pull/609))



## [2.51.0](https://github.com/rokucommunity/vscode-brightscript-language/compare/v2.50.5...v2.51.0) - 2024-12-20
### Added
 - new remote commands ([#605](https://github.com/rokucommunity/vscode-brightscript-language/pull/605))
 - `AppManager` `AppMemoryMonitor` `AppMemoryMonitorEvent` coloring ([#602](https://github.com/rokucommunity/vscode-brightscript-language/pull/602))
### Changed
 - upgrade to [roku-deploy@3.12.3](https://github.com/rokucommunity/roku-deploy/blob/master/CHANGELOG.md#3123---2024-12-06). Notable changes since 3.12.2:
     - Fix issues with detecting "check for updates required" ([roku-deploy#181](https://github.com/rokucommunity/roku-deploy/pull/181))
     - Identify when a 577 error is thrown, send a new developer friendly message ([roku-deploy#180](https://github.com/rokucommunity/roku-deploy/pull/180))
 - upgrade to [roku-debug@0.21.13](https://github.com/rokucommunity/roku-debug/blob/master/CHANGELOG.md#02113---2024-12-20). Notable changes since 0.21.12:
     - Check for two error types. Make sure we do not double display an error ([roku-debug#204](https://github.com/rokucommunity/roku-debug/pull/204))
     - Add `$children` virtual variables for `roSGNode` ([roku-debug#192](https://github.com/rokucommunity/roku-debug/pull/192))
     - Add the missing `Diagnostic` props to `BSDebugDiagnostic` ([roku-debug#203](https://github.com/rokucommunity/roku-debug/pull/203))
     - Upgrade dependencies ([roku-debug#202](https://github.com/rokucommunity/roku-debug/pull/202))
 - upgrade to [brighterscript@0.68.2](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0682---2024-12-06). Notable changes since 0.67.8:
     - Add more convenience exports from vscode-languageserver ([brighterscript#1359](https://github.com/rokucommunity/brighterscript/pull/1359))
     - Fix bug with ternary transpile for indexed set ([brighterscript#1357](https://github.com/rokucommunity/brighterscript/pull/1357))
     - Add Namespace Source Literals ([brighterscript#1353](https://github.com/rokucommunity/brighterscript/pull/1353))
     - Enhance lexer to support long numeric literals with type designators ([brighterscript#1351](https://github.com/rokucommunity/brighterscript/pull/1351))
     - Fix issues with the ast walkArray function ([brighterscript#1347](https://github.com/rokucommunity/brighterscript/pull/1347))
     - Optimize ternary transpilation for assignments ([brighterscript#1341](https://github.com/rokucommunity/brighterscript/pull/1341))
 - upgrade to [brighterscript-formatter@1.7.7](https://github.com/rokucommunity/brighterscript-formatter/blob/master/CHANGELOG.md#177---2024-12-20)
### Fixed
 - issues with busy spinner showing too many error messages ([#607](https://github.com/rokucommunity/vscode-brightscript-language/pull/607))
 - syntax highlighting but for object functions ([#604](https://github.com/rokucommunity/vscode-brightscript-language/pull/604))
 - numeric literal colorization ([#603](https://github.com/rokucommunity/vscode-brightscript-language/pull/603))



## [2.50.5](https://github.com/rokucommunity/vscode-brightscript-language/compare/v2.50.4...v2.50.5) - 2024-11-06
### Changed
 - Show multi-line lsp progress details ([#600](https://github.com/rokucommunity/vscode-brightscript-language/pull/600))
### Fixed
 - Fix bug with m.top colorization ([#601](https://github.com/rokucommunity/vscode-brightscript-language/pull/601))



## [2.50.4](https://github.com/rokucommunity/vscode-brightscript-language/compare/v2.50.3...v2.50.4) - 2024-10-18
### Added
 - ability to set a device as the current active device via the Deive tree view. ([#597](https://github.com/rokucommunity/vscode-brightscript-language/pull/597))
### Changed
 - Highlight `m.top` like `m`. ([#598](https://github.com/rokucommunity/vscode-brightscript-language/pull/598))
 - upgrade to [roku-deploy@3.12.2](https://github.com/rokucommunity/roku-deploy/blob/master/CHANGELOG.md#3122---2024-10-18). Notable changes since 3.12.1:
     - updated regex to find a signed package on `/plugin_package` page ([roku-deploy#176](https://github.com/rokucommunity/roku-deploy/pull/176))
 - upgrade to [roku-debug@0.21.12](https://github.com/rokucommunity/roku-debug/blob/master/CHANGELOG.md#02112---2024-10-18). Notable changes since 0.21.11:
 - upgrade to [brighterscript@0.67.8](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0678---2024-10-18). Notable changes since 0.67.7:
     - Fix namespace-relative transpile bug for standalone file ([brighterscript#1324](https://github.com/rokucommunity/brighterscript/pull/1324))
     - Prevent crash when ProgramBuilder.run called with no options ([brighterscript#1316](https://github.com/rokucommunity/brighterscript/pull/1316))
 - upgrade to [brighterscript-formatter@1.7.6](https://github.com/rokucommunity/brighterscript-formatter/blob/master/CHANGELOG.md#176---2024-10-18). Notable changes since 1.7.5:



## [2.50.3](https://github.com/rokucommunity/vscode-brightscript-language/compare/v2.50.2...v2.50.3) - 2024-09-27
### Fixed
 - Consistent device list sorting and formatting. ([#596](https://github.com/rokucommunity/vscode-brightscript-language/pull/596))



## [2.50.2](https://github.com/rokucommunity/vscode-brightscript-language/compare/v2.50.1...v2.50.2) - 2024-09-27
### Fixed
 - crash when language server was missing ([#594](https://github.com/rokucommunity/vscode-brightscript-language/pull/594))



## [2.50.1](https://github.com/rokucommunity/vscode-brightscript-language/compare/v2.50.0...v2.50.1) - 2024-09-27
### Changed
 - Fix crashes where `workspaceFolders` was undefined ([#593](https://github.com/rokucommunity/vscode-brightscript-language/pull/593))
 - upgrade to [roku-debug@0.21.11](https://github.com/rokucommunity/roku-debug/blob/master/CHANGELOG.md#02111---2024-09-25). Notable changes since 0.21.10:
 - upgrade to [brighterscript@0.67.7](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0677---2024-09-25). Notable changes since 0.67.6:
     - Ast node clone ([brighterscript#1281](https://github.com/rokucommunity/brighterscript/pull/1281))
 - upgrade to [brighterscript-formatter@1.7.5](https://github.com/rokucommunity/brighterscript-formatter/blob/master/CHANGELOG.md#175---2024-09-26). Notable changes since 1.7.4:



## [2.50.0](https://github.com/rokucommunity/vscode-brightscript-language/compare/v2.49.1...v2.50.0) - 2024-09-23
### Added
 - ability to install a missing bsc version ([#583](https://github.com/rokucommunity/vscode-brightscript-language/pull/583))



## [2.49.1](https://github.com/rokucommunity/vscode-brightscript-language/compare/v2.49.0...v2.49.1) - 2024-09-19
### Fixed
 - Roku Device View works again by upgrading to RTA with patch to use postman-request for screenshot triggering ([#589](https://github.com/rokucommunity/vscode-brightscript-language/pull/589))



## [2.49.0](https://github.com/rokucommunity/vscode-brightscript-language/compare/v2.48.6...v2.49.0) - 2024-09-06
### Added
 - Add syntax highlighting support for bsdoc tags ([#586](https://github.com/rokucommunity/vscode-brightscript-language/pull/586))
 - Add sort imports setting ([#582](https://github.com/rokucommunity/vscode-brightscript-language/pull/582))
### Changed
 - upgrade to [brighterscript@0.67.6](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0676---2024-09-05). Notable changes since 0.67.4:
     - Add support for resolving sourceRoot at time of config load ([brighterscript#1290](https://github.com/rokucommunity/brighterscript/pull/1290))
     - Add support for roIntrinsicDouble ([brighterscript#1291](https://github.com/rokucommunity/brighterscript/pull/1291))
     - Add plugin naming convention ([brighterscript#1284](https://github.com/rokucommunity/brighterscript/pull/1284))
     - Add templatestring support for annotation.getArguments() ([brighterscript#1264](https://github.com/rokucommunity/brighterscript/pull/1264))



## [2.48.6](https://github.com/rokucommunity/vscode-brightscript-language/compare/v2.48.5...v2.48.6) - 2024-07-24
### Added
 - support for viewing nodes that are in the node tree from NodeCountByTypePage ([#579](https://github.com/rokucommunity/vscode-brightscript-language/pull/579))
 - support for removing nodes in SceneGraph Inspector ([#578](https://github.com/rokucommunity/vscode-brightscript-language/pull/578))
### Changed
 - upgrade to [roku-deploy@3.12.1](https://github.com/rokucommunity/roku-deploy/blob/master/CHANGELOG.md#3121---2024-07-19). Notable changes since 3.12.0:
     - Fix bug with absolute paths and getDestPath ([roku-deploy#171](https://github.com/rokucommunity/roku-deploy/pull/171))
 - upgrade to [roku-debug@0.21.10](https://github.com/rokucommunity/roku-debug/blob/master/CHANGELOG.md#02110---2024-07-24). Notable changes since 0.21.9:
     - Prevent crash when rokuAdapter is not defined. ([roku-debug#194](https://github.com/rokucommunity/roku-debug/pull/194))
 - upgrade to [brighterscript@0.67.4](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0674---2024-07-24). Notable changes since 0.67.2:
     - Fix crash with missing scope ([brighterscript#1234](https://github.com/rokucommunity/brighterscript/pull/1234))
     - Fix conform bsconfig.schema.json to strict types ([brighterscript#1205](https://github.com/rokucommunity/brighterscript/pull/1205))
     - Flag using devDependency in production code ([brighterscript#1222](https://github.com/rokucommunity/brighterscript/pull/1222))
 - upgrade to [brighterscript-formatter@1.7.4](https://github.com/rokucommunity/brighterscript-formatter/blob/master/CHANGELOG.md#174---2024-07-24). Notable changes since 1.7.3:



## [2.48.5](https://github.com/rokucommunity/vscode-brightscript-language/compare/v2.48.4...v2.48.5) - 2024-06-04
### Fixed
 - bug with the language server crash tracker ([#576](https://github.com/rokucommunity/vscode-brightscript-language/pull/576))



## [2.48.4](https://github.com/rokucommunity/vscode-brightscript-language/compare/v2.48.3...v2.48.4) - 2024-06-04
### Added
 - Prompt to restart lsp if it has stopped ([#575](https://github.com/rokucommunity/vscode-brightscript-language/pull/575))
### Changed
 - Fix shows key path info bug in scenegraph inspector ([#574](https://github.com/rokucommunity/vscode-brightscript-language/pull/574))
 - Small lsp tweaks ([#572](https://github.com/rokucommunity/vscode-brightscript-language/pull/572))
 - upgrade to [roku-debug@0.21.9](https://github.com/rokucommunity/roku-debug/blob/master/CHANGELOG.md#0219---2024-06-03). Notable changes since 0.21.8:
     - Prevent corrupted breakpoints due to invalid sourceDirs, add more logging ([roku-debug#189](https://github.com/rokucommunity/roku-debug/pull/189))
 - upgrade to [brighterscript@0.67.2](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0672---2024-06-03). Notable changes since 0.67.1:
     - Fix crash with optional chaining in signature help ([brighterscript#1207](https://github.com/rokucommunity/brighterscript/pull/1207))
 - upgrade to [brighterscript-formatter@1.7.3](https://github.com/rokucommunity/brighterscript-formatter/blob/master/CHANGELOG.md#173---2024-06-03)



## [2.48.3](https://github.com/rokucommunity/vscode-brightscript-language/compare/v2.48.2...v2.48.3) - 2024-05-20
### Changed
 - Improve manual ip address component UI design ([#570](https://github.com/rokucommunity/vscode-brightscript-language/pull/570))
### Fixed
 - Fix broken device view ([#570](https://github.com/rokucommunity/vscode-brightscript-language/pull/570))



## [2.48.2](https://github.com/rokucommunity/vscode-brightscript-language/compare/v2.48.1...v2.48.2) - 2024-05-17
### Added
 - syntax highlighting support for `alias` statements ([#567](https://github.com/rokucommunity/vscode-brightscript-language/pull/567))
 - Add on device brightscript repl ([#564](https://github.com/rokucommunity/vscode-brightscript-language/pull/564))
### Changed
 - upgrade to [roku-debug@0.21.8](https://github.com/rokucommunity/roku-debug/blob/master/CHANGELOG.md#0218---2024-05-16)
 - upgrade to [brighterscript@0.67.1](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0671---2024-05-16). Notable changes since 0.65.27:
     - fix ascii color chars in language server logs ([brighterscript#1189](https://github.com/rokucommunity/brighterscript/pull/1189))
     - Fix crash when diagnostic is missing range ([brighterscript#1174](https://github.com/rokucommunity/brighterscript/pull/1174))
     - Move function calls to separate diagnostic (brs1140) ([brighterscript#1169](https://github.com/rokucommunity/brighterscript/pull/1169))
     - resolve the stagingDir option relative to the bsconfig.json file ([brighterscript#1148](https://github.com/rokucommunity/brighterscript/pull/1148))
     - Upgrade to @rokucommunity/logger ([brighterscript#1137](https://github.com/rokucommunity/brighterscript/pull/1137))
 - upgrade to [brighterscript-formatter@1.7.2](https://github.com/rokucommunity/brighterscript-formatter/blob/master/CHANGELOG.md#172---2024-05-17). Notable changes since 1.7.1:
     - Fixing issues before release 1.7.2 ([#brighterscript-formatter239ba44](https://github.com/rokucommunity/brighterscript-formatter/commit/239ba44))
     - fix-node14 ([brighterscript-formatter#91](https://github.com/rokucommunity/brighterscript-formatter/pull/91))
### Fixed
 - bugs in the language server version picker ([#568](https://github.com/rokucommunity/vscode-brightscript-language/pull/568))
 - bug that prevented accessing global in scenegraph inspector, prevent duplicate requests for same node ([#565](https://github.com/rokucommunity/vscode-brightscript-language/pull/565))



## [2.48.1](https://github.com/rokucommunity/vscode-brightscript-language/compare/v2.48.0...v2.48.1) - 2024-04-23
### Added
 - support for focusing a node in SceneGraph Inspector ([#563](https://github.com/rokucommunity/vscode-brightscript-language/pull/563))



## [2.48.0](https://github.com/rokucommunity/vscode-brightscript-language/compare/v2.47.0...v2.48.0) - 2024-04-11
### Added
 - support for opening SceneGraph Inspector in panel ([#561](https://github.com/rokucommunity/vscode-brightscript-language/pull/561))



## [2.47.0](https://github.com/rokucommunity/vscode-brightscript-language/compare/v2.46.1...v2.47.0) - 2024-04-01
### Added
 - support for split panel scenegraph inspector ([#555](https://github.com/rokucommunity/vscode-brightscript-language/pull/555))
 - commands to rekey device and create packages ([#509](https://github.com/rokucommunity/vscode-brightscript-language/pull/509))
 - delete button in FS view ([#552](https://github.com/rokucommunity/vscode-brightscript-language/pull/552))
### Changed
 - Don't hardlink the workspace file during install-local ([b874df2](https://github.com/rokucommunity/vscode-brightscript-language/commit/b874df2))
 - upgrade to [roku-debug@0.21.7](https://github.com/rokucommunity/roku-debug/blob/master/CHANGELOG.md#0217---2024-03-27). Notable changes since 0.21.6:
     - TBD-221: Optional Chainging Operator errors in debug console ([roku-debug#187](https://github.com/rokucommunity/roku-debug/pull/187))
 - upgrade to [brighterscript@0.65.27](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#06527---2024-03-27). Notable changes since 0.65.25:
     - Improve workspace/document symbol handling ([brighterscript#1120](https://github.com/rokucommunity/brighterscript/pull/1120))
     - Plugin hook provide workspace symbol ([brighterscript#1118](https://github.com/rokucommunity/brighterscript/pull/1118))
     - Upgade LSP packages ([brighterscript#1117](https://github.com/rokucommunity/brighterscript/pull/1117))
     - Add plugin hook for documentSymbol ([brighterscript#1116](https://github.com/rokucommunity/brighterscript/pull/1116))
     - Increase max param count to 63 ([brighterscript#1112](https://github.com/rokucommunity/brighterscript/pull/1112))
     - Prevent unused variable warnings on ternary and null coalescence expressions ([brighterscript#1101](https://github.com/rokucommunity/brighterscript/pull/1101))
 - upgrade to [brighterscript-formatter@1.7.1](https://github.com/rokucommunity/brighterscript-formatter/blob/master/CHANGELOG.md#171---2024-03-27)



## [2.46.1](https://github.com/rokucommunity/vscode-brightscript-language/compare/v2.46.0...v2.46.1) - 2024-03-07
### Changed
 - upgrade to [roku-debug@0.21.6](https://github.com/rokucommunity/roku-debug/blob/master/CHANGELOG.md#0216---2024-03-07). Notable changes since 0.21.5:
 - upgrade to [brighterscript@0.65.25](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#06525---2024-03-07). Notable changes since 0.65.24:
     - Support when tokens have null ranges ([brighterscript#1072](https://github.com/rokucommunity/brighterscript/pull/1072))
     - Support whitespace in conditional compile keywords ([brighterscript#1090](https://github.com/rokucommunity/brighterscript/pull/1090))
     - Allow negative patterns in diagnostic filters ([brighterscript#1078](https://github.com/rokucommunity/brighterscript/pull/1078))
 - upgrade to [brighterscript-formatter@1.7.0](https://github.com/rokucommunity/brighterscript-formatter/blob/master/CHANGELOG.md#170---2024-03-07). Notable changes since 1.6.41:
     - Add `insertSpaceAfterConditionalCompileSymbol`, fix conditional compile formatting ([brighterscript-formatter#87](https://github.com/rokucommunity/brighterscript-formatter/pull/87))
### Fixed
 - conditional compile syntax highlighting ([#551](https://github.com/rokucommunity/vscode-brightscript-language/pull/551))
 - crash when trying to copy numeric values to the clipboard ([#550](https://github.com/rokucommunity/vscode-brightscript-language/pull/550))



## [2.46.0](https://github.com/rokucommunity/vscode-brightscript-language/compare/v2.45.17...v2.46.0) - 2024-03-01
### Added
 - Add some enhanced launch settings to support more diverse projects ([#538](https://github.com/rokucommunity/vscode-brightscript-language/pull/538))
 - Device disconnect support and other improvements in RDB ([#548](https://github.com/rokucommunity/vscode-brightscript-language/pull/548))
 - Add Roku File System Panel and Roku App Overlays Panel ([#545](https://github.com/rokucommunity/vscode-brightscript-language/pull/545))
### Changed
 - upgrade to [roku-deploy@3.12.0](https://github.com/rokucommunity/roku-deploy/blob/master/CHANGELOG.md#3120---2024-03-01). Notable changes since 3.11.2:
     - Support overriding various package upload form data ([roku-deploy#136](https://github.com/rokucommunity/roku-deploy/pull/136))
     - Retry the convertToSquahsfs request given the HPE_INVALID_CONSTANT error ([roku-deploy#145](https://github.com/rokucommunity/roku-deploy/pull/145))
 - upgrade to [roku-debug@0.21.5](https://github.com/rokucommunity/roku-debug/blob/master/CHANGELOG.md#0215---2024-03-01). Notable changes since 0.21.3:
     - Add some enhanced launch settings to support more diverse projects ([roku-debug#184](https://github.com/rokucommunity/roku-debug/pull/184))
     - DebugProtocol fixes ([roku-debug#186](https://github.com/rokucommunity/roku-debug/pull/186))
     - Support relaunch debug protocol ([roku-debug#181](https://github.com/rokucommunity/roku-debug/pull/181))
 - upgrade to [brighterscript@0.65.24](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#06524---2024-03-01). Notable changes since 0.65.22:
     - TBD-204: Empty interfaces break the parser ([brighterscript#1082](https://github.com/rokucommunity/brighterscript/pull/1082))
     - fix maestro link ([brighterscript#1068](https://github.com/rokucommunity/brighterscript/pull/1068))
 - upgrade to [brighterscript-formatter@1.6.41](https://github.com/rokucommunity/brighterscript-formatter/blob/master/CHANGELOG.md#1641---2024-02-29)



## [2.45.17](https://github.com/rokucommunity/vscode-brightscript-language/compare/v2.45.16...v2.45.17) - 2024-02-09
### Changed
 - Remove duplicate 'clearLogOutput' command ([#544](https://github.com/rokucommunity/vscode-brightscript-language/pull/544))
 - upgrade to [brighterscript@0.65.22](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#06522---2024-02-09). Notable changes since 0.65.21:
     - Add support for `provideReferences` in plugins ([brighterscript#1066](https://github.com/rokucommunity/brighterscript/pull/1066))
     - Fix sourcemap comment and add `file` prop to map ([brighterscript#1064](https://github.com/rokucommunity/brighterscript/pull/1064))
     - Allow v1 syntax: built-in types for class member types and type declarations on lhs ([brighterscript#1059](https://github.com/rokucommunity/brighterscript/pull/1059))
     - Move `coveralls-next` to a devDependency since it's not needed at runtime ([brighterscript#1051](https://github.com/rokucommunity/brighterscript/pull/1051))



## [2.45.16](https://github.com/rokucommunity/vscode-brightscript-language/compare/v2.45.15...v2.45.16) - 2024-01-31
### Changed
 - upgrade to [brighterscript@0.65.21](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#06521---2024-01-31). Notable changes since 0.65.20:
     - Fix parsing issues with multi-index IndexedSet and IndexedGet ([brighterscript#1050](https://github.com/rokucommunity/brighterscript/pull/1050))



## [2.45.15](https://github.com/rokucommunity/vscode-brightscript-language/compare/v2.45.14...v2.45.15) - 2024-01-30
### Changed
 - upgrade to [brighterscript@0.65.20](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#06520---2024-01-30). Notable changes since 0.65.19:
     - Add plugin hooks for getDefinition ([brighterscript#1045](https://github.com/rokucommunity/brighterscript/pull/1045))



## [2.45.14](https://github.com/rokucommunity/vscode-brightscript-language/compare/v2.45.13...v2.45.14) - 2024-01-30
### Changed
 - upgrade to [roku-debug@0.21.3](https://github.com/rokucommunity/roku-debug/blob/master/CHANGELOG.md#0213---2024-01-30)
 - upgrade to [brighterscript@0.65.19](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#06519---2024-01-30). Notable changes since 0.65.18:
     - Backport v1 syntax changes ([brighterscript#1034](https://github.com/rokucommunity/brighterscript/pull/1034))
 - upgrade to [brighterscript-formatter@1.6.40](https://github.com/rokucommunity/brighterscript-formatter/blob/master/CHANGELOG.md#1640---2024-01-30)



## [2.45.13](https://github.com/rokucommunity/vscode-brightscript-language/compare/v2.45.12...v2.45.13) - 2024-01-28
### Fixed
 - Sets `stagingDir` properly in DebugConfigurationProvider ([#543](https://github.com/rokucommunity/vscode-brightscript-language/pull/543))



## [2.45.12](https://github.com/rokucommunity/vscode-brightscript-language/compare/v2.45.11...v2.45.12) - 2024-01-26
### Changed
 - upgrade to [roku-debug@0.21.2](https://github.com/rokucommunity/roku-debug/blob/master/CHANGELOG.md#0212---2024-01-25). Notable changes since 0.21.1:
     - Use `stagingDir` instead of stagingFolderPath ([roku-debug#185](https://github.com/rokucommunity/roku-debug/pull/185))
 - upgrade to [brighterscript@0.65.18](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#06518---2024-01-25). Notable changes since 0.65.17:
     - Prevent overwriting the Program._manifest if already set on startup ([brighterscript#1027](https://github.com/rokucommunity/brighterscript/pull/1027))
     - Improving null safety: Add FinalizedBsConfig and tweak plugin events ([brighterscript#1000](https://github.com/rokucommunity/brighterscript/pull/1000))
 - upgrade to [brighterscript-formatter@1.6.39](https://github.com/rokucommunity/brighterscript-formatter/blob/master/CHANGELOG.md#1639---2024-01-25). Notable changes since 1.6.38:
     - allow spacing on dotted get paths ([brighterscript-formatter#83](https://github.com/rokucommunity/brighterscript-formatter/pull/83))



## [2.45.11](https://github.com/rokucommunity/vscode-brightscript-language/compare/v2.45.10...v2.45.11) - 2024-01-17
### Changed
 - upgrade to [roku-debug@0.21.1](https://github.com/rokucommunity/roku-debug/blob/master/CHANGELOG.md#0211---2024-01-16). Notable changes since 0.21.0:
 - upgrade to [brighterscript@0.65.17](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#06517---2024-01-16). Notable changes since 0.65.16:
     - adds support for libpkg prefix ([brighterscript#1017](https://github.com/rokucommunity/brighterscript/pull/1017))
     - Assign .program to the builder BEFORE calling afterProgram ([brighterscript#1011](https://github.com/rokucommunity/brighterscript/pull/1011))
 - upgrade to [brighterscript-formatter@1.6.38](https://github.com/rokucommunity/brighterscript-formatter/blob/master/CHANGELOG.md#1638---2024-01-16). Notable changes since 1.6.37:



## [2.45.10](https://github.com/rokucommunity/vscode-brightscript-language/compare/v2.45.9...v2.45.10) - 2024-01-10
### Changed
 - upgrade to [roku-deploy@3.11.2](https://github.com/rokucommunity/roku-deploy/blob/master/CHANGELOG.md#3112---2023-12-20). Notable changes since 3.11.1:
     - Update wrong host password error message ([roku-deploy#134](https://github.com/rokucommunity/roku-deploy/pull/134))
 - upgrade to [roku-debug@0.21.0](https://github.com/rokucommunity/roku-debug/blob/master/CHANGELOG.md#0210---2024-01-10). Notable changes since 0.20.14:
     - Add cli flag to run dap as standalone process ([roku-debug#173](https://github.com/rokucommunity/roku-debug/pull/173))
     - Expose debug protocol port ([roku-debug#182](https://github.com/rokucommunity/roku-debug/pull/182))
     - Display a modal message when the we fail to upload a package to the device ([roku-debug#178](https://github.com/rokucommunity/roku-debug/pull/178))
 - upgrade to [brighterscript@0.65.16](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#06516---2024-01-08). Notable changes since 0.65.12:
     - Prevent publishing of empty files ([brighterscript#997](https://github.com/rokucommunity/brighterscript/pull/997))
     - Improve null safety ([brighterscript#996](https://github.com/rokucommunity/brighterscript/pull/996))
     - Prevent errors when using enums in a file that's not included in any scopes ([brighterscript#995](https://github.com/rokucommunity/brighterscript/pull/995))
     - Fix multi-namespace class inheritance transpile bug ([brighterscript#990](https://github.com/rokucommunity/brighterscript/pull/990))
     - Add check for onChange function ([brighterscript#941](https://github.com/rokucommunity/brighterscript/pull/941))
     - Fix broken enum transpiling ([brighterscript#985](https://github.com/rokucommunity/brighterscript/pull/985))
 - upgrade to [brighterscript-formatter@1.6.37](https://github.com/rokucommunity/brighterscript-formatter/blob/master/CHANGELOG.md#1637---2024-01-08). Notable changes since 1.6.36:
### Fixed
 - improve messaging when debug session encounters errors ([#537](https://github.com/rokucommunity/vscode-brightscript-language/pull/537))
 - improve screenshot capabilities to make it easier to share screenshots from device. ([#536](https://github.com/rokucommunity/vscode-brightscript-language/pull/536))



## [2.45.9](https://github.com/rokucommunity/vscode-brightscript-language/compare/v2.45.8...v2.45.9) - 2023-12-07
### Changed
 - Add a few missing brightscript.debug settings ([#535](https://github.com/rokucommunity/vscode-brightscript-language/pull/535))
 - Support a configurable port for SceneGraphDebugCommandController ([#534](https://github.com/rokucommunity/vscode-brightscript-language/pull/534))



## [2.45.8](https://github.com/rokucommunity/vscode-brightscript-language/compare/v2.45.7...v2.45.8) - 2023-12-07
### Changed
 - Use getDeviceInfo from roku-deploy ([#532](https://github.com/rokucommunity/vscode-brightscript-language/pull/532))
 - upgrade to [roku-deploy@3.11.1](https://github.com/rokucommunity/roku-deploy/blob/master/CHANGELOG.md#3111---2023-11-30). Notable changes since 3.10.5:
     - Wait for file stream to close before resolving promise ([roku-deploy#133](https://github.com/rokucommunity/roku-deploy/pull/133))
     - Add public function to normalize device-info field values ([roku-deploy#129](https://github.com/rokucommunity/roku-deploy/pull/129))
 - upgrade to [roku-debug@0.20.14](https://github.com/rokucommunity/roku-debug/blob/master/CHANGELOG.md#02014---2023-12-07). Notable changes since 0.20.13:
     - Fixing issues before release 0.20.14 ([#roku-debug01fba07](https://github.com/rokucommunity/roku-debug/commit/01fba07))
     - Make the connection port for SceneGraphDebugCommandController configurable ([roku-debug#177](https://github.com/rokucommunity/roku-debug/pull/177))
 - upgrade to [brighterscript@0.65.12](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#06512---2023-12-07). Notable changes since 0.65.10:
     - Fix out-of-date transpile blocks in docs ([brighterscript#956](https://github.com/rokucommunity/brighterscript/pull/956))
     - Add `optional` modifier for interface and class members ([brighterscript#955](https://github.com/rokucommunity/brighterscript/pull/955))
     - Use regex for faster manifest/typedef detection ([brighterscript#976](https://github.com/rokucommunity/brighterscript/pull/976))
     - Correct RANGE in template string when dealing with quotes in annotations ([brighterscript#975](https://github.com/rokucommunity/brighterscript/pull/975))
     - Add manifest loading from files ([brighterscript#942](https://github.com/rokucommunity/brighterscript/pull/942))
     - Enums as class initial values ([brighterscript#950](https://github.com/rokucommunity/brighterscript/pull/950))
 - upgrade to [brighterscript-formatter@1.6.36](https://github.com/rokucommunity/brighterscript-formatter/blob/master/CHANGELOG.md#1636---2023-12-07). Notable changes since 1.6.35:
### Fixed
 - spelling mistake in lsp message ([#531](https://github.com/rokucommunity/vscode-brightscript-language/pull/531))



## [2.45.7](https://github.com/rokucommunity/vscode-brightscript-language/compare/v2.45.6...v2.45.7) - 2023-11-27
### Changed
 - Hide the debug protocol popup, use telnet by default ([#530](https://github.com/rokucommunity/vscode-brightscript-language/pull/530))



## [2.45.6](https://github.com/rokucommunity/vscode-brightscript-language/compare/v2.45.5...v2.45.6) - 2023-11-20
### Fixed
 - backtick support in surrounding & autoClosing pairs ([#528](https://github.com/rokucommunity/vscode-brightscript-language/pull/528))



## [2.45.5](https://github.com/rokucommunity/vscode-brightscript-language/compare/v2.45.4...v2.45.5) - 2023-11-16
### Changed
 - Add app dropdown menu for ECP registry link ([#514](https://github.com/rokucommunity/vscode-brightscript-language/pull/514))
 - chore: move common user input into a dedicated manager ([#523](https://github.com/rokucommunity/vscode-brightscript-language/pull/523))



## [2.45.4](https://github.com/rokucommunity/vscode-brightscript-language/compare/v2.45.3...v2.45.4) - 2023-11-16
### Changed
 - upgrade to [roku-debug@0.20.13](https://github.com/rokucommunity/roku-debug/blob/master/CHANGELOG.md#02013---2023-11-16). Notable changes since 0.20.12:
     - Fix bug with compile error reporting ([roku-debug#174](https://github.com/rokucommunity/roku-debug/pull/174))



## [2.45.3](https://github.com/rokucommunity/vscode-brightscript-language/compare/v2.45.2...v2.45.3) - 2023-11-15
### Changed
 - Shorten the timeout for device-info query ([#525](https://github.com/rokucommunity/vscode-brightscript-language/pull/525))
 - upgrade to [roku-deploy@3.10.5](https://github.com/rokucommunity/roku-deploy/blob/master/CHANGELOG.md#3105---2023-11-14). Notable changes since 3.10.4:
     - better detection for sideloading errors ([roku-deploy#127](https://github.com/rokucommunity/roku-deploy/pull/127))
 - upgrade to [roku-debug@0.20.12](https://github.com/rokucommunity/roku-debug/blob/master/CHANGELOG.md#02012---2023-11-14). Notable changes since 0.20.10:
     - Add timeout for deviceinfo query so we don't wait too long ([roku-debug#171](https://github.com/rokucommunity/roku-debug/pull/171))
     - Update DebugProtocolClient supported version range ([roku-debug#170](https://github.com/rokucommunity/roku-debug/pull/170))
     - fix small typo in debug potocol message ([roku-debug#169](https://github.com/rokucommunity/roku-debug/pull/169))
 - upgrade to [brighterscript@0.65.10](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#06510---2023-11-14)



## [2.45.2](https://github.com/rokucommunity/vscode-brightscript-language/compare/v2.45.1...v2.45.2) - 2023-11-08
### Changed
 - Better messaging around debugProtocol popup ([#522](https://github.com/rokucommunity/vscode-brightscript-language/pull/522))
 - upgrade roku-test-automation to 2.0.0-beta.22 to fix issue with RDB ([#521](https://github.com/rokucommunity/vscode-brightscript-language/pull/521))
 - upgrade to [roku-debug@0.20.10](https://github.com/rokucommunity/roku-debug/blob/master/CHANGELOG.md#02010---2023-11-08). Notable changes since 0.20.9:
     - Fix sideload crash ([roku-debug#168](https://github.com/rokucommunity/roku-debug/pull/168))
 - upgrade to [brighterscript-formatter@1.6.35](https://github.com/rokucommunity/brighterscript-formatter/blob/master/CHANGELOG.md#1635---2023-11-08). Notable changes since 1.6.34:



## [2.45.1](https://github.com/rokucommunity/vscode-brightscript-language/compare/v2.45.0...v2.45.1) - 2023-11-06
### Fixed
 - extension crash introduced in 2.45.0 ([#520](https://github.com/rokucommunity/vscode-brightscript-language/pull/520))



## [2.45.0](https://github.com/rokucommunity/vscode-brightscript-language/compare/v2.44.1...v2.45.0) - 2023-11-06
### Changed
 - Auto-enable debug protocol on 12.5 devices ([#517](https://github.com/rokucommunity/vscode-brightscript-language/pull/517))
 - Telemetry tracking for roku OS version ([#516](https://github.com/rokucommunity/vscode-brightscript-language/pull/516))
 - upgrade to [roku-deploy@3.10.4](https://github.com/rokucommunity/roku-deploy/blob/master/CHANGELOG.md#3104---2023-11-03). Notable changes since 3.10.3:
     - Enhance getDeviceInfo() method ([roku-deploy#120](https://github.com/rokucommunity/roku-deploy/pull/120))
 - upgrade to [roku-debug@0.20.9](https://github.com/rokucommunity/roku-debug/blob/master/CHANGELOG.md#0209---2023-11-05). Notable changes since 0.20.8:
     - Upgrade to new deviceInfo api from roku-deploy ([roku-debug#167](https://github.com/rokucommunity/roku-debug/pull/167))
 - upgrade to [brighterscript@0.65.9](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0659---2023-11-06). Notable changes since 0.65.8:
     - Fix issue with unary expression parsing ([brighterscript#938](https://github.com/rokucommunity/brighterscript/pull/938))



## [2.44.1](https://github.com/rokucommunity/vscode-brightscript-language/compare/v2.44.0...v2.44.1) - 2023-10-31
### Changed
 - Enhance host picker during launch ([#512](https://github.com/rokucommunity/vscode-brightscript-language/pull/512))
 - Add link for ECP registry ([#511](https://github.com/rokucommunity/vscode-brightscript-language/pull/511))
 - Add brs to releases script ([5c6622b](https://github.com/rokucommunity/vscode-brightscript-language/commit/5c6622b))
 - upgrade to [roku-debug@0.20.8](https://github.com/rokucommunity/roku-debug/blob/master/CHANGELOG.md#0208---2023-10-31). Notable changes since 0.20.7:
     - Clean up control socket when it's closed ([roku-debug#166](https://github.com/rokucommunity/roku-debug/pull/166))



## [2.44.0](https://github.com/rokucommunity/vscode-brightscript-language/compare/v2.43.1...v2.44.0) - 2023-10-16
### Added
 - ability to capture device screenshots ([#505](https://github.com/rokucommunity/vscode-brightscript-language/pull/505))
### Changed
 - Make device picker name same as tree view item ([#508](https://github.com/rokucommunity/vscode-brightscript-language/pull/508))
 - Diagnostic manager ([#502](https://github.com/rokucommunity/vscode-brightscript-language/pull/502))
 - upgrade to [roku-debug@0.20.7](https://github.com/rokucommunity/roku-debug/blob/master/CHANGELOG.md#0207---2023-10-16). Notable changes since 0.20.6:
     - Debug Protocol Enhancements ([roku-debug#107](https://github.com/rokucommunity/roku-debug/pull/107))



## [2.43.1](https://github.com/rokucommunity/vscode-brightscript-language/compare/v2.43.0...v2.43.1) - 2023-10-08
### Added
 - ability to enable/disable remote control on launch/session-end ([#503](https://github.com/rokucommunity/vscode-brightscript-language/pull/503))
### Changed
 - upgrade to [roku-debug@0.20.6](https://github.com/rokucommunity/roku-debug/blob/master/CHANGELOG.md#0206---2023-10-06). Notable changes since 0.20.4:
     - Fix bug with telnet getting stuck ([roku-debug#163](https://github.com/rokucommunity/roku-debug/pull/163))
 - upgrade to [brighterscript@0.65.8](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0658---2023-10-06). Notable changes since 0.65.5:
     - Bump postcss from 8.2.15 to 8.4.31 ([brighterscript#928](https://github.com/rokucommunity/brighterscript/pull/928))
     - Add interface parameter support ([brighterscript#924](https://github.com/rokucommunity/brighterscript/pull/924))
     - Better typing for `Deferred` ([brighterscript#923](https://github.com/rokucommunity/brighterscript/pull/923))
     - fix bug in --noproject flag logic ([brighterscript#922](https://github.com/rokucommunity/brighterscript/pull/922))
     - Add some more details to the plugins docs ([brighterscript#913](https://github.com/rokucommunity/brighterscript/pull/913))
     - Fix incorrect quasi location in template string ([brighterscript#921](https://github.com/rokucommunity/brighterscript/pull/921))
     - Fix UnaryExpression transpile for ns and const ([brighterscript#914](https://github.com/rokucommunity/brighterscript/pull/914))
     - Add missing emitDefinitions to docs and fix iface ([brighterscript#893](https://github.com/rokucommunity/brighterscript/pull/893))
     - add noProject flag to bsc so BSConfig.json not expected ([brighterscript#868](https://github.com/rokucommunity/brighterscript/pull/868))
 - upgrade to [brighterscript-formatter@1.6.34](https://github.com/rokucommunity/brighterscript-formatter/blob/master/CHANGELOG.md#1634---2023-10-06). Notable changes since 1.6.32:
     - Sort imports ([brighterscript-formatter#75](https://github.com/rokucommunity/brighterscript-formatter/pull/75))
### Fixed
 - automation view crash when no config found ([#504](https://github.com/rokucommunity/vscode-brightscript-language/pull/504))
 - error when generating the docs ([12dfb27](https://github.com/rokucommunity/vscode-brightscript-language/commit/12dfb27))



## [2.43.0](https://github.com/rokucommunity/vscode-brightscript-language/compare/v2.42.0...v2.43.0) - 2023-09-12
### Added
 - Roku Test Automation Panel ([#499](https://github.com/rokucommunity/vscode-brightscript-language/pull/499))
### Changed
 - Updated Node Detail Page in Scenegraph Node Inspector ([#499](https://github.com/rokucommunity/vscode-brightscript-language/pull/499))
 - upgrade to [roku-debug@0.20.4](https://github.com/rokucommunity/roku-debug/blob/master/CHANGELOG.md#0204---2023-09-11). Notable changes since 0.20.3:
 - upgrade to [brighterscript@0.65.5](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0655---2023-09-06). Notable changes since 0.65.4:
     - Task/support bs const in bsconfig ([brighterscript#887](https://github.com/rokucommunity/brighterscript/pull/887))
     - allow optionally specifying bslib destination directory ([brighterscript#871](https://github.com/rokucommunity/brighterscript/pull/871))
     - ensure consistent insertion of bslib.brs ([brighterscript#870](https://github.com/rokucommunity/brighterscript/pull/870))
     - Fix crashes in util for null ranges ([brighterscript#869](https://github.com/rokucommunity/brighterscript/pull/869))
     - Print diagnostic related information ([brighterscript#867](https://github.com/rokucommunity/brighterscript/pull/867))
     - Fix tab issue when printing diagnostics ([brighterscript#865](https://github.com/rokucommunity/brighterscript/pull/865))
 - upgrade to [brighterscript-formatter@1.6.32](https://github.com/rokucommunity/brighterscript-formatter/blob/master/CHANGELOG.md#1632---2023-09-11). Notable changes since 1.6.31:



## [2.42.0](https://github.com/rokucommunity/vscode-brightscript-language/compare/v2.41.2...2.42.0) - 2023-07-26
### Added
 - `deleteDevChannelBeforeInstall` launch option ([#494](https://github.com/rokucommunity/vscode-brightscript-language/pull/494))
### Changed
 - upgrade to [roku-debug@0.20.3](https://github.com/rokucommunity/roku-debug/blob/master/CHANGELOG.md#0203---2023-07-26). Notable changes since 0.20.2:
     - Add `deleteDevChannelBeforeInstall` option to delete dev channel before install ([roku-debug#158](https://github.com/rokucommunity/roku-debug/pull/158))



## [2.41.2](https://github.com/rokucommunity/vscode-brightscript-language/compare/v2.41.1...v2.41.2) - 2023-07-25
### Added
 - a spinner in the statusbar when the language server is busy ([#492](https://github.com/rokucommunity/vscode-brightscript-language/pull/492))
### Changed
 - upgrade to [roku-deploy@3.10.3](https://github.com/rokucommunity/roku-deploy/blob/master/CHANGELOG.md#3103---2023-07-22). Notable changes since 3.10.2:
     - Bump word-wrap from 1.2.3 to 1.2.4 ([roku-deploy#117](https://github.com/rokucommunity/roku-deploy/pull/117))
 - upgrade to [roku-debug@0.20.2](https://github.com/rokucommunity/roku-debug/blob/master/CHANGELOG.md#0202---2023-07-24). Notable changes since 0.20.1:
     - Bump word-wrap from 1.2.3 to 1.2.4 ([roku-debug#157](https://github.com/rokucommunity/roku-debug/pull/157))
 - upgrade to [brighterscript@0.65.4](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0654---2023-07-24). Notable changes since 0.65.1:
     - Bump word-wrap from 1.2.3 to 1.2.4 ([brighterscript#851](https://github.com/rokucommunity/brighterscript/pull/851))
     - Show busy spinner for lsp builds ([brighterscript#852](https://github.com/rokucommunity/brighterscript/pull/852))
     - Expose event interface ([brighterscript#845](https://github.com/rokucommunity/brighterscript/pull/845))
     - Add beforeProgramDispose event ([brighterscript#844](https://github.com/rokucommunity/brighterscript/pull/844))
     - Make component ready on afterScopeCreate ([brighterscript#843](https://github.com/rokucommunity/brighterscript/pull/843))
     - Add project index to language server log entries ([brighterscript#836](https://github.com/rokucommunity/brighterscript/pull/836))
     - Bump semver from 6.3.0 to 6.3.1 in /benchmarks ([brighterscript#838](https://github.com/rokucommunity/brighterscript/pull/838))
     - Bump semver from 5.7.1 to 5.7.2 ([brighterscript#837](https://github.com/rokucommunity/brighterscript/pull/837))
     - Prevent crashing when diagnostic is missing range. ([brighterscript#832](https://github.com/rokucommunity/brighterscript/pull/832))
     - Prevent crash when diagnostic is missing range ([brighterscript#831](https://github.com/rokucommunity/brighterscript/pull/831))
     - Add baseline interface docs ([brighterscript#829](https://github.com/rokucommunity/brighterscript/pull/829))
 - upgrade to [brighterscript-formatter@1.6.31](https://github.com/rokucommunity/brighterscript-formatter/blob/master/CHANGELOG.md#1631---2023-07-24). Notable changes since 1.6.30:
     - Bump word-wrap from 1.2.3 to 1.2.4 ([brighterscript-formatter#74](https://github.com/rokucommunity/brighterscript-formatter/pull/74))



## [2.41.1](https://github.com/rokucommunity/vscode-brightscript-language/compare/v2.41.0...v2.41.1) - 2023-07-07
### Changed
 - upgrade to [roku-debug@0.20.1](https://github.com/rokucommunity/roku-debug/blob/master/CHANGELOG.md#0201---2023-07-07). Notable changes since 0.20.0:
     - Fix rendezvous tracking crash ([roku-debug#156](https://github.com/rokucommunity/roku-debug/pull/156))



## [2.41.0](https://github.com/rokucommunity/vscode-brightscript-language/compare/v2.40.4...v2.41.0) - 2023-07-05
### Added
 - ECP Rendezvous tracking (`rendezvousTracking` launch.json option) ([#490](https://github.com/rokucommunity/vscode-brightscript-language/pull/490))
 - `fileLogging` launch.json option ([#487](https://github.com/rokucommunity/vscode-brightscript-language/pull/487))
### Changed
### Fixed
 - Fix iface syntax highlighting for comments & funcs ([#489](https://github.com/rokucommunity/vscode-brightscript-language/pull/489))
 - npm audit issues ([4121aee](https://github.com/rokucommunity/vscode-brightscript-language/commit/4121aee))
 - upgrade to [roku-debug@0.20.0](https://github.com/rokucommunity/roku-debug/blob/master/CHANGELOG.md#0200---2023-07-05). Notable changes since 0.18.12:
     - Support sgrendezvous through ecp ([roku-debug#150](https://github.com/rokucommunity/roku-debug/pull/150))
     - Move `@types/request` to deps to fix `d.bs` files ([#roku-debug691a7be](https://github.com/rokucommunity/roku-debug/commit/691a7be))
     - File logging ([roku-debug#155](https://github.com/rokucommunity/roku-debug/pull/155))
 - upgrade to [brighterscript@0.65.1](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0651---2023-06-09). Notable changes since 0.65.0:
     - Fix injection of duplicate super calls into classes ([brighterscript#823](https://github.com/rokucommunity/brighterscript/pull/823))
 - upgrade to [brighterscript-formatter@1.6.30](https://github.com/rokucommunity/brighterscript-formatter/blob/master/CHANGELOG.md#1630---2023-07-05)



## [2.40.4](https://github.com/rokucommunity/vscode-brightscript-language/compare/v2.40.3...v2.40.4) - 2023-05-18
### Changed
 - upgrade to [roku-debug@0.18.12](https://github.com/rokucommunity/roku-debug/blob/master/CHANGELOG.md#01812---2023-05-18). Notable changes since 0.18.11:
     - Remove axios in favor of postman-request ([roku-debug#153](https://github.com/rokucommunity/roku-debug/pull/153))
     - Fix `file already exists` error and hung process ([roku-debug#152](https://github.com/rokucommunity/roku-debug/pull/152))



## [2.40.3](https://github.com/rokucommunity/vscode-brightscript-language/compare/v2.40.2...v2.40.3) - 2023-05-17
### Changed
 - upgrade to [roku-debug@0.18.11](https://github.com/rokucommunity/roku-debug/blob/master/CHANGELOG.md#01811---2023-05-17). Notable changes since 0.18.10:
     - Fix crash by using postman-request ([roku-debug#151](https://github.com/rokucommunity/roku-debug/pull/151))
### Fixed
 - Use postman-request instead of request ([#485](https://github.com/rokucommunity/vscode-brightscript-language/pull/485))



## [2.40.2](https://github.com/rokucommunity/vscode-brightscript-language/compare/v2.40.1...v2.40.2) - 2023-05-17
### Changed
 - Bump http-cache-semantics from 4.1.0 to 4.1.1 ([#466](https://github.com/rokucommunity/vscode-brightscript-language/pull/466))
 - Augment roku error codes in the logs with human readable messages ([#467](https://github.com/rokucommunity/vscode-brightscript-language/pull/467))
 - upgrade to [roku-deploy@3.10.2](https://github.com/rokucommunity/roku-deploy/blob/master/CHANGELOG.md#3102---2023-05-10). Notable changes since 3.10.1:
     - TBD-67: roku-deploy: fix nodejs 19 bug ([roku-deploy#115](https://github.com/rokucommunity/roku-deploy/pull/115))
 - upgrade to [roku-debug@0.18.10](https://github.com/rokucommunity/roku-debug/blob/master/CHANGELOG.md#01810---2023-05-17). Notable changes since 0.18.8:
 - upgrade to [brighterscript@0.65.0](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0650---2023-05-17). Notable changes since 0.64.3:
     - npm audit fixes. upgrade to coveralls-next ([#brighterscript43756d8](https://github.com/rokucommunity/brighterscript/commit/43756d8))
     - Improve findChild and findAncestor AST methods ([brighterscript#807](https://github.com/rokucommunity/brighterscript/pull/807))
 - upgrade to [brighterscript-formatter@1.6.29](https://github.com/rokucommunity/brighterscript-formatter/blob/master/CHANGELOG.md#1629---2023-05-17). Notable changes since 1.6.27:
### Fixed
 - Remove `<` and `>` from bracket matching ([#483](https://github.com/rokucommunity/vscode-brightscript-language/pull/483))
 - incorrect rendezvous count for file history ([#482](https://github.com/rokucommunity/vscode-brightscript-language/pull/482))
 - fix infinite recursion possibility in Scenegraph Inspector and fix Roku Commands list of available requests ([#480](https://github.com/rokucommunity/vscode-brightscript-language/pull/480))



## [2.40.1](https://github.com/rokucommunity/vscode-brightscript-language/compare/v2.40.0...v2.40.1) - 2023-04-28
### Changed
 - upgrade to [roku-debug@0.18.8](https://github.com/rokucommunity/roku-debug/blob/master/CHANGELOG.md#0188---2023-04-28). Notable changes since 0.18.6:
     - Make axios a prod dependency ([roku-debug#148](https://github.com/rokucommunity/roku-debug/pull/148))
     - Add better error for failed session starts ([roku-debug#147](https://github.com/rokucommunity/roku-debug/pull/147))
     - Bump xml2js from 0.4.23 to 0.5.0 ([roku-debug#146](https://github.com/rokucommunity/roku-debug/pull/146))
     - adds device query info to debug session ([roku-debug#130](https://github.com/rokucommunity/roku-debug/pull/130))
 - upgrade to [brighterscript@0.64.3](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0643---2023-04-28). Notable changes since 0.64.2:
     - Improves performance in symbol table fetching ([brighterscript#797](https://github.com/rokucommunity/brighterscript/pull/797))
 - upgrade to [brighterscript-formatter@1.6.27](https://github.com/rokucommunity/brighterscript-formatter/blob/master/CHANGELOG.md#1627---2023-04-28). Notable changes since 1.6.26:
### Fixed
 - bugs when using the Device View from within WSL ([#478](https://github.com/rokucommunity/vscode-brightscript-language/pull/478))



## [2.40.0](https://github.com/rokucommunity/vscode-brightscript-language/compare/v2.39.0...v2.40.0) - 2023-04-18
### Added
 - validation for raleTrackerTaskFileLocation setting existence. ([#472](https://github.com/rokucommunity/vscode-brightscript-language/pull/472))
### Changed
 - Run findNode calculations in webview and other improvements ([#477](https://github.com/rokucommunity/vscode-brightscript-language/pull/477))
 - upgrade to [roku-deploy@3.10.1](https://github.com/rokucommunity/roku-deploy/blob/master/CHANGELOG.md#3101---2023-04-14). Notable changes since 3.10.0:
     - Bump xml2js from 0.4.23 to 0.5.0 ([roku-deploy#112](https://github.com/rokucommunity/roku-deploy/pull/112))
     - Fix build status badge ([#roku-deployad2c9ec](https://github.com/rokucommunity/roku-deploy/commit/ad2c9ec))
 - upgrade to [roku-debug@0.18.6](https://github.com/rokucommunity/roku-debug/blob/master/CHANGELOG.md#0186---2023-04-18). Notable changes since 0.18.4:
     - Exclude sourcemaps when sideloading ([roku-debug#145](https://github.com/rokucommunity/roku-debug/pull/145))
 - upgrade to [brighterscript@0.64.2](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0642---2023-04-18). Notable changes since 0.62.0:
     - Fix namespace-relative enum value ([brighterscript#793](https://github.com/rokucommunity/brighterscript/pull/793))
     - Bump xml2js from 0.4.23 to 0.5.0 ([brighterscript#790](https://github.com/rokucommunity/brighterscript/pull/790))
     - Fix namespace-relative items ([brighterscript#789](https://github.com/rokucommunity/brighterscript/pull/789))
     - Wrap transpiled template strings in parens ([brighterscript#788](https://github.com/rokucommunity/brighterscript/pull/788))
     - Simplify the ast range logic ([brighterscript#784](https://github.com/rokucommunity/brighterscript/pull/784))
 - upgrade to [brighterscript-formatter@1.6.26](https://github.com/rokucommunity/brighterscript-formatter/blob/master/CHANGELOG.md#1626---2023-04-18)
### Fixed
 - Fix crash during launch due to missing rale option ([#476](https://github.com/rokucommunity/vscode-brightscript-language/pull/476))
 - Wrap the dnsLookup for host in a try/catch ([#473](https://github.com/rokucommunity/vscode-brightscript-language/pull/473))



## [2.39.0](https://github.com/rokucommunity/vscode-brightscript-language/compare/v2.38.8...v2.39.0) - 2023-03-22
### Added
 - device view with direct node selection ([#465](https://github.com/rokucommunity/vscode-brightscript-language/pull/465))

### Changed
 - upgrade to [roku-deploy@3.10.0](https://github.com/rokucommunity/roku-deploy/blob/master/CHANGELOG.md#3100---2023-03-16). Notable changes since 3.9.3:
     - Use micromatch instead of picomatch ([roku-deploy#109](https://github.com/rokucommunity/roku-deploy/pull/109))
 - upgrade to [roku-debug@0.18.4](https://github.com/rokucommunity/roku-debug/blob/master/CHANGELOG.md#0184---2023-03-17). Notable changes since 0.18.3:
 - upgrade to [brighterscript@0.62.0](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0620---2023-03-17). Notable changes since 0.61.3:
     - Optional chaining assignment validation ([brighterscript#782](https://github.com/rokucommunity/brighterscript/pull/782))
     - Fix transpile bug with optional chaning ([brighterscript#781](https://github.com/rokucommunity/brighterscript/pull/781))
     - Add 'severityOverride' option ([brighterscript#725](https://github.com/rokucommunity/brighterscript/pull/725))
     - Fix crash when func has no block ([brighterscript#774](https://github.com/rokucommunity/brighterscript/pull/774))
     - Remove invalid annotation example ([#brighterscript8d3d74e](https://github.com/rokucommunity/brighterscript/commit/8d3d74e))
 - upgrade to [brighterscript-formatter@1.6.24](https://github.com/rokucommunity/brighterscript-formatter/blob/master/CHANGELOG.md#1624---2023-03-17). Notable changes since 1.6.23:
     - Fix indent format issue related to optional chaining array access ([brighterscript-formatter#71](https://github.com/rokucommunity/brighterscript-formatter/pull/71))



## [2.38.8](https://github.com/rokucommunity/vscode-brightscript-language/compare/v2.38.7...v2.38.8) - 2023-01-31
### Changed
 - Allow relative injectRaleTrackerTask ([#462](https://github.com/rokucommunity/vscode-brightscript-language/pull/462))
 - upgrade to [roku-debug@0.18.3](https://github.com/rokucommunity/roku-debug/blob/master/CHANGELOG.md#0183---2023-01-31). Notable changes since 0.18.1:
     - Increase the timeout for debug protocol control ([roku-debug#134](https://github.com/rokucommunity/roku-debug/pull/134))
     - Fix off-by-1 bug with threads over protocol ([roku-debug#132](https://github.com/rokucommunity/roku-debug/pull/132))



## [2.38.7](https://github.com/rokucommunity/vscode-brightscript-language/compare/v2.38.6...v2.38.7) - 2023-01-24
### Changed
 - upgrade to [roku-debug@0.18.1](https://github.com/rokucommunity/roku-debug/blob/master/CHANGELOG.md#0181---2023-01-24). Notable changes since 0.18.0:
     - hide prefixed variables in the debug variable panel ([roku-debug#127](https://github.com/rokucommunity/roku-debug/pull/127))
     - fix isAssignableExpression to correctly support dotted and indexed set statements ([roku-debug#128](https://github.com/rokucommunity/roku-debug/pull/128))
### Fixed
 - `continue` keyword colorization ([#459](https://github.com/rokucommunity/vscode-brightscript-language/pull/459))



## [2.38.6](https://github.com/rokucommunity/vscode-brightscript-language/compare/v2.38.5...v2.38.6) - 2023-01-17
### Changed
 - replaced vsmarketplace badge url to pass marketplace certification



## [2.38.5](https://github.com/rokucommunity/vscode-brightscript-language/compare/v2.38.4...v2.38.5) - 2023-01-17
### Changed
 - nothing changed. the VSCode extension marketplace isn't showing v2.38.4 for some reason, so bump the patch version to force an update



## [2.38.4](https://github.com/rokucommunity/vscode-brightscript-language/compare/v2.38.3...v2.38.4) - 2023-01-12
### Changed
 - upgrade to [roku-deploy@3.9.3](https://github.com/rokucommunity/roku-deploy/blob/master/CHANGELOG.md#393---2023-01-12)
 - upgrade to [roku-debug@0.18.0](https://github.com/rokucommunity/roku-debug/blob/master/CHANGELOG.md#0180---2023-01-12)
     - Execute command for repl expressions ([roku-debug#119](https://github.com/rokucommunity/roku-debug/pull/119))
     - Fix inifinite-spin for unloaded vars ([roku-debug#120](https://github.com/rokucommunity/roku-debug/pull/120))
 - upgrade to [brighterscript@0.61.3](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0613---2023-01-12). Notable changes since 0.61.2:
     - Add diagnostic for passing more than 5 arguments to a callFunc ([brighterscript#765](https://github.com/rokucommunity/brighterscript/pull/765))
 - upgrade to [brighterscript-formatter@1.6.23](https://github.com/rokucommunity/brighterscript-formatter/blob/master/CHANGELOG.md#1623---2023-01-12)
### Fixed
 - rdb keypaths and focus scrolling ([#455](https://github.com/rokucommunity/vscode-brightscript-language/pull/455))



## [2.38.3](https://github.com/rokucommunity/vscode-brightscript-language/compare/v2.38.2...v2.38.3) - 2022-12-15
### Changed
 - upgrade to [roku-debug@0.17.3](https://github.com/rokucommunity/roku-debug/blob/master/CHANGELOG.md#0173---2022-12-15). Notable changes since 0.17.1:
     - Debug protocol breakpoint verification ([roku-debug#117](https://github.com/rokucommunity/roku-debug/pull/117))
 - upgrade to [brighterscript@0.61.2](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0612---2022-12-15)
 - upgrade to [brighterscript-formatter@1.6.22](https://github.com/rokucommunity/brighterscript-formatter/blob/master/CHANGELOG.md#1622---2022-12-15). Notable changes since 1.6.20:
     - Fix continue for ([brighterscript-formatter#65](https://github.com/rokucommunity/brighterscript-formatter/pull/65))
### Fixed
 - Make vsix smaller by excluding unneeded files ([#454](https://github.com/rokucommunity/vscode-brightscript-language/pull/454))
 - Upgrade webview build system ([#450](https://github.com/rokucommunity/vscode-brightscript-language/pull/450))
 - upgrade roku-test-automation module and update code accordingly ([#440](https://github.com/rokucommunity/vscode-brightscript-language/pull/440))



## [2.38.2](https://github.com/rokucommunity/vscode-brightscript-language/compare/v2.38.1...v2.38.2) - 2022-12-08
### Changed
 - upgrade to [roku-debug@0.17.1](https://github.com/rokucommunity/roku-debug/blob/master/CHANGELOG.md#0171---2022-12-08). Notable changes since 0.17.0:
     - Fix npm audit issues. ([#roku-debuge1857c7](https://github.com/rokucommunity/roku-debug/commit/e1857c7))
     - Fix "continue" repeat bug in protocol adapter ([roku-debug#114](https://github.com/rokucommunity/roku-debug/pull/114))
     - Fix issue with truncated debugger paths ([roku-debug#113](https://github.com/rokucommunity/roku-debug/pull/113))
     - Bugfix/do not alter out file path for libraries ([roku-debug#112](https://github.com/rokucommunity/roku-debug/pull/112))
 - upgrade to [brighterscript@0.61.1](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0611---2022-12-07). Notable changes since 0.60.5:
     - Ensure enums and interfaces persist in typedefs ([brighterscript#757](https://github.com/rokucommunity/brighterscript/pull/757))
     - Throttle transpiling to prevent crashes ([brighterscript#755](https://github.com/rokucommunity/brighterscript/pull/755))
     - Let users use or discard explicit types ([brighterscript#744](https://github.com/rokucommunity/brighterscript/pull/744))
     - Fix exception while validating continue statement ([brighterscript#752](https://github.com/rokucommunity/brighterscript/pull/752))
     - Add missing visitor params for DottedSetStatement ([brighterscript#748](https://github.com/rokucommunity/brighterscript/pull/748))
     - Flag incorrectly nested statements ([brighterscript#747](https://github.com/rokucommunity/brighterscript/pull/747))
     - Prevent a double `super` call in subclasses ([brighterscript#740](https://github.com/rokucommunity/brighterscript/pull/740))
     - Fixes issues with Roku doc scraper and adds missing components ([brighterscript#736](https://github.com/rokucommunity/brighterscript/pull/736))
 - upgrade to [brighterscript-formatter@1.6.20](https://github.com/rokucommunity/brighterscript-formatter/blob/master/CHANGELOG.md#1620---2022-12-08)



## [2.38.1](https://github.com/rokucommunity/vscode-brightscript-language/compare/v2.38.0...v2.38.1) - 2022-11-04
### Changed
 - upgrade to [brighterscript@0.60.5](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0605---2022-11-03). Notable changes since 0.60.4:
     - Cache `getCallableByName` ([brighterscript#739](https://github.com/rokucommunity/brighterscript/pull/739))
     - Prevent namespaces being used as variables ([brighterscript#738](https://github.com/rokucommunity/brighterscript/pull/738))
     - Fix crash in `getDefinition` ([brighterscript#734](https://github.com/rokucommunity/brighterscript/pull/734))
### Fixed
 - significant performance issue while validating larger projects ([brighterscript#739](https://github.com/rokucommunity/brighterscript/pull/739))



## [2.38.0](https://github.com/rokucommunity/vscode-brightscript-language/compare/v2.37.0...v2.38.0) - 2022-11-02
### Changed
 - Added the `brightscript_warnings` command ([#446](https://github.com/rokucommunity/vscode-brightscript-language/pull/446))
 - upgrade to [roku-debug@0.17.0](https://github.com/rokucommunity/roku-debug/blob/master/CHANGELOG.md#0170---2022-11-02). Notable changes since 0.16.1:
     - Added the `brightscript_warnings` command ([roku-debug#110](https://github.com/rokucommunity/roku-debug/pull/110))



## [2.37.0](https://github.com/rokucommunity/vscode-brightscript-language/compare/v2.36.1...v2.37.0) - 2022-10-28
### Added
 - add `brightscript.deviceDiscovery.concealDeviceInfo` option to obscure the device-info ([#443](https://github.com/rokucommunity/vscode-brightscript-language/pull/443))
### Changed
 - upgrade to [roku-debug@0.16.1](https://github.com/rokucommunity/roku-debug/blob/master/CHANGELOG.md#0161---2022-10-28)
 - upgrade to [brighterscript@0.60.4](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0604---2022-10-28). Notable changes since 0.60.2:
     - fix: allow `continue` as local var ([brighterscript#730](https://github.com/rokucommunity/brighterscript/pull/730))
     - fix: semanticToken request wait until validate finishes ([brighterscript#727](https://github.com/rokucommunity/brighterscript/pull/727))
     - fix: better parse recovery for unknown function parameter types ([brighterscript#722](https://github.com/rokucommunity/brighterscript/pull/722))
 - upgrade to [brighterscript-formatter@1.6.19](https://github.com/rokucommunity/brighterscript-formatter/blob/master/CHANGELOG.md#1619---2022-10-28)
### Fixed
 - allow clearing rendezvous events when a debug session is not running. ([#444](https://github.com/rokucommunity/vscode-brightscript-language/pull/444))
 - move "clear rendezvous history" button out of a menu and into the title bar of that section ([#444](https://github.com/rokucommunity/vscode-brightscript-language/pull/444))



## [2.36.1](https://github.com/rokucommunity/vscode-brightscript-language/compare/v2.36.0...v2.36.1) - 2022-10-18
### Changed
 - upgrade to [brighterscript@0.60.2](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0602---2022-10-18). Notable changes since 0.60.1:
     - Fix if statement block var bug ([brighterscript#698](https://github.com/rokucommunity/brighterscript/pull/698))



## [2.36.0](https://github.com/rokucommunity/vscode-brightscript-language/compare/v2.35.2...v2.36.0) - 2022-10-18
### Added
 - all launch configuration settings are avaiable in settings under the `brightscript.debug` key ([#438](https://github.com/rokucommunity/vscode-brightscript-language/pull/438))
### Changed
 - Handle new custom event structures and names introduced in roku-debug@0.16.0 ([#433](https://github.com/rokucommunity/vscode-brightscript-language/pull/433))
 - upgrade to [roku-deploy@3.9.2](https://github.com/rokucommunity/roku-deploy/blob/master/CHANGELOG.md#392---2022-10-03). Notable changes since 3.8.1:
     - Replace minimatch with picomatch ([roku-deploy#101](https://github.com/rokucommunity/roku-deploy/pull/101))
     - Sync retainStagingFolder, stagingFolderPath with options. ([roku-deploy#100](https://github.com/rokucommunity/roku-deploy/pull/100))
     - Add stagingDir and retainStagingDir. ([roku-deploy#99](https://github.com/rokucommunity/roku-deploy/pull/99))
 - upgrade to [roku-debug@0.16.0](https://github.com/rokucommunity/roku-debug/blob/master/CHANGELOG.md#0160---2022-10-17). Notable changes since 0.15.0:
     - fix crash in rendezvous parser for missing files ([roku-debug#108](https://github.com/rokucommunity/roku-debug/pull/108))
     - emit device diagnostics instead of compile errors ([roku-debug#104](https://github.com/rokucommunity/roku-debug/pull/104))
     - standardize custom events, add is* helpers ([roku-debug#103](https://github.com/rokucommunity/roku-debug/pull/103))
     - better debug protocol launch handling ([roku-debug#102](https://github.com/rokucommunity/roku-debug/pull/102))
 - upgrade to [brighterscript@0.60.1](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0601---2022-10-18). Notable changes since 0.57.2:
     - add goto definition for enum statements and enum members ([brighterscript#715](https://github.com/rokucommunity/brighterscript/pull/715))
     - add jsdoc eslint checking ([brighterscript#717](https://github.com/rokucommunity/brighterscript/pull/717))
     - add support for nested namespaces ([brighterscript#708](https://github.com/rokucommunity/brighterscript/pull/708))
     - add an 'isThrowStatement' utility function for plugins ([brighterscript#709](https://github.com/rokucommunity/brighterscript/pull/709))
     - add support for `pkg:/` paths in `setFile` ([brighterscript#701](https://github.com/rokucommunity/brighterscript/pull/701))
     - add syntax and transpile support for continue statement ([brighterscript#697](https://github.com/rokucommunity/brighterscript/pull/697))
     - add AST child searching functionality. ([brighterscript#695](https://github.com/rokucommunity/brighterscript/pull/695))
     - change: migrate to `stagingDir` away from `stagingFolder` ([brighterscript#706](https://github.com/rokucommunity/brighterscript/pull/706))
     - change: change `isClassFieldMethod` and `isClassMethodStatement` calls to use `isFieldMethod` and `isMethodStatement` ([brighterscript#694](https://github.com/rokucommunity/brighterscript/pull/694))
     - change: create common ancestor for Expression and Statement ([brighterscript#693](https://github.com/rokucommunity/brighterscript/pull/693))
     - change: move file validation into BscPlugin ([brighterscript#688](https://github.com/rokucommunity/brighterscript/pull/688))
     - fix token location for bs1042 ([brighterscript#719](https://github.com/rokucommunity/brighterscript/pull/719))
     - fix signature help resolution for callexpressions ([brighterscript#707](https://github.com/rokucommunity/brighterscript/pull/707))
     - fix transpilation of simple else block with leading comment ([brighterscript#712](https://github.com/rokucommunity/brighterscript/pull/712))
     - fix enum error for negative values ([brighterscript#703](https://github.com/rokucommunity/brighterscript/pull/703))
     - fix: finds and includes more deeply embedded expressions ([brighterscript#696](https://github.com/rokucommunity/brighterscript/pull/696))
     - fix xml parse bug during benchmarking ([#brighterscript0805c1f](https://github.com/rokucommunity/brighterscript/commit/0805c1f))
     - fix: scope validation performance boost ([brighterscript#656](https://github.com/rokucommunity/brighterscript/pull/656))
     - fix: error during transpile with duplicate file paths ([brighterscript#691](https://github.com/rokucommunity/brighterscript/pull/691))
 - upgrade to [brighterscript-formatter@1.6.17](https://github.com/rokucommunity/brighterscript-formatter/blob/master/CHANGELOG.md#1617---2022-10-03)
### Fixed
 - ignore default user settings not set by user ([#439](https://github.com/rokucommunity/vscode-brightscript-language/pull/439))



## [2.35.2](https://github.com/rokucommunity/vscode-brightscript-language/compare/v2.35.1...v2.35.2) - 2022-09-08
### Changed
 - upgrade to [brighterscript@0.57.2](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0572---2022-09-08). Notable changes since 0.57.0:
     - Fix brightscript.configFile workspace config bug ([brighterscript#686](https://github.com/rokucommunity/brighterscript/pull/686))
     - fix(parser): consider namespace function transpiled names ([brighterscript#685](https://github.com/rokucommunity/brighterscript/pull/685))



## [2.35.1](https://github.com/rokucommunity/vscode-brightscript-language/compare/v2.35.0...v2.35.1) - 2022-09-02
### Changed
 - Document customizing editor.wordSeparators for trailing type symbols ([#436](https://github.com/rokucommunity/vscode-brightscript-language/pull/436))
 - upgrade to [roku-deploy@3.8.1](https://github.com/rokucommunity/roku-deploy/blob/master/CHANGELOG.md#381---2022-09-02). Notable changes since 3.7.1:
     - Bump moment from 2.29.2 to 2.29.4 ([roku-deploy#98](https://github.com/rokucommunity/roku-deploy/pull/98))
     - Remotedebug connect early ([roku-deploy#97](https://github.com/rokucommunity/roku-deploy/pull/97))
     - Better compile error handling ([roku-deploy#96](https://github.com/rokucommunity/roku-deploy/pull/96))
 - upgrade to [brighterscript@0.57.0](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0570---2022-09-02). Notable changes since 0.56.0:
     - Allow `mod` as an aa prop, aa member identifier kinds forced to Identifier ([brighterscript#684](https://github.com/rokucommunity/brighterscript/pull/684))
     - Improve Roku docs information ([brighterscript#585](https://github.com/rokucommunity/brighterscript/pull/585))
     - Validate too deep nested files ([brighterscript#680](https://github.com/rokucommunity/brighterscript/pull/680))
     - Add class method binding docs ([brighterscript#682](https://github.com/rokucommunity/brighterscript/pull/682))
     - Fix case sensitivity issue with bs_const values ([brighterscript#677](https://github.com/rokucommunity/brighterscript/pull/677))
 - upgrade to [brighterscript-formatter@1.6.16](https://github.com/rokucommunity/brighterscript-formatter/blob/master/CHANGELOG.md#1616---2022-09-02). Notable changes since 1.6.15:
     - Mod case formatting ([brighterscript-formatter#62](https://github.com/rokucommunity/brighterscript-formatter/pull/62))
     - Parse all code as brighterscript to improve formatting context ([brighterscript-formatter#61](https://github.com/rokucommunity/brighterscript-formatter/pull/61))
     - Split formatter into separate processors ([brighterscript-formatter#57](https://github.com/rokucommunity/brighterscript-formatter/pull/57))
     - Break `process` into smaller functions ([brighterscript-formatter#59](https://github.com/rokucommunity/brighterscript-formatter/pull/59))
     - Rename `process` to `format` ([brighterscript-formatter#60](https://github.com/rokucommunity/brighterscript-formatter/pull/60))



## [2.35.0](https://github.com/rokucommunity/vscode-brightscript-language/compare/v2.34.2...v2.35.0) - 2022-08-24
### Changed
 - upgrade to [roku-debug@0.15.0](https://github.com/rokucommunity/roku-debug/blob/master/CHANGELOG.md#0150---2022-08-23). Notable changes since 0.14.2:
     - Fix stopOnEntry bug with deep links. ([roku-debug#100](https://github.com/rokucommunity/roku-debug/pull/100))
     - Add `invalid` data type support ([roku-debug#99](https://github.com/rokucommunity/roku-debug/pull/99))
     - Add support for conditional breakpoints ([roku-debug#97](https://github.com/rokucommunity/roku-debug/pull/97))
 - upgrade to [brighterscript@0.56.0](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0560---2022-08-23). Notable changes since 0.55.2:
     - Fix compile crash for scope-less files ([brighterscript#674](https://github.com/rokucommunity/brighterscript/pull/674))
     - Fix parse error for malformed dim statement ([brighterscript#673](https://github.com/rokucommunity/brighterscript/pull/673))
     - Add validation for dimmed variables ([brighterscript#672](https://github.com/rokucommunity/brighterscript/pull/672))
     - Allow const as variable name ([brighterscript#670](https://github.com/rokucommunity/brighterscript/pull/670))
 - upgrade to [brighterscript-formatter@1.6.15](https://github.com/rokucommunity/brighterscript-formatter/blob/master/CHANGELOG.md#1615---2022-08-24)
### Fixed
 - improve multi-network-interface device discovery ([#427](https://github.com/rokucommunity/vscode-brightscript-language/pull/427))
 - component var coloring ([#426](https://github.com/rokucommunity/vscode-brightscript-language/pull/426))



## [2.34.2](https://github.com/rokucommunity/vscode-brightscript-language/compare/v2.34.1...v2.34.2) - 2022-08-15
### Fixed
 - converted file svg icons to paths instead of text



## [2.34.1](https://github.com/rokucommunity/vscode-brightscript-language/compare/v2.34.0...v2.34.1) - 2022-08-15
### Changed
 - Add .bs and .brs file icon support ([#422](https://github.com/rokucommunity/vscode-brightscript-language/pull/422))
 - WebView restructuring ([#421](https://github.com/rokucommunity/vscode-brightscript-language/pull/421))
 - Add activation events for device panel ([#418](https://github.com/rokucommunity/vscode-brightscript-language/pull/418))
 - upgrade to [roku-debug@0.14.2](https://github.com/rokucommunity/roku-debug/blob/master/CHANGELOG.md#0142---2022-08-12). Notable changes since 0.14.1:
     - Support complib breakpoints on 11.5.0 ([roku-debug#96](https://github.com/rokucommunity/roku-debug/pull/96))
     - Disable thread hopping workaround >= protocol v3.1.0 ([roku-debug#95](https://github.com/rokucommunity/roku-debug/pull/95))
     - Upload zip and connect to protocol socket in parallel ([roku-debug#94](https://github.com/rokucommunity/roku-debug/pull/94))
 - upgrade to [brighterscript@0.55.2](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0552---2022-08-15). Notable changes since 0.53.1:
     - Dedupe code completions in components ([brighterscript#664](https://github.com/rokucommunity/brighterscript/pull/664))
     - Fix scope-specific diagnostic grouping issue ([brighterscript#660](https://github.com/rokucommunity/brighterscript/pull/660))
     - Fix typescript error for ast parent setting ([brighterscript#659](https://github.com/rokucommunity/brighterscript/pull/659))
     - Fix missing constant references ([brighterscript#658](https://github.com/rokucommunity/brighterscript/pull/658))
     - Link all brs AST nodes to parent onFileValidate ([brighterscript#650](https://github.com/rokucommunity/brighterscript/pull/650))
     - Add a `toJSON` function to SymbolTable ([brighterscript#655](https://github.com/rokucommunity/brighterscript/pull/655))
     - Performance boost: better function sorting during validation ([brighterscript#651](https://github.com/rokucommunity/brighterscript/pull/651))
     - Add semantic token color for consts ([brighterscript#654](https://github.com/rokucommunity/brighterscript/pull/654))
     - Add go-to-definition support for const statements ([brighterscript#653](https://github.com/rokucommunity/brighterscript/pull/653))
     - Fix broken plugin imports with custom cwd ([brighterscript#652](https://github.com/rokucommunity/brighterscript/pull/652))
     - Fix bug in languageserver hover provider ([brighterscript#649](https://github.com/rokucommunity/brighterscript/pull/649))
     - Add hover for CONST references. ([brighterscript#648](https://github.com/rokucommunity/brighterscript/pull/648))
     - Allow plugins to contribute completions ([brighterscript#647](https://github.com/rokucommunity/brighterscript/pull/647))
     - chore: github actions use latest operating systems ([#brighterscript0b3d31a](https://github.com/rokucommunity/brighterscript/commit/0b3d31a))
     - Plugin support for hover ([brighterscript#393](https://github.com/rokucommunity/brighterscript/pull/393))
     - Export some vscode interfaces ([brighterscript#644](https://github.com/rokucommunity/brighterscript/pull/644))
     - Better plugin docs ([brighterscript#643](https://github.com/rokucommunity/brighterscript/pull/643))
 - upgrade to [brighterscript-formatter@1.6.14](https://github.com/rokucommunity/brighterscript-formatter/blob/master/CHANGELOG.md#1614---2022-08-12)



## [2.34.0](https://github.com/rokucommunity/vscode-brightscript-language/compare/v2.33.2...v2.34.0) - 2022-07-18
### Added
 - support showing popups from debug sessions ([#407](https://github.com/rokucommunity/vscode-brightscript-language/pull/407))
 - syntax highlighting for regex literals ([#408](https://github.com/rokucommunity/vscode-brightscript-language/pull/408))
 - syntax highlighting support for the new `const` keyword ([#412](https://github.com/rokucommunity/vscode-brightscript-language/pull/412))
### Changed
 - upgrade to [roku-debug@0.14.1](https://github.com/rokucommunity/roku-debug/blob/master/CHANGELOG.md#0141---2022-07-16). Notable changes since 0.13.1:
     - case-sensitivity in getVariables protocol request ([roku-debug#91](https://github.com/rokucommunity/roku-debug/pull/91))
     - Show error when cannot resolve hostname ([roku-debug#90](https://github.com/rokucommunity/roku-debug/pull/90))
 - upgrade to [brighterscript@0.53.1](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0531---2022-07-15). Notable changes since 0.52.2:
     - support codeactions at the edges of tokens. ([brighterscript#642](https://github.com/rokucommunity/brighterscript/pull/642))
     - fix nested namespace import codeActions bug. ([brighterscript#641](https://github.com/rokucommunity/brighterscript/pull/641))
     - new Language Feature: Constants ([brighterscript#632](https://github.com/rokucommunity/brighterscript/pull/632))
     - flag invalid top level statements ([brighterscript#638](https://github.com/rokucommunity/brighterscript/pull/638))
     - flag usage of undefined variables ([brighterscript#631](https://github.com/rokucommunity/brighterscript/pull/631))
     - better project detection by language server ([brighterscript#633](https://github.com/rokucommunity/brighterscript/pull/633))
     - fix bug with class transpile in watch mode ([brighterscript#630](https://github.com/rokucommunity/brighterscript/pull/630))
     - send program-triggered validate() diagnostics to language client ([brighterscript#629](https://github.com/rokucommunity/brighterscript/pull/629))
     - emit before/after programTranspile plugin events during file transpile preview ([brighterscript#628](https://github.com/rokucommunity/brighterscript/pull/628))
 - upgrade to [brighterscript-formatter@1.6.13](https://github.com/rokucommunity/brighterscript-formatter/blob/master/CHANGELOG.md#1613---2022-07-16). Notable changes since 1.6.12:
     - Fix import statement formatting. ([brighterscript-formatter#55](https://github.com/rokucommunity/brighterscript-formatter/pull/55))
### Fixed
 - property and call syntax highlighting ([#414](https://github.com/rokucommunity/vscode-brightscript-language/pull/414))
 - import statement syntax highlighting. ([#413](https://github.com/rokucommunity/vscode-brightscript-language/pull/413))
 - Rdb improvements ([#410](https://github.com/rokucommunity/vscode-brightscript-language/pull/410))



## [2.33.2](https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.33.1...v2.33.2) - 2022-06-13
### Changed
 - updated to [brighterscript@0.52.2](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0522---2022-06-13). Notable changes since v0.52.0:
    - fixed transpile crash when file was changed by a plugin in beforeTranspile events ([brighterscript#627](https://github.com/rokucommunity/brighterscript/pull/627))
    - fixed bug in transpile preview custom command that wasn't returning the result ([brighterscript#626](https://github.com/rokucommunity/brighterscript/pull/626))
    - add missing range on interface statement, causing transpile crashes ([brighterscript#623](https://github.com/rokucommunity/brighterscript/pull/623))
    - transpile enum values in binary expressions ([brighterscript#622](https://github.com/rokucommunity/brighterscript/pull/622))
    - detect class circular extends ([brighterscript#619](https://github.com/rokucommunity/brighterscript/pull/619))
    - improve namespace/enum/class semantic token detection (better syntax highlighting) ([brighterscript#621](https://github.com/rokucommunity/brighterscript/pull/#621))



## [2.33.1](https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.33.0...v2.33.1) - 2022-06-09
### Changed
 - updated to [roku-debug@0.13.1](https://github.com/rokucommunity/roku-debug/blob/master/CHANGELOG.md#0131---2022-06-09).
    - fixed dynamic breakpoints bug where component library breakpoints weren't being hit ([roku-debug#89](https://github.com/rokucommunity/roku-debug/pull/89))



## [2.33.0](https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.32.1...v2.33.0) - 2022-06-08
### Changed
 - updated to [brighterscript@0.52.0](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0520---2022-06-08). Notable changes since v0.51.4:
    - update LanguageServer to load projects based on bsconfig.json presence ([brighterscript#613](https://github.com/rokucommunity/brighterscript/pull/613))
 - updated to [roku-debug@0.13.0](https://github.com/rokucommunity/roku-debug/blob/master/CHANGELOG.md#0130---2022-06-08). Notable changes since 0.12.2:
    - add support for dynamic breakpoints when using Debug Protocol ([roku-debug#84](https://github.com/rokucommunity/roku-debug/pull/84))
    - fix crash when RAF files show up in stacktrace ([roku-debug#88](https://github.com/rokucommunity/roku-debug/pull/88))
 - updated to [roku-deploy@3.7.1](https://github.com/rokucommunity/roku-deploy/blob/master/CHANGELOG.md#371---2022-06-08)
### Fixed
 - don't show error messages when 0 Roku devices are found in the active device manager ([#406](https://github.com/rokucommunity/vscode-brightscript-language/pull/406))
 - delay the language server 1.5 seconds when running in dev mode to help with language server debugging ([#405](https://github.com/rokucommunity/vscode-brightscript-language/pull/405))
 - add missing RDP parameter ([#403](https://github.com/rokucommunity/vscode-brightscript-language/pull/403))



## [2.32.1](https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.32.0...v2.32.1) - 2022-06-02
### Fixed
 - allow user-specified RDB port ([#401](https://github.com/rokucommunity/vscode-brightscript-language/pull/401))
 - prevent RDB-related "port already in use" error after the first debug session ([#401](https://github.com/rokucommunity/vscode-brightscript-language/pull/401))



## [2.32.0](https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.31.1...v2.32.0) - 2022-05-31
### Added
 - new SceneGraph Inspector panel to view/manage all on-device SceneGraph nodes right in vscode. ([#386](https://github.com/rokucommunity/vscode-brightscript-language/pull/386))
 - syntax coloring for experimental `ComponentStatement` brighterscript feature ([#389](https://github.com/rokucommunity/vscode-brightscript-language/pull/389))
 - subdivisions to VSCode Extension Settings ([#390](https://github.com/rokucommunity/vscode-brightscript-language/pull/390))
 - refresh button in the devices panel ([#392](https://github.com/rokucommunity/vscode-brightscript-language/pull/392))
 - support for `enum` and `interface` lookup ([#398](https://github.com/rokucommunity/vscode-brightscript-language/pull/398))
### Changed
 - updated to [brighterscript@0.51.4](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0514---2022-05-31). Notable changes since v0.48.1:
    - allow interfaces and enums as function param types ([#580](https://github.com/rokucommunity/brighterscript/pull/580))
    - Transpile files added by plugins after start of transpile cycle ([#578](https://github.com/rokucommunity/brighterscript/pull/578))
    - Fix semantic tokens for enums in if statements ([#584](https://github.com/rokucommunity/brighterscript/pull/584))
    - Fix language server cwd issue with multi-root workspaces ([#592](https://github.com/rokucommunity/brighterscript/pull/592))
    - `allowBrighterScriptInBrightScript` config option to allow brighterscript features to be included in BrightScript files, and force those files to be transpiled ([#573](https://github.com/rokucommunity/brighterscript/pull/573))
    - allow enums and interfaces as function return types ([#601](https://github.com/rokucommunity/brighterscript/pull/601))
    - allow enums and interfaces as class field types ([#602](https://github.com/rokucommunity/brighterscript/pull/602))
    - add hover for namespace functions ([#606](https://github.com/rokucommunity/brighterscript/pull/606))
 - updated to [roku-debug@0.12.2](https://github.com/rokucommunity/roku-debug/blob/master/CHANGELOG.md#0122---2022-05-31). Notable changes since 0.10.5:
    - fix RDB path bug on windows ([#76](https://github.com/rokucommunity/roku-debug/pull/76))
    - add `brightScriptConsolePort` option. Utilize `remotePort` in more places ([#79](https://github.com/rokucommunity/roku-debug/pull/79))
    - fix crash during rendezvous tracking ([#82](https://github.com/rokucommunity/roku-debug/pull/82))
    - fix line number and thread hopping issues ([#86](https://github.com/rokucommunity/roku-debug/pull/86))
 - updated to [roku-deploy@3.7.0](https://github.com/rokucommunity/roku-deploy/blob/master/CHANGELOG.md#370---2022-05-23)
### Fixed
 - Excludes the out directory from readDeclarations function ([#391](https://github.com/rokucommunity/vscode-brightscript-language/pull/391))
 - `roIntrinsicDouble` syntax highlighting color ([#395](https://github.com/rokucommunity/vscode-brightscript-language/pull/395))



## [2.31.1](https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.31.0...v2.31.1) - 2022-04-18
### Fixed
 - Unfocus **remote control mode** statusbar item on click ([#384](https://github.com/rokucommunity/vscode-brightscript-language/pull/384))
 - Add missing **remote control mode** keybinding `Ctrl+Escape`/`Cmd+Escape` for home press ([#383](https://github.com/rokucommunity/vscode-brightscript-language/pull/383))
 - enable **remote control mode** telemetry tracking


## [2.31.0](https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.30.1...v2.31.0) - 2022-04-14
### Added
 - a `BRS` custom view in the Activity Bar ([#375](https://github.com/rokucommunity/vscode-brightscript-language/pull/375))
 - new **Remote Control Mode** to handle Roku remote emulation. ([#375](https://github.com/rokucommunity/vscode-brightscript-language/pull/375))
 - history tracking of the last 30 unique values sent by the `extension.brightscript.sendRemoteText` command ([#375](https://github.com/rokucommunity/vscode-brightscript-language/pull/375))
 - Many missing ECP commands ([#375](https://github.com/rokucommunity/vscode-brightscript-language/pull/375))
 - new `extension.brightscript.showReleaseNotes` command accessible via the command pallet
### Changed
 - Remove the debug-panel focus-based remote emulation functionality in favor of **Remote Control Mode** ([#375](https://github.com/rokucommunity/vscode-brightscript-language/pull/375))
 - updated to [brighterscript@0.48.1](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0481---2022-04-14)
    - language support for native BrightScript optional chaining ([#546](https://github.com/rokucommunity/brighterscript/pull/546))
    - validation for all known `createObject` values and parameters. ([#435](https://github.com/rokucommunity/brighterscript/pull/435), [#568](https://github.com/rokucommunity/brighterscript/pull/568))
    - for plugin authors: 
        - fixed accuracy issues when parsing the manifest ([#565](https://github.com/rokucommunity/brighterscript/pull/565))
        - add missing statements and expressions to `createVisitor` ([#567](https://github.com/rokucommunity/brighterscript/pull/567))
 - updated to [roku-deploy@3.6.0](https://github.com/rokucommunity/roku-deploy/blob/master/CHANGELOG.md#360---2022-04-13)
 - updated to [brighterscript-formatter@1.6.12](https://github.com/rokucommunity/brighterscript-formatter/blob/master/CHANGELOG.md#1612---2022-04-13)
 - updated to [roku-debug@0.10.5](https://github.com/rokucommunity/roku-debug/blob/master/CHANGELOG.md#0105---2022-04-13)
 - removed the `CreateObject` snippet because it's too aggressive
### Fixed
 - bug with `brightscript.deviceDiscovery.includeNonDeveloperDevices` setting not working
 - bug with `brightscript.deviceDiscovery.enabled` not working properly ([#236](https://github.com/rokucommunity/vscode-brightscript-language/issues/236))
 - issue where the rendezvous ui commands would show up in the when they shouldn't
 - Rendezvous timing issue ([#367](https://github.com/rokucommunity/vscode-brightscript-language/issues/367))



## [2.30.1](https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.30.0...v2.30.1) - 2022-04-07
### Changed
 - updated to [roku-debug@0.10.2](https://github.com/rokucommunity/roku-debug/blob/master/CHANGELOG.md#0104---2022-04-07)
    - fixed stability issues when restarting an existing debug session ([#74](https://github.com/rokucommunity/roku-debug/pull/74))
    - fixed issue where the `type` and `keys` commands would time out. ([#73](https://github.com/rokucommunity/roku-debug/pull/73))
    - possible fix for [#72](https://github.com/rokucommunity/roku-debug/issues/72) ([#73](https://github.com/rokucommunity/roku-debug/pull/73))
 - updated to [brighterscript@0.47.2](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0472---2022-04-07)
    - fixed enum transpile bug for binary expressions ([#559](https://github.com/rokucommunity/brighterscript/pull/559))
    - added missing `require` entry to `bsconfig.schema.json` ([#560](https://github.com/rokucommunity/brighterscript/pull/560))
    - don't add trailing commas in transpiled output for array and aa literals ([#556](https://github.com/rokucommunity/brighterscript/pull/556))
    - retain quote char when transpiling xml attributes ([#552](https://github.com/rokucommunity/brighterscript/pull/552))
    - add `require` flag to allow loading external node modules as part of the build process (useful for things like `ts-node/register`). ([#550](https://github.com/rokucommunity/brighterscript/pull/550), [#551](https://github.com/rokucommunity/brighterscript/pull/551))
 - updated to [brighterscript-formatter@1.6.11](https://github.com/rokucommunity/brighterscript-formatter/blob/master/CHANGELOG.md#1611---2022-04-07)
### Fixed
 - empty `host` and `password` fields for new launch configuration
 - standardized the default value for `retainStagingFolder` and `stopOnEntry` launch options



## [2.30.0](https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.29.4...v2.30.0) - 2022-03-30
### Added
 - Add bsc problem matchers. (`$bsc`, `$bsc-watch`, `$bsc-watch-silent`) ([#376](https://github.com/rokucommunity/vscode-brightscript-language/pull/376))



## [2.29.4](https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.29.3...v2.29.4) - 2022-03-25
### Changed
 - updated to [roku-debug@0.10.2](https://github.com/rokucommunity/roku-debug/blob/master/CHANGELOG.md#0102---2022-03-25)
    - fixed bug with protocol step command killing the app ([roku-debug#70](https://github.com/rokucommunity/roku-debug/pull/70))
    - fixed event flow on protocol debugger startup ([roku-debug#70](https://github.com/rokucommunity/roku-debug/pull/70))
    - fixed bug cleaning up packet lengths for v3 ([roku-debug#70](https://github.com/rokucommunity/roku-debug/pull/70))
 - updated to [brighterscript@0.46.0](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0460---2022-03-24)
    - refactored try-catch statement to make the expressions and bodies easier to access via plugins. ([brighterscript#514](https://github.com/rokucommunity/brighterscript/pull/514))
### Fixed
 - sendRemoteText command no longer times out when sending large text. ([#373](https://github.com/rokucommunity/vscode-brightscript-language/pull/373))



## [2.29.3](https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.29.2...v2.29.3) - 2022-03-23
### Fixed
 - reverted syntax highlighting introduced in v2.29.2. 



## [2.29.2](https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.29.1...v2.29.2) - 2022-03-22
### Fixed
 - better function, method, and type syntax highlighting. ([#371](https://github.com/rokucommunity/vscode-brightscript-language/pull/371))



## [2.29.1](https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.29.0...v2.29.1) - 2022-03-18
### Changed
 - updated to [roku-debug@0.10.1](https://github.com/rokucommunity/roku-debug/blob/master/CHANGELOG.md#0101---2022-03-17)
 - updated to [brighterscript@0.45.6](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0456---2022-03-17)
 - updated to [brighterscript-formatter@1.6.10](https://github.com/rokucommunity/brighterscript-formatter/blob/master/CHANGELOG.md#1610---2022-03-17)
 - updated to [roku-deploy@3.5.4](https://github.com/rokucommunity/roku-deploy/blob/master/CHANGELOG.md#354---2022-03-17)
### Fixed
 - speed issues when zipping project during launch ([roku-deploy#86](https://github.com/rokucommunity/roku-deploy/pull/86))



## [2.29.0](https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.28.1...v2.29.0) - 2022-03-08
### Changed
 - updated to [brighterscript@0.45.4](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0454---2022-03-08)
    - fixed bug calculating parse time. ([brighterscript#532](https://github.com/rokucommunity/brighterscript/pull/532))
 - updated to [roku-debug@0.10.0](https://github.com/rokucommunity/roku-debug/blob/master/CHANGELOG.md#0100---2022-03-08) 
    - added support for roku debug protocol v3.0.0
    - support for eval/execute functionality over the debug protocol(v3.0.0+) from the debug console
    - Changed: running `print` statements in the debug console now runs an actual print statement. To do variable evaluation, simply type the name of the variable.



## [2.28.1](https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.28.0...v2.28.1) - 2022-02-24
### Changed
 - updated to [brighterscript@0.45.2](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0452---2022-02-24)
    - fixed significant memory leak [brighterscript#527](https://github.com/rokucommunity/brighterscript/pull/527)
 - updated to [brighterscript-formatter@1.6.9](https://github.com/rokucommunity/brighterscript-formatter/blob/master/CHANGELOG.md#169---2022-02-24)
 - updated to [roku-deploy@3.5.3](https://github.com/rokucommunity/roku-deploy/blob/master/CHANGELOG.md#353---2022-02-16)
 - updated to [roku-debug@0.9.4](https://github.com/rokucommunity/roku-debug/blob/master/CHANGELOG.md#094---2022-02-24) 



## [2.28.0](https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.27.2...v2.28.0) - 2022-02-11
### Changed
 - updated to [brighterscript@0.45.0](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0450---2022-02-11)
    - `enum` language feature ([BrighterScript#484](https://github.com/rokucommunity/brighterscript/pull/484))
 - updated to [brighterscript-formatter@1.6.8](https://github.com/rokucommunity/brighterscript-formatter/blob/master/CHANGELOG.md#168---2022-02-11)
    - adds enum indentation support
### Fixed
 - fixed bug with indented enum syntax highlighting
 - bug with namespace, interface, and enum indentation rules



## [2.27.2](https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.27.1...v2.27.2) - 2022-02-08
### Added
 - enum syntax highlighting ([#359](https://github.com/rokucommunity/vscode-brightscript-language/pull/359))
### Changed
 - updated to [brighterscript@0.44.0](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0440---2022-02-08)
    - fixed bug in hover showing required params as optional and optional params as required ([brighterscript#501](https://github.com/rokucommunity/brighterscript/pull/501))  
    - show plugin transpile modifications in the `getTranspiledFile` callback (used for "show preview" functionality in vscode) ([brighterscript#502](https://github.com/rokucommunity/brighterscript/pull/502))



## [2.27.1](https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.27.0...v2.27.1) - 2022-02-01
### Changed
 - updated to [brighterscript-formatter@1.6.7](https://github.com/rokucommunity/brighterscript-formatter/blob/master/CHANGELOG.md#167---2022-02-01)
### Fixed
 - formatting bug that was incorrectly removing whitespace between certain characters. ([brighterscript-formatter#49](https://github.com/rokucommunity/brighterscript-formatter/pull/49))



## [2.27.0](https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.26.1...v2.27.0) - 2022-01-31
### Added
 - start tracking anonymized telemetry data to give visibility into real-world usage of the extension and its features. ([#354](https://github.com/rokucommunity/vscode-brightscript-language/pull/354))



## [2.26.1](https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.26.0...v2.26.1) - 2022-01-28
### Changed
 - updated to [brighterscript@0.43.1](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0431---2022-01-28)
    - fix crash when hovering over global functions ([brighterscript#497](https://github.com/rokucommunity/brighterscript/pull/497))



## [2.26.0](https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.25.3...v2.26.0) - 2022-01-28
### Added
 - ability to filter out devices with developer mode off ([#353](https://github.com/rokucommunity/vscode-brightscript-language/pull/353))
### Changed
 - updated to [brighterscript@0.43.0](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0430---2022-01-28). Since last update:
    - show function documentation when hovering over functions. ([brighterscript#495](https://github.com/rokucommunity/brighterscript/pull/495))
    - bug preventing code to come after an interface statement.  ([brighterscript#493](https://github.com/rokucommunity/brighterscript/pull/493))
    - bug in global function parameter checking that was not properly enforcing optional/required status for parameters. ([brighterscript#479](https://github.com/rokucommunity/brighterscript/pull/479))
 - updated to [brighterscript-formatter@1.6.6](https://github.com/rokucommunity/brighterscript-formatter/blob/master/CHANGELOG.md#166---2022-01-28)
    - properly formats an interface that includes subs and functions ([brighterscript-formatter#46](https://github.com/rokucommunity/brighterscript-formatter/pull/46))
    - adds better support for appropriate whitespace between minus and numbers/identifiers ([brighterscript-formatter#47](https://github.com/rokucommunity/brighterscript-formatter/pull/47))
 - updated to [roku-debug@0.9.3](https://github.com/rokucommunity/roku-debug/blob/master/CHANGELOG.md#093---2022-01-28) which uses brighterscript@0.43.0


## [2.25.3](https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.25.2...v2.25.3) - 2022-01-14
### Changed
 - updated to [brighterscript-formatter@1.6.5](https://github.com/rokucommunity/brighterscript-formatter/blob/master/CHANGELOG.md#165---2022-01-14)
 - Removed all interface snippets introduced in Adding Completion Items #105 that were partially removed a while ago. These should all be handled by the language server as we add better type tracking support. ([#348](https://github.com/rokucommunity/vscode-brightscript-language/pull/348))
 - Don't show brighterscript-specific snippets in BrightScript files ([#348](https://github.com/rokucommunity/vscode-brightscript-language/pull/348))
### Fixed
 - formatting indentation bug with `interface` statements ([brighterscript-formatter#45](https://github.com/rokucommunity/brighterscript-formatter/pull/45))
 - syntax highlighting for interface statements ([#351](https://github.com/rokucommunity/vscode-brightscript-language/pull/351))
 - Add brightscript and brighterscript snippets to BrighterScript files (they were missing for some reason) ([#348](https://github.com/rokucommunity/vscode-brightscript-language/pull/348))



## [2.25.2](https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.25.1...v2.25.2) - 2022-01-12
### Fixed
 - updated to [roku-debug@0.9.2](https://github.com/rokucommunity/roku-debug/blob/master/CHANGELOG.md#092---2022-01-12)
    - fixed bug with telnet debug session related to fire-and-forget commands like `step`, `continue`, etc. This was causing the debug session to stall frequently. ([roku-debug#64](https://github.com/rokucommunity/roku-debug/pull/64))
    - combine telnet output that was split due to buffer sizes ([roku-debug#64](https://github.com/rokucommunity/roku-debug/pull/64))



## [2.25.1](https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.25.0...v2.25.1) - 2022-01-05
### Changed
 - updated to [brighterscript@0.41.6](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0416---2022-01-05)
    - fixed issue in the transpiled output of the null coalescing operator where plain variable references are not properly passed into the function. ([brighterscript#474](https://github.com/rokucommunity/brighterscript/pull/474))
 - updated to [brighterscript-formatter@1.6.4](https://github.com/rokucommunity/brighterscript-formatter/blob/master/CHANGELOG.md#164---2022-01-05)
    - fixed formatting issue with ternary operator and square brace in the consequent ([brighterscript-formatter#44](https://github.com/rokucommunity/brighterscript-formatter/pull/44))
 - updated to [roku-debug@0.9.1](https://github.com/rokucommunity/roku-debug/blob/master/CHANGELOG.md#091---2022-01-05)
    - fixed issue where `"consoleOutput": "full"` shows no output when `enableDebugProtocol === true`. ([roku-debug#65](https://github.com/rokucommunity/roku-debug/pull/65))



## [2.25.0](https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.24.2...v2.25.0) - 2021-12-17
### Changed
 - updated to [roku-debug@0.9.0](https://github.com/rokucommunity/roku-debug/blob/master/CHANGELOG.md#090---2021-12-17) 
    - Adds many new log messages at various debug levels. ([roku-debug#61](https://github.com/rokucommunity/roku-debug/pull/61))
    - Ability to inspect node children through the `[[children]]` virtual property ([#57](https://github.com/rokucommunity/roku-debug/pull/57))
    - `[[length]]` virtual property for all variables that support it.  ([#57](https://github.com/rokucommunity/roku-debug/pull/57))
 - add `logLevel` launch configuration variable ([roku-debug#61](https://github.com/rokucommunity/roku-debug/pull/61))
 - rename `SceneGraph Debug Commands Log` output panel to `SceneGraph Debug Commands`  ([#342](https://github.com/rokucommunity/vscode-brightscript-language/pull/342))
 - rename `BrightScript Debug Server` output panel to `BrightScript Extension` for wider usage. ([#342](https://github.com/rokucommunity/vscode-brightscript-language/pull/342))
### Fixed
 - add `brightscript.extensionLogfilePath` setting to specify an output file for debug logs ([#342](https://github.com/rokucommunity/vscode-brightscript-language/pull/342))
 - several telnet debugging issues related to the 10.5 Roku OS release.([roku-debug#57](https://github.com/rokucommunity/roku-debug/pull/57))



## [2.24.2](https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.24.1...v2.24.2) - 2021-11-23
### Changed
 - updated to [brighterscript@0.41.5](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0415---2021-11-23)
### Fixed
 - critical crash in language server whenever a local variable had the same name as a javascript object function on the prototype (stuch as `constructor`). ([brighterscript#469](https://github.com/rokucommunity/brighterscript/pull/469))



## [2.24.1](https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.24.0...v2.24.1) - 2021-11-11
### Changed
 - updated to [roku-debug@0.8.7](https://github.com/rokucommunity/roku-debug/blob/master/CHANGELOG.md#087---2021-11-11) 
   - Don't delete dev channel during launch, as this clears the registry. ([roku-debug#58](https://github.com/rokucommunity/roku-debug/pull/58))



## [2.24.0](https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.23.1...v2.24.0) - 2021-11-04
### Added
 - limited support for running the extension in vscode for web. Currently only the syntax hightlighter works. ([#333](https://github.com/rokucommunity/vscode-brightscript-language/pull/333))
### Fixed
 - updated to [roku-debug@0.8.6](https://github.com/rokucommunity/roku-debug/blob/master/CHANGELOG.md#086---2021-11-04) 
    - telnet debugger to work better with RokuOS 10.5 and `run_as_process=1` projects, as well as some better detection of the `Brightscript Debugger>` prompt.
    - fix ECP commands that would fail when using a hostname instead of an ip address.
 - updated to [roku-deploy@3.5.2](https://github.com/rokucommunity/roku-deploy/blob/master/CHANGELOG.md#352---2021-11-02)



## [2.23.1](https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.23.0...v2.23.1) - 2021-10-27
### Changed
 - updated to [roku-debug@0.8.5](https://github.com/rokucommunity/roku-debug/blob/master/CHANGELOG.md#085---2021-10-27) 
    - add additional logging to the "BrightScript Debug Server" output panel
    - fixed bug with boxed primitives for telnet debugger ([roku-debug#36](https://github.com/rokucommunity/roku-debug/pull/36))
    - send stdio lines as separate debug events which fixes focus bug in the output panel. ([roku-debug#51](https://github.com/rokucommunity/roku-debug/pull/51))
    - retain newlines in log output after tracker preprocessing ([roku-debug#50](https://github.com/rokucommunity/roku-debug/pull/50))
 - updated to [roku-deploy@3.5.0](https://github.com/rokucommunity/roku-deploy/blob/master/CHANGELOG.md#350---2021-10-27)
    - includes ability to use negated non-rootDir top-level patterns in the files array ([roku-deploy#78](https://github.com/rokucommunity/roku-deploy/pull/78))
 - updated to [brighterscript@0.41.3](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0413---2021-10-27)
    -  Allow diagnostic non-numeric disable code comments ([brighterscript#463](https://github.com/rokucommunity/brighterscript/pull/463))
 - updated to [brighterscript-formatter@1.6.3](https://github.com/rokucommunity/brighterscript-formatter/blob/master/CHANGELOG.md#163---2021-10-27)
### Fixed
 - syntax highlighting issue related to `if` keyword that looked like a function call ([#331](https://github.com/rokucommunity/vscode-brightscript-language/pull/331))
 - `throw` keyword colorization ([#330](https://github.com/rokucommunity/vscode-brightscript-language/pull/330))



## [2.23.0](https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.22.3...v2.23.0) - 2021-09-17
### Added
 - Initial RDB implementation ([#317](https://github.com/rokucommunity/vscode-brightscript-language/pull/317))
### Fixed
 - deploy crashes when target Roku doesn't have an installed channel (roku-deploy#65)
### Changed
 - updated to [brighterscript@0.40.1](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0401---2021-09-17) which includes roku-deploy@3.4.2
 - updated to [roku-deploy@3.4.2](https://github.com/rokucommunity/roku-deploy/blob/master/CHANGELOG.md#342---2021-09-17)
 - updated to [brighterscript-formatter@1.6.2](https://github.com/rokucommunity/brighterscript-formatter/blob/master/CHANGELOG.md#162---2021-09-17)



## [2.22.3] - 2021-06-28
[2.22.3]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.22.2...v2.22.3
### Fixed
 - (Debugger) freeze when debugger prompt split across multiple telnet messages ([roku-debug#35](https://github.com/rokucommunity/roku-debug/pull/35))
 - (LanguageServer) allow up to 6 arguments in `CreateObject` function signature ([brighterscript#430](https://github.com/rokucommunity/brighterscript/pull/430))
 - (LanguageServer) add `v30/bslCore` library functions to global callables ([brighterscript#433](https://github.com/rokucommunity/brighterscript/pull/433))



## [2.22.2] - 2021-06-01
[2.22.2]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.22.1...v2.22.2
### Fixed
 - extension crash due to a missing dependency in roku-deploy
### Changed
 - updated to [brighterscript@0.39.3](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0393---2021-06-01) which includes roku-deploy@3.4.1
 - updated to [roku-debug@0.8.2](https://github.com/rokucommunity/roku-debug/blob/master/CHANGELOG.md#082---2021-05-28) which includes roku-deploy@3.4.1
 - updated to [roku-deploy@3.4.1](https://github.com/rokucommunity/roku-deploy/blob/master/CHANGELOG.md#341---2021-06-01)



## [2.22.1] - 2021-05-28
[2.22.1]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.22.0...v2.22.1
### Changed
 - Latest roku-deploy changed the internal zip libary which yields up to 75% speed boost during the zipping process. 
 - updated to [brighterscript@0.39.2](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0392---2021-05-28)
 - updated to [roku-debug@0.8.2](https://github.com/rokucommunity/roku-debug/blob/master/CHANGELOG.md#082---2021-05-28)
 - updated to [roku-deploy@3.4.0](https://github.com/rokucommunity/roku-deploy/blob/master/CHANGELOG.md#340---2021-05-28)



## [2.22.0] - 2021-05-19
[2.22.0]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.21.0...v2.22.0
### Added
 - `extension.brightscript.showkey` command to show the current developer key ([#313](https://github.com/rokucommunity/vscode-brightscript-language/pull/313))
### Fixed
 - broken `extension.brightscript.genkey` command due to wrong casing of the command ([#313](https://github.com/rokucommunity/vscode-brightscript-language/pull/313))



## [2.21.0] - 2021-05-18
[2.21.0]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.20.2...v2.21.0
### Changed
 - upgraded to languageclient version 7 ([#306](https://github.com/rokucommunity/vscode-brightscript-language/pull/306))
 - updated to [brighterscript@0.39.0](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0390---2021-05-18)



## [2.20.2] - 2021-05-17
[2.20.2]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.20.1...v2.20.2
### Added
 - updated to [brighterscript@0.38.2](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0382---2021-05-17)



## [2.20.1] - 2021-05-03
[2.20.1]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.20.0...v2.20.1
### Added
 - (LanguageServer) warning for mismatched class method accessibility ([BrighterScript#402](https://github.com/rokucommunity/brighterscript/pull/402))
 - (LanguageServer) allow class field overrides in child classes as long as they are the same type ([BrighterScript#394](https://github.com/rokucommunity/brighterscript/pull/394))
### Changed
 - updated to [brighterscript@0.38.0](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0380---2021-05-04)
 - updated to [roku-debug@0.8.1](https://github.com/rokucommunity/roku-debug/blob/master/CHANGELOG.md#081---2021-05-04)
### Fixed
 - (Debugger) Fix incorrect sgnodes shell prompt matching string. ([RokuDebug#31](https://github.com/rokucommunity/roku-debug/pull/31))
 - (Debugger) Increase port 8080 commands max buffer size ([RokuDebug#31](https://github.com/rokucommunity/roku-debug/pull/31))
 - (Extension) Fixed an issue where some sg debug command logs could have missing results for large responses ([#309](https://github.com/rokucommunity/vscode-brightscript-language/pull/309))



## [2.20.0] - 2021-05-03
[2.20.0]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.19.0...v2.20.0
### Added
 - Commands for all port 8080 requests (chanperf, rendezvous tracking, etc...) ([#308](https://github.com/rokucommunity/vscode-brightscript-language/pull/308))
 - (Debugger) launch config options `autoRunSgDebugCommands` for running port 8080 commands before starting a debug session
 - new `showOutputPanelOnStartup` setting.
### Changed
 - updated to [roku-debug@0.8.0](https://github.com/rokucommunity/roku-debug/blob/master/CHANGELOG.md#080---2021-05-03)
 - Deprecated `focusOutputPanelOnStartup` in favor of the new `showOutputPanelOnStartup` setting.



## [2.19.0] - 2021-04-27
[2.19.0]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.18.1...v2.19.0
### Added
 - (Debugger) support for inspecting roXmlElement
 - (Debugger) support for capturing chanperf events (these are shown in the status bar)
### Changed
 - updated to [brighterscript@0.37.4](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0374---2021-04-20)
 - updated to [roku-debug@0.7.0](https://github.com/rokucommunity/roku-debug/blob/master/CHANGELOG.md#070---2021-04-27)
### Fixed
 - (LanguageServer) bug validating namespace function calls



## [2.18.1] - 2021-04-13
[2.18.1]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.18.0...v2.18.1
### Changed
 - updated to [brighterscript@0.37.3](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0373---2021-04-12)
### Fixed
 - (LanguageServer) crash when encountering BrighterScript circular imports
 - (LanguageServer) bug where having multiple components with the same name would cause issues in the program, normally requiring a language server restart. 



## [2.18.0] - 2021-03-30
[2.18.0]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.17.9...v2.18.0
### Added
 - (LanguageServer) version picker for running locally-installed versions of BrighterScript ([#300](https://github.com/rokucommunity/vscode-brightscript-language/pull/300))
 - (LanguageSever) setting `brightscript.bsdk` for specifying the version of BrighterScript to use for the language server ([#300](https://github.com/rokucommunity/vscode-brightscript-language/pull/300))
### Changed
 - updated to [brighterscript@0.37.1](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0371---2021-03-30)
### Fixed
 - colorization issues with certain SceneGraph support functions



## [2.17.9] - 2021-03-18
[2.17.9]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.17.8...v2.17.9
### Added
 - (LanguageServer) support for bs:disable comments in xml files ([BrighterScript#363](https://github.com/rokucommunity/brighterscript/pull/363))
### Changed
 - updated to [brighterscript@0.37.0](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0370---2021-03-18)



## [2.17.8] - 2021-03-16
[2.17.8]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.17.7...v2.17.8
### Added
 - (LanguageServer) class import code actions ([BrighterScript#365](https://github.com/rokucommunity/brighterscript/pull/365))
### Changed
 - (LanguageServer) append stack trace to every language server error ([BrighterScript#354)](https://github.com/rokucommunity/brighterscript/pull/354))
 - updated to [brighterscript@0.36.0](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0360---2021-03-15)
### Fixed
 - (LanguageServer) restrict function and class imports to .bs files only ([BrighterScript#365)](https://github.com/rokucommunity/brighterscript/pull/365))
 - (LanguageServer) crashes due to unsafe property access in callfunc expressions ([BrighterScript#360)](https://github.com/rokucommunity/brighterscript/pull/360))
 - (LanguageServer) crashes in signature help ([BrighterScript#358)](https://github.com/rokucommunity/brighterscript/pull/358))



## [2.17.7] - 2021-03-13
[2.17.7]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.17.6...v2.17.7
### Added
 - (Debugger) RDB integration ([roku-debug#25](https://github.com/rokucommunity/roku-debug/pull/25)
### Changed
 - updated to [roku-debug@0.6.0](https://github.com/rokucommunity/roku-debug/blob/master/CHANGELOG.md#060---2021-03-09)
### Fixed
 - syntax highlight issue for keywords in class method declarations



## [2.17.6] - 2021-03-10
[2.17.6]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.17.5...v2.17.6
### Added
 - (LanguageServer) code actions for suggesting import statements in brighterscript files
 - (LanguageServer) support for loading bslib without alias
### Changed
 - updated to [brighterscript@0.35.0](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0350---2021-03-09)
### Fixed
 - (LanguageServer) bugs during hover and completion requests ([BrighterScript#328](https://github.com/rokucommunity/brighterscript/pull/328))



## [2.17.5] - 2021-03-02
[2.17.5]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.17.4...v2.17.5
### Changed
 - updated to [brighterscript@0.34.1](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0341---2021-03-02)
### Fixed
 - (LanguageServer) syntax parsing bugs within single-line if statements



## [2.17.4] - 2021-02-28
[2.17.4]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.17.3...v2.17.4
### Added
 - (LanguageServer) file path completions inside strings that start with `pkg:` or `libpkg:`
### Changed
 - (LanguageServer) BrighterScript support for a ropm version of bslib ([BrighterScript#334](https://github.com/rokucommunity/brighterscript/pull/334))
 - updated to [brighterscript@0.34.0](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0340---2021-02-28)



## [2.17.3] - 2021-02-27
[2.17.3]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.17.2...v2.17.3
### Changed
 - updated to [brighterscript@0.33.0](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0330---2021-02-27)
### Fixed
 - (LanguageServer) bslib bugs
 - (LanguageServer) parse crash when encountering immediately-invoked function expressions
 - (LanguageServer) error during language server completions when activated on the first token in the file


## [2.17.2] - 2021-02-25
[2.17.2]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.17.1...v2.17.2
### Changed
 - updated to [brighterscript@0.32.3](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0323---2021-02-25)
### Fixed
 - (LanguageServer) fix significant performance bug in diagnostic filtering
 - (LanguageServer) null reference error in Scope.getFileByRelativePath()
 - (LanguageServer) fix class fields that were missing in getSymbol requests



## [2.17.1] - 2021-02-18
[2.17.1]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.17.0...v2.17.1
### Changed
 - updated to [brighterscript@0.31.1](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0311---2021-02-18)
### Fixed
  - (LanguageServer) prevent exception in codeAction functionality when file cannot be found in a Program, which caused unwanted focus on the "BrighterScript Language Server" output panel.



### [2.17.0] - 2021-02-17
[2.17.0]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.16.2...v2.17.0
### Added
 - (LanguageServer) codeAction to add missing `extends` attribute in components
### Changed
 - updated to [brighterscript@0.31.0](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0310---2021-02-17)
 - updated to [roku-debug@0.5.10](https://github.com/rokucommunity/roku-debug/blob/master/CHANGELOG.md#0510---2021-02-16)
### Fixed
 - (Debugger) improve stack trace name mapping for BrighterScript class methods



### [2.16.2] - 2021-02-15
[2.16.2]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.16.1...v2.16.2
### Changed
 - updated to [brighterscript@0.30.9](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0309---2021-02-15)
### Fixed
 - (LanguageServer) prevent excess validations when non-workspace files are changed  ([BrighterScript#315](https://github.com/rokucommunity/brighterscript/pull/315))
 - (LanguageServer) catch errors when getting signatures ([BrighterScript#285](https://github.com/rokucommunity/brighterscript/pull/285))
 - (LanguageServer) missing `Roku_Ads` function in global functions list. ([BrighterScript#312](https://github.com/rokucommunity/brighterscript/pull/312))



## [2.16.1] - 2021-02-12
[2.16.1]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.16.0...v2.16.1
### Added
 - (LanguageServer) additional debug logging
### Changed
 - updated to [brighterscript@0.30.8](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0308---2021-02-12)
### Fixed
 - (LanguageServer) don't mangle xml scripts during transpile preview



## [2.16.0] - 2021-02-11
[2.16.0]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.15.0...v2.16.0
### Added
 - Command to restart language server called "BrightScript: Restart Language Server"
### Changed
 - updated to [brighterscript@0.30.7](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0307---2021-02-11)
### Fixed
 - (LanguageServer) bug prevent signature help for functions with zero leading whitespace



## [2.15.0] - 2021-02-04
[2.15.0]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.14.3...v2.15.0
### Added
- (LanguageServer) syntax support for `dim` statements
- (LanguageServer) completion and code navigation for labels
### Changed
 - updated to [brighterscript@0.30.5](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0305---2021-02-03)
### Fixed
 - (LanguageServer) exception related to signature help when writing comments



## [2.14.2] - 2021-02-03
[2.14.2]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.14.1...v2.14.2
### Changed
 - updated to [brighterscript@0.30.4](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0304---2021-02-02)
### Fixed
 - (LanguageServer) fixed crash during validation caused by a missing function body when parsing malformed code



## [2.14.1] - 2021-01-31
[2.14.1]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.14.0...v2.14.1
### Fixed
 - (LanguageServer) xml parse error crashing validation ((BrighterScript#294)[https://github.com/rokucommunity/brighterscript/pull/294])
 - broken document links in the output windows for Windows devices
### Changed
 - updated to [brighterscript@0.30.2](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0302---2021-01-31)



## [2.14.0] - 2021-01-26
[2.14.0]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.13.0...v2.14.0
### Added
 - (BrighterScript) null coalescing operator (see [the BrighterScript docs](https://github.com/rokucommunity/brighterscript/blob/master/docs/null-coalescing-operator.md) for more information)
### Changed
 - updated to [brighterscript@0.30.0](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0300---2021-01-26)
### Fixed
 - (BrighterScript)infinite parser loop when encountering annotations without an identifier above a class method ([#291](https://github.com/rokucommunity/brighterscript/pull/291))



## [2.13.0] - 2021-01-25
[2.13.0]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.12.3...v2.13.0
### Added
 - (BrighterScript) support for ternary operator (see [the BrighterScript ternary operator docs](https://github.com/rokucommunity/brighterscript/blob/master/docs/ternary-operator.md) for more information)
### Changed
 - updated to [brighterscript@0.29.0](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0290---2021-01-25)



## [2.12.3] - 2021-01-24
[2.12.3]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.12.2...v2.12.3
### Changed
 - updated to [brighterscript@0.28.2](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0282--2021-01-22)
### Fixed
 - (LanguageServer) bug where the variable declaration from `for each` statements was missing from intellisense.



## [2.12.2] - 2021-01-19
[2.12.2]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.12.1...v2.12.2
### Changed
 - (LanguageServer) (For plugin authors) refactored many async methods into sync methods to simplify file creation/management. ([#278](https://github.com/rokucommunity/brighterscript/pull/278))
 - updated to [brighterscript@0.28.1](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0281---2021-01-19)
 - updated to [roku-debug@0.5.9](https://github.com/rokucommunity/roku-debug/blob/master/CHANGELOG.md#059---2021-01-19)
### Fixed
 - (LanguageServer) bug with transpiling classes that would not always get the correct superclass index. ([#279](https://github.com/rokucommunity/brighterscript/pull/279))
 - (Debugger) timing issue when shutting down debug session before the log processor has finish its job
 - (Debugger) off-by-one location of "compile errors" when device validates XML components
 - (Debugger) off-by-one code stepping with debug protocol
 - (Debugger) XML sourcemap resolution; follow mapped source even if we don't have a resolved mapping
 - (Debugger) errors being dropped when a "line" error is found
 - (Debugger) added extra XML error matching
 - (Debugger) filter out "generic XML error" on a file if a specific one was captured as well


## [2.12.1] - 2021-01-16
[2.12.1]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.12.0...v2.12.1
### Added
 - (LanguageServer) annotation support for classes and class methods ([BrighterScript#270](https://github.com/rokucommunity/brighterscript/pull/270))
 - syntax highlighting support for annotations
### Changed
 - updated to [brighterscript@0.28.0](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0280---2021-01-16)
 - (LanguageServer) plugin system changed to require a factory function instead of a singleton object ([BrighterScript#272](https://github.com/rokucommunity/brighterscript/pull/272))
### Fixed
 - (Languageserver) bugs with go-to-definition and signature help for namespace functions, classes, and callfunc calls



## [2.12.0] - 2021-01-15
[2.12.0]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.11.7...v2.12.0
### Added
 - (LanguageServer) support for proper xml parsing and additional SceneGraph diagnostics (such as component interface validation)
 - (LanguageServer) support for string-based diagnostic codes from plugins
### Changed
 - updated to [brighterscript@0.26.0](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0260---2021-01-14)



## [2.11.7] - 2021-01-12
[2.11.7]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.11.6...v2.11.7
### Added
 - (LanguageServer) support for passing custom types as function parameters and return types ([BrighterScript#262](https://github.com/rokucommunity/brighterscript/issues/262))
### Changed
 - updated to [brighterscript@0.25.0](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0250---2021-01-12)
 - upgraded to [roku-deploy@3.2.4](https://github.com/rokucommunity/roku-deploy/blob/master/CHANGELOG.md#324---2021-01-08)
### Fixed
 - (Debugger) occasional failure to launch during home press commands when device would send 202 instead of 200 http response
 - (LanguageServer) bug with transpiled child classes causing on-device stack overflows ([BrighterScript#267](https://github.com/rokucommunity/brighterscript/issues/267))



## [2.11.6] - 2020-12-22
[2.11.6]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.11.5...v2.11.6
### Changed
 - updated to [brighterscript@0.23.1](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0231---2020-12-22)
 - (LanguageServer) Refactored statement separators processing and cleaned error messages
 - (LanguageServer) Improved try-catch parsing
 - (LanguageServer) Improved label error handling
### Fixed
 - syntax highlighting for BrighterScript template strings ([#287](https://github.com/rokucommunity/vscode-brightscript-language/pull/287))
 - (LanguageServer) crashes related to negative ranges in token location tracking
 - (LanguageServer) bug causing invalid diagnostics to be thrown on files with multiple dots in their names ([BrighterScript#257](https://github.com/rokucommunity/brighterscript/pull/257))
 - syntax error for [integer type declaration character](https://developer.roku.com/docs/references/brightscript/language/expressions-variables-types.md#type-declaration-characters) ([BrighterScript#254](https://github.com/rokucommunity/brighterscript/pull/254))
 - syntax error for floats with more than 5 decimal places that also have a trailing exponent ([BrighterScript#255](https://github.com/rokucommunity/brighterscript/pull/255))



## [2.11.5] - 2020-12-10
[2.11.5]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.11.4...v2.11.5
### Fixed
 - show better error messages in certain debug crash situations ([#286](https://github.com/rokucommunity/vscode-brightscript-language/pull/286))



## [2.11.4] - 2020-11-25
[2.11.4]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.11.3...v2.11.4
### Fixed
 - broken syntax highlighting introduced in v2.11.3



## [2.11.3] - 2020-11-25
[2.11.3]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.11.2...v2.11.3
### Added
 - (Formatter) indentation and keyword support for `try`,`catch`,`throw`,`end try`.
 - (Editor) syntax highlighting for  `try`,`catch`,`throw`,`end try`.
### Changed
 - updated to [brighterscript-formatter@1.6.0](https://github.com/rokucommunity/brighterscript-formatter/blob/master/CHANGELOG.md#160---2020-11-25)



## [2.11.2] - 2020-11-23
[2.11.2]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.11.1...v2.11.2
### Added
 - (LanguageServer) `try/catch` and `throw` syntax support [BrighterScript#218](https://github.com/rokucommunity/brighterscript/issues/218)
 - (LanguageServer) Catch when local variables and scope functions have the same name as a class. ([BrighterScript#246](https://github.com/rokucommunity/brighterscript/pull/246))
 - (LanguageServer) Catch when functions use keyword names ([BrighterScript#247](https://github.com/rokucommunity/brighterscript/pull/247))
### Changed
 - updated to [brighterscript@0.22.0](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0220---2020-11-23)



## [2.11.1] - 2020-11-17
[2.11.1]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.11.0...v2.11.1
### Changed
 - updated to [brighterscript@0.20.1](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0201---2020-11-16)
### Fixed
 - (LanguageServer) - load BrighterScript plugins relative to the project ([BrighterScript#243](https://github.com/rokucommunity/brighterscript/pull/243))



## [2.11.0] - 2020-11-14
[2.11.0]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.10.3...v2.11.0
### Changed
 - use LanguageServer for most completion/provider functionality. (you can disable this by setting `"brightscript.enableLanguageServer": false` in user/workspace settings). ([279](https://github.com/rokucommunity/vscode-brightscript-language/pull/279))
 - updated to [brighterscript@0.20.0](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0200---2020-11-13)



## [2.10.3] - 2020-11-11
[2.10.3]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.10.2...v2.10.3
### Fixed
 - bug with hardcoded extension ID that did not properly work with new vscode publisher id.



## [2.10.2] - 2020-11-11
[2.10.2]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.10.1...v2.10.2
### Changed
 - Publish to OpenVSX registry
 - Rename VSCode marketplace publisher to "RokuCommunity"
 - update badges



## [2.10.1] - 2020-10-30
[2.10.1]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.10.0...v2.10.1
### Changed
 - updated to [brighterscript@0.18.1](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0181---2020-10-30)
### Fixed
 - (LanguageServer) exclude bs1100 for typedef files (`Missing "super()" call in class constructor method.`)
 - (LanguageServer) fix some invalid class field types in typedef files
 - (LanguageServer) include override keyword in class methods in typedef files



## [2.10.0] - 2020-10-30
[2.10.0]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.9.0...v2.10.0
### Added
 - (LanguageServer) support for BrighterScript type definitions
### Changed
 - updated to [brighterscript@0.18.0](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0180---2020-10-30)



## [2.9.0] - 2020-10-28
[2.9.0]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.8.15...v2.9.0
### Added
 - (LanguageServer) support for BrighterScript annotations
### Changed
 - updated to [brighterscript@0.17.0](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0170---2020-10-27)
 - Upgraded to [brighterscript-formatter@1.5.5](https://github.com/rokucommunity/brighterscript-formatter/blob/master/CHANGELOG.md#155---2020-10-28)



## [2.8.15] - 2020-10-23
[2.8.15]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.8.14...v2.8.15
### Changed
 - updated to [roku-debug@0.5.8](https://github.com/rokucommunity/roku-debug/blob/master/CHANGELOG.md#058---2020-10-23)
### Fixed
 - (Debugger) bug when converting `$anon_###` function names into original function names that was using the wrong line number to look up the name. ([roku-debug#21](https://github.com/rokucommunity/roku-debug/pull/21))



## [2.8.14] - 2020-10-20
[2.8.14]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.8.13...v2.8.14
### Changed
 - updated to [brighterscript@0.16.11](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#01611---2020-10-20)
 - (LanguageServer) removed `bs1106` (.bs file script tags must use the `type="brighterscript"`) diagnostic because it's unnecessary.
### Fixed
 - (LanguageServer) bug when using single quotes in an xml script tag



## [2.8.13] - 2020-10-20
[2.8.13]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.8.12...v2.8.13
### Changed
 - updated to [brighterscript@0.16.10](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#01610---2020-10-20)
### Fixed
 - (LanguageServer) crash when a callable has the same name as a javascript reserved name ([BrighterScript#226](https://github.com/rokucommunity/brighterscript/pull/226))
 - (LanguageServer) crash when `import` statement is malformed ([BrighterScript#224](https://github.com/rokucommunity/brighterscript/pull/224))



## [2.8.12] - 2020-10-18
[2.8.12]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.8.11...v2.8.12
### Changed
 - updated to [brighterscript@0.16.9](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0169---2020-10-18)
### Fixed
 - (LanguageServer) reduce throttle for validation and parsing now that those have improved performance.
 - (LanguageServer) massively improve validation performance by refactoring `getFileByPkgPath`
 - (LanguageServer) micro-optimization of hot parser functions
 - (LanguageServer) change codebase to use `import type` many places, which reduces the number of files imported at runtime



## [2.8.11] - 2020-10-15
[2.8.11]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.8.10...v2.8.11
### Changed
 - updated to [brighterscript@0.16.8](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0168---2020-10-15)
### Fixed
 - (LanguageServer) bug when printing diagnostics that would crash if the contents were missing (like for in-memory-only files injected by plugins) ([BrighterScript#217](https://github.com/rokucommunity/brighterscript/pull/217))
 - (LanguageServer) performance improvements by moving property name collection into the parser, which elimitates a costly AST walk



## [2.8.10] - 2020-10-13
[2.8.10]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.8.9...v2.8.10
### Changed
 - updated to [brighterscript@0.16.7](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0167---2020-10-13)
### Fixed
 - (LanguageServer) bug when finding bsconfig.json that would use the wrong cwd in multi-workspace language server situations. This fix may resolve significant multi-workspace performance problems you might have been seeing.
 - (LanguageServer) performance issue during the parser phase. We now defer certain collections until needed ([BrighterScript#210](https://github.com/rokucommunity/brighterscript/pull/210))



## [2.8.9] - 2020-10-12
[2.8.9]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.8.8...v2.8.9
### Changed
 - (LanguageServer) significant changes to the plugin API related to AST traversal.
 - LanguageServer) plugin system (still in alpha) support for re-scanning the AST after modifing the AST by calling `invalidateReferences()`
 - (LanguageServer) now sends a _diff_ of diagnostics for files, instead of the entire project's diagnostics every time. This improves performance for projects with a high number of diagnostics or files ([BrighterScript#204](https://github.com/rokucommunity/brighterscript/pull/204))
 - update to [brighterscript@0.16.4](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0164---2020-10-12)
### Fixed
 - (Debugger) Fixed bug where `stagingFolderPath` was defaulting to `${workspaceFolder}/.roku-deploy-staging`, when it should have been `${workspaceFolder}/out/.roku-deploy-staging`. 
 - (LanguageServer) bugs with plugin interoperability with BrighterScript when using `instanceof`. All internal BrighterScript logic now uses the `is` functions from `astutils/reflection`, and plugin authors should do the same.
 - (LanguageServer) critical bug in diagnostic printing that would crash the program if a diagnostic was missing a valid range.
 - (LanguageServer) Prevent bogus diagnostic on all callfunc operations ([BrighterScript#205](https://github.com/rokucommunity/brighterscript/issues/205))
 - (LanguageServer) transpile bug for namespaced class constructors that wouldn't properly prepend the namespace in some situations. ([BrighterScript#208](https://github.com/rokucommunity/brighterscript/pull/208))
 - (LanguageServer) bug in class validation that was causing bogus diagnostics during class construction in namespaces.([BrighterScript#203](https://github.com/rokucommunity/brighterscript/issues/203))



## [2.8.8] - 2020-10-06
[2.8.8]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.8.7...v2.8.8
### Changed
 - upgraded to [roku-debug@0.5.7](https://github.com/rokucommunity/roku-debug/blob/master/CHANGELOG.md#057---2020-10-06)
### Fixed
 - (Debugger) bug that was not passing in the `stagingFolderPath` property for the root project, and therefore incorrectly loading that value from `bsconfig.json` if it existed. ([roku-debug#18](https://github.com/rokucommunity/roku-debug/pull/18))



## [2.8.7] - 2020-10-01
[2.8.7]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.8.6...v2.8.7
### Changed
 - update to [brighterscript@0.15.2](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0152---2020-10-01)
### Fixed
 - (LanguageServer) annoying popup that would show anytime invalid XML was encountered.
 - (LanguageServer) improved performance in the lexer and parser
 - (LanguageServer) potential for accidentally changing cwd during bsconfig resolving



## [2.8.6] - 2020-09-30
[2.8.6]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.8.5...v2.8.6
### Changed
 - upgraded to [roku-debug@0.5.6](https://github.com/rokucommunity/roku-debug/blob/master/CHANGELOG.md#056---2020-09-30)
### Fixed
 - (Debugger) bug preventing component library debug sessions from launching in certain situations



## [2.8.5] - 2020-09-30
[2.8.5]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.8.4...v2.8.5
### Changed
 - upgraded to [roku-debug@0.5.5](https://github.com/rokucommunity/roku-debug/blob/master/CHANGELOG.md#055---2020-09-28)
### Fixed
 - (Debugger) bug where debugger couldn't find `manifest` file for component libraries during publish.



## [2.8.4] - 2020-09-25
[2.8.4]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.8.3...v2.8.4
### Added
 - (Language Server) alpha version of plugin system. This is subject to change at any time, so use at your own risk.
### Changed
 - upgraded to [roku-debug@0.5.4](https://github.com/rokucommunity/roku-debug/blob/master/CHANGELOG.md#054---2020-09-25)
 - update to [brighterscript@0.15.0](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0150---2020-09-18)
### Fixed
 - (Debugger) fixed some false positive detections of `Can't continue` in the TelnetAdapter



## [2.8.3] - 2020-09-04
[2.8.3]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.8.2...v2.8.3
### Changed
 - (Language Server) Add error diagnostic BS1115 which flags duplicate component names [brighterscript#186](https://github.com/rokucommunity/brighterscript/pull/186)
 - update to [brighterscript@0.14.0](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0140---2020-09-04)


## [2.8.2] - 2020-09-01
[2.8.2]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.8.1...v2.8.2
### Changed
 - update to [brighterscript@0.13.2](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0132---2020-08-31)
 - (Language Server) Upgraded BS1104 to error (previously a warning) and refined the messaging.



## [2.8.1] - 2020-08-14
[2.8.1]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.8.0...v2.8.1
###  Changed
 - upgraded to [roku-deploy@3.2.3](https://github.com/rokucommunity/roku-deploy/blob/master/CHANGELOG.md#323---2020-08-14)
 - upgraded to [roku-debug@0.5.3](https://github.com/rokucommunity/roku-debug/blob/master/CHANGELOG.md#053---2020-08-14)
 - upgraded to [brighterscript@0.13.1](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0131---2020-08-14)
 - throw exception when copying to staging folder and `rootDir` does not exist in the file system
 - throw exception when zipping package and `${stagingFolder}/manifest` does not exist in the file system
### Fixed
 - bug in `DebugConfigProvider` that incorrectly used `${workspaceFolder}` when `rootDir` didn't exist. 



## [2.8.0] - 2020-08-10
[2.8.0]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.7.0...v2.8.0
### Added
 - (Language Server) ability to mark the `extends` and `project` options in `bsconfig.json` as optional by prefixing the path with a question mark. See [this link](https://github.com/rokucommunity/brighterscript#optional-extends-and-project) for more details. 
### Changed
 - upgraded to [brighterscript@0.13.0](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0130---2020-08-10)



## [2.7.0] - 2020-08-03
[2.7.0]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.6.0...v2.7.0
### Added
 - support for clickable `file://` links in the log output ([#262](https://github.com/rokucommunity/vscode-brightscript-language/pull/262))
### Changed
 - upgraded to [brighterscript@0.12.3](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0123---2020-08-03)
### Fixed
 - (Language Server) bug that would provide stale completions due to the file throttling introduced in brighterscript@0.11.2. Now the language server will wait for the throttled parsing to complete before serving completion results. 
 - improvements in the auto-indent functionality for certain language keywords ([#271](https://github.com/rokucommunity/vscode-brightscript-language/pull/271)).



## [2.6.0] - 2020-07-29
[2.6.0]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.5.4...v2.6.0
### Added
- (Formatter) ability to load formatter settings in `bsfmt.json` file in cwd. If `bsfmt.json` exists, then user/workspace formatting settings are ignored. 
### Changed
 - upgraded to [brighterscript@0.12.2](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0122---2020-07-16)
 - Upgraded to [brighterscript-formatter@1.5.4](https://github.com/rokucommunity/brighterscript-formatter/blob/master/CHANGELOG.md#154---2020-07-29)
### Fixed
 - (BrighterScript) bug on Windows when transpiling import statements into xml script tags that would use the wrong path separator sometimes.



## [2.5.4] - 2020-07-14
[2.5.4]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.5.3...v2.5.4
### Changed
 - upgraded to [roku-deploy@3.2.2](https://github.com/rokucommunity/roku-deploy/blob/master/CHANGELOG.md#322---2020-07-14)
 - upgraded to [brighterscript@0.12.1](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0121---2020-07-15)
### Fixed
 - (LanguageServer) - critical bug in BrighterScript and roku-deploy when when loading `stagingFolderPath` from `rokudeploy.json` or `bsconfig.json` that would crash the language server



## [2.5.3] - 2020-07-11
[2.5.3]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.5.2...v2.5.3
### Fixed
 - (Debugger) Prevent debug session crash if target breakpoint file doesn't exist. [roku-debug#10](https://github.com/rokucommunity/roku-debug/pull/10)
 - (Debugger) Bug when converting source location to staging locations that incorrectly checked rootDir before sourceDirs. [roku-debug#10](https://github.com/rokucommunity/roku-debug/pull/10)



## [2.5.2] - 2020-07-09
[2.5.2]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.5.1...v2.5.2
### Changed
 - Upgraded to [brighterscript@0.12.0](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0120---2020-07-09)
### Fixed
 - Throttle LanguageServer validation to prevent running too many validations in a row.



## [2.5.1] - 2020-07-09
[2.5.1]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.5.0...v2.5.1
### Changed
 - (LanguageServer) add 350ms debounce in `onDidChangeWatchedFiles` to increase performance by reducing the number of times a file is parsed and validated.
 - Upgraded to [brighterscript@0.11.2](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0112---2020-07-09)
### Fixed
 - (Debugger) bug in the `.env` file processing during debug launch.
 - (LanguageServer) bug in the log output that wasn't casting string log levels into their numeric enum versions, causing messages to be lost at certain log levels.
 - (LanguageServer) load manifest file exactly one time per program rather than every time a file gets parsed.
 - (LanguageServer) bug in `info` logging that wasn't showing the proper parse times for files on first run.



## [2.5.0] - 2020-07-08
[2.5.0]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.4.6...v2.5.0
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
[2.4.6]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.4.5...v2.4.6
### Changed
 - Upgraded to [roku-debug@0.4.0](https://github.com/rokucommunity/roku-debug/blob/master/CHANGELOG.md#040---2020-07-02) 
 - (Debugger) Try to look up original function names for anonymous functions in call stack [roku-debug#6](https://github.com/rokucommunity/roku-debug/issues/6)



## [2.4.5] - 2020-07-02
[2.4.5]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.4.4...v2.4.5
### Fixed
 - bug where .env placeholders in nested launch.json settings were not being handled in the config resolver. [#256](https://github.com/rokucommunity/vscode-brightscript-language/pull/256)



## [2.4.4] - 2020-06-12
[2.4.4]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.4.3...v2.4.4
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
[2.4.3]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.4.2...v2.4.3
### Changed
 - Upgraded to [brighterscript@0.10.8](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0108---2020-06-09)
### Fixed
 - (LanguageServer) Allow leading spaces for `bs:disable-line` and `bs:disable-next-line` comments ([brighterscript#108](https://github.com/rokucommunity/brighterscript/pull/108))
 - (LanguageServer) incorrect definition for global `Left()` function. ([brighterscript#100](https://github.com/rokucommunity/brighterscript/issues/100))
 - (LanguageServer) missing definition for global `Tab()` and `Pos()` functions ([brighterscript#101](https://github.com/rokucommunity/brighterscript/issues/101))
 - BrighterScript `class-extends` snippet with broken placeholder for parent class ([#252](https://github.com/rokucommunity/vscode-brightscript-language/issues/252))



## [2.4.2] - 2020-06-04
[2.4.2]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.4.1...v2.4.2
### Changed
 - Upgraded to [brighterscript@0.10.5](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0103---2020-05-27)
 - (LanguageServer) log full error to language server console in client anytime critical error is encountered (attempting to find cause of [brighterscript#97](https://github.com/rokucommunity/brighterscript/issues/97))



## [2.4.1] - 2020-06-04
[2.4.1]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.4.0...v2.4.1
### Changed
 - remove required fields (`rootDir`, `host`, `password`) from `launch.json` as it's perfectly valid to provide none and rely on the `bsconfig.json`. ([#251](https://github.com/rokucommunity/vscode-brightscript-language/issues/251))



## [2.4.0] - 2020-06-01
[2.4.0]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.3.0...v2.4.0
### Added
 - basic snippets for brs/bs and xml files ([#248](https://github.com/rokucommunity/vscode-brightscript-language/pull/248))
### Fixed
 - bug where command `extension.brightscript.toggleXML` wouldn't account for `.bs` files ([#242](https://github.com/rokucommunity/vscode-brightscript-language/pull/242))



## [2.3.0] - 2020-06-01
[2.3.0]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.2.1...v2.3.0
### Added 
- (Formatter) new option `insertSpaceBetweenAssociativeArrayLiteralKeyAndColon` which will ensure exactly 1 or 0 spaces between an associative array key and its trailing colon. ([brighterscript-formatter#17](https://github.com/rokucommunity/brighterscript-formatter/issues/17))
### Changed
 - Upgraded to [brighterscript-formatter@1.4.0](https://github.com/rokucommunity/brighterscript-formatter/blob/master/CHANGELOG.md#140---2020-05-29)
### Fixed
 - (Formatter) bugs related to formatting single-line if statements ([brighterscript-formatter#13](https://github.com/rokucommunity/brighterscript-formatter/issues/13))
 


## [2.2.1] - 2020-05-28
[2.2.1]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.2.0...v2.2.1
### Changed
 - Upgraded to [brighterscript@0.10.4](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0104---2020-05-28)
### Fixed
 - (LanguageServer) `CreateObject("roRegex")` with third parameter caused compile error ([BrighterScript#95](https://github.com/rokucommunity/brighterscript/issues/95))
 - (BrighterScript) flag parameter with same name as namespace
 - (BrighterScript) flag variable with same name as namespace



## [2.2.0] - 2020-05-27
[2.2.0]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.1.23...v2.2.0
### Added
 - commands to show preview of transpiled BrighterScript (`brighterscript.showPreview` and `brighterscript.showPreviewToSide`);
### Changed
 - Upgraded to [brighterscript@0.10.3](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0103---2020-05-27)



## [2.1.23] - 2020-05-20
[2.1.23]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.1.22...v2.1.23
### Changed
 - disabled `formatMultiLineObjectsAndArrays` by default because it has a bug. Will re-enable in the future when that option gets fixed.



## [2.1.22] - 2020-05-20
[2.1.22]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.1.21...v2.1.22
### Added
 - (BRS/BS formatter) new option `formatMultiLineObjectsAndArrays` which inserts newlines and indents multi-line objects and arrays



## [2.1.21] - 2020-05-20
[2.1.21]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.1.20...v2.1.21
### Added
 - (BRS/BS Formatter) new option `insertSpaceAfterOpeningAndBeforeClosingNonemptyBraces` which...does what it says. ([brighterscript-formatter#16](https://github.com/rokucommunity/brighterscript-formatter/issues/16)
### Changed
 - Upgraded to [brighterscript-formatter@1.2.0](https://github.com/rokucommunity/brighterscript-formatter/blob/master/CHANGELOG.md#120---2020-05-20) 
 - missing launch.json schema information for `enableDebugProtocol`
### Fixed
 - issue where somehow BrighterScript got moved from a dependency into a devDependency, causing the entire package to be excluded from the extension. ([#244](https://github.com/rokucommunity/vscode-brightscript-language/issues/244))
 - incorrect indent when using `class`, `endclass`, `namespace`, `endnamespace` as an object property ([brighterscript-formatter#18](https://github.com/rokucommunity/brighterscript-formatter/issues/18))



## [2.1.20] - 2020-05-19
[2.1.20]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.1.19...v2.1.20
### Added
 - (BrighterScript) parser support for the new [callfunc operator](https://github.com/rokucommunity/brighterscript/blob/master/docs/callfunc-operator.md)
### Changed
 - Upgraded to [brighterscript@0.10.0](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#0100)



## [2.1.19] - 2020-05-16
[2.1.19]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.1.18...v2.1.19
### Changed
 - Upgraded to [brighterscript@0.9.8](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#098---2020-05-16)
### Fixed
 - timing bugs in the language server on first parse that would randomly show errors during startup
 - (BrighterScript) some bugs related to import statements not being properly traced.



## [2.1.18] - 2020-05-14
[2.1.18]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.1.17...v2.1.18
### Changed
 - Upgraded to [brighterscript@0.9.7](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#097---2020-05-14) 
 - BrighterScript TypeScript compile targets "ES2017" which provides a signifiant performance boost in lexer (~30%) and parser (~175%)
### Fixed
 - (LanguageServer) false negative diagnostic when using the `new` keyword as a local variable [#79](https://github.com/rokucommunity/brighterscript/issues/79)



## [2.1.17] - 2020-05-14
[2.1.17]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.1.16...v2.1.17
### Changed
 - Upgraded to [brighterscript-formatter@1.1.8](https://github.com/rokucommunity/brighterscript-formatter/blob/master/CHANGELOG.md#118) 
### Fixed
 - formatter bug that would incorrectly add spacing between a negative sign and a number if it's the first entry in an array ([brighterscript-formatter#14](https://github.com/rokucommunity/brighterscript-formatter/issues/14))
 - formatter bug that would incorrectly add spacing to the left of a negative sign if preceeded by a left curly bracket or left paren.  
 - (formatter) Prevent indent after lines with indexed getter function call (i.e. `someObj[someKey]()`) ([brighterscript-formatter#15](https://github.com/rokucommunity/brighterscript-formatter/issues/15))



## [2.1.16] - 2020-05-11
[2.1.16]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.1.15...v2.1.16
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
[2.1.15]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.1.14...v2.1.15
### Changed
  - Upgraded to [brighterscript@0.9.5](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#095) 
### Fixed
  - bug in LanguageServer that was printing diagnostics to the console when it shouldn't be.



## [2.1.14] - 2020-05-05
[2.1.14]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.1.13...v2.1.14
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
[2.1.13]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.1.12...v2.1.13
### Changed
 - Upgraded to [brighterscript-formatter@1.1.6](https://github.com/rokucommunity/brighterscript-formatter/blob/master/CHANGELOG.md#116---2020-05-04)
### Fixed
 - issue where object properties named `next` would incorrectly cause a de-indent ([brighterscript-formatter#12](https://github.com/rokucommunity/brighterscript-formatter/issues/12))



## [2.1.12] - 2020-05-04
[2.1.12]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.1.11...v2.1.12
### Changed
 - Upgraded to [brighterscript@0.9.3](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#093---2020-05-04) 
 - do not show BRS1013 for standalone files ([brighterscript#72](https://github.com/rokucommunity/brighterscript/issues/72))
 - BS1011 (same name as global function) is no longer shown for local variables that are not of type function ([brighterscript#70](https://github.com/rokucommunity/brighterscript/issues/70))
### Fixed
 - issue that prevented certain keywords from being used as function parameter names ([brighterscript#69](https://github.com/rokucommunity/brighterscript/issues/69))



## [2.1.11] - 2020-05-02
[2.1.11]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.1.10...v2.1.11
### Changed
 - Upgraded to [brighterscript@0.9.2](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#092---2020-05-02) 
 - Include keywords in intellisense anywhere other than next to a dot ([brighterscript#67](https://github.com/rokucommunity/brighterscript/issues/67))

### Fixed
 - colorization of the `new` keyword in BrighterScript
 - Bug in LanguageServer that would show parse errors for functions named `constructor`([brighterscript#66](https://github.com/rokucommunity/brighterscript/issues/66))
 - bug when printing diagnostics that would sometimes fail to find the line in question `([brighterscript#68](https://github.com/rokucommunity/brighterscript/issues/68))
 - Some performance issues during typing caused by the LanguageServer validating too frequently.



## [2.1.10] - 2020-05-01
[2.1.10]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.1.9...v2.1.10
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
[2.1.9]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.1.8...v2.1.9
### Changed
 - Upgraded to [brighterscript@0.8.2](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#082---2020-04-29) 
 - Upgraded to [brighterscript-formatter@1.1.2](https://github.com/rokucommunity/brighterscript-formatter/blob/master/CHANGELOG.md#112---2020-04-29)
### Fixed
 - bugs in class field initialization
 - bug preventing class fields from being named certain keywords. Now they can.



## [2.1.8] - 2020-04-27
[2.1.8]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.1.7...v2.1.8
### Changed
 - Upgraded to [brighterscript@0.8.1](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#072---2020-04-24) 
 - Upgraded to [brighterscript-formatter@1.1.1](https://github.com/rokucommunity/brighterscript-formatter/blob/master/CHANGELOG.md#111---2020-04-27)
### Fixed
 - incorrect syntax highlighting for commented-out `end if` statement. 
 - colorize class fields
### Fixed
 - formatter bug that was de-indenting `for each` loop bodies and everything after.



## [2.1.7] - 2020-04-24
[2.1.7]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.1.6...v2.1.7
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
[2.1.6]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.1.5...v2.1.6
### Added
 - syntax highlighting for `import` and `namespace`
### Changed
 - upgraded to [roku-debug@0.3.6](https://www.npmjs.com/package/roku-debug/v/0.3.6) which fixed a bug in the new BrightScript debug protocol that would sometimes crash during launch.



## [2.1.5] - 2020-04-15
[2.1.5]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.1.4...v2.1.5
### Added
 - (LanguageServer) ability to filter out diagnostics by using the `diagnosticFilters` option in bsconfig
### Changed
 - upgraded to [brighterscript@0.6.0](https://github.com/rokucommunity/brighterscript/releases/tag/v0.6.0) 
 - (LanguageServer depricated the `ignoreErrorCodes` in favor of `diagnosticFilters`
### Fixed
 - (LanguageServer) Bug in the language server that wasn't reloading the project when changing the `bsconfig.json`



## [2.1.4] - 2020-04-14
[2.1.4]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.1.3...v2.1.4
### Changed
 - upgraded to [brighterscript@0.5.4](https://github.com/rokucommunity/brighterscript/releases/tag/v0.5.4) which fixed a syntax bug, now allowing the use of a period before an indexed getter (i.e. `object.["key]"`). It



## [2.1.3] - 2020-04-12
[2.1.3]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.1.2...v2.1.3
### Changed
 - upgraded to [brighterscript@0.5.3](https://github.com/rokucommunity/brighterscript/releases/tag/v0.5.3) which fixed several syntax errors during brighscript file parsing. 



## [2.1.2] - 2020-04-11
[2.1.2]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.1.1...v2.1.2
### Changed
 - upgraded to [brighterscript@0.5.2](https://github.com/rokucommunity/brighterscript/releases/tag/v0.5.2)
 - upgraded to [roku-debug@0.3.5](https://www.npmjs.com/package/roku-debug/v/0.3.5)
 - upgraded to [roku-deploy@3.0.2](https://www.npmjs.com/package/roku-deploy/v/3.0.2) which fixed a file copy bug in subdirectories of symlinked folders
 - (LanguageServer) downgrade diagnostic issue 1007 from an error to a warning, and updated the message to "Component is mising "extends" attribute and will automatically extend "Group" by default". ([BrighterScript#53](https://github.com/rokucommunity/brighterscript/issues/53))
### Fixed
 - (LanguageServer) Prevent xml files found outside of the `pkg:/components` folder from being parsed and validated. ([BrighterScript#51](https://github.com/rokucommunity/brighterscript/issues/51))
 - (LanguageServer) allow empty `elseif` and `else` blocks. ([BrighterScript#48](https://github.com/rokucommunity/brighterscript/issues/48))



## [2.1.1] - 2020-04-10
[2.1.1]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.1.0...v2.1.1
### Added
- several new diagnostics for conditional compiles. Some of them allow the parser to recover and continue. (BrightScript/BrighterScript) 
### Changed
 - upgraded to [brighterscript@0.5.0](https://github.com/rokucommunity/brighterscript/releases/tag/v0.5.0)
 - parser diagnostics have been broken out into their own error codes, removing the use of error code 1000 for a generic catch-all. That code still exists and will hold runtime errors from the parser. (BrightScript/BrighterScript) 
### Fixed
 - (LanguageServer) bug in parser that was flagging the new class keywords (`new`, `class`, `public`, `protected`, `private`, `override`) as parse errors. These are now allowed as both local variables and property names.



## [2.1.0] - 2020-04-07
[2.1.0]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.0.0...v2.1.0
### Added
 - Support for the [BrightScript debug protocol](https://developer.roku.com/en-ca/docs/developer-program/debugging/socket-based-debugger.md). It's disabled by default, but can be enabled by setting `brightscript.debug.enableDebugProtocol` to `true` in your user settings or launch configuration.



## [2.0.0] - 2020-04-01
[2.0.0]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v1.23.0...v2.0.0
This is a summary of all changes between 1.23.0 and 2.0.0-beta.50
### Added
 - language server support, which includes intellisense and syntax checking for brightscript projects
 - flag to enable/disable the language server
 - DebugServer output channel for showing more details of the status of the debug server without cluttering the main BrightScript log output 



## [2.0.0-beta.50] - 2020-03-25
[2.0.0-beta.50]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.0.0-beta.49...v2.0.0-beta.50
### Added
 - flag to enable/disable the language server


## [2.0.0-beta.49] - 2020-03-07
[2.0.0-beta.49]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.0.0-beta.48...v2.0.0-beta.49
### Added
 - all changes from 1.23.0



## [2.0.0-beta.48] - 2020-02-26
[2.0.0-beta.48]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.0.0-beta.47...v2.0.0-beta.48
### Fixed
 - bug where no files would be copied to staging during the launch process.



## [2.0.0-beta.47] - 2020-02-26
[2.0.0-beta.47]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.0.0-beta.46...v2.0.0-beta.47
### Added
 - all changes from 1.22.0



## [2.0.0-beta.46] - 2020-02-18
[2.0.0-beta.46]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.0.0-beta.45...v2.0.0-beta.46
### Added
 - all changes from 1.21.3



## [2.0.0-beta.45] - 2020-01-22
[2.0.0-beta.45]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.0.0-beta.44...v2.0.0-beta.45
### Fixed
 - performance issue where projects including component libraries were writing to the filesystem too frequently, causing very slow build times. [#217](https://github.com/rokucommunity/vscode-brightscript-language/pull/217)



## [2.0.0-beta.44] - 2020-01-15
[2.0.0-beta.44]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.0.0-beta.43...v2.0.0-beta.44
### Fixed
 - issue where the extension was still using [roku-deploy@3.0.0-beta.5](https://github.com/rokucommunity/roku-deploy/releases/tag/v3.0.0-beta.5). The extension now uses  [roku-deploy@3.0.0-beta.7](https://github.com/rokucommunity/roku-deploy/releases/tag/v3.0.0-beta.7)



## [2.0.0-beta.43] - 2020-01-11
[2.0.0-beta.43]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.0.0-beta.42...v2.0.0-beta.43
### Added
 - DebugServer output channel for showing more details of the status of the debug server without cluttering the main BrightScript log output 
### Updated
 - use [roku-deploy@3.0.0-beta.7](https://github.com/rokucommunity/roku-deploy/releases/tag/v3.0.0-beta.7) which fixes bug during file copy that was not prepending `stagingFolderPath` to certain file operations.
 - use [brighterscript@0.4.0](https://github.com/rokucommunity/brighterscript/releases/tag/v0.4.0) updates to [roku-deploy@3.0.0-beta.7](https://github.com/rokucommunity/roku-deploy/releases/tag/v3.0.0-beta.7)



## [2.0.0-beta.42] - 2020-01-07
[2.0.0-beta.42]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.0.0-beta.41...v2.0.0-beta.42
### Updated
 - [brighterscript@0.4.0](https://github.com/rokucommunity/brighterscript/releases/tag/v0.4.0) which fixes [these issues](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#040---2020-01-07);



## [2.0.0-beta.41] - 2019-11-08
[2.0.0-beta.41]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.0.0-beta.40...v2.0.0-beta.41
### Updated
 - [brighterscript@0.3.1](https://github.com/rokucommunity/brighterscript/releases/tag/v0.3.1) which fixes [these issues](https://github.com/rokucommunity/brighterscript/blob/master/CHANGELOG.md#031---2019-11-08).



## [2.0.0-beta.40] - 2019-10-30
[2.0.0-beta.40]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.0.0-beta.39...v2.0.0-beta.40
### Added
 - all changes from 1.20.3



## [2.0.0-beta.39] - 2019-10-21
[2.0.0-beta.39]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.0.0-beta.38...v2.0.0-beta.39
### Added
 - all changes from 1.20.2



## [2.0.0-beta.38] - 2019-10-03
[2.0.0-beta.38]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.0.0-beta.37...v2.0.0-beta.38
### Added
 - all changes from 1.20.0
### Changed
 - upgraded to [brighterscript@0.3.0](https://www.npmjs.com/package/brighterscript/v/0.3.0) which fixes parse error related to comments inside of associative array literals, and supports parsing opened files that are not included in a `bsconfig.json` file



## [2.0.0-beta.37] - 2019-10-01
[2.0.0-beta.37]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.0.0-beta.36...v2.0.0-beta.37
### Added
  - all changes from 1.20.0



## [2.0.0-beta.36] - 2019-09-28
[2.0.0-beta.36]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.0.0-beta.35...v2.0.0-beta.36
### Changed
 - upgraded to [brighterscript@0.2.2](https://www.npmjs.com/package/brighterscript/v/0.2.2) which fixes several startup race conditions.



## [2.0.0-beta.35] - 2019-09-24
[2.0.0-beta.35]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.0.0-beta.34...v2.0.0-beta.35
### Added
 - all changes from 1.19.0 through 1.19.6
### Changed
 - Enhanced intellisense to scan all files in context to provide more accurate results for object property completions.
 - Enhanced intellisense that filters results based on whether you typing an object proeprty/method or not.
 - switched languageserver to use [brighterscript](https://github.com/RokuCommunity/brighterscript). This is the first step towards support the BrighterScript language.
### Fixed
 - bug that would not register new files until a vscode restart.



## [1.23.0] - 2020-03-06
[1.23.0]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v1.22.0...v1.23.0
### Added
 - support for file-system logging of the BrightScript and debug output channels. (`brightscript.debug.logfilePath` in user/workspace settings or `logfilePath` in `launch.json`) (#216)



## [1.22.0] - 2020-02-25
[1.22.0]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v1.21.3...v1.22.0
### Added
 - source map support during debugging. See the sourcemap section of the README for more information.
 - support for `sourceDirs` for component libraries
 - ability to set any default launch config settings in user/workspace settings under `brightscript.debug.launchConfigValueHere`. There is not full validation for these yet, but the logic is already in place to use them.
### Changed
 - setting `brightscript.rokuAdvancedLayoutEditor.trackerTaskFileLocation` has been depricated and replaced with `brightscript.debug.raleTrackerTaskFileLocation`



## [1.21.3] - 2020-02-18
[1.21.3]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v1.21.2...v1.21.3
### Fixed
 - set many default config values so .env file works better. (#215)
 - Speed up RALE insertion (#218)



## [1.21.2] - 2020-01-22
[1.21.2]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v1.21.1...v1.21.2
### Fixed
 - performance issue where projects including component libraries were writing to the filesystem too frequently, causing very slow build times. [#217](https://github.com/rokucommunity/vscode-brightscript-language/pull/217)



## [1.21.1] - 2019-12-20
[1.21.1]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v1.21.0...v1.21.1
### Changed
 - upgraded to [roku-deploy@2.6.1](https://github.com/rokucommunity/roku-deploy/tree/v2.6.1)



## [1.21.0] - 2019-12-08
[1.21.0]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v1.20.3...v1.21.0
### Added
 - option to use an alternate port when publishing a package to a Roku. This is mainly useful for publishing to an emulator an alternate port through port-forwarding. 
### Changed
 - upgraded to [roku-deploy@2.6.0](https://github.com/rokucommunity/roku-deploy/tree/v2.6.0)



## [1.20.3] - 2019-10-21
[1.20.3]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v1.20.2...v1.20.3
### Fixed
 - bug in debugger that would fail to identify empty arrays and associative arrays.



## [1.20.2] - 2019-10-21
[1.20.2]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v1.20.1...v1.20.2
### Fixed
 - bug in the parsing of the file paths on the device as of Roku FW 9.2 causing the opening of Component Library file to fail on runtime crashes and break points.



## [1.20.1] - 2019-10-03
[1.20.1]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v1.20.0...v1.20.1
### Fixed
 - bug in the "port is in use" crash message detection (it wasn't awaiting an async call which was causing intermittent errors).
 - bug in the componentLibrary `files` JSON schema that wasn't allowing `{src;dest}` objects.



## [1.20.0] - 2019-10-01
[1.20.0]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v1.19.6...v1.20.0
### Added
 - "port is in use" crash message when serving component libraries
### Changed
 - The Roku stacktrace includes all function names back as fully lower case. The extension reads the original files and attempts to find the correct case for every function. These results were not being cached, but are now cached in order to improve performance.
### Fixed
 - some syntax colors related to object function calls



## [1.19.6] - 2019-09-23
[1.19.6]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v1.19.5...v1.19.6
### Fixed
 - bugs in language grammar (syntax highlighting)



## [1.19.5] - 2019-09-20
[1.19.5]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v1.19.4...v1.19.5
### Fixed
 - issue where part of the debug crash output was not being logged to the console (see [#198](https://github.com/rokucommunity/vscode-brightscript-language/pull/198))


## [1.19.4] - 2019-09-19
[1.19.4]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v1.19.3...v1.19.4
### Changed
 - upgraded to [brighterscript-formatter](https://www.npmjs.com/package/brighterscript-formatter)@1.0.2
### Fixed
 - formatting bug where, if a line ended with `end` (even property names), the following lines would all be de-indented



## [1.19.3] - 2019-09-18
[1.19.3]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v1.19.2...v1.19.3
### Fixed
 - added format-document support for BrighterScript files.



## [1.19.2] - 2019-09-17
[1.19.2]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v1.19.1...v1.19.2
### Changed
 - migrated from [brightscript-formatter](https://www.npmjs.com/package/brightscript-formatter) to [brighterscript-formatter](https://www.npmjs.com/package/brighterscript-formatter). `brighterscript-formatter` fully supports formatting standard BrightScript code, so there's no lost functionality by upgrading.
### Fixed
 - syntax colorization of `library` and `sub`


## [1.19.1] - 2019-09-17
[1.19.1]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v1.19.0...v1.19.1
### Changed
 - .env files are processed closer to the beginning of the config resolve function, which allows users to customize which prompts they want to see.



## [1.19.0] - 2019-09-16
[1.19.0]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v1.18.2...v1.19.0
### Changed
 - location of repository is now https://github.com/RokuCommunity/vscode-brightscript-language
 - removed experimental flag `enableLookupVariableNodeChildren` because it is now enabled by default.
### Fixed
 - many bugs related to inspecting large arrays/objects on the Roku during debugging. (see [#152](https://github.com/RokuCommunity/vscode-brightscript-language/issues/152))



## [2.0.0-beta.34] - 2019-08-19
[2.0.0-beta.34]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.0.0-beta.33...v2.0.0-beta.34
### Changed
 - upgraded to [brightscript-language@0.2.15](https://www.npmjs.com/package/brightscript-language/v/0.2.15)
### Fixed
 - issue with syntax highlighting while hovering over variables in `.brs` files (fixed by upgrading [brightscript-language@0.2.15](https://www.npmjs.com/package/brightscript-language/v/0.2.15))



## [2.0.0-beta.33] - 2019-08-09
[2.0.0-beta.33]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.0.0-beta.32...v2.0.0-beta.33
### Fixed
 - issue that was crashing every debug session before it started.



## [2.0.0-beta.32] - 2019-08-07
[2.0.0-beta.32]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.0.0-beta.31...v2.0.0-beta.32
### Added
 - all changes from [v1.18.2](#1182---2019-08-07)
### Changed
 - upgraded to [brightscript-language@0.2.14](https://www.npmjs.com/package/brightscript-language/v/0.2.14)



## [2.0.0-beta.31] - 2019-08-03
[2.0.0-beta.31]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.0.0-beta.30...v2.0.0-beta.31
### Added
 - all changes from [v1.18.1](#1181---2019-08-03)



## [2.0.0-beta.30] - 2019-08-02
[2.0.0-beta.30]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.0.0-beta.29...v2.0.0-beta.30
### Added
 - all changes from [v1.18.0](#1180---2019-08-02)



## [2.0.0-beta.30] - 2019-06-21
[2.0.0-beta.29]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.0.0-beta.28...v2.0.0-beta.29
### Added
 - all changes from [v1.17.1](#1171---2019-06-21)



## [2.0.0-beta.28] - 2019-06-18
[2.0.0-beta.28]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.0.0-beta.27...v2.0.0-beta.28
### Added
 - all changes from [v1.17.0](#1170---2019-06-18)



## [2.0.0-beta.27] - 2019-06-13
[2.0.0-beta.27]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.0.0-beta.26...v2.0.0-beta.27
### Added
 - upgraded to [brightscript-language@0.2.13](https://www.npmjs.com/package/brightscript-language/v/0.2.13) which:
   - syntax support for `GOTO` and labels [brs#248](https://github.com/sjbarag/brs/pull/248)



## [2.0.0-beta.26] - 2019-06-11
[2.0.0-beta.26]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.0.0-beta.25...v2.0.0-beta.26
### Added
 - all changes from [v1.16.0](#1160---2019-06-11)



## [2.0.0-beta.25] - 2019-05-31
[2.0.0-beta.25]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.0.0-beta.24...v2.0.0-beta.25
### Fixed
 - upgraded to [brightscript-language@0.2.12](https://www.npmjs.com/package/brightscript-language/v/0.2.12) which:
   - prevent compile errors for conditional compile statements
   - syntax support for single-word `#elseif` and `#endif` [brs#249](https://github.com/sjbarag/brs/pull/249)
   - syntax support for `stop` statements [brs#247](https://github.com/sjbarag/brs/pull/247)
   - syntax support for empty `print` statements [brs#264](https://github.com/sjbarag/brs/pull/246)



## [2.0.0-beta.24] - 2019-05-28
[2.0.0-beta.24]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.0.0-beta.23...v2.0.0-beta.24
### Added
 - all changes from [v1.15.0](#1150---2019-05-28)
### Changed
 - upgraded to [brightscript-language@0.2.11](https://www.npmjs.com/package/brightscript-language/v/0.2.11) which:
  - syntax support for LINE_NUM variable



## [2.0.0-beta.23] - 2019-05-23
[2.0.0-beta.23]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.0.0-beta.22...v2.0.0-beta.23
### Changed
 - upgraded to [brightscript-language@0.2.10](https://www.npmjs.com/package/brightscript-language/v/0.2.10) which:
   - adds syntax support for trailing colons in if statements



## [2.0.0-beta.22] - 2019-05-22
[2.0.0-beta.22]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.0.0-beta.21...v2.0.0-beta.22
### Changed
 - upgraded to [brightscript-language@0.2.9](https://www.npmjs.com/package/brightscript-language/v/0.2.9) which:
   - added syntax support for numbers with leading or trailing period
   - added `&` as supported type designator for identifiers



## [2.0.0-beta.21] - 2019-05-14
[2.0.0-beta.21]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.0.0-beta.20...v2.0.0-beta.21
### Added
 - all changes from [v1.14.0](#1140---2019-05-14)
### Changed
 - upgraded to [brightscript-language@0.2.8](https://www.npmjs.com/package/brightscript-language/v/0.2.8) which:
   - adds syntax support for library statements



## [2.0.0-beta.20] - 2019-05-07
[2.0.0-beta.20]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.0.0-beta.19...v2.0.0-beta.20
### Changed
 - upgraded to [brightscript-language@0.2.7](https://www.npmjs.com/package/brightscript-language/v/0.2.7) which:
   - fixes many syntax errors related to using keywords as property names.
   - adds support for hex literals
### Fixed
 - bug in syntax highlighting that was showing keyword colors for object properties with keyword names.



## [2.0.0-beta.19] - 2019-05-01
[2.0.0-beta.19]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.0.0-beta.18...v2.0.0-beta.19
### Changed
 - upgraded to [brightscript-language@0.2.6](https://www.npmjs.com/package/brightscript-language/v/0.2.6) which removes error for subs with return types ([brs#220](https://github.com/sjbarag/brs/issues/220))



## [2.0.0-beta.18] - 2019-04-30
[2.0.0-beta.18]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.0.0-beta.17...v2.0.0-beta.18
### Changed
 - upgraded to [brightscript-language@0.2.5](https://www.npmjs.com/package/brightscript-language/v/0.2.6) which brings syntax support for increment (++) and decrement (--) operators.



## [2.0.0-beta.17] - 2019-04-26
[2.0.0-beta.17]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.0.0-beta.16...v2.0.0-beta.17
### Added
 - all changes from [v1.13.1](#1131---2019-04-26)



## [2.0.0-beta.16] - 2019-04-19
[2.0.0-beta.16]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.0.0-beta.15...v2.0.0-beta.16
### Added
 - all changes from [v1.13.0](#1130---2019-04-19)



## [2.0.0-beta.15] - 2019-04-11
[2.0.0-beta.15]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.0.0-beta.14...v2.0.0-beta.15
### Added
 - all changes from [v1.12.0](#1120---2019-04-09) and [v1.12.1](#1121---2019-04-11)



## [2.0.0-beta.14] - 2019-03-21
[2.0.0-beta.14]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.0.0-beta.13...v2.0.0-beta.14
### Added
 - all changes from [v1.11.0](#1110---2019-04-01)



## [2.0.0-beta.13] - 2019-03-21
[2.0.0-beta.13]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.0.0-beta.12...v2.0.0-beta.13
### Changed
 - upgraded to [brightscript-language@0.2.4](https://github.com/RokuCommunity/brightscript-language/tree/v0.2.4)
### Fixed
 - greatly improved single-line recovery. Previously, certain syntax errors would prevent the rest of the block or file from parsing. The parser will now skip erraneous lines and attempt to recover. This _usually_ provides much better error recovery, but in certain cases can produce additional errors in the file.
 - bitshift assignment operators (`>>=` `<<=`) no longer cause parse errors
 - using colons as separators for associate arrays no longer cause parse errors (e.g `obj = {x:0 : y: 1}`)



## [2.0.0-beta.12] - 2019-03-21
[2.0.0-beta.12]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.0.0-beta.11...v2.0.0-beta.12
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
[2.0.0-beta.11]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.0.0-beta.10...v2.0.0-beta.11
### Added
 - Support for `go to definition` to open parent component xml file when the cursor is on a component's `extends="ParentName"` section (fixes #114).
### Fixed
 - Syntax colorization for multi-word keywords like endfor, endif, elseif, etc. that were not supporting zero spaces between or more than 1 space between.



## [2.0.0-beta.10] - 2019-03-12
[2.0.0-beta.10]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.0.0-beta.9...v2.0.0-beta.10
### Added
 - Upgraded to [brightscript-language@0.1.21](https://github.com/RokuCommunity/brightscript-language/tree/v0.1.21) which brought support for supressing errors using a comment
### Fixed
 - regression issue preventing the use of launch configs stored `settings.json` (see #111)



## [2.0.0-beta.9] - 2019-03-11
[2.0.0-beta.9]:  https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.0.0-beta.8...v2.0.0-beta.9
### Fixed
 - Upgraded to [brightscript-language@0.1.20](https://github.com/RokuCommunity/brightscript-language/tree/v0.1.20) which fixed an npm issue that was loading the wrong version of `brs`.



## [2.0.0-beta.8] - 2019-03-10
[2.0.0-beta.8]:  https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.0.0-beta.7...v2.0.0-beta.8
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
[2.0.0-beta.7]:  https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.0.0-beta.6...v2.0.0-beta.7
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
[2.0.0-beta.6]:  https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.0.0-beta.5...v2.0.0-beta.6
### Added
 - All changes from [1.8.3](#183---2019-03-04)
### Fixed
 - syntax highlighting bug related to `then` not colorizing when containing any upper case character
 - the `MaxListenersExceededWarning` warning by upgrading to [brightscript-language@0.1.15](https://github.com/RokuCommunity/brightscript-language/tree/v0.1.15)



## [2.0.0-beta.5] - 2019-03-03
[2.0.0-beta.5]:  https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.0.0-beta.4...v2.0.0-beta.5
### Changed
 - Upgraded to [brightscript-language@0.1.14](https://github.com/RokuCommunity/brightscript-language/tree/v0.1.14) that brings syntax fixes for using `then` as an object property name and now allows `function` as an argument type.
### Fixed
 - textmate grammar related to `run`, `stop`, and `then` when used as object property names



### [2.0.0-beta.4] - 2019-02-25
[2.0.0-beta.4]:  https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.0.0-beta.3...v2.0.0-beta.4
### Changed
 - Upgraded to [brightscript-language@0.1.13](https://github.com/RokuCommunity/brightscript-language/tree/v0.1.13) which fixes duplicate diagnostic reporting



## [2.0.0-beta.3] - 2019-02-25
[2.0.0-beta.3]:  https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.0.0-beta.2...v2.0.0-beta.3
### Fixed
 - bugs with errors showing up for script imports inside of comments.



## [2.0.0-beta.2] - 2019-02-24
[2.0.0-beta.2]:  https://github.com/RokuCommunity/vscode-brightscript-language/compare/v2.0.0-beta.1...v2.0.0-beta.2
### Changed
 - Upgraded to latest `brightscript` project, which fixes bitshift assignment operators and `stop` and `run` keywords on object literals.



## [2.0.0-beta.1] - 2019-02-20
[2.0.0-beta.1]:  https://github.com/RokuCommunity/vscode-brightscript-language/compare/v1.8.2...v2.0.0-beta.1
### Added
 - Experimental language validation support. Catches most parse errors and a few basic language errors.




## [1.18.2] - 2019-08-07
[1.18.2]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v1.18.1...v1.18.2
### Changed
 - upgrade to roku-deploy@2.2.1 which fixes manifest parsing bug related to colors starting with `#`.



## [1.18.1] - 2019-08-03
[1.18.1]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v1.18.0...v1.18.1
### Fixed
 - issue where the RALE Tracker Task injection logic was enabled by default.



## [1.18.0] - 2019-08-02
[1.18.0]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v1.17.1...v1.18.0
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
[1.17.1]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v1.17.0...v1.17.1
### Fixed
 - regression issue with `formatIndent`



## [1.17.0] - 2019-06-18
[1.17.0]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v1.16.0...v1.17.0
### Added
 - support for hosting and debugging component libraries. ([#161](https://github.com/RokuCommunity/vscode-brightscript-language/pull/161))
 - Dropdown during launch allowing you to pick from a list of Rokus found on local network. ([#156](https://github.com/RokuCommunity/vscode-brightscript-language/pull/156))
 - Upgraded to brightscript-formatter@1.6.0, and added new extension settings:
   - brightscript.format.formatInteriorWhitespace
   - brightscript.format.insertSpaceBeforeFunctionParenthesis
   - brightscript.format.insertSpaceBetweenEmptyCurlyBraces



## [1.16.0] - 2019-06-11
[1.16.0]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v1.15.0...v1.16.0
### Added
 - added launch config setting `stopDebuggerOnAppExit` which monitors the console output, and automatically ends the debug session when detected.
 - added launch config setting `enableLookupVariableNodeChildren` that, if true, will get all children of a node, when the value is displayed in a debug session, and display it in the virtual `_children` field
 - added extension setting `brightscript.output.clearConsoleOnChannelStart` that allows you to clear/not clear the initial roku compile console output.
 -  resolving children of nodes variables
### Fixed
 - bug that would cause debug session crashes when inspecting a `roList` variable ([#155](https://github.com/RokuCommunity/vscode-brightscript-language/issues/155))



## [1.15.0] - 2019-05-28
[1.15.0]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v1.14.0...v1.15.0
### Added
 - support for foldable regions by typing `'#region` and `'#endregion`
 - added syntax colorization for `#region` and `#endregion`



## [1.14.0] - 2019-05-14
[1.14.0]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v1.13.1...v1.14.0
### Changed
 - default value of debug configuration setting `stopOnEntry` to false.
### Fixed
 - bug that wouldn't support launching screen savers due to not looking for `RunScreenSaver` entry point.



## [1.13.1] - 2019-04-26
[1.13.1]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v1.13.0...v1.13.1
### Fixed
 - bug in the run loop break recovery section that was not resetting certain variables, which was requiring a vscode reboot to fix.



## [1.13.0] - 2019-04-19
[1.13.0]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v1.12.1...v1.13.0
### Added
 - `sourceDirs` launch config setting that enables the debugger to search through each entry in `sourceDirs` until it finds a relative file path that matches the file currently being debugged. (#130)
 - deep link / ECP support when launching a debug session. Use the `deepLinkUrl` property in your `launch.json` (#4)
### Depricated
 - `debugRootDir` launch config setting. Use the new `sourceDirs` setting instead. (#130)
### Fixed
 - Bugs in hover and locals that would not show the full variable name (#137).



## [1.12.1] - 2019-04-11
[1.12.1]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v1.12.0...v1.12.1
### Fixed
 - issue where vscode would periodically provide different character casing for workspaceFolder than for full file paths, which would prevent launching a debug session
 - Remove excess spacing in logpoint output



## [1.12.0] - 2019-04-09
[1.12.0]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v1.11.0...v1.12.0
### Added
 - conditional breakpoint support
 - logpoint support
 - hit count breakpoint support



## [1.11.0] - 2019-04-01
[1.11.0]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v1.10.0...v1.11.0
### Added
 - ability to recover from roku run loop break issues that would previously cause many debug sessions to completely bomb. Set `enableDebuggerAutoRecovery` to true to opt-in to this feature. See #129 for more information
 - ability to change the presentation of package path hyperlinks in the BrightScript output log. See #128 for more information.



## [1.10.0] - 2019-03-21
[1.10.0]: https://github.com/RokuCommunity/vscode-brightscript-language/compare/v1.9.0...v1.10.0
### Added
 - Completion items for all BrightScript interface methods except for a few more obscure ones (#68). These can be activated by typing the full interface name after the variable (i.e. )
### Fixed
 - problems launching a debug session when the Roku has an app already running that is stuck in the debug state. This extension now issues several `exit` commands in a row (in addition to the home press it was already doing) which seems to resolve the majority of those issues. (#125)



## [1.9.0] - 2019-03-19
[1.9.0]:  https://github.com/RokuCommunity/vscode-brightscript-language/compare/v1.8.6...v1.9.0
### Added
 - Support for the `vars` panel during a debug session. This can be disabled by setting `enableVariablesPanel: false` in the `launch.json` configuration.
### Fixed
 - Syntax highlighting issues
   - variable names with type designators are colored properly
   - `endsub` and `endfunction` are colored properly
   - `end` is colored properly as a standalone command
   - various two word keywords now support no space or multiple spaces between (previously needed exactly 1 space between then)



## [1.8.6] - 2019-03-09
[1.8.6]:  https://github.com/RokuCommunity/vscode-brightscript-language/compare/v1.8.5...v1.8.6
### Fixed
 - launching debug session without a `launch.json` works again.



## [1.8.5] - 2019-03-07
[1.8.5]:  https://github.com/RokuCommunity/vscode-brightscript-language/compare/v1.8.4...v1.8.5
### Fixed
 - Re-added the log commands that somehow got dropped in a previous release



## [1.8.4] - 2019-03-04
[1.8.4]:  https://github.com/RokuCommunity/vscode-brightscript-language/compare/v1.8.3...v1.8.4
### Fixed
 - Regression syntax highlighting issue that was not correctly colorizing `then` in conditional statements if it contains any uppercase letters.



## [1.8.3] - 2019-03-04
[1.8.3]:  https://github.com/RokuCommunity/vscode-brightscript-language/compare/v1.8.2...v1.8.3
### Fixed
 - Several textmate grammar issues and added more variety in the captured tokens to provide better colorization



## [1.8.2] - 2019-01-27
[1.8.2]:  https://github.com/RokuCommunity/vscode-brightscript-language/compare/v1.8.1...v1.8.2
### Changed
 - Upgraded to [roku-deploy](https://www.npmjs.com/package/roku-deploy)@2.0.0 which brings support for dereferencing symbolic links, and copying files located outside of rootDir.



## [1.8.1] - 2019-01-25
[1.8.1]:  https://github.com/RokuCommunity/vscode-brightscript-language/compare/v1.8.0...v1.8.1
### Fixed
 - Issue in `Go to definition` that would not find functions/subs with a space between the name and the opening parenthesis ([#85](https://github.com/RokuCommunity/vscode-brightscript-language/issues/85))



## [1.8.0] - 2019-01-25
[1.8.0]:  https://github.com/RokuCommunity/vscode-brightscript-language/compare/v1.7.0...v1.8.0
### Added
 - Support for reading variables from a `.env` file in `launch.json` (see [this section](https://github.com/RokuCommunity/vscode-brightscript-language#config-file-for-user-specific-launch-settings) of the readme for more information)
### Fixed
 - Bug in `Go to definition` that wasn't finding function declarations with leading whitespace



## [1.7.0] - 2019-01-22
[1.7.0]:  https://github.com/RokuCommunity/vscode-brightscript-language/compare/v1.6.1...v1.7.0
### Added
 - Ability to click on `pkg:/` links in BrightScript output window to open that file at the specified line number.



## [1.6.1] - 2019-01-20
[1.6.1]:  https://github.com/RokuCommunity/vscode-brightscript-language/compare/v1.6.0...v1.6.1
### Fixed
 - Bug where the debugger would hang indefinitely on certain deployment errors.



## [1.6.0] - 2019-01-15
[1.6.0]:  https://github.com/RokuCommunity/vscode-brightscript-language/compare/v1.5.0...v1.6.0
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
[1.5.0]:  https://github.com/RokuCommunity/vscode-brightscript-language/compare/v1.4.2...v1.5.0
### Added
 - Ability to send remote control commands from the keyboard. See readme for more details.



## [1.4.2] - 2018-12-19
[1.4.2]:  https://github.com/RokuCommunity/vscode-brightscript-language/compare/v1.4.1...v1.4.2
### Changed
 - Upgraded to [roku-deploy](https://www.npmjs.com/package/roku-deploy) version 1.0.0 which brings `glob-all` support for negating globs.



## [1.4.1] - 2018-12-14
[1.4.1]:  https://github.com/RokuCommunity/vscode-brightscript-language/compare/v1.4.0...v1.4.1
### Fixed
 - Bug that was preventing debugger from working.



## [1.4.0] - 2018-12-10
[1.4.0]:  https://github.com/RokuCommunity/vscode-brightscript-language/compare/v1.3.2...v1.4.0
### Added
 - Basic goto declaration support in xml documents
 - Inline errors for compilation failures
 - BrightScript Log output window, which can have colors/searches applied to it
 - Basic message signature support
 - `Find usage` support for brs documents



## [1.3.2] - 2018-12-07
[1.3.2]:  https://github.com/RokuCommunity/vscode-brightscript-language/compare/v1.3.1...v1.3.2
### Fixed
 - Bug that was preventing using `function Main` as an entry function.



## [1.3.1] - 2018-12-05
[1.3.1]:  https://github.com/RokuCommunity/vscode-brightscript-language/compare/v1.3.0...v1.3.1
### Changed
 - Upgraded to [brightscript-formatter](https://www.npmjs.com/package/brightscript-formatter) version `1.5.0` which brings support for overriding keywordCase for specific keywords.

### Fixed
 - Bug introduced in [1.3.0](#130---2018-11-20) that was preventing a debug session from starting due to incorrect "out" path.



## [1.3.0] - 2018-11-20
[1.3.0]:  https://github.com/RokuCommunity/vscode-brightscript-language/compare/v1.2.2...v1.3.0
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
[1.2.2]:  https://github.com/RokuCommunity/vscode-brightscript-language/compare/v1.2.1...v1.2.2
 ### Changed
 - Upgraded to [brightscript-formatter](https://www.npmjs.com/package/brightscript-formatter) version `1.3.0` which brings support for formatting conditional compile statements.



## [1.2.1] - 2018-09-26
[1.2.1]:  https://github.com/RokuCommunity/vscode-brightscript-language/compare/v1.2.0...v1.2.1
### Changed
 - Upgraded to [roku-deploy](https://www.npmjs.com/package/roku-deploy) version `0.2.1` which removed some packages containing security vulnerabilities.



## [1.2.0] - 2018-09-26
[1.2.0]:  https://github.com/RokuCommunity/vscode-brightscript-language/compare/v1.1.0...v1.2.0
### Changed
 - Upgraded to [roku-deploy](https://www.npmjs.com/package/roku-deploy) version `0.2.0` which adds support for moving and renaming files during the packaging process (see [the files property](https://github.com/RokuCommunity/roku-deploy#options) for more details).



## [1.1.0] - 2018-07-11
[1.1.0]:  https://github.com/RokuCommunity/vscode-brightscript-language/compare/v1.0.1...v1.1.0
### Changed
 - Upgraded [brightscript-formatter](https://www.npmjs.com/package/brightscript-formatter) to version `1.2.0` which enables removing trailing whitespace when formatting.



## [1.0.1] - 2018-04-04
[1.0.1]:  https://github.com/RokuCommunity/vscode-brightscript-language/compare/v1.0.0...v1.0.1
### Fixed
 - Issue in debugger that was not properly handling truncated file paths received from Roku.



## [1.0.0] - 2018-03-16
[1.0.0]:  https://github.com/RokuCommunity/vscode-brightscript-language/compare/f3e1d91...v1.0.0
### Added
- Remote debugging support
- Code formatter

### Fixed
- Issues with language colorization
