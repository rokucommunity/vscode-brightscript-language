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
}
