import * as request from 'postman-request';
import * as vscode from 'vscode';
import BrightScriptFileUtils from './BrightScriptFileUtils';
import { GlobalStateManager } from './GlobalStateManager';
import { brighterScriptPreviewCommand } from './commands/BrighterScriptPreviewCommand';
import { captureScreenshotCommand } from './commands/CaptureScreenshotCommand';
import { languageServerInfoCommand } from './commands/LanguageServerInfoCommand';
import { util } from './util';
import { util as rokuDebugUtil } from 'roku-debug/dist/util';
import type { RemoteControlManager, RemoteControlModeInitiator } from './managers/RemoteControlManager';
import type { WhatsNewManager } from './managers/WhatsNewManager';
import type { ActiveDeviceManager } from './ActiveDeviceManager';
import * as rokuDeploy from 'roku-deploy';
import * as path from 'path';
import { readFileSync } from 'fs-extra';

export class BrightScriptCommands {

    constructor(
        private remoteControlManager: RemoteControlManager,
        private whatsNewManager: WhatsNewManager,
        private context: vscode.ExtensionContext,
        private activeDeviceManager: ActiveDeviceManager
    ) {
        this.fileUtils = new BrightScriptFileUtils();
    }

    private fileUtils: BrightScriptFileUtils;
    public host: string;
    public password: string;
    public workspacePath: string;
    private signingPassword: string;
    private signedPackagePath: string;
    private keypressNotifiers = [] as ((key: string, literalCharacter: boolean) => void)[];

    public registerCommands() {

        brighterScriptPreviewCommand.register(this.context);
        languageServerInfoCommand.register(this.context);
        captureScreenshotCommand.register(this.context, this);

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
            await this.sendRemoteCommand('FindVolumeUp');
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

        this.registerCommand('rekeyDevice', async () => {
            await this.rekeyDevice();
        });

        this.registerCommand('createPackage', async () => {
            await this.createPackage();
        });

        this.registerCommand('rekeyAndPackage', async () => {
            await this.rekeyDevice();
            await this.createPackage();
        });

        this.registerKeyboardInputs();
    }

    private async getRekeyConfigFromJson(rekeyConfig) {
        const options: vscode.OpenDialogOptions = {
            canSelectMany: false,
            openLabel: 'Select',
            canSelectFiles: true,
            canSelectFolders: false,
            filters: {
                'Json files': ['json']
            }
        };
        await this.getWorkspacePath();

        let fileUri = await vscode.window.showOpenDialog(options);
        if (fileUri?.[0]) {
            let content = JSON.parse(readFileSync(fileUri[0].fsPath).toString());

            if (content.signingPassword) {
                rekeyConfig.signingPassword = content.signingPassword;
            }

            if (content.rekeySignedPackage.includes('./')) {
                rekeyConfig.rekeySignedPackage = this.workspacePath + content.rekeySignedPackage.replace('./', '/');
            }

            if (content.host) {
                rekeyConfig.host = content.host;
            }

            if (content.password) {
                rekeyConfig.password = content.password;
            }
        }
        return rekeyConfig;
    }

    private async getRekeyManualEntries(rekeyConfig) {
        rekeyConfig.host = await vscode.window.showInputBox({
            placeHolder: 'Enter IP address of the Roku device you want to rekey',
            value: ''
        });

        rekeyConfig.password = await vscode.window.showInputBox({
            placeHolder: 'Enter password for the Roku device you want to rekey',
            value: ''
        });

        rekeyConfig.signingPassword = await vscode.window.showInputBox({
            placeHolder: 'Enter signingPassword to be used to rekey the Roku',
            value: ''
        });

        const options: vscode.OpenDialogOptions = {
            canSelectMany: false,
            openLabel: 'Select signed package file',
            canSelectFiles: true,
            canSelectFolders: false,
            filters: {
                'Pkg files': ['pkg']
            }
        };
        let fileUri = await vscode.window.showOpenDialog(options);
        if (fileUri?.[0]) {
            rekeyConfig.rekeySignedPackage = fileUri[0].fsPath;
        }

        return rekeyConfig;
    }

