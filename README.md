# BrightScript Language extension for VSCode

[![build status](https://img.shields.io/github/workflow/status/rokucommunity/vscode-brightscript-language/build.svg?logo=github)](https://github.com/rokucommunity/vscode-brightscript-language/actions?query=workflow%3Abuild)
[![coverage status](https://img.shields.io/coveralls/github/rokucommunity/vscode-brightscript-language?logo=coveralls)](https://coveralls.io/github/rokucommunity/vscode-brightscript-language?branch=master)
[![Visual Studio Marketplace](https://vsmarketplacebadge.apphb.com/installs-short/RokuCommunity.brightscript.svg?logo=visual-studio-code)](https://marketplace.visualstudio.com/items?itemName=RokuCommunity.brightscript)
[![Visual Studio Marketplace Version](https://img.shields.io/visual-studio-marketplace/v/RokuCommunity.brightscript.svg?logo=visual-studio-code&label=VSCode)](https://marketplace.visualstudio.com/items?itemName=RokuCommunity.brightscript)
[![OpenVSX](https://img.shields.io/open-vsx/v/RokuCommunity/brightscript.svg?label=OpenVSX)](https://open-vsx.org/extension/RokuCommunity/brightscript)
[![license](https://img.shields.io/github/license/rokucommunity/vscode-brightscript-language.svg)](LICENSE)
[![Slack](https://img.shields.io/badge/Slack-RokuCommunity-4A154B?logo=slack)](https://join.slack.com/t/rokudevelopers/shared_invite/zt-4vw7rg6v-NH46oY7hTktpRIBM_zGvwA)

The popular [BrightScript Language](https://marketplace.visualstudio.com/items?itemName=RokuCommunity.brightscript) extension for [VSCode](https://code.visualstudio.com/) is used by thousands of Roku developers around the world. Revolutionize your Roku development workflow by using this powerful tool.

<hr>

## Notable features
The extension is packed with features, but here are some highlights:
 - Side-load directly to a roku device from VSCode
 - In editor debugging support including breakpoints, variable inspection, and more...
 - Integrated device logs and interactive console (see image below)
 - Catch errors in VSCode with the built in syntax checking. (Powered by the [BrighterScript](https://github.com/rokucommunity/brighterscript) language server)
 - Automatic rendezvous tracking when `logrendezvous` is enabled on the Roku device.
 - Syntax highlighting, code formatting, symbol navigation, and [much more](https://rokucommunity.github.io/vscode-brightscript-language/features.html)

<img src="https://user-images.githubusercontent.com/2544493/78854455-5e08c880-79ef-11ea-8eb4-1f2d74230842.gif"/>

## Documentation
For a full list of features and settings, please see our [documentation website](https://rokucommunity.github.io/vscode-brightscript-language), or click one of the links below.

#### Extension
 - [Features](https://rokucommunity.github.io/vscode-brightscript-language/features.html) - The full list of features provided by [BrightScript Language](https://marketplace.visualstudio.com/items?itemName=RokuCommunity.brightscript)
 - [KeyBindings](https://rokucommunity.github.io/vscode-brightscript-language/keyboard-shortcuts.html) - A full list of pre included keybindings
 - [Extension Settings](https://rokucommunity.github.io/vscode-brightscript-language/extesnion-settings.html) - The full list of possible VS Code settings
#### Code Editing
 - [Language Server Errors and Warnings](https://rokucommunity.github.io/vscode-brightscript-language/Editing/error-handling.html) - Ways to handle different errors show by the language server
 - [Code formatting](https://rokucommunity.github.io/vscode-brightscript-language/Editing/code-formatting.html) - How to set up code formatting and the different formatting options.
 - [Code Snippets](https://rokucommunity.github.io/vscode-brightscript-language/Editing/snippets.html) - A collection of useful code sippets

#### Debugging
 - [Basic project setup](https://rokucommunity.github.io/vscode-brightscript-language/Debugging/index.html) - Launching and debugging your local project on a Roku device.
 - [Component Libraries](https://rokucommunity.github.io/vscode-brightscript-language/Debugging/component-libraries.html) - How to define custom component libraries in your `launch.json`
 - [Deeplinking](https://rokucommunity.github.io/vscode-brightscript-language/Debugging/deep-linking.html) - Sending deeplinks from the `launch.json`
 - [Remote control emulation](https://rokucommunity.github.io/vscode-brightscript-language/Debugging/remote-control-mode.html) - How to emulate the Roku remote control
 - [Rale](https://rokucommunity.github.io/vscode-brightscript-language/Debugging/rale.html) - Inject Rale into your application without committing the TrackerTask to your repository
 - [BS_Consts](https://rokucommunity.github.io/vscode-brightscript-language/Debugging/bs-const.html) - Changing `bs_const` values from the `launch.json`
 - [Advanced Project Setup](https://rokucommunity.github.io/vscode-brightscript-language/Debugging/advanced-project-setup.html) - Setting up your project with complex use cases such as custom build scripts or source files located in multiple different directories.
## Contributing

The majority of this extension's language feature support depends on the [BrighterScript](https://github.com/RokuCommunity/brighterscript) project, which contributes the language server. The debugging functionality comes from the [roku-debug](https://github.com/RokuCommunity/roku-debug) project. If you would like to contribute please see our [contributing guide](https://rokucommunity.github.io/vscode-brightscript-language/contributing.html)

## Changelog

Click [here](https://github.com/RokuCommunity/vscode-brightscript-language/blob/master/CHANGELOG.md) to see the changelog.
