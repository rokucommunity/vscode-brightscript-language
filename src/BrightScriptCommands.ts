import * as request from 'postman-request';
import * as vscode from 'vscode';
import BrightScriptFileUtils from './BrightScriptFileUtils';
import { GlobalStateManager } from './GlobalStateManager';
import { brighterScriptPreviewCommand } from './commands/BrighterScriptPreviewCommand';
import { captureScreenshotCommand } from './commands/CaptureScreenshotCommand';
import { rekeyAndPackageCommand } from './commands/RekeyAndPackageCommand';
import { languageServerInfoCommand } from './commands/LanguageServerInfoCommand';
import { util } from './util';
import { util as rokuDebugUtil } from 'roku-debug/dist/util';
import type { RemoteControlManager, RemoteControlModeInitiator } from './managers/RemoteControlManager';
import type { WhatsNewManager } from './managers/WhatsNewManager';
import type { ConfiguredDevice, DeviceManager, RokuDevice } from './deviceDiscovery/DeviceManager';
import * as xml2js from 'xml2js';
import { firstBy } from 'thenby';
import type { UserInputManager } from './managers/UserInputManager';
import { clearNpmPackageCacheCommand } from './commands/ClearNpmPackageCacheCommand';
import type { LocalPackageManager } from './managers/LocalPackageManager';
import { profilingCommands } from './commands/ProfilingCommands';
import { vscodeContextManager } from './managers/VscodeContextManager';
import type { CredentialStore } from './managers/CredentialStore';

export class BrightScriptCommands {

    constructor(
        private remoteControlManager: RemoteControlManager,
        private whatsNewManager: WhatsNewManager,
        private context: vscode.ExtensionContext,
        private deviceManager: DeviceManager,
        private userInputManager: UserInputManager,
        private localPackageManager: LocalPackageManager,
        private credentialStore: CredentialStore
    ) {
        this.fileUtils = new BrightScriptFileUtils();
    }

    private fileUtils: BrightScriptFileUtils;
    public host: string;
    public password: string;
    public workspacePath: string;
    private keypressNotifiers = [] as ((key: string, literalCharacter: boolean) => void)[];

