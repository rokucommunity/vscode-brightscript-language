import * as vscode from 'vscode';
import type { ChannelPublishedEvent } from 'roku-debug';
import { utils, ecp } from 'roku-test-automation';
import { vscodeContextManager } from '../managers/VscodeContextManager';
import type { BrightScriptCommands } from '../BrightScriptCommands';
import { VscodeCommand } from '../commands/VscodeCommand';
import { BaseRdbViewProvider } from './BaseRdbViewProvider';
import { ViewProviderId } from './ViewProviderId';
import { ViewProviderCommand } from './ViewProviderCommand';
import { ViewProviderEvent } from './ViewProviderEvent';
import { WorkspaceStateKey } from './WorkspaceStateKey';
import { readFileSync, writeFileSync } from 'fs';

export class RokuAutomationViewViewProvider extends BaseRdbViewProvider {
    public readonly id = ViewProviderId.rokuAutomationView;

    constructor(context: vscode.ExtensionContext, dependencies) {
        super(context, dependencies);

        this.addMessageCommandCallback(ViewProviderCommand.storeRokuAutomationConfigs, async (message) => {
            this.selectedConfig = message.context.selectedConfig;
            this.rokuAutomationConfigs = message.context.configs;
            // Make sure to use JSON.stringify or weird stuff happens
            await context.workspaceState.update(WorkspaceStateKey.rokuAutomationConfigs, JSON.stringify(message.context));
            return true;
        });

        this.addMessageCommandCallback(ViewProviderCommand.runRokuAutomationConfig, async (message) => {
            const index = message.context.configIndex;
            try {
                await this.runRokuAutomationConfig(index);
            } catch (e) {
                this.updateCurrentRunningStep(-1);
                throw e;
            }
            return true;
        });

        const brightScriptCommands = dependencies.brightScriptCommands as BrightScriptCommands;
        brightScriptCommands.registerKeypressNotifier((key, literalCharacter) => {
            if (this.isRecording) {
                const message = this.createEventMessage(ViewProviderEvent.onRokuAutomationKeyPressed, {
                    key: key,
                    literalCharacter: literalCharacter
                });

                this.postOrQueueMessage(message);
            }
        });

        this.registerCommand(VscodeCommand.rokuAutomationViewLoadAutomation, async () => {
            if (this.isRecording) {
                // Only allow loading when we aren't currently recording
                await this.setIsRecording(false);
            }

            // macOS does not have a title bar on the open dialog so we need to show a warning message
            if (process.platform === 'darwin') {
                const confirm = await vscode.window.showWarningMessage(
                    'This will replace all currently loaded automation scripts. Continue?',
                    { modal: true },
                    'Yes'
                );
                if (confirm !== 'Yes') {
                    return;
                }
            }

            vscode.window.showOpenDialog({
                title: 'Load Automation Scripts (Warning: This will replace all currently loaded scripts)',
                filters: {
                    'JSON': ['json'],
                    'All Files': ['*']
                },
                defaultUri: vscode.Uri.file('automation.json'),
                canSelectMany: false
            }).then(async (filePath) => {
                if (!filePath) {
                    return;
                }
                try {
                    const data = readFileSync(filePath[0].fsPath, 'utf8');
                    const result = JSON.parse(data);
                    this.selectedConfig = result.selectedConfig;
                    this.rokuAutomationConfigs = result.configs;
                    await this.extensionContext.workspaceState.update(WorkspaceStateKey.rokuAutomationConfigs, JSON.stringify(result));
                    const message = this.createEventMessage(ViewProviderEvent.onRokuAutomationConfigsLoaded, {
                        selectedConfig: this.selectedConfig,
                        configs: this.rokuAutomationConfigs
                    });

                    this.postOrQueueMessage(message);

                    this.updateCurrentRunningStep();
                    this.onLoadAutomation();
                    vscode.window.showInformationMessage('Automation loaded successfully from ' + filePath[0].fsPath);
                } catch (err) {
                    vscode.window.showErrorMessage('Failed to load automation: ' + (err as Error).message);
                }
            });
        });

        this.registerCommand(VscodeCommand.rokuAutomationViewExportAutomation, async () => {
            vscode.window.showInformationMessage('Exporting automation data...');

            if (this.isRecording) {
                // Only allow exporting when we aren't currently recording
                await this.setIsRecording(false);
            }
            vscode.window.showSaveDialog({
                title: 'Export Automation scripts',
                filters: {
                    'JSON': ['json'],
                    'All Files': ['*']
                },
                defaultUri: vscode.Uri.file('automation.json')
            }).then(async (filePath) => {
                if (!filePath) {
                    return;
                }
                try {
                    writeFileSync(filePath.fsPath, JSON.stringify({ selectedConfig: this.selectedConfig, configs: this.rokuAutomationConfigs }, null, 2));
                    vscode.window.showInformationMessage('Automation exported successfully to ' + filePath.fsPath);
                } catch (err) {
                    vscode.window.showErrorMessage('Failed to export automation: ' + (err as Error).message);
                }
            });
        });

        this.registerCommand(VscodeCommand.rokuAutomationViewStartRecording, async () => {
            if (this.currentRunningStep === -1) {
                // Only allow recording when we aren't currently running
                await this.setIsRecording(true);
                await vscode.commands.executeCommand(VscodeCommand.enableRemoteControlMode);

                // We reset the current step to update the timestamp of the first sleep
                this.updateCurrentRunningStep(-1);
            }
        });

        this.registerCommand(VscodeCommand.rokuAutomationViewStopRecording, async () => {
            if (this.isRecording) {
                await this.setIsRecording(false);
                await vscode.commands.executeCommand(VscodeCommand.disableRemoteControlMode);
            }
        });

        this.registerCommand(VscodeCommand.rokuAutomationViewEnableAutorunOnDeploy, async () => {
            await this.setAutorunOnDeploy(true);
        });

        this.registerCommand(VscodeCommand.rokuAutomationViewDisableAutorunOnDeploy, async () => {
            await this.setAutorunOnDeploy(false);
        });

        let autorunOnDeploy: boolean = this.extensionContext.workspaceState.get(WorkspaceStateKey.rokuAutomationAutorunOnDeploy);
        // Default to true if not set
        if (autorunOnDeploy !== false) {
            autorunOnDeploy = true;
        }
        void this.setAutorunOnDeploy(autorunOnDeploy);
    }

