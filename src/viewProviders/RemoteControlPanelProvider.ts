import * as vscode from 'vscode';
import { BaseWebviewViewProvider } from './BaseWebviewViewProvider';
import { ViewProviderId } from './ViewProviderId';
import { ViewProviderCommand } from './ViewProviderCommand';
import { ViewProviderEvent } from './ViewProviderEvent';
import { VscodeCommand } from '../commands/VscodeCommand';

/**
 * Provides a webview panel for virtual remote control with visual feedback
 */
export class RemoteControlPanelProvider extends BaseWebviewViewProvider {
    public readonly id = ViewProviderId.remoteControlPanel;

    constructor(context: vscode.ExtensionContext, dependencies) {
        super(context, dependencies);

        console.log('RemoteControlPanelProvider constructor');

        this.registerCommand(VscodeCommand.openRemoteControlPanelInPanel, async () => {
            await this.createOrRevealWebviewPanel();
        });

        // Handle remote command requests from the webview
        this.addMessageCommandCallback(ViewProviderCommand.sendRemoteCommand, async (message) => {
            const button = message.context.button;
            console.log('RemoteControlPanelProvider received sendRemoteCommand:', button);

            // Map button names to the corresponding press command
            const commandMap = {
                'Power': 'pressPowerButton',
                'Back': 'pressBackButton',
                'Home': 'pressHomeButton',
                'Up': 'pressUpButton',
                'Down': 'pressDownButton',
                'Left': 'pressLeftButton',
                'Right': 'pressRightButton',
                'Select': 'pressSelectButton',
                'InstantReplay': 'pressInstantReplayButton',
                'Search': 'pressSearchButton',
                'Info': 'pressInfoButton',
                'Rev': 'pressRevButton',
                'Play': 'pressPlayButton',
                'Fwd': 'pressFwdButton',
                'Blue': 'pressBlueButton',
                'Green': 'pressGreenButton',
                'Red': 'pressRedButton',
                'Yellow': 'pressYellowButton',
                'Exit': 'pressExitButton',
                'Guide': 'pressGuideButton',
                'VolumeUp': 'pressVolumeUpButton',
                'VolumeDown': 'pressVolumeDownButton',
                'VolumeMute': 'pressVolumeMuteButton'
            };

            const commandName = commandMap[button];
            if (commandName) {
                try {
                    await vscode.commands.executeCommand(`extension.brightscript.${commandName}`);
                    this.postOrQueueMessage(this.createResponseMessage(message));
                } catch (error) {
                    this.postOrQueueMessage(this.createResponseMessage(message, undefined, error.message));
                }
            } else {
                this.postOrQueueMessage(this.createResponseMessage(message, undefined, `Unknown button: ${button}`));
            }
            return true;
        });

        // Handle text input requests from the webview
        this.addMessageCommandCallback(ViewProviderCommand.sendRemoteText, async (message) => {
            const text = message.context.text;
            try {
                await vscode.commands.executeCommand('extension.brightscript.sendRemoteText', text);
                this.postOrQueueMessage(this.createResponseMessage(message));
            } catch (error) {
                this.postOrQueueMessage(this.createResponseMessage(message, undefined, error.message));
            }
            return true;
        });
    }

    public onViewReady() {
        // Send initial device connection status when view is ready
        console.log('RemoteControlPanelProvider.onViewReady()');
        this.updateDeviceStatus();
    }

    private updateDeviceStatus() {
        // Check if there's a remoteHost set in workspace state
        const remoteHost = this.extensionContext.workspaceState.get<string>('remoteHost');
        console.log('RemoteControlPanelProvider.updateDeviceStatus(), remoteHost:', remoteHost);

        const message = this.createEventMessage(ViewProviderEvent.onDeviceConnectionChanged, {
            connected: !!remoteHost,
            deviceName: remoteHost || ''
        });
        console.log('RemoteControlPanelProvider sending event:', message);
        this.postOrQueueMessage(message);
    }

    /**
     * Public method to update device status when remoteHost changes
     * Can be called from BrightScriptCommands when setActiveDevice is called
     */
    public updateRemoteHost() {
        this.updateDeviceStatus();
    }

    public onDidStartDebugSession(e: vscode.DebugSession) {
        // When a debug session starts, also update based on workspace state
        // as the remoteHost might have been set
        this.updateDeviceStatus();
    }

    public onDidTerminateDebugSession(e: vscode.DebugSession) {
        // When debug session ends, check if remoteHost is still set
        // (it might still be set from previous sessions)
        this.updateDeviceStatus();
    }

    /**
     * Override to open the panel to the side instead of in the active column
     */
    protected async createOrRevealWebviewPanel() {
        // See if we need to make the panel or not
        let createPanel = false;
        if (!this.panel) {
            createPanel = true;
        } else {
            try {
                if (!this.panel.active) {
                    // If we still exist and aren't active then reveal the panel
                    this.panel.reveal();
                }
            } catch (e) {
                createPanel = true;
            }
        }

        if (createPanel) {
            this.panel = vscode.window.createWebviewPanel(
                this.id,
                'Remote Control Panel',
                vscode.ViewColumn.Beside, // Open to the side instead of active column
                {
                    // Enable javascript in the webview
                    enableScripts: true,
                    localResourceRoots: [
                        vscode.Uri.file(this.webviewBasePath)
                    ]
                }
            );

            this.setupViewMessageObserver(this.panel.webview);

            const html = await this.getHtmlForWebview();
            this.panel.webview.html = html;
        }
    }
}