    public registerCommands() {

        brighterScriptPreviewCommand.register(this.context);
        languageServerInfoCommand.register(this.context, this.localPackageManager);
        captureScreenshotCommand.register(this.context, this);
        rekeyAndPackageCommand.register(this.context, this, this.userInputManager);
        clearNpmPackageCacheCommand.register(this.context, this.localPackageManager);
        profilingCommands.register(this.context);

        this.registerGeneralCommands();

        this.registerCommand('sendRemoteCommand', async (key: string) => {
            await this.sendRemoteCommand(key);
        });

        //the "Refresh" button in the Devices list
        this.registerCommand('refreshDeviceList', (key: string) => {
            this.deviceManager.refresh(true);
        });

        this.registerCommand('rescanDevices', () => {
            this.deviceManager.refresh(true);
        });

        // Refresh a single device (inline button on hover in devices panel)
        this.registerCommand('refreshDevice', async (item: { key: string }) => {
            await this.deviceManager.checkDeviceHealth({ serialNumber: item.key }, true);
        });

        this.registerCommand('sendRemoteText', async () => {
            let items: vscode.QuickPickItem[] = [];
            for (const item of new GlobalStateManager(this.context).sendRemoteTextHistory) {
                items.push({ label: item });
            }

            const stuffUserTyped = await util.showQuickPickInputBox({
                placeholder: 'Press enter to send all typed characters to the Roku',
                items: items
            });
            console.log('userInput', stuffUserTyped);

            if (stuffUserTyped) {
                new GlobalStateManager(this.context).addTextHistory(stuffUserTyped);
                let fallbackToHttp = true;
                await this.getRemoteHost();
                //TODO fix SceneGraphDebugCommandController to not timeout so quickly
                // try {
                //     let commandController = new SceneGraphDebugCommandController(this.host);
                //     let response = await commandController.type(stuffUserTyped);
                //     if (!response.error) {
                //         fallbackToHttp = false;
                //     }
                // } catch (error) {
                //     console.error(error);
                //     // Let this fallback to the old HTTP based logic
                // }

                if (fallbackToHttp) {
                    for (let character of stuffUserTyped) {
                        await this.sendAsciiToDevice(character);
                    }
                }
            }
            await vscode.commands.executeCommand('workbench.action.focusPanel');
        });

        this.registerCommand('toggleRemoteControlMode', (initiator: RemoteControlModeInitiator) => {
            return this.remoteControlManager.toggleRemoteControlMode(initiator);
        });

        this.registerCommand('enableRemoteControlMode', () => {
            return this.remoteControlManager.setRemoteControlMode(true, 'command');
        });

        this.registerCommand('disableRemoteControlMode', () => {
            return this.remoteControlManager.setRemoteControlMode(false, 'command');
        });

        this.registerCommand('pressBackButton', async () => {
            await this.sendRemoteCommand('Back');
        });

        this.registerCommand('pressBackspaceButton', async () => {
            await this.sendRemoteCommand('Backspace');
        });

        this.registerCommand('pressHomeButton', async () => {
            await this.sendRemoteCommand('Home');
        });

        this.registerCommand('pressUpButton', async () => {
            await this.sendRemoteCommand('Up');
        });

        this.registerCommand('pressDownButton', async () => {
            await this.sendRemoteCommand('Down');
        });

        this.registerCommand('pressRightButton', async () => {
            await this.sendRemoteCommand('Right');
        });

        this.registerCommand('pressLeftButton', async () => {
            await this.sendRemoteCommand('Left');
        });

        this.registerCommand('pressSelectButton', async () => {
            await this.sendRemoteCommand('Select');
        });

        this.registerCommand('pressPlayButton', async () => {
            await this.sendRemoteCommand('Play');
        });

        this.registerCommand('pressRevButton', async () => {
            await this.sendRemoteCommand('Rev');
        });

        this.registerCommand('pressFwdButton', async () => {
            await this.sendRemoteCommand('Fwd');
        });

        this.registerCommand('pressStarButton', async () => {
            await this.sendRemoteCommand('Info');
        });

        this.registerCommand('pressInstantReplayButton', async () => {
            await this.sendRemoteCommand('InstantReplay');
        });

        this.registerCommand('pressSearchButton', async () => {
            await this.sendRemoteCommand('Search');
        });

        this.registerCommand('pressEnterButton', async () => {
            await this.sendRemoteCommand('Enter');
        });

        this.registerCommand('pressFindRemote', async () => {
            await this.sendRemoteCommand('FindRemote');
        });

        this.registerCommand('pressVolumeDown', async () => {
            await this.sendRemoteCommand('VolumeDown');
        });

        this.registerCommand('pressVolumeMute', async () => {
            await this.sendRemoteCommand('VolumeMute');
        });

        this.registerCommand('pressVolumeUp', async () => {
            await this.sendRemoteCommand('VolumeUp');
        });

        this.registerCommand('setVolume', async () => {
            let result = await vscode.window.showInputBox({
                placeHolder: 'The target volume level (0-100)',
                value: '',
                validateInput: (text: string) => {
                    const num = Number(text);
                    if (isNaN(num)) {
                        return 'Value must be a number';
                    } else if (num < 0 || num > 100) {
                        return 'Please enter a number between 0 and 100';
                    }
                    return null;
                }
            });
            const targetVolume = Number(result);

            if (!isNaN(targetVolume)) {
                await vscode.window.withProgress({
                    location: vscode.ProgressLocation.Notification,
                    title: 'Setting volume'
                }, async (progress) => {
                    const totalCommands = 100 + targetVolume;
                    const incrementValue = 100 / totalCommands;
                    let executedCommands = 0;

                    for (let i = 0; i < 100; i++) {
                        await this.sendRemoteCommand('VolumeDown');
                        executedCommands++;
                        progress.report({ increment: incrementValue, message: `decreasing volume - ${Math.round((executedCommands / totalCommands) * 100)}%` });
                    }

                    for (let i = 0; i < targetVolume; i++) {
                        await this.sendRemoteCommand('VolumeUp');
                        executedCommands++;
                        progress.report({ increment: incrementValue, message: `increasing volume - ${Math.round((executedCommands / totalCommands) * 100)}%` });
                    }
                });
            }
        });

        this.registerCommand('pressPowerOff', async () => {
            await this.sendRemoteCommand('PowerOff');
        });

        this.registerCommand('pressPowerOn', async () => {
            await this.sendRemoteCommand('PowerOn');
        });

        this.registerCommand('pressChannelUp', async () => {
            await this.sendRemoteCommand('ChannelUp');
        });

        this.registerCommand('pressChannelDown', async () => {
            await this.sendRemoteCommand('ChannelDown');
        });

        this.registerCommand('pressBlue', async () => {
            await this.sendRemoteCommand('Blue');
        });

        this.registerCommand('pressGreen', async () => {
            await this.sendRemoteCommand('Green');
        });

        this.registerCommand('pressRed', async () => {
            await this.sendRemoteCommand('Red');
        });

        this.registerCommand('pressYellow', async () => {
            await this.sendRemoteCommand('Yellow');
        });

        this.registerCommand('pressExit', async () => {
            await this.sendRemoteCommand('Exit');
        });

        this.registerCommand('changeTvInput', async (host?: string) => {
            const selectedInput = await vscode.window.showQuickPick([
                'InputHDMI1',
                'InputHDMI2',
                'InputHDMI3',
                'InputHDMI4',
                'InputAV1',
                'InputTuner'
            ]);

            if (selectedInput) {
                await this.sendRemoteCommand(selectedInput, host);
            }
        });

        this.registerKeyboardInputs();
    }

