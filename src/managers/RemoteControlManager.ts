import * as vscode from 'vscode';
import { vscodeContextManager } from './VscodeContextManager';
import type { TelemetryManager } from './TelemetryManager';
import { VscodeCommand } from '../commands/VscodeCommand';

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

        // Only move focus when we have enabled remote mode
        if (!this.isEnabled) {
            return;
        }

        //focus the active text editor (if there is one)
        if (vscode.window.activeTextEditor?.document) {
            await vscode.window.showTextDocument(vscode.window.activeTextEditor.document);

            //there's no active text editor. Move focus away from the the currently focused view item (somehow)
        } else {
            //focus the next editor group, then the previous editor group.
            //This is safe to call when there are no editor groups, so it's a good way to remove focus from the statusbar item
            await vscode.commands.executeCommand('workbench.action.focusNextGroup');
            await vscode.commands.executeCommand('workbench.action.focusPreviousGroup');
        }
    }

    public async setRemoteControlMode(isEnabled: boolean, initiator: RemoteControlModeInitiator) {
        if (this.isEnabled && !isEnabled) {
            // Want to also stop Roku automation recording if it was running
            await vscode.commands.executeCommand(VscodeCommand.rokuAutomationViewStopRecording);
        }

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

export type RemoteControlModeInitiator = 'statusbar' | 'command' | 'launch';
