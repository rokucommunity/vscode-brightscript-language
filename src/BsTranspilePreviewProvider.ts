import * as vscode from 'vscode';
import * as fs from 'fs';
import { extension } from './extension';

export class BsTranspilePreviewProvider {
    constructor() {
        //register BrighterScript transpile preview handler
        vscode.workspace.registerTextDocumentContentProvider('bs-transpile-preview', this);
    }

    // emitter and its event
    public onDidChangeEmitter = new vscode.EventEmitter<vscode.Uri>();
    public onDidChange = this.onDidChangeEmitter.event;

    public async provideTextDocumentContent(uri: vscode.Uri) {
        let result = await extension.languageServerManager.getTranspiledFileContents(uri.fsPath);
        return result.code;
    }
}
