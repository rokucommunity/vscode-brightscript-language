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
import * as fsExtra from 'fs-extra';

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

        this.registerCommand(VscodeCommand.rokuAutomationViewImportAutomation, async () => {
            if (this.isRecording) {
                // Only allow importing when we aren't currently recording
                vscode.window.showInformationMessage('Cannot import automation scripts while recording. Please stop recording first.');
                return;
            }

            // macOS does not have a title bar on the open dialog so we need to show a warning message
            if (process.platform === 'darwin') {
                const confirm = await vscode.window.showWarningMessage(
                    'This will replace all automation scripts. Continue importing?',
                    { modal: true },
                    'Yes'
                );
                if (confirm !== 'Yes') {
                    return;
                }
            }

            const filePath = await vscode.window.showOpenDialog({
                title: 'Import Automation Scripts (Warning: This will replace all currently loaded scripts)',
                filters: {
                    'JSON': ['json'],
                    'All Files': ['*']
                },
                defaultUri: vscode.Uri.file('automation.json'),
                canSelectMany: false
            })

            if (!filePath) {
                return;
            }

            try {
                const data = fsExtra.readFileSync(filePath[0].fsPath, 'utf8');
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
                this.onImportAutomation();
                vscode.window.showInformationMessage('Automation scripts imported successfully from ' + filePath[0].fsPath);
            } catch (err) {
                vscode.window.showErrorMessage('Failed to import automation: ' + (err as Error).message);
            }
        });

        this.registerCommand(VscodeCommand.rokuAutomationViewExportAutomation, async () => {
            vscode.window.showInformationMessage('Exporting automation data...');

            if (this.isRecording) {
                // Only allow exporting when we aren't currently recording
                vscode.window.showInformationMessage('Cannot export automation scripts while recording. Please stop recording first.');
                return;
            }

            // Set the default save location to be the current workspace folder
            let defaultUri = vscode.Uri.file('automation.json');
            if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
                // Use the first workspace folder
                defaultUri = vscode.Uri.joinPath(
                    vscode.workspace.workspaceFolders[0].uri,
                    'automation.json'
                );
            }

            const filePath = await vscode.window.showSaveDialog({
                title: 'Export Automation scripts',
                filters: {
                    'JSON': ['json'],
                    'All Files': ['*']
                },
                defaultUri: defaultUri,
            });

            if (!filePath) {
                return;
            }

            try {
                // format the json to put each step on a single line for easier editing
                // Changing the code formatting modifies the json output. Not sure how to fix that.
                const json = `{
  "selectedConfig": ${JSON.stringify(this.selectedConfig)},
  "configs": [
    ${this.rokuAutomationConfigs.map(config =>
      `{
        "name": ${JSON.stringify(config.name)},
        "steps": [${config.steps?.length ? '\n' + config.steps.map(step =>
          `          {"type": ${JSON.stringify(step.type)},"value": ${JSON.stringify(step.value)}}`
        ).join(',\n') + '\n      ' : ''}]
      }`
    ).join(',\n    ')}
  ]
}`;
                fsExtra.outputFileSync(filePath.fsPath, json);
                vscode.window.showInformationMessage('Automation exported successfully to ' + filePath.fsPath);
            } catch (err) {
                vscode.window.showErrorMessage('Failed to export automation: ' + (err as Error).message);
            }
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

    protected onImportAutomation() {
        const message = this.createEventMessage(ViewProviderEvent.onRokuAutomationImportAutomation, {
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
