# BrightScript Language extension for VS Code

Write, run and debug Roku apps without leaving VS Code.

[![docs](https://img.shields.io/badge/docs-rokucommunity.github.io-662d91)](https://rokucommunity.github.io/vscode-brightscript-language/)
[![build status](https://img.shields.io/github/actions/workflow/status/rokucommunity/vscode-brightscript-language/build.yml?logo=github&branch=master)](https://github.com/rokucommunity/vscode-brightscript-language/actions/workflows/build.yml)
[![security](https://img.shields.io/github/actions/workflow/status/rokucommunity/vscode-brightscript-language/security-audit.yml?branch=master&label=security&logo=data:image/svg%2Bxml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxNiAxNiI+PHJlY3QgeD0iMyIgeT0iOCIgd2lkdGg9IjEwIiBoZWlnaHQ9IjciIHJ4PSIxIiBmaWxsPSJ3aGl0ZSIvPjxwYXRoIGQ9Ik01IDhWNWEzIDMgMCAwIDEgNiAwdjMiIGZpbGw9Im5vbmUiIHN0cm9rZT0id2hpdGUiIHN0cm9rZS13aWR0aD0iMiIvPjwvc3ZnPg==)](https://github.com/rokucommunity/vscode-brightscript-language/actions/workflows/security-audit.yml)
[![coverage status](https://img.shields.io/coveralls/github/rokucommunity/vscode-brightscript-language?logo=coveralls)](https://coveralls.io/github/rokucommunity/vscode-brightscript-language?branch=master)
[![Visual Studio Marketplace](https://vsmarketplacebadges.dev/installs-short/RokuCommunity.brightscript.svg?logo=visual-studio-code)](https://marketplace.visualstudio.com/items?itemName=RokuCommunity.brightscript)
[![Visual Studio Marketplace Version](https://vsmarketplacebadges.dev/version/RokuCommunity.brightscript.svg?logo=visual-studio-code&label=VSCode)](https://marketplace.visualstudio.com/items?itemName=RokuCommunity.brightscript)
[![OpenVSX](https://img.shields.io/open-vsx/v/RokuCommunity/brightscript.svg?label=OpenVSX)](https://open-vsx.org/extension/RokuCommunity/brightscript)
[![license](https://img.shields.io/github/license/rokucommunity/vscode-brightscript-language.svg)](LICENSE)
[![Slack](https://img.shields.io/badge/Slack-RokuCommunity-4A154B?logo=slack)](https://join.slack.com/t/rokudevelopers/shared_invite/zt-4vw7rg6v-NH46oY7hTktpRIBM_zGvwA)

BrightScript Language packages your app, installs it on a Roku device and attaches a debugger, all with one press of **F5**. Stop on breakpoints, step through code, inspect variables and run BrightScript in the debug console while the app is paused. While it runs, the sidebar shows its live screen, its SceneGraph node tree, its registry and the files on the device.

As you type, it checks your BrightScript and [BrighterScript](https://github.com/rokucommunity/brighterscript) code across your whole project, and catches syntax errors, calls to functions that don't exist and wrong argument counts. It also gives you go to definition, find references, code formatting, snippets and [much more](https://rokucommunity.github.io/vscode-brightscript-language/features).

![Debugging a Roku app in VS Code](https://user-images.githubusercontent.com/2544493/78854455-5e08c880-79ef-11ea-8eb4-1f2d74230842.gif)

## Documentation

The full documentation is at **[rokucommunity.github.io/vscode-brightscript-language](https://rokucommunity.github.io/vscode-brightscript-language/)**.

- [Introduction](https://rokucommunity.github.io/vscode-brightscript-language/): what the extension is, how it works, and what you need.
- [Quick Start](https://rokucommunity.github.io/vscode-brightscript-language/quick-start): from install to your first breakpoint in a few minutes.
- [Features](https://rokucommunity.github.io/vscode-brightscript-language/features): everything the extension can do.
- [Extension Settings](https://rokucommunity.github.io/vscode-brightscript-language/extension-settings) and [Launch Configuration](https://rokucommunity.github.io/vscode-brightscript-language/debugging/launch-configuration): every setting and every `launch.json` option.

## Quick start

1. Install **BrightScript Language** from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=RokuCommunity.brightscript) or [Open VSX](https://open-vsx.org/extension/RokuCommunity/brightscript).
2. Put your Roku device in [developer mode](https://developer.roku.com/docs/developer-program/getting-started/developer-setup.md).
3. Open the folder that contains your project's `manifest` file.
4. Open the **Run and Debug** panel and click **Debug Roku Project**.

The extension finds the Roku devices on your network and asks which one to use. See the [Quick Start](https://rokucommunity.github.io/vscode-brightscript-language/quick-start) to save your settings in a `launch.json` file.

## Contributing

The language features come from [BrighterScript](https://github.com/rokucommunity/brighterscript), and debugging comes from [roku-debug](https://github.com/rokucommunity/roku-debug). To work on the extension itself, see the [contributing guide](https://rokucommunity.github.io/vscode-brightscript-language/contributing).

## Accepted security advisories

Dependencies flagged by `npm audit` that we have reviewed and chosen not to upgrade are tracked in [audit-ci.jsonc](https://github.com/RokuCommunity/vscode-brightscript-language/blob/master/audit-ci.jsonc). Each entry includes the advisory ID, the date it was added, and the reason it does not apply to this project.

## Changelog

Click [here](https://github.com/RokuCommunity/vscode-brightscript-language/blob/master/CHANGELOG.md) to see the changelog.
