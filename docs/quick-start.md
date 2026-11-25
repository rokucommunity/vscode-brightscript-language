# Quick Start

From a fresh install to your app running (and stopping on a breakpoint) on a Roku device in a few minutes.

## 1. Install the extension
Search for **BrightScript Language** in the VS Code extensions panel and click **Install**, or install it from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=RokuCommunity.brightscript). See [Installation](installation.md) for other ways to install it.

## 2. Open your Roku project
Open the folder that contains your project's `manifest` file (**File → Open Folder...**). If your project follows Roku's standard layout (`manifest`, `source/`, `components/`, `images/`), syntax highlighting, error checking, go to definition and the rest of the language features work right away, with no configuration.

If your project lives in a subfolder or uses a custom layout, see [Editing Setup](editing/index.md).

## 3. Put your Roku device in developer mode
The extension side-loads your app onto a Roku device, which needs developer mode turned on. On the Roku remote, press **Home** 3 times, **Up** 2 times, then **Right, Left, Right, Left, Right**, and follow the prompts. Make a note of the device's IP address and the password you choose. See Roku's [developer setup guide](https://developer.roku.com/docs/developer-program/getting-started/developer-setup.md) for details.

Your computer and the Roku need to be on the same network. The extension finds Roku devices on your network automatically, and lists them in the **Devices** panel of the BrightScript Language sidebar.

## 4. Start debugging
Open the **Run and Debug** panel and click **Debug Roku Project**. The extension finds your project, asks which Roku device to use and its developer password, then packages the app, side-loads it, and attaches the debugger. The app's output shows up in the **Debug Console**.

To save your settings (and skip the prompts next time), create a `.vscode/launch.json` file:

```json title=".vscode/launch.json"
{
    "version": "0.2.0",
    "configurations": [
        {
            "type": "brightscript",
            "request": "launch",
            "name": "BrightScript Debug: Launch",
            "host": "${promptForHost}",
            "password": "${promptForPassword}",
            "rootDir": "${workspaceFolder}"
        }
    ]
}
```

Then press **F5** to launch. Replace `${promptForHost}` with your Roku's IP address (and `${promptForPassword}` with its password) to stop being asked. To keep the password out of source control, see [.env File](debugging/env-file.md).

## 5. Set a breakpoint
Click in the gutter to the left of a line number in any `.brs` file to set a breakpoint, then launch again. When the app reaches that line, it pauses so you can inspect variables, step through the code and run code in the Debug Console.

> [!NOTE]
> Roku devices can't add breakpoints to a running app, so the extension adds them while it packages your app. After you add or remove a breakpoint, restart the debug session for it to take effect.

## Where to go next
- [Features](features.md): everything the extension can do
- [Debugging Setup](debugging/index.md) and the full list of [launch configuration](debugging/launch-configuration.md) options
- [Remote Control Mode](debugging/remote-control-mode.md): control your Roku from your keyboard
- [Extension Settings](extension-settings.md)
