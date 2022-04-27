import * as request from 'request';
import * as vscode from 'vscode';
import BrightScriptFileUtils from './BrightScriptFileUtils';
import { GlobalStateManager } from './GlobalStateManager';
import { brighterScriptPreviewCommand } from './commands/BrighterScriptPreviewCommand';
import { languageServerInfoCommand } from './commands/LanguageServerInfoCommand';
import { util } from './util';
import { util as rokuDebugUtil } from 'roku-debug/dist/util';
import type { RemoteControlManager, RemoteControlModeInitiator } from './managers/RemoteControlManager';
import type { WhatsNewManager } from './managers/WhatsNewManager';

export class BrightScriptCommands {

    constructor(
        private remoteControlManager: RemoteControlManager,
        private whatsNewManager: WhatsNewManager,
        private context: vscode.ExtensionContext
    ) {
        this.fileUtils = new BrightScriptFileUtils();
    }

    private fileUtils: BrightScriptFileUtils;
    private host: string;

    public registerCommands() {

        brighterScriptPreviewCommand.register(this.context);
        languageServerInfoCommand.register(this.context);

        this.registerGeneralCommands();

        this.registerCommand('sendRemoteCommand', async (key: string) => {
            await this.sendRemoteCommand(key);
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
            await this.sendRemoteCommand('FindVolumeUp');
        });

        this.registerCommand('pressPowerOff', async () => {
            await this.sendRemoteCommand('PowerOff');
        });

        this.registerCommand('pressChannelUp', async () => {
            await this.sendRemoteCommand('ChannelUp');
        });

        this.registerCommand('pressChannelDown', async () => {
            await this.sendRemoteCommand('ChannelDown');
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
                await vscode.env.clipboard.writeText(value);
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

    public async sendRemoteCommand(key: string, host?: string) {
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

    public async getRemoteHost() {
        this.host = await this.context.workspaceState.get('remoteHost');
        if (!this.host) {
            let config = vscode.workspace.getConfiguration('brightscript.remoteControl', null);
            this.host = config.get('host');
            // eslint-disable-next-line no-template-curly-in-string
            if (this.host === '${promptForHost}') {
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
            this.host = await rokuDebugUtil.dnsLookup(this.host);
        }
    }

    private registerCommand(name: string, callback: (...args: any[]) => any, thisArg?: any) {
        const prefix = 'extension.brightscript.';
        const commandName = name.startsWith(prefix) ? name : prefix + name;
        this.context.subscriptions.push(vscode.commands.registerCommand(commandName, callback, thisArg));
    }

    private async sendAsciiToDevice(character: string) {
        let commandToSend: string = 'Lit_' + encodeURIComponent(character);
        await this.sendRemoteCommand(commandToSend);
    }
}