    private async rekeyDevice() {
        const PICK_FROM_JSON = 'Pick from Json file';
        const MANUAL_ENTRY = 'Enter manually';

        let rekeyConfig = {
            signingPassword: '',
            rekeySignedPackage: '',
            host: '',
            password: ''
        };

        let rekeyOptionList = [PICK_FROM_JSON, MANUAL_ENTRY];
        let rekeyOption = await vscode.window.showQuickPick(rekeyOptionList, { placeHolder: 'How do you want to select you configurations', canPickMany: false });
        if (rekeyOption) {
            switch (rekeyOption) {
                case PICK_FROM_JSON:
                    rekeyConfig = await this.getRekeyConfigFromJson(rekeyConfig);
                    break;

                case MANUAL_ENTRY:
                    rekeyConfig = await this.getRekeyManualEntries(rekeyConfig);
                    break;
            }
        }

        await rokuDeploy.rekeyDevice(rekeyConfig);
        void vscode.window.showInformationMessage(`Device successfully rekeyed!`);
    }

    private async createPackage() {
        await this.getWorkspacePath();
        let rokuDeployOptions = {
            rootDir: '',
            outDir: this.workspacePath + '/out',
            outFile: '',
            retainStagingDir: true,
            host: '',
            password: '',
            signingPassword: ''
        };

        let PACKAGE_FOLDER = 'Pick a folder';
        let PACKAGE_FROM_LAUNCH_JSON = 'Pick from a launch.json';
        let PACKAGE_FROM_ROKU_DEPLOY = 'Pick a rokudeploy.json';

        let packageOptionList = [PACKAGE_FOLDER, PACKAGE_FROM_LAUNCH_JSON, PACKAGE_FROM_ROKU_DEPLOY];
        let packageOption = await vscode.window.showQuickPick(packageOptionList, { placeHolder: 'What would you like to package', canPickMany: false });
        if (packageOption) {
            switch (packageOption) {
                case PACKAGE_FOLDER:
                    rokuDeployOptions = await this.packageFromFolder(rokuDeployOptions);
                    break;

                case PACKAGE_FROM_LAUNCH_JSON:
                    rokuDeployOptions = await this.packageFromLaunchConfig(rokuDeployOptions);
                    break;

                case PACKAGE_FROM_ROKU_DEPLOY:
                    rokuDeployOptions = await this.packageFromRokuDeploy(rokuDeployOptions);
                    break;
            }

            await this.getSigningPassword(false);
            await this.getRemoteHost(false);
            await this.getRemotePassword(false);

            let hostValue = rokuDeployOptions.host ? rokuDeployOptions.host : this.host;
            let passwordValue = rokuDeployOptions.password ? rokuDeployOptions.password : this.password;
            let signingPasswordValue = rokuDeployOptions.signingPassword ? rokuDeployOptions.signingPassword : this.signingPassword;

            rokuDeployOptions.host = await vscode.window.showInputBox({
                title: 'Enter IP address of the Roku device',
                value: hostValue ? hostValue : ''
            });

            rokuDeployOptions.password = await vscode.window.showInputBox({
                title: 'Enter password for the Roku device',
                value: passwordValue ? passwordValue : ''
            });

            rokuDeployOptions.signingPassword = await vscode.window.showInputBox({
                title: 'Enter signingPassword to be used to rekey the Roku',
                value: signingPasswordValue ? signingPasswordValue : ''
            });

            let confirmText = 'Create Package';
            let cancelText = 'Cancel';
            let response = await vscode.window.showInformationMessage(
                'Please confirm details below to create package \n' + JSON.stringify(rokuDeployOptions),
                ...[confirmText, cancelText]
            );
            if (response === confirmText) {
                //create a zip and pkg file of the app based on the selected launch config
                await rokuDeploy.createPackage(rokuDeployOptions);
                let remotePkgPath = await rokuDeploy.signExistingPackage(rokuDeployOptions);
                await rokuDeploy.retrieveSignedPackage(remotePkgPath, rokuDeployOptions);
                void vscode.window.showInformationMessage(`Package successfully created!`);
            }
        }
    }

    private async packageFromFolder(rokuDeployOptions) {
        const options: vscode.OpenDialogOptions = {
            canSelectMany: false,
            openLabel: 'Select Folder to package',
            canSelectFiles: false,
            canSelectFolders: true
        };
        let fileUri = await vscode.window.showOpenDialog(options);
        if (fileUri?.[0]) {
            let rootDir = fileUri?.[0].fsPath;
            let rootDirArray = rootDir.split('/');
            let outFileName = rootDirArray[rootDirArray.length - 1];

            rokuDeployOptions.rootDir = rootDir;
            rokuDeployOptions.outFile = 'roku-' + outFileName.replace(/ /g, '-');

            return rokuDeployOptions;
        }
    }


