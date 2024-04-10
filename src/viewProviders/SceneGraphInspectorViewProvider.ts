import type * as vscode from 'vscode';
import { BaseRdbViewProvider } from './BaseRdbViewProvider';
import { ViewProviderId } from './ViewProviderId';
import { VscodeCommand } from '../commands/VscodeCommand';

export class SceneGraphInspectorViewProvider extends BaseRdbViewProvider {
    public readonly id = ViewProviderId.sceneGraphInspectorView;

    constructor(context: vscode.ExtensionContext, dependencies) {
        super(context, dependencies);

        this.registerCommand(context, VscodeCommand.openSceneGraphInspectorInPanel, async () => {
            await this.createOrRevealWebviewPanel();
        });
    }
}
