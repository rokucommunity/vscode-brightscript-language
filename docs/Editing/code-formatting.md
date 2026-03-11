
# Code formatting
The extension provides code formatting for BrightScript and BrighterScript files. If you don't like the default formatter settings, you can customize them in three ways:
1. Update your user or workspace settings with various `brightscript.format.*` options (see the [extension settings](../extension-settings.html) page for more info).

2. Create a `bsfmt.json` file at the root of your project. See all of the available `bsfmt.json` options [here](https://github.com/rokucommunity/brighterscript-formatter#bsfmtjson-options). Please note, if a `bsfmt.json` file exists, all formatter-related user/workspace settings will be ignored.

3. Use the `brightscript.format.bsfmtPath` setting to specify a custom path to your bsfmt.json file. This can be an absolute path, or a path relative to the workspace folder. This is useful when you want to share a common formatting config file across multiple projects or have it in a non-standard location.
