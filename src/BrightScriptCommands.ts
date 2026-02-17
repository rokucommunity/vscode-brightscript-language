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
import type { ActiveDeviceManager } from './ActiveDeviceManager';
import * as xml2js from 'xml2js';
import { firstBy } from 'thenby';
import type { UserInputManager } from './managers/UserInputManager';
import { clearNpmPackageCacheCommand } from './commands/ClearNpmPackageCacheCommand';
import type { LocalPackageManager } from './managers/LocalPackageManager';
import { perfettoControlCommands } from './PerfettoControlCommands';

export class BrightScriptCommands {

    constructor(
        private remoteControlManager: RemoteControlManager,
        private whatsNewManager: WhatsNewManager,
        private context: vscode.ExtensionContext,
        private activeDeviceManager: ActiveDeviceManager,
        private userInputManager: UserInputManager,
        private localPackageManager: LocalPackageManager
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
        perfettoControlCommands.registerPerfettoControlCommands(
            this.context
        );

        this.registerGeneralCommands();

        this.registerCommand('sendRemoteCommand', async (key: string) => {
            await this.sendRemoteCommand(key);
        });

        //the "Refresh" button in the Devices list
        this.registerCommand('refreshDeviceList', (key: string) => {
            this.activeDeviceManager.refresh();
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

        this.registerCommand('clearGlobalState', async () => {
            new GlobalStateManager(this.context).clear();
            await vscode.window.showInformationMessage('BrightScript Language extension global state cleared');
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

        this.registerCommand('setActiveDevice', async (device: string) => {
            if (!device) {
                device = await this.userInputManager.promptForHost();
            }
            if (!device) {
                throw new Error('Tried to set active device but failed.');
            } else {
                await this.context.workspaceState.update('remoteHost', device);
                await vscode.window.showInformationMessage(`BrightScript Language extension active device set to: ${device}`);
            }
        });

        this.registerCommand('clearActiveDevice', async () => {
            await this.context.workspaceState.update('remoteHost', '');
            await vscode.window.showInformationMessage('BrightScript Language extension active device cleared');
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
            let config = vscode.workspace.getConfiguration('brightscript.remoteControl', null);
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
            let config = vscode.workspace.getConfiguration('brightscript.remoteControl', null);
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
