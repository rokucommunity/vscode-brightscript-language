import type * as vscode from 'vscode';
import { BaseRdbViewProvider } from './BaseRdbViewProvider';
import { ViewProviderId } from './ViewProviderId';

export class SceneGraphInspectorViewProvider extends BaseRdbViewProvider {
    public readonly id = ViewProviderId.sceneGraphInspectorView;

    constructor(context: vscode.ExtensionContext, dependencies) {
        super(context, dependencies);

        this.registerCommandWithWebViewNotifier(context, 'extension.brightscript.sceneGraphInspectorView.refreshNodeTree');
    }
}
