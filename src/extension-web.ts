import * as vscode from 'vscode';
import { TelemetryManager } from './managers/TelemetryManager';

//TODO move this to a common file since it's duplicated in extension.ts
const EXTENSION_ID = 'RokuCommunity.brightscript';

export class Extension {
    private analyticsManager: TelemetryManager;

    public async activate(context: vscode.ExtensionContext) {
        const currentExtensionVersion = '1.0.1'; //TODO get this somehow...perhaps inject during the build process since we don't have access to package.json in web?
        //initialize the analytics manager
        context.subscriptions.push(
            this.analyticsManager = new TelemetryManager({
                extensionId: EXTENSION_ID,
                extensionVersion: currentExtensionVersion
            })
        );

        this.analyticsManager.sendStartupEvent();
    }
}

export const extension = new Extension();
export function activate(context: vscode.ExtensionContext) {
    extension.activate(context);
}
