import type * as vscode from 'vscode';
import { BaseRdbViewProvider } from './BaseRdbViewProvider';
import { ViewProviderId } from './ViewProviderId';
import { VscodeCommand } from '../commands/VscodeCommand';

export class SceneGraphInspectorViewProvider extends BaseRdbViewProvider {
    public readonly id = ViewProviderId.sceneGraphInspectorView;

    constructor(context: vscode.ExtensionContext, dependencies) {
        super(context, dependencies);

        this.registerCommand(VscodeCommand.openSceneGraphInspectorInPanel, async () => {
            await this.createOrRevealWebviewPanel();
        });
        // bring the panel back after a window reload (paired with the
        // onWebviewPanel:sceneGraphInspectorView activation event)
        this.enablePanelRestore();
    }
}
