import * as vscode from 'vscode';
import * as request from 'request';

// tslint:disable-next-line
export var __request: any = request;

import BrightScriptFileUtils from './BrightScriptFileUtils';

// georgejecook: I can't find a way to stub/mock a TypeScript class constructor
// so I have to do this for the time being. Not ideal.
export function getBrightScriptCommandsInstance() {
    return new BrightScriptCommands();
}

export default class BrightScriptCommands {

    constructor() {
        this.fileUtils = new BrightScriptFileUtils();
    }

    private fileUtils: BrightScriptFileUtils;
    private context: vscode.ExtensionContext;
    public function;

    public rokuDeploy = require('roku-deploy');
    private valueName = 'isInRemoteMode';

    public registerCommands(context: vscode.ExtensionContext) {
        this.context = context;
        let subscriptions = context.subscriptions;
        subscriptions.push(vscode.commands.registerCommand('extension.brightscript.toggleXML', () => {
            this.onToggleXml();
        } ));
        subscriptions.push(vscode.commands.registerCommand('extension.brightscript.sendRemoteCommand', (key: string) => {
            this.sendRemoteCommand(key);
        } ));
        subscriptions.push(vscode.commands.registerCommand('extension.brightscript.toggleRemote', async () => {
            await this.onToggleRemoteMode();
        }));
    }

    public async openFile(filename: string) {
        let uri = vscode.Uri.file(filename);
        let doc = await vscode.workspace.openTextDocument(uri); // calls back into the provider
        await vscode.window.showTextDocument(doc, { preview: false });
    }

    public async onToggleXml() {
        if (vscode.window.activeTextEditor) {
            const currentDocument = vscode.window.activeTextEditor.document;
            let alternateFileName = this.fileUtils.getAlternateFileName(currentDocument.fileName);
            if (alternateFileName) {
                this.openFile(alternateFileName);
            }
        }
    }

    public async onToggleRemoteMode() {
        let isInRemoteMode = this.context.workspaceState.get(this.valueName, false);
        console.log(`onToggleRemoteMode ${this.valueName} was ${isInRemoteMode}. Setting it to ${!isInRemoteMode}`);
        await this.context.workspaceState.update(this.valueName, !isInRemoteMode);
    }

    public async sendRemoteCommand(key){
        let isInRemoteMode = this.context.workspaceState.get(this.valueName, false);
        console.log(`sendHome ${this.valueName} is ${isInRemoteMode}`);
        if (isInRemoteMode){
            let config = vscode.workspace.getConfiguration('brightscript.remoteControl', null);
            let host = config.get("host")
            let clickUrl = `http://${host}:8060/keypress/${key}`;
            console.log(`send ${clickUrl}`);
            return new Promise(function (resolve, reject) {
                request.post(clickUrl, function (err, response) {
                    if (err) {
                        return reject(err);
                    }
                    return resolve(response);
                });
            });

        }
    }
}
