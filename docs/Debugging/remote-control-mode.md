# Remote Control Mode
**Remote Control Mode** is a convenient way to send remote control commands to a Roku entirely from your keyboard in vscode without needing to pick up a physical Roku remote. 

## 
### From the status bar
Click the remote icon in the status bar to toggle remote mode on or off

![remote-mode](https://user-images.githubusercontent.com/2544493/162752275-e60dea72-cc78-4818-aa99-6c3a354157ce.gif)

### From the command palette
![image](https://user-images.githubusercontent.com/2544493/162752967-a152dfd7-89a3-4072-aa10-b8d918cd10ff.png)

### From the keyboard
Press `ctrl+k` on windows or `cmd+k` on mac.

## How it works
When Remote Control Mode is activated, we enable about 100 key bindings that capture most of the standard US keyboard keys. At this point, you may use your keyboard to send text input, use the arrow keys to send left/right/up/down button presses, etc. Once you're finished, simply disable **remote control mode**.

Here are many of the registered key bindings. You can see the full list in the [package.json](https://github.com/rokucommunity/vscode-brightscript-language/blob/master/package.json) under `keybindings`.


| Keybinding (Windows) | Keybinding (Mac) | Roku Button     | Description                                                                                         |
| -------------------- | -------------------- | --------------- | ----------------------------------------------------------------------------------------------- |
| `Up`                 | `Up`                 | Up              |                                                                                                 |
| `Down`               | `Down`               | Down            |                                                                                                 |
| `Left`               | `Left`               | Left            |                                                                                                 |
| `Right`              | `Right`              | Right           |                                                                                                 |
| `Enter`              | `Enter`              | OK              |                                                                                                 |
| `Escape`             | `Escape`             | Back            |                                                                                                 |
| `Delete`             | `Delete`             | Back            |                                                                                                 |
| `Home`               | `Home`               | Home            |                                                                                                 |
| `Ctrl+Escape`        | `Cmd+Escape`         | Home            |                                                                                                 |
| `Backspace`          | `Backspace`          | Instant Replay  | Can also be used to delete the character to the left of the cursor in an input box              |
| `Ctrl+Backspace`     | `Cmd+Backspace`      | Backspace       | Delete the character to the left of the cursor in an input box                                  |
| `Ctrl+Enter`         | `Cmd+Enter`          | Play/Pause      |                                                                                                 |
| `End`                | `End`                | Play/Pause      |                                                                                                 |
| `MediaPlayPause`     | `MediaPlayPause`     | Play/Pause      | VSCode does not block this button's system action, so only use this if you're not playing audio | 
| `Ctrl+Left`          | `Cmd+Left`           | Rewind          |                                                                                                 |
| `PageDown`           | `PageDown`           | Rewind          |                                                                                                 |
| `MediaTrackPrevious` | `MediaTrackPrevious` | Rewind          | VSCode does not block this button's system action, so only use this if you're not playing audio | 
| `Ctrl+Right`         | `Cmd+Right`          | Fast Forward    |                                                                                                 |
| `PageUp`             | `PageUp`             | Fast Forward    |                                                                                                 |
| `MediaTrackNext`     | `MediaTrackNext`     | Fast Forward    | VSCode does not block this button's system action, so only use this if you're not playing audio | 
| `Ctrl+8`             | `Cmd+8`              | Star            |                                                                                                 |
| `Ctrl+Shift+8`       | `Cmd+Shift+8`        | Star            |                                                                                                 |
| `Insert`             | `Insert`             | Star            |                                                                                                 |
| `AudioVolumeMute`    | `AudioVolumeMute`    | Volume Mute     | VSCode does not block this button's system action, so only use this if you're not playing audio | 

