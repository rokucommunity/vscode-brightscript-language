import type * as vscode from 'vscode';

//TODO move this to a common file since it's duplicated in extension.ts
const EXTENSION_ID = 'RokuCommunity.brightscript';

export class Extension {

    public async activate(context: vscode.ExtensionContext) {
    }
}

export const extension = new Extension();
export async function activate(context: vscode.ExtensionContext) {
    await extension.activate(context);
}
