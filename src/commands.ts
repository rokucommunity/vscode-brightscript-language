import * as vscode from 'vscode';

export function registerCommands({ subscriptions }: vscode.ExtensionContext) {

    async function openFile(filename: string) {
        let uri = vscode.Uri.file(filename);
        let doc = await vscode.workspace.openTextDocument(uri); // calls back into the provider
        await vscode.window.showTextDocument(doc, {preview: false});
    }

    // register a command that opens a cowsay-document
  subscriptions.push(vscode.commands.registerCommand('extension.brightscript.toggleXML', async () => {
    if (vscode.window.activeTextEditor) {
      const currentDocument = vscode.window.activeTextEditor.document;
      if (currentDocument !== undefined && currentDocument.fileName.toLowerCase().endsWith(".brs")){
        //jump to xml file
        openFile(currentDocument.fileName.substring(0, currentDocument.fileName.length - 4) + ".xml");
      } else if (currentDocument !== undefined && currentDocument.fileName.toLowerCase().endsWith(".xml")){
        //jump to brs file
        openFile(currentDocument.fileName.substring(0, currentDocument.fileName.length - 4) + ".brs");
      }
    }
  }));
}