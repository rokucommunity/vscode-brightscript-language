import * as vscode from 'vscode';
import * as path from 'path';
import * as fsExtra from 'fs-extra';
import { BaseWebviewViewProvider } from './BaseWebviewViewProvider';
import { ViewProviderId } from './ViewProviderId';
import { ViewProviderCommand } from './ViewProviderCommand';
import { ViewProviderEvent } from './ViewProviderEvent';
import { VscodeCommand } from '../commands/VscodeCommand';
import { vscodeContextManager } from '../managers/VscodeContextManager';

/**
 * Provides a webview panel for virtual remote control with visual feedback
 */
export class RemoteControlPanelProvider extends BaseWebviewViewProvider {
    public readonly id = ViewProviderId.remoteControlPanel;

    // Maps button names (as used in the webview) to their VS Code command IDs
    private static readonly buttonCommandMap: Record<string, string> = {
        'Power': 'extension.brightscript.pressPowerButton',
        'Back': 'extension.brightscript.pressBackButton',
        'Home': 'extension.brightscript.pressHomeButton',
        'Up': 'extension.brightscript.pressUpButton',
        'Down': 'extension.brightscript.pressDownButton',
        'Left': 'extension.brightscript.pressLeftButton',
        'Right': 'extension.brightscript.pressRightButton',
        'Select': 'extension.brightscript.pressSelectButton',
        'InstantReplay': 'extension.brightscript.pressInstantReplayButton',
        'Info': 'extension.brightscript.pressStarButton',
        'Rev': 'extension.brightscript.pressRevButton',
        'Play': 'extension.brightscript.pressPlayButton',
        'Fwd': 'extension.brightscript.pressFwdButton',
        'Blue': 'extension.brightscript.pressBlue',
        'Green': 'extension.brightscript.pressGreen',
        'Red': 'extension.brightscript.pressRed',
        'Yellow': 'extension.brightscript.pressYellow',
        'Exit': 'extension.brightscript.pressExit',
        'VolumeUp': 'extension.brightscript.pressVolumeUp',
        'VolumeDown': 'extension.brightscript.pressVolumeDown',
        'VolumeMute': 'extension.brightscript.pressVolumeMute'
    };

    constructor(context: vscode.ExtensionContext, dependencies) {
        super(context, dependencies);

        console.log('RemoteControlPanelProvider constructor');
        this.setupKeybindingsWatcher();

        this.registerCommand(VscodeCommand.openRemoteControlPanelInPanel, async () => {
            await this.createOrRevealWebviewPanel();
        });

        // Restore the panel when VS Code reopens a window that had it open
        context.subscriptions.push(
            vscode.window.registerWebviewPanelSerializer(this.id, {
                deserializeWebviewPanel: async (webviewPanel: vscode.WebviewPanel) => {
                    this.panel = webviewPanel;
                    webviewPanel.onDidDispose(() => {
                        this.panel = undefined;
                    });
                    this.setupViewMessageObserver(webviewPanel.webview);
                    webviewPanel.webview.html = await this.getHtmlForWebview();
                }
            })
        );

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
        this.notifyRemoteControlModeChanged(vscodeContextManager.get<boolean>('brightscript.isRemoteControlMode', false));
        this.sendKeybindings();
    }

    private setupKeybindingsWatcher() {
        // Watch the user's keybindings.json for real-time updates
        const userKeybindingsPath = this.getUserKeybindingsPath();
        const watcher = vscode.workspace.createFileSystemWatcher(
            new vscode.RelativePattern(vscode.Uri.file(path.dirname(userKeybindingsPath)), 'keybindings.json')
        );
        const onChanged = () => this.sendKeybindings();
        watcher.onDidChange(onChanged);
        watcher.onDidCreate(onChanged);
        watcher.onDidDelete(onChanged);
        this.extensionContext.subscriptions.push(watcher);
    }

    private getUserKeybindingsPath(): string {
        // globalStorageUri is <user-data>/User/globalStorage/<ext-id>
        // keybindings.json lives at <user-data>/User/keybindings.json
        return path.resolve(this.extensionContext.globalStorageUri.fsPath, '..', '..', 'keybindings.json');
    }

