import * as vscode from 'vscode';
import { vscodeContextManager } from './VscodeContextManager';

export class RemoteControlManager {
    constructor(
        private context: vscode.ExtensionContext
    ) {
        this.remoteControlStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right);
        void this.setRemoteControlMode(false);
    }

    private primaryColor = '#FFFFFF';
    private secondaryColor = '#FF7070';

    private remoteControlStatusBarItem: vscode.StatusBarItem;

    public async toggleRemoteControlMode() {
        const currentMode = vscodeContextManager.get<boolean>('brightscript.isRemoteControlMode', false);
        await this.setRemoteControlMode(!currentMode);
    }

    public async setRemoteControlMode(isEnabled: boolean) {
        await vscodeContextManager.set('brightscript.isRemoteControlMode', isEnabled);
        const oppositeAction = isEnabled ? 'Disable' : 'Enable';
        this.remoteControlStatusBarItem.text = `$(flame) ${oppositeAction} Remote`;
        this.remoteControlStatusBarItem.color = this.primaryColor;
        this.remoteControlStatusBarItem.command = 'extension.brightscript.toggleRemoteControlMode';
        this.remoteControlStatusBarItem.tooltip = `${oppositeAction} remote control mode`;
        this.remoteControlStatusBarItem.show();

        if (isEnabled) {
            this.enableFlasher();
        } else {
            this.disableFlasher?.();
        }
    }

    private disableFlasher: () => void;
    public enableFlasher() {
        if (!this.disableFlasher) {
            const handle = setInterval(() => {
                this.remoteControlStatusBarItem.color = this.remoteControlStatusBarItem.color === this.primaryColor ? this.secondaryColor : this.primaryColor;
            }, 500);
            this.remoteControlStatusBarItem.show();
            this.disableFlasher = () => {
                clearInterval(handle);
                this.remoteControlStatusBarItem.color = this.primaryColor;
                // this.remoteControlStatusBarItem.hide();
                delete this.disableFlasher;
            };
        }
    }
}
