# Telemetry
The extension collects a small amount of telemetry data, focused on how frequently certain features are being used. We do not collect any user-specific information. This data is also incredibly useful when requesting new features from Roku, as real-world usage carries a lot more weight than simple conjecture. 

To make things as transparent as possible, every telemetry event and everything it sends is defined in [this file](https://github.com/rokucommunity/vscode-brightscript-language/blob/master/src/managers/TelemetryManager.ts). A small amount of call-site code elsewhere records which feature path was taken (for example, how a target device was selected) and passes that along, but the actual sending always happens in that one file. Feel free to open an issue if you have any questions or concerns. 

### Opting out of telemetry tracking
If you would like to disable telemetry tracking, you can follow [these instructions](https://code.visualstudio.com/docs/getstarted/telemetry#_disable-telemetry-reporting) from the VSCode docs. 