    /**
     * Registers all the commands for a-z, A-Z, 0-9, and all the primary character such as !, @, #, ', ", etc...
     */
    private registerKeyboardInputs() {
        // Get all the keybindings from our package.json
        const extension = vscode.extensions.getExtension('RokuCommunity.brightscript');
        const keybindings = (extension.packageJSON.contributes.keybindings as Array<{
            key: string;
            command: string;
            when: string;
            args: any;
        }>);

        for (let keybinding of keybindings) {
            // Find every keybinding that is related to sending text characters to the device
            if (keybinding.command.includes('.sendAscii+')) {

                if (!keybinding.args) {
                    throw new Error(`Can not register command: ${keybinding.command}. Missing Arguments.`);
                }

                // Dynamically register the the command defined in the keybinding
                this.registerCommand(keybinding.command, async (character: string) => {
                    await this.sendAsciiToDevice(character);
                });
            }
        }
    }

    private registerGeneralCommands() {
        //a command that does absolutely nothing. It's here to allow us to absorb unsupported keypresses when in **remote control mode**.
        this.registerCommand('doNothing', () => { });

        this.registerCommand('toggleXML', async () => {
            await this.onToggleXml();
        });

        this.registerCommand('goToParentComponent', async () => {
            await this.onGoToParentComponent();
        });

        this.registerCommand('clearGlobalState', async () => {
            new GlobalStateManager(this.context).clear();
            await vscode.window.showInformationMessage('BrightScript Language extension global state cleared');
        });

        this.registerCommand('clearCurrentDeviceList', async () => {
            this.deviceManager.clearCurrentDeviceList();
            await util.showTimedNotification('Clearing device list');
        });

        this.registerCommand('enableDeviceDiscovery', async () => {
            await util.setConfigurationValueAtUserOrClosestScope('brightscript.deviceDiscovery.enabled', true);
        });

        this.registerCommand('disableDeviceDiscovery', async () => {
            await util.setConfigurationValueAtUserOrClosestScope('brightscript.deviceDiscovery.enabled', false);
        });

        this.registerCommand('clearDeviceCache', async () => {
            this.deviceManager.clearAllCache();
            await util.showTimedNotification('Clearing device cache');
        });

        this.registerCommand('clearLastSeenDevices', async () => {
            new GlobalStateManager(this.context).clearLastSeenDevices();
            await vscode.window.showInformationMessage('Last seen devices cleared');
        });

        this.registerCommand('copyToClipboard', async (value: string) => {
            try {
                if (util.isNullish(value)) {
                    throw new Error('Cannot copy ${value} to clipboard');
                }
                await vscode.env.clipboard.writeText(value?.toString());
                await vscode.window.showInformationMessage(`Copied to clipboard: ${value}`);
            } catch (error) {
                await vscode.window.showErrorMessage(`Could not copy value to clipboard`);
            }
        });

        this.registerCommand('openUrl', async (url: string) => {
            try {
                await vscode.env.openExternal(vscode.Uri.parse(url));
            } catch (error) {
                await vscode.window.showErrorMessage(`Tried to open url but failed: ${url}`);
            }
        });

        this.registerCommand('openRegistryInBrowser', async (host: string) => {
            if (!host) {
                host = await this.userInputManager.promptForHost();
            }

            let responseText = await util.spinAsync('Fetching app list', async () => {
                return (await util.httpGet(`http://${host}:8060/query/apps`, { timeout: 4_000 })).body as string;
            });

            const parsed = await xml2js.parseStringPromise(responseText);

            //convert the items to QuickPick items
            const items: Array<vscode.QuickPickItem & { appId?: string }> = parsed.apps.app.map((appData: any) => {
                return {
                    label: appData._,
                    detail: `ID: ${appData.$.id}`,
                    description: `${appData.$.version}`,
                    appId: `${appData.$.id}`
                } as vscode.QuickPickItem;
                //sort the items alphabetically
            }).sort(firstBy('label'));

            //move the dev app to the top (and add a label/section to differentiate it)
            const devApp = items.find(x => x.appId === 'dev');
            if (devApp) {
                items.splice(items.indexOf(devApp), 1);
                items.unshift(
                    { kind: vscode.QuickPickItemKind.Separator, label: 'dev' },
                    devApp,
                    { kind: vscode.QuickPickItemKind.Separator, label: ' ' }
                );
            }

            const selectedApp: typeof items[0] = await vscode.window.showQuickPick(items, { placeHolder: 'Which app would you like to see the registry for?' });

            if (selectedApp) {
                const appId = selectedApp.appId;
                let url = `http://${host}:8060/query/registry/${appId}`;
                try {
                    await vscode.env.openExternal(vscode.Uri.parse(url));
                } catch (error) {
                    await vscode.window.showErrorMessage(`Tried to open url but failed: ${url}`);
                }
            }
        });

        this.registerCommand('setActiveDevice', async (deviceOrItem: string | { key: string }) => {
            let ip: string;
            if (typeof deviceOrItem === 'object' && deviceOrItem?.key) {
                ip = this.deviceManager.getDevice(deviceOrItem.key)?.ip;
            } else if (typeof deviceOrItem === 'string') {
                ip = deviceOrItem;
            }
            if (!ip) {
                ip = await this.userInputManager.promptForHost();
            }
            if (!ip) {
                throw new Error('Tried to set active device but failed.');
            } else {
                await this.context.workspaceState.update('remoteHost', ip);
                await vscodeContextManager.set('activeHost', ip);
                await util.showTimedNotification(`'${ip}' set as active device`);
            }
        });

        this.registerCommand('editDeviceInUserSettings', async (deviceOrItem: { key: string }) => {
            const device = this.deviceManager.getDevice(deviceOrItem?.key);
            await this.openSettingsJsonAtDevice(device, 'user');
        });

        this.registerCommand('editDeviceInWorkspaceSettings', async (deviceOrItem: { key: string }) => {
            const device = this.deviceManager.getDevice(deviceOrItem?.key);
            await this.openSettingsJsonAtDevice(device, 'workspace');
        });

        this.registerCommand('addDeviceToUserSettings', async (deviceOrItem: { key: string }) => {
            const device = this.deviceManager.getDevice(deviceOrItem?.key);
            if (!device) {
                void vscode.window.showErrorMessage('Could not find device to add to settings.');
                return;
            }

            const config = vscode.workspace.getConfiguration('brightscript');
            const inspection = config.inspect<ConfiguredDevice[]>('devices');
            const userDevices = inspection?.globalValue || [];

            if (userDevices.some(d => d.host === device.ip || (device.serialNumber && d.serialNumber === device.serialNumber))) {
                void vscode.window.showInformationMessage('Device is already in your user settings.');
                return;
            }

            // Copy any cred-store-cached password into the settings entry so the device
            // is portable across machines via Settings Sync. The cred store keeps its own
            // copy — it's a running cache of validated passwords that gets refreshed on
            // each successful password validation.
            const storedPassword = device.serialNumber
                ? await this.credentialStore.getPassword(device.serialNumber)
                : undefined;

            const newDevice = {
                host: device.ip,
                ...(device.serialNumber && { serialNumber: device.serialNumber }),
                ...(storedPassword && { password: storedPassword })
            };
            userDevices.push(newDevice);

            await config.update('devices', userDevices, vscode.ConfigurationTarget.Global);
            const displayName = device.deviceInfo['user-device-name'] || device.deviceInfo['default-device-name'] || device.ip;
            void vscode.window.showInformationMessage(`Added "${displayName}" to user settings.`);
        });

        this.registerCommand('addDeviceToWorkspaceSettings', async (deviceOrItem: { key: string }) => {
            const device = this.deviceManager.getDevice(deviceOrItem?.key);
            if (!device) {
                void vscode.window.showErrorMessage('Could not find device to add to settings.');
                return;
            }

            const config = vscode.workspace.getConfiguration('brightscript');
            const inspection = config.inspect<ConfiguredDevice[]>('devices');
            const workspaceDevices = inspection?.workspaceValue || [];

            if (workspaceDevices.some(d => (device.serialNumber && d.serialNumber === device.serialNumber))) {
                void vscode.window.showInformationMessage('Device is already in your workspace settings.');
                return;
            }

            const storedPassword = device.serialNumber
                ? await this.credentialStore.getPassword(device.serialNumber)
                : undefined;

            const newDevice = {
                host: device.ip,
                ...(device.serialNumber && { serialNumber: device.serialNumber }),
                ...(storedPassword && { password: storedPassword })
            };
            workspaceDevices.push(newDevice);

            await config.update('devices', workspaceDevices, vscode.ConfigurationTarget.Workspace);
            const displayName = device.deviceInfo['user-device-name'] || device.deviceInfo['default-device-name'] || device.ip;
            void vscode.window.showInformationMessage(`Added "${displayName}" to workspace settings.`);
        });

        this.registerCommand('clearDefaultDevicePassword', async () => {
            await vscode.workspace.getConfiguration('brightscript').update('defaultDevicePassword', undefined, vscode.ConfigurationTarget.Global);
            await util.showTimedNotification('Default device password cleared.');
        });

        this.registerCommand('setDefaultDevicePassword', async () => {
            const currentValue = vscode.workspace.getConfiguration('brightscript').get<string>('defaultDevicePassword') ?? '';

            const password = await vscode.window.showInputBox({
                placeHolder: 'Enter the default developer password (applied to devices without their own password)',
                password: true,
                value: currentValue,
                prompt: 'Set default device password'
            });

            if (password === undefined) {
                return;
            }

            //this value is only supported at the global level, so just always write it there
            await vscode.workspace.getConfiguration('brightscript').update('defaultDevicePassword', password, vscode.ConfigurationTarget.Global);
        });

        this.registerCommand('setDevicePassword', async (serialNumber: string) => {
            if (!serialNumber) {
                throw new Error('Device serial number is required to set password.');
            }

            const device = this.deviceManager.getDevice({ serialNumber: serialNumber });
            const displayName = device?.deviceInfo?.['user-device-name'] || device?.deviceInfo?.['default-device-name'] || device?.ip || serialNumber;

            const password = await vscode.window.showInputBox({
                placeHolder: 'Enter the developer account password for this device',
                password: true,
                prompt: `Set password for device: ${displayName}`,
                // Roku's own webserver UI enforces the same 4-character minimum.
                validateInput: (value) => {
                    return value.length < 4 ? 'Password must be at least 4 characters' : undefined;
                }
            });

            if (password !== undefined) {
                await this.setDevicePassword(serialNumber, password);
                await vscode.window.showInformationMessage(`Password set for device: ${displayName}`);
            }
        });

        this.registerCommand('clearDevicePassword', async (serialNumber: string) => {
            if (!serialNumber) {
                throw new Error('Device serial number is required to clear password.');
            }

            const device = this.deviceManager.getDevice({ serialNumber: serialNumber });
            const displayName = device?.deviceInfo?.['user-device-name'] || device?.deviceInfo?.['default-device-name'] || device?.ip || serialNumber;

            await this.setDevicePassword(serialNumber, '');
            await vscode.window.showInformationMessage(`Password cleared for device: ${displayName}`);
        });

        this.registerCommand('clearActiveDevice', async () => {
            await this.context.workspaceState.update('remoteHost', '');
            await vscodeContextManager.set('activeHost', '');
            await util.showTimedNotification('Active device cleared');
        });

        this.registerCommand('showReleaseNotes', () => {
            this.whatsNewManager.showReleaseNotes();
        });
    }

