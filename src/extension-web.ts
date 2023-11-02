import type * as vscode from 'vscode';

export class Extension {

    public async activate(context: vscode.ExtensionContext) {
    }
}

export const extension = new Extension();
export async function activate(context: vscode.ExtensionContext) {
    await extension.activate(context);
}
