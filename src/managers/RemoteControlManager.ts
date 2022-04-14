import * as vscode from 'vscode';
import { vscodeContextManager } from './VscodeContextManager';
import type { TelemetryManager } from './TelemetryManager';

export class RemoteControlManager {
    constructor(
        private telemetryManager: TelemetryManager
    ) {
        this.remoteControlStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right);
        void this.setRemoteControlMode(this.isEnabled, undefined);

        //keep the user's button flashing preference in sync
        vscode.workspace.onDidChangeConfiguration(() => {
            this.loadIsFlasherAllowedByUser();
        });
        this.loadIsFlasherAllowedByUser();
    }

    private loadIsFlasherAllowedByUser() {
        this.isFlasherAllowedByUser = vscode.workspace.getConfiguration('brightscript')?.get('remoteControlMode.enableActiveAnimation') ?? true;
    }

    private isEnabled = false;

    private isFlasherAllowedByUser: boolean;

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
        this.isEnabled = isEnabled;
        if (this.isEnabled) {
            this.enableFlasher();
        } else {
            this.disableFlasher?.();
        }
    }

    private disableFlasher: () => void;
    public enableFlasher() {
        if (!this.disableFlasher) {
            let colorKey = 'primary';

            const toggleStatusbarColors = () => {
                colorKey = colorKey === 'primary' ? 'secondary' : 'primary';
                Object.assign(this.remoteControlStatusBarItem, this.colors[colorKey]);
            };

            toggleStatusbarColors();

            const handle = setInterval(() => {
                if (this.isFlasherAllowedByUser) {
                    toggleStatusbarColors();
                }
            }, 500);

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
