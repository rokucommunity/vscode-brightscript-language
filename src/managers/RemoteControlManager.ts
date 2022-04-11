import * as vscode from 'vscode';
import { vscodeContextManager } from './VscodeContextManager';
import type { TelemetryManager } from './TelemetryManager';

export class RemoteControlManager {
    constructor(
        private context: vscode.ExtensionContext,
        private telemetryManager: TelemetryManager
    ) {
        this.remoteControlStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right);
        void this.setRemoteControlMode(false, undefined);
    }

    private default = {
        color: undefined,
        backgroundColor: undefined
    };

    private colors = {
        default: {
            color: undefined,
            backgroundColor: undefined
        },
        primary: {
            color: new vscode.ThemeColor(
                'statusBarItem.errorForeground'
            ),
            backgroundColor: new vscode.ThemeColor(
                'statusBarItem.errorBackground'
            )
        },
        secondary: {
            color: new vscode.ThemeColor(
                'statusBarItem.warningForeground'
            ),
            backgroundColor: new vscode.ThemeColor(
                'statusBarItem.warningBackground'
            )
        }
    };

    private remoteControlStatusBarItem: vscode.StatusBarItem;

    public async toggleRemoteControlMode(initiator: RemoteControlModeInitiator) {
        const currentMode = vscodeContextManager.get<boolean>('brightscript.isRemoteControlMode', false);
        await this.setRemoteControlMode(!currentMode, initiator);
    }

    public async setRemoteControlMode(isEnabled: boolean, initiator: RemoteControlModeInitiator) {
        //only send a telemetry event if we know who initiated the mode. `undefined` usually means our internal system set the value...so don't track that
        if (initiator) {
            this.telemetryManager.sendSetRemoteControlModeEvent(isEnabled, initiator);
        }
        await vscodeContextManager.set('brightscript.isRemoteControlMode', isEnabled);
        const currentState = isEnabled ? 'enabled' : 'disabled';
        this.remoteControlStatusBarItem.text = `$(radio-tower) Remote: ${currentState} `;
        //set the initial statusbar colors
        Object.assign(this.remoteControlStatusBarItem, this.colors.default);
        this.remoteControlStatusBarItem.command = {
            title: 'Toggle Remote Control Mode',
            command: 'extension.brightscript.toggleRemoteControlMode',
            arguments: ['statusbar']
        };
        this.remoteControlStatusBarItem.tooltip = `Roku remote control mode is: ${currentState}`;
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
            let colorKey = 'primary';
            const handle = setInterval(() => {
                colorKey = colorKey === 'primary' ? 'secondary' : 'primary';
                Object.assign(this.remoteControlStatusBarItem, this.colors[colorKey]);
            }, 500);
            this.remoteControlStatusBarItem.show();
            this.disableFlasher = () => {
                clearInterval(handle);
                Object.assign(this.remoteControlStatusBarItem, this.colors.default);
                // this.remoteControlStatusBarItem.hide();
                delete this.disableFlasher;
            };
        }
    }
}

export type RemoteControlModeInitiator = 'statusbar' | 'command';
