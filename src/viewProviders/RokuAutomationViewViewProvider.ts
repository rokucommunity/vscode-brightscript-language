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

export class RokuAutomationViewViewProvider extends BaseRdbViewProvider {
    public readonly id = ViewProviderId.rokuAutomationView;

    constructor(context: vscode.ExtensionContext, dependencies) {
        super(context, dependencies);

        this.addMessageCommandCallback(ViewProviderCommand.storeRokuAutomationConfigs, async (message) => {
            this.rokuAutomationConfigs = message.context.configs;
            this.rokuAutomationAutorunOnDeploy = message.context.autorunOnDeploy;
            // Make sure to use JSON.stringify or weird stuff happens
            await context.workspaceState.update(this.configStorageKey, JSON.stringify(message.context));
            return true;
        });

        this.addMessageCommandCallback(ViewProviderCommand.runRokuAutomationConfig, async (message) => {
            const index = message.context.configIndex;
            await this.runRokuAutomationConfig(index);
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

        const subscriptions = context.subscriptions;

        subscriptions.push(vscode.commands.registerCommand(VscodeCommand.rokuAutomationStartRecording, async () => {
            // TODO decide how to handle initiator
            await vscode.commands.executeCommand('extension.brightscript.enableRemoteControlMode');
            await this.setIsRecording(true);
        }));

        subscriptions.push(vscode.commands.registerCommand(VscodeCommand.rokuAutomationStopRecording, async () => {
            await vscode.commands.executeCommand('extension.brightscript.disableRemoteControlMode');
            await this.setIsRecording(false);
        }));
    }

    private async setIsRecording(isRecording) {
        this.isRecording = isRecording;
        // TODO decide how to handle initiator
        await vscodeContextManager.set('brightscript.rokuAutomationView.isRecording', isRecording);
    }

    private isRecording = false;
    private configStorageKey = 'rokuAutomationConfigs';
    private rokuAutomationConfigs: {
        name: string;
        steps: {
            type: string;
            value: string;
        }[];
    }[];
    private rokuAutomationAutorunOnDeploy = true;

    private currentRunningStep = -1;

    public async runRokuAutomationConfig(index) {
        let stopRunning = false;
        this.addMessageCommandCallback(ViewProviderCommand.stopRokuAutomationConfig, (message) => {
            stopRunning = true;
            return Promise.resolve(true);
        });

        const config = this.rokuAutomationConfigs[index];
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
                    await ecp.sendKeyPress(step.value as any);
                    break;
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

        const json = this.extensionContext.workspaceState.get(this.configStorageKey);
        if (typeof json === 'string') {
            const result = JSON.parse(json);
            this.rokuAutomationConfigs = result.configs;
            this.rokuAutomationAutorunOnDeploy = result.autorunOnDeploy;
        }

        const message = this.createEventMessage(ViewProviderEvent.onRokuAutomationConfigsLoaded, {
            configs: this.rokuAutomationConfigs,
            autorunOnDeploy: this.rokuAutomationAutorunOnDeploy
        });

        this.postOrQueueMessage(message);

        this.updateCurrentRunningStep();
    }
}
