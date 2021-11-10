import * as request from 'request';
import * as vscode from 'vscode';
import BrightScriptFileUtils from './BrightScriptFileUtils';
import { GlobalStateManager } from './GlobalStateManager';
import { brighterScriptPreviewCommand } from './commands/BrighterScriptPreviewCommand';
import { languageServerInfoCommand } from './commands/LanguageServerInfoCommand';
import { SceneGraphDebugCommandController } from 'roku-debug';
import * as rokuDeploy from 'roku-deploy';
import { BrightScriptDebugConfigurationProvider } from './DebugConfigurationProvider';

export class BrightScriptCommands {
    constructor(
        private context: vscode.ExtensionContext,
        private debugConfigProvider: BrightScriptDebugConfigurationProvider,
        private globalStateManager: GlobalStateManager
    ) {
        this.fileUtils = new BrightScriptFileUtils();
    }

    private fileUtils: BrightScriptFileUtils;
    private host: string;
    private password: string;

    public registerCommands() {
        brighterScriptPreviewCommand.register(this.context);
        languageServerInfoCommand.register(this.context);

        let subscriptions = this.context.subscriptions;

        subscriptions.push(vscode.commands.registerCommand('extension.brightscript.toggleXML', () => {
            this.onToggleXml();
        }));

        subscriptions.push(vscode.commands.registerCommand('extension.brightscript.clearGlobalState', () => {
            new GlobalStateManager(this.context).clear();
            vscode.window.showInformationMessage('BrightScript Language extension global state cleared');
        }));

        subscriptions.push(vscode.commands.registerCommand('extension.brightscript.sendRemoteCommand', (key: string) => {
            this.sendRemoteCommand(key);
        }));

        subscriptions.push(vscode.commands.registerCommand('extension.brightscript.sendRemoteText', async () => {
            let stuffUserTyped: string = await vscode.window.showInputBox({
                placeHolder: 'Press enter to send all typed characters to the Roku',
                value: ''
            });
            if (stuffUserTyped) {
                let fallbackToHttp = true;
                await this.getRemoteHost();
                try {
                    let commandController = new SceneGraphDebugCommandController(this.host);
                    let response = await commandController.type(stuffUserTyped);
                    if (!response.error) {
                        fallbackToHttp = false;
                    }
                } catch (error) {
                    // Let this fallback to the old HTTP based logic
                }

                if (fallbackToHttp) {
                    for (let character of stuffUserTyped) {
                        let commandToSend: string = 'Lit_' + encodeURIComponent(character);
                        await this.sendRemoteCommand(commandToSend);
                    }
                }
            }
            vscode.commands.executeCommand('workbench.action.focusPanel');
        }));

        subscriptions.push(vscode.commands.registerCommand('extension.brightscript.deleteDevChannel', () => {
            this.deleteDevChannel();
        }));

        subscriptions.push(vscode.commands.registerCommand('extension.brightscript.pressBackButton', () => {
            this.sendRemoteCommand('Back');
        }));
        subscriptions.push(vscode.commands.registerCommand('extension.brightscript.pressBackspaceButton', () => {
            this.sendRemoteCommand('Backspace');
        }));
        subscriptions.push(vscode.commands.registerCommand('extension.brightscript.pressHomeButton', () => {
            this.sendRemoteCommand('Home');
        }));
        subscriptions.push(vscode.commands.registerCommand('extension.brightscript.pressUpButton', () => {
            this.sendRemoteCommand('Up');
        }));
        subscriptions.push(vscode.commands.registerCommand('extension.brightscript.pressDownButton', () => {
            this.sendRemoteCommand('Down');
        }));
        subscriptions.push(vscode.commands.registerCommand('extension.brightscript.pressRightButton', () => {
            this.sendRemoteCommand('Right');
        }));
        subscriptions.push(vscode.commands.registerCommand('extension.brightscript.pressLeftButton', () => {
            this.sendRemoteCommand('Left');
        }));
        subscriptions.push(vscode.commands.registerCommand('extension.brightscript.pressSelectButton', () => {
            this.sendRemoteCommand('Select');
        }));
        subscriptions.push(vscode.commands.registerCommand('extension.brightscript.pressPlayButton', () => {
            this.sendRemoteCommand('Play');
        }));
        subscriptions.push(vscode.commands.registerCommand('extension.brightscript.pressRevButton', () => {
            this.sendRemoteCommand('Rev');
        }));
        subscriptions.push(vscode.commands.registerCommand('extension.brightscript.pressFwdButton', () => {
            this.sendRemoteCommand('Fwd');
        }));
        subscriptions.push(vscode.commands.registerCommand('extension.brightscript.pressStarButton', () => {
            this.sendRemoteCommand('Info');
        }));
    }