    private async packageFromRokuDeploy(rokuDeployOptions) {
        const options: vscode.OpenDialogOptions = {
            canSelectMany: false,
            openLabel: 'Select',
            canSelectFiles: true,
            canSelectFolders: false,
            filters: {
                'Json files': ['json']
            }
        };
        await this.getWorkspacePath();

        let fileUri = await vscode.window.showOpenDialog(options);
        if (fileUri?.[0]) {
            return this.parseRokuDeployJson(fileUri[0].fsPath, rokuDeployOptions);
        }
        return rokuDeployOptions;
    }

    private async packageFromLaunchConfig(rokuDeployOptions) {
        await this.getWorkspacePath();
        let config = vscode.workspace.getConfiguration('launch', null);
        const configurations = config.get<any[]>('configurations');
        let configNames = [];
        for (let config of configurations) {
            configNames.push(config.name);
        }

        //show user a list of available launch configs to choose from
        let selectedConfig = configurations[0];
        let selectedConfigName = await vscode.window.showQuickPick(configNames, { placeHolder: 'Please select a config', canPickMany: false });
        if (selectedConfigName) {
            let selectedIndex = configNames.indexOf(selectedConfigName);
            selectedConfig = configurations[selectedIndex];
        }

        if (selectedConfig.rootDir?.includes('${workspaceFolder}')) {
            selectedConfig.rootDir = path.normalize(selectedConfig.rootDir.replace('${workspaceFolder}', this.workspacePath));
        }

        if (!selectedConfig.host.includes('${')) {
            rokuDeployOptions.host = selectedConfig.host;
        }

        if (!selectedConfig.password.includes('${')) {
            rokuDeployOptions.password = selectedConfig.password;
        }

        rokuDeployOptions.rootDir = selectedConfig.rootDir;
        rokuDeployOptions.files = selectedConfig.files;
        rokuDeployOptions.outFile = 'roku-' + selectedConfig.name.replace(/ /g, '-');

        return rokuDeployOptions;
    }

    private async parseRokuDeployJson(filePath: string, rokuDeployOptions) {
        let content = JSON.parse(readFileSync(filePath).toString());

        if (content.signingPassword) {
            rokuDeployOptions.signingPassword = content.signingPassword;
        }

        await this.getWorkspacePath();
        if (content.rekeySignedPackage?.includes('./')) {
            rokuDeployOptions.rekeySignedPackage = this.workspacePath + content.rekeySignedPackage.replace('./', '/');
        }

        if (content.host) {
            rokuDeployOptions.host = content.host;
        }

        if (content.password) {
            rokuDeployOptions.password = content.password;
        }

        if (content.rootDir?.includes('./')) {
            rokuDeployOptions.rootDir = this.workspacePath + content.rootDir.replace('./', '/');
        }

        if (content.outDir?.includes('./')) {
            rokuDeployOptions.outDir = this.workspacePath + content.outDir.replace('./', '/');
        }

        if (content.outFile) {
            rokuDeployOptions.outFile = content.outFile;
        }

        if (content.retainStagingDir) {
            rokuDeployOptions.retainStagingDir = content.retainStagingDir;
        }

        return rokuDeployOptions;
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
            if (vscode.workspace.workspaceFolders.length === 1) {
                this.workspacePath = vscode.workspace.workspaceFolders[0].uri.fsPath;
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

    public async getSigningPassword(showPrompt = true) {
        this.signingPassword = await this.context.workspaceState.get('signingPassword');
        if (!this.signingPassword) {
            let config = vscode.workspace.getConfiguration('brightscript.remoteControl', null);
            this.signingPassword = config.get('signingPassword');
            // eslint-disable-next-line no-template-curly-in-string
            if (!this.signingPassword && showPrompt) {
                this.signingPassword = await vscode.window.showInputBox({
                    placeHolder: 'Enter the signing password used for creating signed packages',
                    value: ''
                });
            }
        }
        if (!this.signingPassword) {
            throw new Error('Can\'t send command: signingPassword is required.');
        } else {
            await this.context.workspaceState.update('signingPassword', this.signingPassword);
        }
    }

    public async getSignedPackagePath() {
        this.signedPackagePath = await this.context.workspaceState.get('signedPackagePath');
        if (!this.signedPackagePath) {
            let config = vscode.workspace.getConfiguration('brightscript.remoteControl', null);
            this.signedPackagePath = config.get('signedPackagePath');
            // eslint-disable-next-line no-template-curly-in-string
            if (!this.signedPackagePath) {
                this.signedPackagePath = await vscode.window.showInputBox({
                    placeHolder: 'Enter the path for the signed package',
                    value: ''
                });
            }
        }
        if (!this.signedPackagePath) {
            throw new Error('Can\'t send command: Signed Package Path is required.');
        } else {
            await this.context.workspaceState.update('signedPackagePath', this.signedPackagePath);
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
