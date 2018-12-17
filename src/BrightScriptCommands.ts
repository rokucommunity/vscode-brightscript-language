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
    private host: string;
    private myStatusBarItem: vscode.StatusBarItem;
    private remoteInfoMessage: vscode.MessageItem;
    private colorCustomizations: Object;
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
        this.myStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
        this.myStatusBarItem.command = 'brightscript.showRokuRemoteEnabled';
        subscriptions.push(this.myStatusBarItem);
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
        await vscode.commands.executeCommand('setContext', this.valueName, !isInRemoteMode);
        this.updateStatusBarItem(!isInRemoteMode);
        const configuration = vscode.workspace.getConfiguration('workbench');
        if (!isInRemoteMode){
            configuration.update('colorCustomizations', {"statusBar.background" : "#551A8B", "statusBar.debuggingBackground": "#551A8B"}, true);
        }else{
            configuration.update('colorCustomizations', {}, true);
        }
    }


    public async sendRemoteCommand(key: string){
        await this.getRemoteHost()
        if (this.host){
            let clickUrl = `http://${this.host}:8060/keypress/${key}`;
            console.log(`send ${clickUrl}`);
            this.updateStatusBarItem(true, key);
            return new Promise(function (resolve, reject) {
                request.post(clickUrl, function (err, response) {
                    if (err) {
                        return reject(err);
                    }
                    return resolve(response);
                });
            });
        };
    }

    public async getRemoteHost(){
        let isInRemoteMode = this.context.workspaceState.get(this.valueName, false);
        this.host = await this.context.workspaceState.get('remoteHost');
        if (this.host == undefined){
            let config = await vscode.workspace.getConfiguration('brightscript.remoteControl', null);
            this.host = config.get("host")
            if (this.host === '${promptForHost}') {
                this.host = await vscode.window.showInputBox({
                    placeHolder: 'The IP address of your Roku device',
                    value: ''
                });
            }
        }
        if (!this.host) {
            throw new Error('Can\'t send command: host is required.');
        }else{
            await this.context.workspaceState.update('remoteHost', this.host);
        }
    }

    public async updateStatusBarItem(isInRemoteMode: boolean, keyPressed = undefined){
        console.log(`updateStatusBarItem isInRemoteMode: ${isInRemoteMode}.`);
        if (isInRemoteMode){
            if (keyPressed){
                this.myStatusBarItem.text = `Roku Remote Active and ${keyPressed} pressed`;
            }else{
                this.myStatusBarItem.text = "Roku Remote Active";
            }
            this.myStatusBarItem.show();
        } else{
            this.myStatusBarItem.hide();
        }
    }
}
