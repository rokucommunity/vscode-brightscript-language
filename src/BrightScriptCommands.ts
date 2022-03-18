import * as request from 'request';
import * as vscode from 'vscode';
import BrightScriptFileUtils from './BrightScriptFileUtils';
import { GlobalStateManager } from './GlobalStateManager';
import { brighterScriptPreviewCommand } from './commands/BrighterScriptPreviewCommand';
import { languageServerInfoCommand } from './commands/LanguageServerInfoCommand';
import { SceneGraphDebugCommandController } from 'roku-debug';

export class BrightScriptCommands {

    constructor() {
        this.fileUtils = new BrightScriptFileUtils();
    }

    private fileUtils: BrightScriptFileUtils;
    private context: vscode.ExtensionContext;
    private host: string;

    public registerCommands(context: vscode.ExtensionContext) {
        this.context = context;

        brighterScriptPreviewCommand.register(context);
        languageServerInfoCommand.register(context);

        let subscriptions = context.subscriptions;

        subscriptions.push(vscode.commands.registerCommand('extension.brightscript.toggleXML', async () => {
            await this.onToggleXml();
        }));

        subscriptions.push(vscode.commands.registerCommand('extension.brightscript.clearGlobalState', async () => {
            new GlobalStateManager(this.context).clear();
            await vscode.window.showInformationMessage('BrightScript Language extension global state cleared');
        }));

        subscriptions.push(vscode.commands.registerCommand('extension.brightscript.sendRemoteCommand', async (key: string) => {
            await this.sendRemoteCommand(key);
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
            await vscode.commands.executeCommand('workbench.action.focusPanel');
        }));

        subscriptions.push(vscode.commands.registerCommand('extension.brightscript.pressBackButton', async () => {
            await this.sendRemoteCommand('Back');
        }));
        subscriptions.push(vscode.commands.registerCommand('extension.brightscript.pressBackspaceButton', async () => {
            await this.sendRemoteCommand('Backspace');
        }));
        subscriptions.push(vscode.commands.registerCommand('extension.brightscript.pressHomeButton', async () => {
            await this.sendRemoteCommand('Home');
        }));
        subscriptions.push(vscode.commands.registerCommand('extension.brightscript.pressUpButton', async () => {
            await this.sendRemoteCommand('Up');
        }));
        subscriptions.push(vscode.commands.registerCommand('extension.brightscript.pressDownButton', async () => {
            await this.sendRemoteCommand('Down');
        }));
        subscriptions.push(vscode.commands.registerCommand('extension.brightscript.pressRightButton', async () => {
            await this.sendRemoteCommand('Right');
        }));
        subscriptions.push(vscode.commands.registerCommand('extension.brightscript.pressLeftButton', async () => {
            await this.sendRemoteCommand('Left');
        }));
        subscriptions.push(vscode.commands.registerCommand('extension.brightscript.pressSelectButton', async () => {
            await this.sendRemoteCommand('Select');
        }));
        subscriptions.push(vscode.commands.registerCommand('extension.brightscript.pressPlayButton', async () => {
            await this.sendRemoteCommand('Play');
        }));
        subscriptions.push(vscode.commands.registerCommand('extension.brightscript.pressRevButton', async () => {
            await this.sendRemoteCommand('Rev');
        }));
        subscriptions.push(vscode.commands.registerCommand('extension.brightscript.pressFwdButton', async () => {
            await this.sendRemoteCommand('Fwd');
        }));
        subscriptions.push(vscode.commands.registerCommand('extension.brightscript.pressStarButton', async () => {
            await this.sendRemoteCommand('Info');
        }));
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

    public async sendRemoteCommand(key: string) {
        await this.getRemoteHost();
        if (this.host) {
            let clickUrl = `http://${this.host}:8060/keypress/${key}`;
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
    }

}

export const brightScriptCommands = new BrightScriptCommands();