    public async openFile(filename: string, range: vscode.Range = null, preview = false): Promise<boolean> {
        let uri = vscode.Uri.file(filename);
        try {
            let doc = await vscode.workspace.openTextDocument(uri); // calls back into the provider
            await vscode.window.showTextDocument(doc, { preview: preview });
            if (range) {
                await this.gotoRange(range);
            }
        } catch (e) {
            return false;
        }
        return true;
    }

    private async gotoRange(range: vscode.Range) {
        let editor = vscode.window.activeTextEditor;
        editor.selection = new vscode.Selection(
            range.start.line,
            range.start.character,
            range.start.line,
            range.start.character
        );
        await vscode.commands.executeCommand('revealLine', {
            lineNumber: range.start.line,
            at: 'center'
        });
    }

    public async onToggleXml() {
        if (vscode.window.activeTextEditor) {
            const currentDocument = vscode.window.activeTextEditor.document;
            let alternateFileName = this.fileUtils.getAlternateFileName(currentDocument.fileName);
            if (alternateFileName) {
                if (
                    !await this.openFile(alternateFileName) &&
                    alternateFileName.toLowerCase().endsWith('.brs')
                ) {
                    await this.openFile(this.fileUtils.getBsFileName(alternateFileName));
                }
            }
        }
    }