    private async setIsRecording(isRecording) {
        this.isRecording = isRecording;
        await vscodeContextManager.set('brightscript.rokuAutomationView.isRecording', isRecording);
    }

    private async setAutorunOnDeploy(autorunOnDeploy: boolean) {
        this.rokuAutomationAutorunOnDeploy = autorunOnDeploy;
        await vscodeContextManager.set('brightscript.rokuAutomationView.autorunOnDeploy', autorunOnDeploy);
        await this.extensionContext.workspaceState.update(WorkspaceStateKey.rokuAutomationAutorunOnDeploy, autorunOnDeploy);
    }

    private isRecording = false;
    private selectedConfig: string;
    private rokuAutomationConfigs: {
        name: string;
        steps: {
            type: string;
            value: string;
        }[];
    }[];

    private rokuAutomationAutorunOnDeploy = false;

    private currentRunningStep = -1;

    public async runRokuAutomationConfig(index) {
        let stopRunning = false;
        this.addMessageCommandCallback(ViewProviderCommand.stopRokuAutomationConfig, (message) => {
            stopRunning = true;
            return Promise.resolve(true);
        });

        const config = this.rokuAutomationConfigs?.[index];
        if (config) {
            for (const [index, step] of config.steps.entries()) {
                if (stopRunning) {
                    break;
                }

                this.updateCurrentRunningStep(index);
                switch (step.type) {
                    case 'sleep':
                        await utils.sleep(+step.value * 1000);
                        break;
                    case 'sendText':
                        await ecp.sendText(step.value);
                        break;
                    case 'sendKeyPress':
                        await ecp.sendKeypress(step.value as any);
                        break;
                }
            }
        }

        // Let the view know we're done running
        this.updateCurrentRunningStep(-1);
    }

    public onChannelPublishedEvent(e: ChannelPublishedEvent) {
        if (this.rokuAutomationAutorunOnDeploy) {
            return this.runRokuAutomationConfig(0);
        }
    }

    protected updateCurrentRunningStep(step = this.currentRunningStep) {
        const message = this.createEventMessage(ViewProviderEvent.onRokuAutomationConfigStepChange, {
            step: step
        });

        this.postOrQueueMessage(message);
    }

    protected onViewReady() {
        // Always post back the device status so we make sure the client doesn't miss it if it got refreshed
        this.updateDeviceAvailability();

        const json = this.extensionContext.workspaceState.get(WorkspaceStateKey.rokuAutomationConfigs);
        if (typeof json === 'string') {
            const result = JSON.parse(json);
            this.selectedConfig = result.selectedConfig;
            this.rokuAutomationConfigs = result.configs;
        }

        const message = this.createEventMessage(ViewProviderEvent.onRokuAutomationConfigsLoaded, {
            selectedConfig: this.selectedConfig,
            configs: this.rokuAutomationConfigs
        });

        this.postOrQueueMessage(message);

        this.updateCurrentRunningStep();
    }

    protected onLoadAutomation() {
        const message = this.createEventMessage(ViewProviderEvent.onRokuAutomationLoadAutomation, {
            selectedConfig: this.selectedConfig,
            configs: this.rokuAutomationConfigs
        });

        this.postOrQueueMessage(message);
    }

    protected onExportAutomation() {
        const message = this.createEventMessage(ViewProviderEvent.onRokuAutomationExportAutomation, {
            selectedConfig: this.selectedConfig,
            configs: this.rokuAutomationConfigs
        });

        this.postOrQueueMessage(message);
    }
}
