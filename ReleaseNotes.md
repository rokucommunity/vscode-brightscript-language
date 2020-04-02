# Release Notes
Only notable releases will be tracked in this file. Please see the [CHANGELOG.md](CHANGELOG.md) for a comprehensive list of changes for each version. 

## 2.0.0
### roku-deploy
The extension now uses [roku-deploy version 3](https://www.npmjs.com/package/roku-deploy/v/3.0.0), which made some changes to the `files` array. Standard projects should be unaffected, but more advanced projects may require modifications to their `files` array. Please take a moment to review the new `files` specification [here](https://github.com/rokucommunity/roku-deploy#files-array). The most notable changes are:
 - Top-level string patterns may not reference files outside of `rootDir`. (You should use `{src;dest}` objects to accomplish this) 
 - Paths to folders will be ignored. If you want to copy a folder and its contents, use the glob syntax (i.e. `some_folder/**/*`)

### The LanguageServer
After being in beta for over a year, we are proud to announce that the language server is now enabled by default in the mainline version of the extension. Standard projects should work automatically, and several alternative project structures should also work with a minimal amount of configuration. (see the [README](README.md#language-features) about how customize the language server to your project's needs).

Under the hood, the language server is powered by the [Brighterscript](https://github.com/rokucommunity/brighterscript) language, which is a superset of BrightScript. Don't worry, you are not required to write any BrighterScript code, as it works just fine with standard BrightScript. 

The language server is still fairly new, and we expect there to be bugs. If you encounter errors for valid syntax, please file an issue. You can disable errors for a specific line by adding a comment above the erraneous line (full instructions [here](https://github.com/rokucommunity/brighterscript#ignore-errors-and-warnings-on-a-per-line-basis)). For example:

```BrightScript
'bs:disable-next-line
someLineWithError()
```
The primary motivation for the ignore feature was to provide a stopgap measure to hide incorrectly-thrown errors on legitimate brightscript code due to parser bugs. It is recommended that you only use these comments when absolutely necessary.

If all else fails, you can completely disable the language server by setting `"brightscript.enableLanguageServer":false` in your user/workspace settings. 


Please [let us know](https://github.com/rokucommunity/vscode-brightscript-language/issues/new) about any problems you find with the language server. 