    public async onGoToParentComponent() {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return;
        }
        const currentDocument = editor.document;
        const fileName = currentDocument.fileName;
        const lowerFileName = fileName.toLowerCase();
        const isXml = lowerFileName.endsWith('.xml');
        const isBrs = lowerFileName.endsWith('.brs') || lowerFileName.endsWith('.bs');

        if (!isXml && !isBrs) {
            return;
        }

        // Get or open the XML document
        let xmlDoc: vscode.TextDocument;
        if (isXml) {
            xmlDoc = currentDocument;
        } else {
            const xmlFileName = this.fileUtils.getAlternateFileName(fileName);
            if (!xmlFileName) {
                return;
            }
            try {
                xmlDoc = await vscode.workspace.openTextDocument(vscode.Uri.file(xmlFileName));
            } catch (e) {
                return;
            }
        }

        const xmlContent = xmlDoc.getText();
        const parentName = this.fileUtils.getParentComponentName(xmlContent);
        if (!parentName) {
            await vscode.window.showInformationMessage('No parent component found');
            return;
        }

        const extendsPosition = this.getExtendsValuePosition(xmlContent, xmlDoc);
        if (!extendsPosition) {
            return;
        }

        // Delegate to the definition provider via the LSP
        const locations = await vscode.commands.executeCommand<vscode.Location[]>(
            'vscode.executeDefinitionProvider',
            xmlDoc.uri,
            extendsPosition
        );

