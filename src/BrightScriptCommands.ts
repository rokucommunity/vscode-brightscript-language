import * as vscode from 'vscode';

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
    public function;

    public registerCommands({ subscriptions }: vscode.ExtensionContext) {
        subscriptions.push(vscode.commands.registerCommand('extension.brightscript.toggleXML', () => {
            this.onToggleXml();
        } ));
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
}