    public async openFile(filename: string, range: vscode.Range = null, preview: boolean = false): Promise<boolean> {
        let uri = vscode.Uri.file(filename);
        try {
            let doc = await vscode.workspace.openTextDocument(uri); // calls back into the provider
            await vscode.window.showTextDocument(doc, { preview: preview });
            if (range) {
                this.gotoRange(range);
            }
        } catch (e) {
            return false;
        }
        return true;
    }

    private gotoRange(range: vscode.Range) {
        let editor = vscode.window.activeTextEditor;
        editor.selection = new vscode.Selection(
            range.start.line,
            range.start.character,
            range.start.line,
            range.start.character
        );
        vscode.commands.executeCommand('revealLine', {
            lineNumber: range.start.line,
            at: 'center'
        });
    }

    public async onToggleXml() {
        if (vscode.window.activeTextEditor) {
            const currentDocument = vscode.window.activeTextEditor.document;
            let alternateFileName = this.fileUtils.getAlternateFileName(currentDocument.fileName);
            if (alternateFileName) {
                if (! await this.openFile(alternateFileName)
                    && alternateFileName.toLowerCase().endsWith('.brs')) {
                    await this.openFile(this.fileUtils.getBsFileName(alternateFileName));
                }
            }
        }
    }

    public async deleteDevChannel() {
        await this.getRemoteHost();
        await this.getRemotePassword();
        try {
            await rokuDeploy.deleteInstalledChannel({
                host: this.host,
                password: this.password
            });
            vscode.window.showInformationMessage(`dev channel deleted from ${this.host}`);
        } catch (e) {
            if (e.message.toLowerCase() === 'delete failed: no such file or directory.') {
                vscode.window.showInformationMessage(`no dev channel to delete on ${this.host}`);
            } else {
                console.error(e);
                vscode.window.showErrorMessage(e.message);
            }
        }
    }

    public async sendRemoteCommand(key: string) {
        await this.getRemoteHost();
        if (this.host) {
            let clickUrl = `http://${this.host}:8060/keypress/${key}`;
            console.log(`send ${clickUrl}`);
            return new Promise(function(resolve, reject) {
                request.post(clickUrl, function(err, response) {
                    if (err) {
                        return reject(err);
                    }
                    return resolve(response);
                });
            });
        }
    }

    private async getRemoteHost() {
        this.host = await this.globalStateManager.remoteHost;

        if (!this.host) {
            const config = await this.debugConfigProvider.processHostParameter({
                host: await vscode.workspace.getConfiguration('brightscript.remoteControl', null)?.get('host')
            } as any);
            this.host = config?.host;
        }
        if (!this.host) {
            throw new Error('Can\'t send command: host is required.');
        } else {
            this.globalStateManager.remoteHost = this.host;
        }
    }

    private async getRemotePassword() {
        this.password = this.globalStateManager.remotePassword;
        if (!this.password) {
            this.password = (await this.debugConfigProvider.processPasswordParameter({
                password: await vscode.workspace.getConfiguration('brightscript.remoteControl', null)?.get('password')
            } as any))?.password;
        }

        if (!this.password) {
            throw new Error('Can\'t send command: host is required.');
        } else {
            this.globalStateManager.remotePassword = this.password;
        }
    }
}