        if (!locations || locations.length === 0) {
            await vscode.window.showInformationMessage(`Could not find parent component: ${parentName}`);
            return;
        }

        const parentXmlPath = locations[0].uri.fsPath;

        if (isBrs) {
            const parentBrsPath = this.fileUtils.getAlternateFileName(parentXmlPath);
            if (parentBrsPath && !await this.openFile(parentBrsPath)) {
                await this.openFile(this.fileUtils.getBsFileName(parentBrsPath));
            }
        } else {
            await this.openFile(parentXmlPath);
        }
    }

    private getExtendsValuePosition(xmlContent: string, xmlDoc: vscode.TextDocument): vscode.Position | undefined {
        // Match extends="VALUE" capturing the VALUE portion; [^>]+ spans across lines since [^>] matches \n
        const match = /<component[^>]+extends\s*=\s*["']([^"']+)/i.exec(xmlContent);
        if (!match) {
            return undefined;
        }
        // Offset to first character of the value (after the opening quote)
        const valueOffset = match.index + match[0].length - match[1].length;
        return xmlDoc.positionAt(valueOffset);
    }

    public async sendRemoteCommand(key: string, host?: string, literalCharacter = false) {
        for (const notifier of this.keypressNotifiers) {
            notifier(key, literalCharacter);
        }

        if (literalCharacter) {
            key = 'Lit_' + encodeURIComponent(key);
        }

        // do we have a temporary override?
        if (!host) {
            // Get the long lived host ip
            await this.getRemoteHost();
            host = this.host;
        }

        if (host) {
            let clickUrl = `http://${host}:8060/keypress/${key}`;
            console.log(`send ${clickUrl}`);
            return new Promise((resolve, reject) => {
                request.post(clickUrl, (err, response) => {
                    if (err) {
                        return reject(err);
                    }
                    return resolve(response);
                });
            });
        }
    }

    public async getRemoteHost(showPrompt = true) {
        this.host = await this.context.workspaceState.get('remoteHost');
        if (!this.host) {
            let config = util.getConfiguration('brightscript.remoteControl');
            this.host = config.get('host');
            // eslint-disable-next-line no-template-curly-in-string
            if ((!this.host || this.host === '${promptForHost}') && showPrompt) {
                this.host = await vscode.window.showInputBox({
                    placeHolder: 'The IP address of your Roku device',
                    value: ''
                });
            }
        }
        if (!this.host) {
            throw new Error('Can\'t send command: host is required.');
        } else {
            await this.context.workspaceState.update('remoteHost', this.host);
        }
        if (this.host) {
            //try resolving the hostname. (sometimes it fails for no reason, so just ignore the crash if it does)
            try {
                this.host = await rokuDebugUtil.dnsLookup(this.host);
            } catch (e) {
                console.error('Error doing dns lookup for host ', this.host, e);
            }
        }
        return this.host;
    }

    public async getRemotePassword(showPrompt = true) {
        this.password = await this.context.workspaceState.get('remotePassword');
        if (!this.password) {
            let config = util.getConfiguration('brightscript.remoteControl');
            this.password = config.get('password');
            // eslint-disable-next-line no-template-curly-in-string
            if ((!this.password || this.password === '${promptForPassword}') && showPrompt) {
                this.password = await vscode.window.showInputBox({
                    placeHolder: 'The developer account password for your Roku device',
                    value: ''
                });
            }
        }
        if (!this.password) {
            throw new Error(`Can't send command: password is required.`);
        } else {
            await this.context.workspaceState.update('remotePassword', this.password);
        }
        return this.password;
    }

    public async getWorkspacePath() {
        this.workspacePath = await this.context.workspaceState.get('workspacePath');
        //let folderUri: vscode.Uri;
        if (!this.workspacePath) {
            if (vscode.workspace.workspaceFolders?.length === 1) {
                this.workspacePath = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
            } else {
                //there are multiple workspaces, ask the user to specify which one they want to use
                let workspaceFolder = await vscode.window.showWorkspaceFolderPick();
                if (workspaceFolder) {
                    this.workspacePath = workspaceFolder.uri.fsPath;
                }
            }
        }
        return this.workspacePath;
    }

    /**
     * Store a password for a specific device, keyed by serial number.
     * An empty password clears the stored entry.
     *
     * Writes the password to every `brightscript.devices[]` settings entry that
     * matches the SN (user/workspace/workspace-folder scopes) and also keeps the
     * cred store updated. The cred store acts as a running cache of passwords —
     * kept fresh alongside settings here, and refreshed on each successful
     * password validation elsewhere.
     */
    public async setDevicePassword(serialNumber: string, password: string) {
        await this.writeDevicePasswordToSettings(serialNumber, password);
        if (password) {
            await this.credentialStore.setPassword(serialNumber, password);
        } else {
            await this.credentialStore.clearPassword(serialNumber);
        }
    }

    /**
     * Update/clear the `password` field on any `brightscript.devices[]` entries
     * whose `serialNumber` matches. Writes to every writable scope that contains
     * a matching entry — user (Global), workspace, and each workspace folder.
     * The default (package.json) scope is read-only and is never written.
     * Empty password removes the field rather than writing an empty string.
     * Returns true when at least one scope contained a matching entry.
     */
    private async writeDevicePasswordToSettings(serialNumber: string, password: string): Promise<boolean> {
        if (!serialNumber) {
            return false;
        }

        const scopeHasMatch = (devices: ConfiguredDevice[] | undefined): boolean => !!devices?.some(entry => entry.serialNumber === serialNumber);

        const rewriteEntries = (devices: ConfiguredDevice[]): ConfiguredDevice[] => devices.map(entry => {
            if (entry.serialNumber !== serialNumber) {
                return entry;
            }
            if (password) {
                return { ...entry, password: password };
            }
            const { password: _existingPassword, ...entryWithoutPassword } = entry;
            return entryWithoutPassword;
        });

        let found = false;

        // User (Global) + workspace scopes — resource-agnostic
        const rootConfig = vscode.workspace.getConfiguration('brightscript');
        const rootInspection = rootConfig.inspect<ConfiguredDevice[]>('devices');

        if (scopeHasMatch(rootInspection?.globalValue)) {
            found = true;
            await rootConfig.update('devices', rewriteEntries(rootInspection.globalValue), vscode.ConfigurationTarget.Global);
        }
        if (scopeHasMatch(rootInspection?.workspaceValue)) {
            found = true;
            await rootConfig.update('devices', rewriteEntries(rootInspection.workspaceValue), vscode.ConfigurationTarget.Workspace);
        }

        // Workspace-folder scope — one setting per folder in multi-root workspaces
        const workspaceFolders = vscode.workspace.workspaceFolders ?? [];
        for (const folder of workspaceFolders) {
            const folderConfig = vscode.workspace.getConfiguration('brightscript', folder.uri);
            const folderInspection = folderConfig.inspect<ConfiguredDevice[]>('devices');
            if (scopeHasMatch(folderInspection?.workspaceFolderValue)) {
                found = true;
                await folderConfig.update('devices', rewriteEntries(folderInspection.workspaceFolderValue), vscode.ConfigurationTarget.WorkspaceFolder);
            }
        }

        return found;
    }

    /**
     * Get the stored password for a specific device by serial number.
     */
    public async getDevicePassword(serialNumber: string | undefined): Promise<string | undefined> {
        return this.credentialStore.getPassword(serialNumber);
    }

    /**
     * Get the password for the currently active device.
     * Resolves the active host's IP to a serial number via DeviceManager,
     * then reads from the SN-keyed credential store. Falls back to the
     * workspace-global password when no per-device entry exists.
     */
    public async getActiveHostPassword(): Promise<string | undefined> {
        const activeHost = this.context.workspaceState.get<string>('remoteHost');
        if (activeHost && typeof activeHost === 'string') {
            const serialNumber = this.deviceManager.getDevice({ ip: activeHost })?.serialNumber;
            const devicePassword = await this.credentialStore.getPassword(serialNumber);
            if (devicePassword) {
                return devicePassword;
            }
        }
        return this.getRemotePassword(false);
    }

    /**
     * Return the active host IP if one is set and passes a health check; otherwise undefined.
     */
    public async getHealthyActiveHost(): Promise<string | undefined> {
        const activeHost = vscodeContextManager.get<string>('activeHost');
        if (!activeHost) {
            return undefined;
        }
        const isHealthy = await this.deviceManager.checkDeviceHealth({ ip: activeHost }, true, false);
        return isHealthy ? activeHost : undefined;
    }

    /**
     * Open the settings JSON file and position cursor at the specified device entry
     */
    private async openSettingsJsonAtDevice(device: RokuDevice | undefined, scope: 'user' | 'workspace'): Promise<void> {
        // Open the appropriate settings JSON file
        const command = scope === 'user'
            ? 'workbench.action.openSettingsJson'
            : 'workbench.action.openWorkspaceSettingsFile';
        await vscode.commands.executeCommand(command);

        // Get the active editor (should be the settings file we just opened)
        const editor = vscode.window.activeTextEditor;
        if (!editor || !device) {
            return;
        }

        const text = editor.document.getText();

        // Search for the device by IP or serial number
        const searchTerms = [device.ip];
        if (device.serialNumber) {
            searchTerms.push(device.serialNumber);
        }

        let matchIndex = -1;
        for (const term of searchTerms) {
            const index = text.indexOf(`"${term}"`);
            if (index !== -1) {
                matchIndex = index;
                break;
            }
        }

        if (matchIndex !== -1) {
            const position = editor.document.positionAt(matchIndex + 1); // +1 to skip opening quote
            const selection = new vscode.Selection(position, position);
            editor.selection = selection;
            editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
        }
    }

    public registerKeypressNotifier(notifier: (key: string, literalCharacter: boolean) => void) {
        this.keypressNotifiers.push(notifier);
    }

    private registerCommand(name: string, callback: (...args: any[]) => any, thisArg?: any) {
        const prefix = 'extension.brightscript.';
        const commandName = name.startsWith(prefix) ? name : prefix + name;
        this.context.subscriptions.push(vscode.commands.registerCommand(commandName, callback, thisArg));
    }

    private async sendAsciiToDevice(character: string) {
        await this.sendRemoteCommand(character, undefined, true);
    }
}