    private loadKeybindings(): Record<string, string[]> {
        const isMac = process.platform === 'darwin';
        const isLinux = process.platform === 'linux';

        // Read default keybindings from this extension's package.json
        const pkgJson = fsExtra.readJsonSync(path.join(this.extensionContext.extensionPath, 'package.json'));
        const defaultBindings: { command: string; key?: string; mac?: string; linux?: string; win?: string }[] =
            pkgJson.contributes?.keybindings ?? [];

        // Build command → keys[] map, applying platform-specific overrides
        const commandKeys: Record<string, string[]> = {};
        for (const binding of defaultBindings) {
            let key = binding.key;
            if (isMac && binding.mac) {
                key = binding.mac;
            } else if (isLinux && binding.linux) {
                key = binding.linux;
            }
            if (!key) {
                continue;
            }
            if (!commandKeys[binding.command]) {
                commandKeys[binding.command] = [];
            }
            commandKeys[binding.command].push(key);
        }

        // Overlay with user keybinding customizations
        try {
            const userKeybindingsPath = this.getUserKeybindingsPath();
            if (fsExtra.existsSync(userKeybindingsPath)) {
                const content = fsExtra.readFileSync(userKeybindingsPath, 'utf8');
                // Strip JSONC comments before parsing
                const stripped = content
                    .replace(/\/\/[^\n]*/g, '')
                    .replace(/\/\*[\s\S]*?\*\//g, '');
                const userBindings: { command: string; key: string }[] = JSON.parse(stripped);
                for (const binding of userBindings) {
                    const isRemoval = binding.command.startsWith('-');
                    const commandId = isRemoval ? binding.command.slice(1) : binding.command;
                    if (isRemoval) {
                        if (commandKeys[commandId]) {
                            commandKeys[commandId] = commandKeys[commandId].filter(
                                k => k.toLowerCase() !== binding.key.toLowerCase()
                            );
                        }
                    } else {
                        if (!commandKeys[commandId]) {
                            commandKeys[commandId] = [];
                        }
                        if (!commandKeys[commandId].includes(binding.key)) {
                            commandKeys[commandId].push(binding.key);
                        }
                    }
                }
            }
        } catch {
            // Silently fall back to defaults if user keybindings can't be read/parsed
        }

        // Build button name → keys[] map
        const result: Record<string, string[]> = {};
        for (const [button, commandId] of Object.entries(RemoteControlPanelProvider.buttonCommandMap)) {
            result[button] = commandKeys[commandId] ?? [];
        }
        return result;
    }

    private sendKeybindings() {
        let keybindings: Record<string, string[]> = {};
        try {
            keybindings = this.loadKeybindings();
        } catch (e) {
            console.error('RemoteControlPanelProvider: failed to load keybindings:', e);
        }
        this.postOrQueueMessage(this.createEventMessage(ViewProviderEvent.onKeybindingsUpdated, { keybindings: keybindings }));
    }

    public notifyRemoteControlModeChanged(isEnabled: boolean) {
        this.postOrQueueMessage(this.createEventMessage(ViewProviderEvent.onRemoteControlModeChanged, { isEnabled: isEnabled }));
    }

    public notifyRemoteCommandSent(key: string, literalCharacter: boolean) {
        this.postOrQueueMessage(this.createEventMessage(ViewProviderEvent.onRemoteCommandSent, { key: key, literalCharacter: literalCharacter }));
    }

    public closePanel() {
        this.panel?.dispose();
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
                this.panel.reveal();
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
                    // Keep the webview alive when hidden so postMessage still delivers
                    // (e.g. keyboard shortcut feedback when the panel isn't the active tab)
                    retainContextWhenHidden: true,
                    localResourceRoots: [
                        vscode.Uri.file(this.webviewBasePath)
                    ]
                }
            );

            this.panel.onDidDispose(() => {
                this.panel = undefined;
            });

            this.setupViewMessageObserver(this.panel.webview);

            const html = await this.getHtmlForWebview();
            this.panel.webview.html = html;
        }
    }
}
